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
- Fact mismatch detection when a claim's number contradicts a verified fact
- AI-assisted analysis (Gemini 3.8 Flash) with strict output validation and an automatic rule-based fallback
- Compliant rewrite suggestions and per-finding suggested fixes
- Text view with labelled highlights, board view with drag and drop, search, filter and sort
- Accept, dismiss and undo, saved to the database; review history; Rules and Facts pages
- Compliance score, light and dark themes, responsive layout
- Automated tests for the review engine and the AI validator

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

## Limitations and responsible AI

Deterministic rules and approved facts remain the source of truth. AI findings are advisory, must cite a known Rule or Fact code (or be marked `needs_verification`), and are dropped if their evidence code or quoted text cannot be validated against the current review. A model can still misinterpret tone or produce a poor rewrite, so review all suggestions before publishing. Rewrites are drafts, not approved copy. AI failures and timeouts fall back to deterministic results and are shown as an unavailable notice. Review text is sent to Google Gemini only when AI analysis is enabled; disable the toggle for deterministic-only processing. The API caps review text at 10,000 characters and rate-limits review creation.

## Known limitations

- Plain text input only, English only
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
