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

In one terminal, from the project root:

```bash
cd server
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm ci
```

Set `MONGODB_URI` in `server/.env` to your MongoDB Atlas connection string. To enable AI-assisted analysis, also set `AI_API_KEY` to a Google AI Studio API key and `AI_MODEL` to `gemini-3.8-flash`. AI is enabled by default in the review form; the app continues with deterministic-only findings if the AI request is unavailable or fails. Then start the development server:

```bash
npm run dev
```

For a production-style start, use `npm start`.

### Seed the data

With `MONGODB_URI` set in `server/.env`, from the `server` directory run:

```bash
npm run seed -- --confirm
```

The seed command clears and replaces the Rules and Facts collections with fictional Nimbus Notes data. It requires `--confirm` every time to prevent accidental database wipes.

### Test the data endpoints

Start the server with `npm run dev`, then use a second terminal:

```bash
curl http://localhost:5000/api/rules
curl "http://localhost:5000/api/rules?category=claims"
curl http://localhost:5000/api/facts
# PowerShell: Invoke-RestMethod http://localhost:5000/api/rules
```

### Run the tests

```bash
cd server
npm test
```

The tests run the review engine on the demo document and check the AI validator with a mocked provider. No real AI calls are made.

### Client

In a second terminal, from the project root:

```bash
cd client
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm ci
npm run dev
```

The Vite development server prints the local URL (normally http://localhost:5173). The client API layer uses `VITE_API_URL` from `client/.env`.

## Environment variables

| Variable | Location | Purpose |
| --- | --- | --- |
| `PORT` | server/.env | Express port; defaults to 5000 when omitted. |
| `MONGODB_URI` | server/.env | MongoDB Atlas connection string. |
| `CLIENT_URL` | server/.env | Comma-separated browser origins allowed by CORS. |
| `AI_API_KEY` | server/.env | Secret Google Gemini API key. Keep it on the server only. |
| `AI_MODEL` | server/.env | Gemini model identifier; use `gemini-3.8-flash`. |
| `VITE_API_URL` | client/.env | Base URL used by the client to reach the API. |

Copy the example env files and replace placeholders locally. Never commit `.env` files or real credentials.

## Scripts

| Directory | Command | Purpose |
| --- | --- | --- |
| client | `npm run dev` | Start the Vite development server. |
| client | `npm run build` | Create the production client bundle. |
| client | `npm run preview` | Preview the production client bundle locally. |
| server | `npm run dev` | Start the API with nodemon. |
| server | `npm start` | Start the API with Node.js. |
| server | `npm test` | Run the review engine and mocked AI tests. |
| server | `npm run seed -- --confirm` | Clear and replace the Rules and Facts collections with Nimbus Notes sample data. |

## Limitations and responsible AI

Deterministic rules and approved facts remain the source of truth. AI findings are advisory, must cite a known Rule or Fact code (or be marked `needs_verification`), and are dropped if their evidence code or quoted text cannot be validated against the current review. A model can still misinterpret tone or produce a poor rewrite, so review all suggestions before publishing. Rewrites are drafts, not approved copy. AI failures and timeouts fall back to deterministic results and are shown as an unavailable notice. Review text is sent to Google Gemini only when AI analysis is enabled; disable the toggle for deterministic-only processing. The API caps review text at 10,000 characters and rate-limits review creation.

## Known limitations

- No user accounts, approval roles or audit trail yet (planned for Round 3)
- Review notes are drafts and are not saved
- Plain text input only, English only
- Fact matching uses keyword overlap, so unusual phrasing can be missed
- Free-tier hosting and AI quotas can occasionally slow a review or fall back to rule-based results

## Deployment

### Environment variables

| Service | Variable | Value |
| --- | --- | --- |
| Render API | `MONGODB_URI` | MongoDB Atlas application database connection string (secret). |
| Render API | `CLIENT_URL` | Comma-separated allowed origins, e.g. `https://your-app.vercel.app,http://localhost:5173`. |
| Render API | `AI_API_KEY`, `AI_MODEL` | Gemini API key (secret) and model name `gemini-3.8-flash`. |
| Render API | `PORT` | Set automatically by Render; the service listens on this value. |
| Vercel client | `VITE_API_URL` | Render API origin, e.g. `https://your-brandguard-api.onrender.com` (no `/api` suffix). |

### Deploy MongoDB Atlas

1. Create or select an Atlas cluster and a least-privilege database user.
2. Configure Network Access for the Render service. Render's free tier has no fixed outbound IP addresses, so the demo deployment allows all addresses; restrict this (for example with static outbound IPs on a plan that provides them) for any production use.
3. Copy the Atlas connection string and keep it secret. Seed the intended database from a trusted local terminal only when ready: from `server`, set `MONGODB_URI` and run `npm run seed -- --confirm`. This replaces the Rules and Facts collections.

### Deploy the backend to Render

1. Connect the repository in Render and create a Web Service using the root `render.yaml` Blueprint, or configure the service manually.
2. Set the service root directory to `server`, build command to `npm install`, and start command to `npm start`.
3. Set `MONGODB_URI`, `AI_API_KEY`, `AI_MODEL` and `CLIENT_URL` (a comma-separated list including the final Vercel origin). Do not add credentials to `render.yaml`.
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
