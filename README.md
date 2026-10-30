# BrandGuard AI

A transparent pre-publication platform that reviews marketing content against approved brand rules and facts. Every finding links to evidence, and claims with no supporting fact are flagged **Needs verification**.

**Live demo:** https://brand-guard-ai-pi.vercel.app
**API health:** https://brandguard-ai-inwv.onrender.com/api/health
**Docs:** [Architecture](docs/ARCHITECTURE.md) | [Tech inventory](docs/TECH_INVENTORY.md)

Built solo by Vishal (NSUT Delhi) for CodeAxis Round 2: The Build.

## Try it in 30 seconds

1. Open the [live demo](https://brand-guard-ai-pi.vercel.app).
2. Click **New review**, then **Load sample**, then **Review copy**.
3. Click a highlighted passage to open its evidence. Try Accept, Dismiss and the Board view.

The backend runs on a free tier and is kept awake by an uptime monitor, so the first request after a quiet period can still take a few seconds.

## Features

- 13 brand rules and 11 verified facts drive a deterministic review engine (banned terms, required phrases, regex patterns, claim detection and fact matching)
- Evidence on every finding: a rule code, a sourced fact, or a Needs verification flag
- Deterministic readability and accessibility checks with measured evidence
- Fact mismatch detection when a claim's number contradicts a verified fact
- AI-assisted analysis (Gemini 3.8 Flash) with strict output validation and an automatic rule-based fallback
- Compliant rewrite suggestions and per-finding suggested fixes
- Text view with labelled highlights, board view with drag and drop, search, filter and sort
- Accept, dismiss and undo, saved to the database; review history; Rules and Facts pages
- Compliance score, light and dark themes, responsive layout
- Automated tests for the review engine and the AI validator

## Quality checks

Quality checks run by default before AI analysis. Set `qualityChecks: false` on `POST /api/reviews` to skip their findings; review readability metrics are still calculated. Thresholds can be overridden with `QUALITY_LONG_SENTENCE_MEDIUM_WORDS`, `QUALITY_LONG_SENTENCE_HIGH_WORDS`, `QUALITY_HARD_TO_READ_GRADE`, `QUALITY_HARD_TO_READ_MIN_WORDS`, `QUALITY_PASSIVE_MIN_OCCURRENCES`, `QUALITY_RAW_URL_LINK_TEXT_CHARS`, and `QUALITY_ALL_CAPS_MIN_WORDS`. `QUALITY_JARGON_TERMS` and `QUALITY_ACRONYMS` accept comma-separated lists. The default jargon terms are editable in `server/src/seed/jargonTerms.json`.

| Code | Category | Default severity | Threshold |
|---|---|---:|---|
| READ-01 | Readability | Medium / high | More than 30 words (medium); more than 45 (high) |
| READ-02 | Readability | Low | Flesch-Kincaid grade above 16, with at least 12 words |
| READ-03 | Readability | Low | At least 2 possible passive constructions in a sentence; simple heuristic |
| JARGON-01 | Readability | Low | Term appears in the editable default list or configured list |
| LINK-01 | Accessibility | Medium | Generic link text such as “click here”, “read more”, “link”, or “this” |
| LINK-02 | Accessibility | Low | Raw URL used as Markdown link text exceeds 60 characters |
| ACC-01 | Accessibility | Low | At least 3 consecutive all-caps words of 3+ letters, excluding allowlisted acronyms |
| ACC-02 | Accessibility | Low | A line starts with an emoji or decorative symbol used as a bullet/separator |

Each finding includes a `check` evidence reference and the measured excerpt. Readability uses a simple English syllable estimator and the standard Flesch formulas; plain-text checks are heuristics, not a substitute for editorial or accessibility review. Exact-span findings from different categories are both retained; a quality check in the same category as an existing exact-span rule finding is suppressed. AI still accepts only library Rule/Fact evidence and ignores spans occupied by deterministic findings.

## Insights API

Authenticated `GET /api/insights` summarizes review counts, severity/status totals, up to five top recurring issues, up to 25 total issues, category counts, daily or weekly trends, readability trends, and workflow decision time. Query parameters are `days` (1–365, default 30), `scope` (`all` by default or `mine` for reviews created by the signed-in user), and optional exact, case-insensitive `brand`. The response includes `truncated: true` when the 2,000-review cap is reached. `GET /api/insights/brands` returns `{ brandName, count }` rows for a brand filter dropdown.

Readability trend values are `null` for buckets with no metric data so the chart can omit those points. Legacy reviews keep missing readability metrics absent.

## Document extraction

Authenticated `POST /api/documents/extract` accepts exactly one multipart file in the `file` field and returns its sanitized filename, detected file type, PDF page count (or `null` for DOCX), extracted character count, truncation flag, warnings, and plain text. Extraction runs in memory; uploaded files and extracted text are not stored. DOCX extraction returns raw text only; linked files and embedded images are not opened. OCR is not supported.

The Review page has **Paste text** and **Upload documents** tabs. Upload up to five PDF/DOCX files (5 MB each); extraction and review run sequentially, with retry for failed rows and a batch summary for multiple successful reviews. Review detail shows the source filename and notices when extraction was truncated, AI analysis was partial/failed, or the 1,000-finding cap was reached. Document review accepts up to `MAX_DOC_CHARS` (60,000 default); pasted text remains limited to 10,000 characters.

Optional server environment limits are `MAX_UPLOAD_MB` (default 5 MB), `MAX_DOC_CHARS` (default 60,000 characters), and `MAX_PDF_PAGES` (default 100 pages). These variables are optional in Render's service environment settings as well as local `server/.env`. Extracted text beyond the character limit is truncated with a warning. PDFs above 50 pages receive a warning; documents above the configured page limit are rejected. Uploads are limited to 20 requests per 15 minutes per authenticated user.

Errors use the normal `{ "error": "..." }` JSON format: 400 for missing, empty, unsupported, or malformed uploads; 413 when the file exceeds the upload limit; 422 for scanned/image-only, corrupt, password-protected, timed-out, or over-page-limit documents; and 429 when the extraction rate limit is reached. CORS continues to accept the `Authorization` and `Content-Type` headers from the configured `CLIENT_URL` origins.

## Insights dashboard

Sign in and open `/insights` to see the top five repeated findings, filters, category totals, findings-over-time and readability charts, and workflow counts. The page places ranked issues first, with count bars and text labels for severity and status. The lower chart sections also offer table views. The period, review scope, and brand are kept in the URL query string. Empty periods show a prompt to run a review. The page does not display review text, email addresses, or tokens.

To add six local demo reviews through the API, start the server, then set credentials in a PowerShell session and run the helper from `server`:

```powershell
$env:BRANDGUARD_API = "http://localhost:5000"
$env:BRANDGUARD_EMAIL = "reviewer@nimbusnotes.demo"
$env:BRANDGUARD_PASSWORD = Read-Host "Demo account password"
node .\scripts\seed-demo-reviews.mjs
Remove-Item Env:\BRANDGUARD_PASSWORD
```

The script also accepts API URL, email, and password as positional arguments. It creates six reviews on each run, disables AI, and prints only the number created. Use it with a local database; it adds persistent review records.

## Compliance report export

Every signed-in user can open **Export report** from a review. `GET /api/reviews/:id/report` accepts `includeFullText` (default `false`), `includeComments` (default `true`), and `includeAudit` (default `true`) as boolean query parameters and returns a print-ready report object. Full submitted text is included only when explicitly enabled. The report contains the review/source metadata, severity and status counts, compliance score, evidence titles, findings, approval decision, optional comments and audit trail, library counts, disclosures, and a generated-by snapshot. The browser report page offers Print / Save as PDF, CSV, JSON, and copy-summary actions. PDF generation is handled by the browser print dialog; the server does not generate PDFs.

`POST /api/reviews/report-summary` accepts 1–25 review IDs and returns compact summary rows plus any unknown IDs. Select reviews in History or export a completed multi-file upload batch to download the summary CSV.

The fingerprint is SHA-256 over a canonical representation of each finding's type, matched text, offsets, evidence code and status, plus workflow status and decision time. The same state yields the same digest, and a finding/status/decision-state change changes it. This is a tamper-evidence aid only: it is not a digital signature, does not prove who generated the report, and does not guarantee that source data was authentic. Each report request appends a `report_exported` event with the selected options and fingerprint; report delivery continues if that audit write fails. Report and summary responses never expose account emails, password hashes, or tokens. Full text is omitted unless opted in. All reports disclose that findings depend on the rules and facts library.

Trimmed example:

```json
{
  "period": { "from": "2026-10-01T00:00:00.000Z", "to": "2026-10-31T00:00:00.000Z", "bucket": "day" },
  "totals": { "reviews": 12, "findings": 38, "bySeverity": { "high": 4, "medium": 20, "low": 14 }, "byStatus": { "open": 17, "accepted": 16, "dismissed": 5 }, "acceptanceRate": 0.8 },
  "topIssues": [
    { "key": "TERM-01", "title": "Use the approved product spelling", "category": "terminology", "kind": "rule", "count": 7, "severity": "medium", "accepted": 4, "dismissed": 1, "open": 2, "lastSeen": "2026-10-28T11:24:00.000Z", "exampleText": "NimbusNotes" }
  ],
  "allIssues": [], "byCategory": [], "overTime": [], "readabilityTrend": [],
  "workflow": { "draft": 5, "pending_approval": 2, "approved": 4, "changes_requested": 1, "avgHoursToDecision": 3.5 },
  "truncated": false
}
```

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Node.js, Express, Mongoose
- **Database:** MongoDB Atlas
- **AI:** Google Gemini API (gemini-3.8-flash)
- **Hosting:** Vercel (client), Render (API), UptimeRobot (health pings)

## Setup

Requirements: Node.js 20.20.2 (or a compatible 20.x release) and npm. A MongoDB Atlas database is required.

### Server

In PowerShell, from the project root:

```powershell
Set-Location .\server
Copy-Item .env.example .env
npm ci
```

Set `MONGODB_URI` in `server/.env` to your MongoDB Atlas connection string and set `JWT_SECRET` to a long random value. `JWT_EXPIRES_IN` defaults to `7d`. To enable AI-assisted analysis, also set `AI_API_KEY` to a Google AI Studio API key and `AI_MODEL` to `gemini-3.8-flash`. AI is enabled by default in the review form; the app continues with deterministic-only findings if the AI request is unavailable or fails. Then start the development server:

```powershell
npm run dev
```

For a production-style start, use `npm start`.

### Seed the data

With `MONGODB_URI` set in `server/.env`, from the `server` directory run:

```powershell
npm run seed -- --confirm
```

The seed command adds missing fictional Nimbus Notes Rules and Facts by their unique codes and creates missing demo users. It does not delete or overwrite existing Rules/Facts or reset demo passwords, so rerunning it is idempotent. `--confirm` is still required to make the intent explicit.

### Test the data endpoints

Start the server with `npm run dev`, then use a second PowerShell terminal:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/rules"
Invoke-RestMethod -Uri "http://localhost:5000/api/rules?category=claims"
Invoke-RestMethod -Uri "http://localhost:5000/api/facts"
```

### Run the tests

```powershell
Set-Location .\server
npm test
```

The tests run the review engine on the demo document and check the AI validator with a mocked provider. No real AI calls are made.

### Testing the workflow

In PowerShell, configure `server/.env` with `MONGODB_URI`, `JWT_SECRET`, and (optionally) `SEED_DEMO_PASSWORD`. The local-only demo password defaults to `NimbusDemo2026!` when `SEED_DEMO_PASSWORD` is unset; use a private value for any shared environment. Open the first terminal and start the API:

```powershell
Set-Location .\server
npm run dev
```

In a second PowerShell terminal, add any missing Nimbus Notes rules, facts, and demo accounts. Existing records and demo account passwords are preserved:

```powershell
Set-Location .\server
npm run seed -- --confirm
```

Then run the end-to-end workflow check from that `server` directory:

```powershell
.\scripts\test-workflow.ps1
```

The script reads `SEED_DEMO_PASSWORD` from `server/.env` (or uses the documented local-only default). You can override the URL or password with `-Api` and `-DemoPassword`. It creates a uniquely named throwaway reviewer account and prints step results without printing tokens or passwords.

### Demo accounts and how to test approvals

Seed the local database with `npm run seed -- --confirm` from `server`. The demo users are `reviewer@nimbusnotes.demo` and `approver@nimbusnotes.demo`; both use the `SEED_DEMO_PASSWORD` value configured in `server/.env`, or the documented local-only fallback when it is unset. Registration always creates a reviewer; the approver account is created by the seed command.

For a two-user demo, sign in as the reviewer in one browser window, create a review, resolve its open high-severity findings, add a comment, and submit it. In a separate private window, sign in as the approver and open that review from History. The approver can comment while it is locked, request changes with a required note, or approve it. To demonstrate the full cycle, request changes first; return to the reviewer window, update a finding and resubmit; then approve the resubmitted review in the approver window. The Audit trail tab shows both users' actions.

For a production database, set the Render `SEED_DEMO_PASSWORD` secret before creating the demo users. Use the Render service Shell or a trusted one-off job with the production environment configured, verify that `MONGODB_URI` points to the intended database, then run `npm run seed -- --confirm` from the service root (`server`). The seed operation only inserts sample Rules, Facts, or demo users that are missing; it preserves existing records and passwords, and can be safely repeated. Never put production credentials in a command, repository, or shared log.

### Client

In a second PowerShell terminal, from the project root:

```powershell
Set-Location .\client
Copy-Item .env.example .env
npm ci
npm run dev
```

The Vite development server prints the local URL (normally http://localhost:5173). The client API layer uses `VITE_API_URL` from `client/.env`.

## Environment variables

| Variable | Location | Purpose |
|---|---|---|
| `PORT` | `server/.env` | Express port; defaults to `5000` when omitted. |
| `MONGODB_URI` | `server/.env` | MongoDB Atlas connection string. |
| `CLIENT_URL` | `server/.env` | Comma-separated browser origins allowed by CORS. |
| `JWT_SECRET` | `server/.env` | Secret used to sign authentication tokens. Required at startup. |
| `JWT_EXPIRES_IN` | `server/.env` | Token lifetime; defaults to `7d`. |
| `SEED_DEMO_PASSWORD` | `server/.env` | Seeded demo-account password. Local-only fallback is `NimbusDemo2026!`; set a private secret before seeding any shared or production environment. Existing demo passwords are never reset by later seed runs. |
| `ALLOW_SELF_APPROVAL` | `server/.env` | Whether a reviewer may approve their own review; defaults to `true`. |
| `AI_API_KEY` | `server/.env` | Secret Google Gemini API key. Keep it on the server only. |
| `AI_MODEL` | `server/.env` | Gemini model identifier; use `gemini-3.8-flash`. |
| `VITE_API_URL` | `client/.env` | Base URL used by the client to reach the API. |

Copy the example env files and replace placeholders locally. Never commit `.env` files or real credentials.

## Scripts

| Directory | Command | Purpose |
| --- | --- | --- |
| client | `npm run dev` | Start the Vite development server. |
| client | `npm run build` | Create the production client bundle. |
| client | `npm run preview` | Preview the production client bundle locally. |
| server | `npm run dev` | Start the API with nodemon. |
| server | `npm start` | Start the API with Node.js. |
| server | `npm test` | Run the review engine, mocked AI, authentication, and workflow tests. |
| server | `npm run seed -- --confirm` | Add missing Nimbus Notes sample Rules, Facts, and demo accounts without deleting existing records. |
| server | `npm run migrate:brands -- --dry-run` | Preview legacy library/review records that the brand migration would update. |
| server | `npm run migrate:brands` | Apply the idempotent brand migration and replace global code indexes with per-brand indexes. |

## Brand libraries and approval lifecycle

Each Rule, Fact, and new Review belongs to a Brand. The default brand is Nimbus Notes; new reviews without a brand ID use that default, and legacy reviews without a brand continue to resolve against its active library. Rules and Facts are scoped by brand and code. The migration drops the old global `code_1` indexes and creates unique `(brand, code)` indexes.

Rule and Fact status transitions:

```text
draft ──approve──> active ──archive──> archived ──restore──> active
  └──reject──> rejected
```

Reviewers and approvers may propose and edit their own draft library entries. Approvers may edit drafts and active entries, approve or reject drafts, and archive or restore active entries. A rejection requires a note. When `ALLOW_SELF_APPROVAL=false`, an approver cannot approve their own proposal. Library changes are append-only and available at `GET /api/brands/:id/library-log`.

Library endpoints require a bearer token: `GET/POST /api/brands`, `PATCH /api/brands/:id`, `GET/POST /api/rules`, `GET/POST /api/facts`, `PATCH /api/rules/:id`, `PATCH /api/facts/:id`, and per-item `POST /approve`, `/reject`, `/archive`, and `/unarchive` routes. List routes accept `brand` and `status` (`active` by default or `all`); Rules also accept `category`. `GET /api/rules/next-code?prefix=TERM&brand=<brandId>` suggests a free code and `POST /api/rules/test` safely tests a proposed rule without saving it.

### Import a new brand's guidelines

Rules and Facts pages can import a PDF, DOCX, or pasted guideline. The extracted text is sent to the configured AI provider for candidate generation. The guideline itself is not stored; each draft retains only a short quoted excerpt and the source filename. AI suggestions are always saved as `draft` with origin `ai_draft`; only an approver can activate them. The review engine and its AI prompt are unchanged.

The ingestion prompt treats guideline contents as untrusted data and requests JSON candidates only. It asks for supported rule types, supported categories and severity, and fact statements with exact excerpts. Validation checks candidate fields and lengths, verifies that excerpts occur in the analyzed chunk, checks banned and required values against their excerpts, verifies every fact number against its excerpt, applies the same regex safety validation as manual rules, and removes duplicates against existing active/draft records and within the import. Rejected and archived items do not block a new proposal. AI-provided codes, status, brand, provenance, approval fields, URLs, and source data are discarded. Rule codes are assigned on the server by category prefix; fact codes use `FACT`.

```text
Upload PDF/DOCX or paste text
  → extract text (uploads)
  → send text to configured AI provider in bounded sections
  → validate excerpts, schema, numbers, regexes, and duplicates
  → save surviving candidates as drafts + append-only change entries
  → approver edits, approves, or rejects
  → only approved active items reach brand reviews
```

Limits default to `AI_INGEST_MAX_CHUNKS=8`, `AI_INGEST_MAX_ITEMS=40` across rules and facts, and `AI_INGEST_TOTAL_TIMEOUT_MS=60000`. Partial runs keep successful sections; if every section fails, the API returns 503 and saves nothing. Imports are limited to five per user per hour. `GET /api/brands/:id/ingestion-runs` lists runs, `GET /api/brands/:id/setup-status` reports the four setup steps, and `POST /api/rules/bulk` / `POST /api/facts/bulk` perform approver-only draft decisions with per-item results.

The fictional [Orbit Bank sample guideline](docs/samples/orbit-bank-brand-guidelines.md) is suitable for conversion to DOCX or PDF. To set up a new brand in about five minutes: (1) sign in as an approver and create the brand, (2) choose **Import guidelines** and upload the sample or paste its text, (3) inspect the quoted evidence and edit candidates, (4) bulk approve suitable drafts and reject unsuitable ones with a note, then (5) run a review and confirm that its findings cite only this brand's approved library. The setup checklist tracks these steps.

Prompt injection inside a guideline is treated as source text, not an instruction. The configured AI provider receives the guideline text and a compact summary of existing non-rejected/non-archived items for duplicate avoidance. Do not import confidential material unless its disclosure to that provider is permitted. The service logs counts and validation reasons, not the guideline text or full AI response.

### Migrate an existing database

For a local database, run from `server`:

```powershell
npm run migrate:brands -- --dry-run
npm run migrate:brands
npm run seed -- --confirm
```

For production, first take the normal database backup, run `npm run migrate:brands -- --dry-run` against the production connection and review its counts, then run `npm run migrate:brands` exactly once from a trusted one-off job or service shell. The operation is idempotent and safe to rerun. Run `npm run seed -- --confirm` separately only if sample records or demo users are needed. Migration output contains aggregate counts only.

## Limitations and responsible AI

Deterministic rules and approved facts remain the source of truth. AI findings are advisory, must cite a known Rule or Fact code (or be marked `needs_verification`), and are dropped if their evidence code or quoted text cannot be validated against the current review. A model can still misinterpret tone or produce a poor rewrite, so review all suggestions before publishing. Rewrites are drafts, not approved copy. Long documents are divided at paragraph, sentence, or word boundaries and analyzed sequentially. Defaults are `AI_CHUNK_CHARS=6000`, `AI_MAX_CHUNKS=5`, and `AI_TOTAL_TIMEOUT_MS=45000`; partial and failed coverage is shown in the review. Review text is sent to Google Gemini only when AI analysis is enabled; disable the toggle for deterministic-only processing. Review creation is rate-limited.

## Known limitations

- English-language copy and guidelines are supported; guideline uploads accept text-based PDF and DOCX (scanned PDFs require OCR, which is not supported).
- Fact matching uses keyword overlap, so unusual phrasing can be missed
- Free-tier hosting and AI quotas can occasionally slow a review or fall back to rule-based results

## Deployment

### Environment variables

| Service | Variable | Value |
| --- | --- | --- |
| Render API | `MONGODB_URI` | **Secret.** MongoDB Atlas application database connection string. |
| Render API | `JWT_SECRET` | **Secret.** Generated by the Render blueprint and used to sign tokens. |
| Render API | `JWT_EXPIRES_IN` | Token lifetime; blueprint default is `7d`. |
| Render API | `SEED_DEMO_PASSWORD` | **Secret.** Required for production seeding; used only when creating demo users and never resets existing passwords. |
| Render API | `ALLOW_SELF_APPROVAL` | `false` in the blueprint; set to `true` only if policy permits submitter decisions. |
| Render API | `AI_API_KEY` | **Secret, optional.** Gemini API key; omit to use deterministic review only. |
| Render API | `AI_MODEL` | Gemini model name, default `gemini-3.8-flash`. |
| Render API | `AI_MAX_CHUNKS` | Maximum AI sections per document; default `5`. |
| Render API | `AI_CHUNK_CHARS` | Maximum characters sent in one AI section; default `6000`. |
| Render API | `AI_TOTAL_TIMEOUT_MS` | Overall AI analysis budget in milliseconds; default `45000`. |
| Render API | `AI_INGEST_MAX_CHUNKS` | Maximum guideline sections; default `8`. |
| Render API | `AI_INGEST_MAX_ITEMS` | Maximum rule and fact drafts per import; default `40`. |
| Render API | `AI_INGEST_TOTAL_TIMEOUT_MS` | Overall guideline analysis budget in milliseconds; default `60000`. |
| Render API | `CLIENT_URL` | Comma-separated allowed origins. Set the exact deployed Vercel origin; the CORS middleware reads this environment variable. |
| Render API | `PORT` | Supplied automatically by Render; do not set manually. |
| Render API | `NODE_ENV` | `production`, set by the Render blueprint (enables production seed safeguards). |
| Render API | `NODE_VERSION` | Set to `20.20.2` by the Render blueprint. |
| Vercel client | `VITE_API_URL` | API origin, e.g. `https://your-brandguard-api.onrender.com` (no `/api` suffix). Public build-time URL, not a secret. |

### Deploy MongoDB Atlas

1. Create or select an Atlas cluster and a least-privilege database user.
2. Configure Network Access for the Render service. Render's free tier has no fixed outbound IP addresses, so the demo deployment allows all addresses; restrict this (for example with static outbound IPs on a plan that provides them) for any production use.
3. Copy the Atlas connection string and keep it secret. Seed the intended database from the Render service Shell or a trusted one-off job only when ready. Set `SEED_DEMO_PASSWORD` as a Render secret, verify `MONGODB_URI`, and run `npm run seed -- --confirm` from `server`. The seed is additive and idempotent: it inserts missing sample Rules/Facts and demo users by code/email, preserves existing records and passwords, and does not clear collections.

### Deploy the backend to Render

1. Connect the repository in Render and create a Web Service using the root `render.yaml` Blueprint, or configure the service manually.
2. Set the service root directory to `server`, build command to `npm install`, and start command to `npm start`.
3. Set `MONGODB_URI`, `SEED_DEMO_PASSWORD`, and `AI_API_KEY` (if AI is enabled) as Render secrets. Set `CLIENT_URL` to the exact Vercel origin; Render generates `JWT_SECRET`. Do not add credentials or deployment-specific origins to the repository.
4. After deploy, verify the health URL: `https://your-brandguard-api.onrender.com/api/health`. It should return `{"status":"ok","db":"connected"}`.
5. Optional: add an UptimeRobot monitor on `/api/health` (5-minute interval) so the free-tier service does not spin down.

### Deploy the frontend to Vercel

1. Import the repository in Vercel and set the project root directory to `client`.
2. Set the build command to `npm run build` and the output directory to `dist` (Vercel usually detects Vite automatically).
3. Add `VITE_API_URL=https://your-brandguard-api.onrender.com` in the Vercel project environment variables, then deploy or redeploy.
4. Add the exact production Vercel origin (and any preview origins you intend to support) to Render's comma-separated `CLIENT_URL`, then redeploy the backend.
5. `client/vercel.json` contains a rewrite so browser refresh works on `/history` and `/reviews/:id`.

## Live links

- Live demo: https://brand-guard-ai-pi.vercel.app
- Backend: https://brandguard-ai-inwv.onrender.com
- Health: https://brandguard-ai-inwv.onrender.com/api/health
