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

### SSO (optional)

With Google OAuth, users sign in once; their API key and provider/model are saved per user so they can chat and view usage without re-entering credentials.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 Client ID (Web application). Add redirect URI: `http://localhost:3002/auth/callback` (or your gateway URL in production).
2. Set env when starting the gateway:
   - `GOOGLE_CLIENT_ID` – OAuth client ID  
   - `GOOGLE_CLIENT_SECRET` – OAuth client secret  
   - `JWT_SECRET` or `SESSION_SECRET` – secret to sign session tokens (defaults to a placeholder)  
   - `DASHBOARD_URL` – where the React app runs (e.g. `http://localhost:5173`)  
   - `GATEWAY_PUBLIC_URL` – public URL of the gateway (e.g. `http://localhost:3002`) for OAuth redirect_uri
3. In the dashboard, **Sign in with Google** appears; after login, users add their API key once in **Settings**. Credentials are stored on the gateway (in-memory by default) and used for chat and usage.

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
