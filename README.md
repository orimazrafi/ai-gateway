# AI Gateway

A minimal **AI Gateway** that sits between your app and OpenAI-compatible APIs. It provides:

- **Model routing** – Route by model id to different upstreams (OpenAI, Azure, local LLM).
- **Cost tracking** – Per-key token usage and estimated cost (USD).
- **Observability** – Request IDs, response timing, cost headers, and prompt log.
- **Rate limiting** – Per API key (or IP) requests per minute.
- **Prompt logging** – Optional request/response preview and token counts.
- **Streaming support** – Proxies SSE streaming for chat completions.
- **Retry policies** – Configurable retries with exponential backoff for transient failures.

## Quick start

```bash
cd ai-gateway
npm install
# Set your upstream API key (or forward client key)
export OPENAI_API_KEY=sk-...
npm run dev
```

Gateway runs at `http://localhost:3002`.

### React chat dashboard

A React dashboard to chat with the agent (streaming, provider/model/key in sidebar):

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173`. Ensure the gateway is running on port 3002; the dashboard proxies `/v1`, `/api`, `/auth`, and `/health` to it.

### Deploy to the internet (via GitHub)

You can have the app deploy automatically when you **push to GitHub** in two ways:

**Option A – Connect the repo (easiest)**  
No Actions secrets needed.

1. **Gateway:** [Railway](https://railway.app) or [Render](https://render.com) → New Project → **Deploy from GitHub** → select this repo. Set env vars (see table below). Every push to `main` will build and deploy the gateway.
2. **Dashboard:** [Vercel](https://vercel.com) → Add New Project → **Import** this repo. Set **Root Directory** to `dashboard`, add env **GATEWAY_URL** = your gateway URL. Every push to `main` will build and deploy the dashboard.

**Option B – Deploy from GitHub Actions**  
Uses the `Deploy` workflow in this repo.

1. In **Vercel**: create a project (root = `dashboard`), add **GATEWAY_URL** in project env. Copy your **Vercel token** ([account/tokens](https://vercel.com/account/tokens)), **Org ID** and **Project ID** (project Settings → General).
2. In **GitHub**: repo → **Settings → Secrets and variables → Actions**. Add:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
3. Push to `main`. The **Deploy** workflow runs and deploys the dashboard to Vercel.  
   (Gateway: still use Option A — connect the repo in Railway/Render so they deploy on push.)

Either way, you get **upload via GitHub**: push to `main` → gateway and dashboard deploy to the internet.

---

**Manual / one-off deploy**

You need two URLs: one for the **gateway** (API + auth) and one for the **dashboard** (Next.js). Deploy the gateway first, then the dashboard.

**1. Deploy the gateway** (Railway, Render, Fly.io, or any Node/Docker host)

- **Railway:** [railway.app](https://railway.app) → New Project → Deploy from GitHub (this repo). Set **Root Directory** to `/` (repo root). Add env vars (see table below). Railway will use the `Dockerfile` or run `npm run build && npm start`; set **Start Command** to `node build/index.js` and **Build Command** to `npm run build` if not using Docker. Note the public URL (e.g. `https://ai-gateway-xxx.up.railway.app`).
- **Render:** [render.com](https://render.com) → New Web Service → Connect this repo. Root directory: leave blank. Build: `npm install && npm run build`. Start: `node build/index.js`. Add the same env vars. Set **PORT** to what Render provides (e.g. `10000`) or leave default; Render sets `PORT` automatically.
- **Docker:** `docker build -t ai-gateway . && docker run -p 3002:3002 -e OPENAI_API_KEY=sk-... ai-gateway`. Expose the container on your server and put a reverse proxy (e.g. Caddy, nginx) in front with HTTPS.

Set at least:

| Env (gateway) | Example |
|---------------|--------|
| `PORT` | `3002` (or host’s assigned port) |
| `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY` | Your upstream API key |
| `GATEWAY_PUBLIC_URL` | `https://your-gateway-url.up.railway.app` |
| `DASHBOARD_URL` | Set in step 2 after deploying the dashboard |

For SSO (Google sign-in), also set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, and add the gateway callback URL in Google Console (e.g. `https://your-gateway-url.up.railway.app/auth/callback`).

**2. Deploy the dashboard** (Vercel)

- Go to [vercel.com](https://vercel.com) → Add New Project → Import this GitHub repo.
- Set **Root Directory** to `dashboard` (click Edit, set to `dashboard`).
- Add **Environment Variable**: **`GATEWAY_URL`** = your gateway URL (e.g. `https://ai-gateway-xxx.up.railway.app`) for **Production** (and optionally Preview). The dashboard uses relative URLs and Next.js rewrites proxy `/auth/*`, `/api/*`, `/v1/*` to the gateway, so the browser never calls the gateway directly (no CORS needed).
- Deploy. Vercel will build the Next.js app and give you a URL (e.g. `https://ai-gateway-dashboard.vercel.app`).

**3. Point the gateway at the dashboard**

- In the gateway’s env, set **`DASHBOARD_URL`** to your Vercel URL (e.g. `https://ai-gateway-dashboard.vercel.app`). This is used for OAuth redirects and CORS.
- If you use Google SSO, in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) add the gateway callback URL: `https://your-gateway-url/auth/callback`.

You can now open the dashboard URL in a browser; it will call your gateway on the internet.

**If you still see CORS or "fetch to ai-gateway.up.railway.app blocked":** The browser is running old JS. Do all of the following:

1. **Deploy the latest code**  
   Push your repo (including **`dashboard/app/gateway-auth-config/route.ts`**) to the branch Vercel builds from. In Vercel → Deployments, wait for the **latest** deployment to finish (green check).

2. **Env on Vercel**  
   Settings → Environment Variables: set **`GATEWAY_URL`** to your gateway URL. **Delete** **`NEXT_PUBLIC_GATEWAY_URL`** if it exists.

3. **Force a new build**  
   Deployments → … on the latest deployment → **Redeploy** → enable **Clear build cache** if shown. Wait for the new build to complete.

4. **Load the new bundle**  
   Open the **production URL** of the dashboard (or the new deployment’s URL). Do a **hard refresh** (Ctrl+Shift+R / Cmd+Shift+R) or open the site in an **incognito/private** window so the browser doesn’t use cached JS.

5. **Check in Network tab**  
   Open DevTools → Network. Reload the page. The auth config request should go to **`https://your-dashboard.vercel.app/gateway-auth-config`** (your Vercel host). If you see **404 "Application not found"** on that request, the deployment does not include the route: ensure **`dashboard/app/gateway-auth-config/route.ts`** is committed and pushed, then in Vercel use **Redeploy** with **Clear build cache** and open the **new deployment’s** URL (not an old preview).

### SSO (optional)

With Google OAuth, users sign in once; their API key and provider/model are saved per user so they can chat and view usage without re-entering credentials.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 Client ID (Web application).
   - **Authorized redirect URIs:** add the **dashboard** callback (where Google sends the user after login):
     - Local: `http://localhost:3000/auth/callback` (or your Next.js dev port)
     - Production: `https://<your-dashboard-host>/auth/callback` (e.g. `https://ai-gateway-azure.vercel.app/auth/callback`)
   - **Authorized JavaScript origins:** add the dashboard origin (no path): e.g. `http://localhost:3000` and `https://ai-gateway-azure.vercel.app`
2. Set env when starting the **gateway** (e.g. on Railway): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET` or `SESSION_SECRET`, and **`DASHBOARD_URL`** = full dashboard URL (e.g. `https://ai-gateway-azure.vercel.app`). The gateway uses `DASHBOARD_URL/auth/callback` as the OAuth redirect_uri when talking to Google.
3. The dashboard has a real route at **`/auth/callback`** (`app/auth/callback/route.ts`). After login, Google redirects there; the dashboard then sends the user to the gateway to exchange the code and redirect back with the token.

**SSO checklist (if the button doesn’t show or login fails):**

| Where | What to check |
|-------|----------------|
| **Vercel** | Only `GATEWAY_URL` set (no `NEXT_PUBLIC_GATEWAY_URL`). Redeploy with “Clear build cache” if you changed env. |
| **Railway (gateway)** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DASHBOARD_URL` (full dashboard URL, no trailing slash). Redeploy after changing. |
| **Google Console** | Authorized redirect URIs: dashboard URL + `/auth/callback` (e.g. `https://ai-gateway-azure.vercel.app/auth/callback`). Authorized JavaScript origins: dashboard origin (e.g. `https://ai-gateway-azure.vercel.app`). |

### Database (optional)

By default, user settings, cost totals, and prompt log are kept in memory and lost on restart. To persist them, set a SQLite file path:

```bash
export DATABASE_PATH=./data/gateway.sqlite
```

Then install the optional dependency and run the gateway:

```bash
npm install better-sqlite3   # optional; needed only when using DATABASE_PATH
npm run dev
```

On startup you’ll see either `Storage: SQLite (persistent)` or `Storage: in-memory (set DATABASE_PATH for persistence)`.

Use it as the base URL for OpenAI clients:

```bash
curl http://localhost:3002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hi"}]}'
```

## Configuration (env)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3002` |
| `AI_GATEWAY_UPSTREAM` | Default upstream base URL (OpenAI-compatible) | `https://api.openai.com/v1` |
| `OPENAI_API_KEY` / `AI_GATEWAY_API_KEY` | Upstream API key when client doesn’t send one | - |
| `AI_GATEWAY_RATE_LIMIT_RPM` | Max requests per minute per key/IP | `60` |
| `AI_GATEWAY_RETRY_ATTEMPTS` | Max retries for upstream errors | `3` |
| `AI_GATEWAY_RETRY_DELAY_MS` | Base retry delay (exponential backoff) | `1000` |
| `AI_GATEWAY_PROMPT_LOGGING` | Set to `false` to disable prompt log | `true` |
| `AI_GATEWAY_MODEL_ROUTES` | Model routing: `modelId:baseUrl,modelId2:baseUrl2` | - |
| `DATABASE_PATH` / `DB_PATH` | SQLite file path for persistent user settings, costs, and prompt log | - (in-memory) |

## Model routing

Use `AI_GATEWAY_MODEL_ROUTES` to send specific models to different backends:

```bash
# e.g. gpt-4 -> OpenAI, llama -> local
export AI_GATEWAY_MODEL_ROUTES="gpt-4:https://api.openai.com/v1,llama:http://localhost:8080/v1"
```

## API

- **`POST /v1/chat/completions`** – Proxied to upstream (with routing, retry, streaming). Supports `stream: true`.
- **`GET /api/costs`** – All costs by key (in-memory).
- **`GET /api/costs/:key`** – Cost for one key.
- **`GET /api/prompt-log?limit=100`** – Last N prompt log entries.
- **`GET /health`** – Health check.

Response headers:

- `X-Request-Id` – Request id (or `X-Request-Id` from client).
- `X-RateLimit-Remaining` – Remaining requests in current window.
- `X-RateLimit-Reset-Ms` – Ms until window reset.
- `X-Cost-USD` – Estimated cost for non-streamed completions.

## New GitHub repo

To use this as a **new GitHub project**:

1. Create a new repository on GitHub (e.g. `ai-gateway`).
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial AI Gateway"
   git remote add origin https://github.com/YOUR_USER/ai-gateway.git
   git push -u origin main
   ```

If this folder lives inside another repo (e.g. `web`), you can move it out and then init, or use **GitHub’s “Use this template”** after pushing to a new repo.
