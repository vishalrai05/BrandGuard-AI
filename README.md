# BrandGuard AI

A transparent pre-publication platform that reviews marketing content against approved brand rules and facts.

## Setup

Requirements: Node.js 20.20.2 and npm for the server. MongoDB Atlas is required.

### Server

In one terminal, from the project root:

```powershell
cd server
Copy-Item .env.example .env
npm ci
```

Set `MONGODB_URI` in `server/.env` to your MongoDB Atlas connection string. To enable AI-assisted analysis, also set `AI_API_KEY` to a Google AI Studio API key and `AI_MODEL` to `gemini-3.8-flash`. AI is enabled by default in the review form; the app continues with deterministic-only findings if the AI request is unavailable or fails. Then start the development server:

```powershell
npm run dev
```

For a production-style start, use `npm start`.

### Seed the data

With `MONGODB_URI` set in `server/.env`, from the `server` directory run:

```powershell
npm run seed -- --confirm
```

The seed command clears and replaces the Rules and Facts collections with fictional Nimbus Notes data. It requires `--confirm` every time to prevent accidental database wipes.

### Test the data endpoints

Start the server with `npm run dev`, then use a second terminal:

```powershell
Invoke-RestMethod http://localhost:5000/api/rules
Invoke-RestMethod 'http://localhost:5000/api/rules?category=claims'
Invoke-RestMethod http://localhost:5000/api/facts
```

### Client

In a second terminal, from the project root:

```powershell
cd client
Copy-Item .env.example .env
npm ci
npm run dev
```

The Vite development server prints the local URL (normally `http://localhost:5173`). The client API client uses `VITE_API_URL` from `client/.env`.

## Environment variables

| Variable | Location | Purpose |
|---|---|---|
| `PORT` | `server/.env` | Express port; defaults to `5000` when omitted. |
| `MONGODB_URI` | `server/.env` | MongoDB Atlas connection string. |
| `CLIENT_URL` | `server/.env` | Comma-separated browser origins allowed by CORS. |
| `AI_API_KEY` | `server/.env` | Secret Google Gemini API key. Keep it on the server only. |
| `AI_MODEL` | `server/.env` | Gemini model identifier; use `gemini-3.8-flash`. |
| `VITE_API_URL` | `client/.env` | Base URL used by the client to reach the API. |

Copy the example env files and replace placeholders locally. Never commit `.env` files or real credentials.

### Limitations and responsible AI

Deterministic rules and approved facts remain the source of truth. AI findings are advisory, must cite a known Rule or Fact code (or be marked `needs_verification`), and are dropped if their evidence code or quoted text cannot be validated against the current review. A model can still misinterpret tone or produce a poor rewrite, so review all suggestions before publishing. Rewrites are drafts, not approved copy. AI failures and timeouts fall back to deterministic results and are shown as an unavailable notice. Review text is sent to Google Gemini only when AI analysis is enabled; disable the toggle for deterministic-only processing. The API caps review text at 10,000 characters and rate-limits review creation.

## Scripts

| Directory | Command | Purpose |
|---|---|---|
| `client` | `npm run dev` | Start the Vite development server. |
| `client` | `npm run build` | Create the production client bundle. |
| `client` | `npm run preview` | Preview the production client bundle locally. |
| `server` | `npm run dev` | Start the API with nodemon. |
| `server` | `npm start` | Start the API with Node.js. |
| `server` | `npm run seed -- --confirm` | Clear and replace the Rules and Facts collections with Nimbus Notes sample data. |

## Deployment

### Environment variables

| Service | Variable | Value |
|---|---|---|
| Render API | `MONGODB_URI` | MongoDB Atlas application database connection string (secret). |
| Render API | `CLIENT_URL` | Comma-separated allowed origins, e.g. `https://your-app.vercel.app,http://localhost:5173`. |
| Render API | `PORT` | Set automatically by Render; the service listens on this value. |
| Vercel client | `VITE_API_URL` | Render API origin, e.g. `https://your-brandguard-api.onrender.com` (no `/api` suffix). |

### Deploy MongoDB Atlas

1. Create or select an Atlas cluster and a least-privilege database user.
2. Configure Network Access for the Render service. For a Render outbound IP allowlist, use static outbound IPs on a plan that provides them; otherwise follow Render and Atlas guidance for your chosen plan. Do not use `0.0.0.0/0` as a permanent production rule.
3. Copy the Atlas connection string and keep it secret. Seed the intended database from a trusted local terminal only when ready: from `server`, set `MONGODB_URI` and run `npm run seed -- --confirm`. This replaces the Rules and Facts collections.

### Deploy the backend to Render

1. Connect the repository in Render and create a Web Service using the root [render.yaml](./render.yaml) Blueprint, or configure the service manually.
2. Set the service root directory to `server`, build command to `npm install`, and start command to `npm start`.
3. Set `MONGODB_URI` to the Atlas URI and `CLIENT_URL` to a comma-separated list including the final Vercel origin. Do not add credentials to `render.yaml`.
4. After deploy, verify the health URL: `https://your-brandguard-api.onrender.com/api/health`. It should return `{"status":"ok","db":"connected"}`.

### Deploy the frontend to Vercel

1. Import the repository in Vercel and set the project root directory to `client`.
2. Set the build command to `npm run build` and the output directory to `dist` (Vercel usually detects Vite automatically).
3. Add `VITE_API_URL=https://your-brandguard-api.onrender.com` in the Vercel project environment variables, then deploy or redeploy.
4. Add the exact production Vercel origin (and any preview origins you intend to support) to Render's comma-separated `CLIENT_URL`, then redeploy the backend.
5. Vercel's [client/vercel.json](./client/vercel.json) rewrite supports browser refresh on `/history` and `/reviews/:id`.

### Live URL placeholders

-  Live demo: https://brand-guard-ai-pi.vercel.app
- Backend: https://brandguard-ai-inwv.onrender.com
- Health: https://brandguard-ai-inwv.onrender.com/api/health
