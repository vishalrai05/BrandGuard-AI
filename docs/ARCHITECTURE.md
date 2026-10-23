## Overview

## Data flow

## Key decisions

## Data model

- **Rules** and **Facts** are separate MongoDB collections so approved guidance and verified claims can be maintained and queried independently. Each uses a unique code as a stable evidence reference.
- **Reviews** store submitted text, the brand name, findings, and summary counts. Findings are embedded subdocuments because they belong to one review, are read and updated with that review, and do not need an independent collection lifecycle. Each finding stores its evidence kind and reference code so results can point back to a Rule or Fact.

## Review engine

The deterministic review pipeline splits submitted text into sentences while preserving source offsets, checks each sentence against active brand rules, identifies factual claims, and compares those claims to the approved Facts library. It then combines and de-duplicates findings, suppresses redundant verification warnings when a fact mismatch already explains a sentence, sorts findings by source position, and calculates severity and verification counts.

Deterministic checks run first so explicit brand rules and approved facts provide repeatable, auditable results. A claim is only called a fact mismatch when a relevant approved fact exists and its numbers disagree; without supporting evidence, it is marked “Needs verification” rather than false. Each finding links to the matching Rule or Fact code and evidence excerpt when available.

The review engine runs deterministic checks first, then optionally invokes the AI layer. AI findings are advisory additions; deterministic findings take precedence when spans overlap. The Gemini output validator requires verbatim text and a known Rule/Fact code, or `needs_verification` with no evidence code. Invalid JSON, unknown codes, unsupported text spans, timeouts, and provider failures produce deterministic-only results with `aiStatus: unavailable`. Turning the toggle off skips provider calls (`aiStatus: disabled`).

### AI-assisted analysis and guardrails

`services/ai/aiProvider.js` wraps Google's official `@google/genai` Node SDK and selects `AI_MODEL` from server environment configuration (default `gemini-3.8-flash`). `aiAnalyzer.js` makes at most one structured analysis call and one batched rewrite call per review, each with a 15-second timeout. The prompt focuses on nuanced tone, paraphrased or implied claims, and sentence-specific suggestions. The validator strips optional Markdown fences, parses JSON, verifies evidence codes and exact source text, derives offsets from the original input, and removes deterministic duplicates/overlaps. Rewrites are returned as drafts and are never considered evidence or approval.

AI is enabled by default in the input panel but can be disabled per review. API keys remain server-side. Input is limited to 10,000 characters and review creation is rate-limited. Each provider call logs elapsed time. Any AI failure leaves deterministic findings available and records `aiStatus: unavailable`; the UI explains this fallback. AI outputs can still be incomplete or make poor editorial suggestions, so reviewers must verify suggestions before publication.

## Frontend

`App` provides the shared navigation and routes for the review screen, saved review details, and history. `ReviewPage` coordinates input, review/loading/error state, saved review loading, evidence-library data, finding filters, and status updates. Its components separate text entry, source highlighting, summaries, finding cards, and empty/loading states; `HistoryPage` lists saved reviews and links back to their detail route.

`HighlightedText` partitions the original input at finding offset boundaries, then renders each text segment once. Overlapping findings share a segment instead of duplicating source text; selecting a segment/card links the two panes and marks the active item. Findings retain the API's offsets and are never applied as text replacements.

The state flow uses the small API client to submit content, retrieve reviews/rules/facts, and patch finding status. The returned review becomes the source of truth for rendered results; status updates replace it with the persisted API response. AI findings use the same evidence-aware findings interface and carry a source badge.

## Design system and frontend structure

The client dashboard uses CSS custom properties in `client/src/index.css`. Dark is the stylesheet default; on first visit the theme follows `prefers-color-scheme`, then the choice is stored in `localStorage` (`brandguard-theme`).

### Tokens

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#121216` | `#F4F5F8` |
| `--panel` | `#1A1A20` | `#FFFFFF` |
| `--card` | `#212128` | `#FFFFFF` |
| `--border` | `#2E2E38` | `#E4E4EC` |
| `--text` | `#F2F2F7` | `#16161D` |
| `--muted` | `#8E8EA0` | `#6B6B7B` |
| `--accent` / hover | `#4F7CFF` / `#6B91FF` | same |
| Severity | high `#F87171`, medium `#FBBF24`, low `#60A5FA`, needs-verification `#A78BFA`, success `#34D399` | same |

Typography is Plus Jakarta Sans with system sans-serif fallbacks. Cards use `rounded-2xl`-scale radii, panels `rounded-xl`, pills `rounded-full`, 1px borders, soft shadows, and 150ms transitions.

### Component tree

```
App
└─ ThemeProvider
   └─ Shell
      ├─ icon rail (Review, History, Rules, Facts, Settings)
      ├─ NavPanel (Reviews / Libraries / Findings groups, theme pill)
      ├─ TopBar (search, bell, date, avatar, New review)
      ├─ Toast
      └─ routes
         ├─ ReviewPage
         │  ├─ EmptyState (Card) + InputPanel
         │  ├─ Tabs (Board view / Text view)
         │  ├─ FindingsBoard → Column → FindingCard
         │  ├─ SummaryBar + HighlightedText + ScoreRing
         │  └─ Drawer → FindingDetail (local note draft)
         ├─ HistoryPage
         ├─ RulesPage
         └─ FactsPage
```

Supporting primitives: `Pill`, `Card`, `IconButton`, `Tabs`, `Drawer`, `Toast`, `ScoreRing`. Finding type labels (`Banned term`, `Fact mismatch`, `Needs verification`, and related rule types) live in `client/src/utils/findingLabels.js`.

The review board uses dnd-kit pointer and keyboard sensors. Dropping a finding on another status column optimistically updates its local status, calls `PATCH /api/reviews/:id/findings/:findingId`, and restores the previous review with a toast if the request fails. The card menu also exposes Copy suggestion, View evidence, Undo (reopen), and Move to Open/Accepted/Dismissed. Finding notes are intentionally local drawer drafts only; no note API or persistence is implied. Text highlights continue to use the deterministic review offsets and partition overlapping ranges so source text is rendered once; each highlight start includes an icon and type label so color is not the only signal.

Compliance score is `max(0, 100 − penalties)` with weights high=10, medium=5, low=2, needs-verification=4.

## Deployment

The API is deployed as a Render Node web service, with `PORT` supplied by the host and the process bound to `0.0.0.0`. The Vite-built React client is hosted on Vercel with an SPA rewrite so review/history routes work on refresh. MongoDB Atlas provides the managed database. This keeps frontend delivery/CDN and API runtime independently deployable while environment variables connect the client, API, and database without committing secrets.

The backend CORS allowlist is configured by comma-separated `CLIENT_URL` origins. The Vercel build receives its API base URL through `VITE_API_URL`; Atlas credentials remain only in the Render/local server environment. Health responses expose MongoDB connection state for deployment checks. Production seeding requires an explicit `--confirm` flag because it replaces the Rules and Facts collections.
