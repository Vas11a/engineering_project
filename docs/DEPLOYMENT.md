# Tokens, deployment and real-device testing

## 1. Database and bot token

Create a Neon project and copy both PostgreSQL URLs: pooled (-pooler hostname) to DATABASE_URL; direct to DATABASE_URL_UNPOOLED. Keep sslmode=require. Use separate development/production databases or branches. Migrations are under backend/prisma/migrations; test them in development first. No cloud resources are provisioned automatically. [Neon pooling](https://neon.com/docs/connect/connection-pooling).

In Telegram, open @BotFather, run /newbot, and copy its token to backend TELEGRAM_BOT_TOKEN. The launching bot and backend must use the same token. Never put it in VITE_* variables.

## 2. Backend on Render

Create a Blueprint from render.yaml, or a Node Web Service:

| Setting        | Value                              |
| -------------- | ---------------------------------- |
| Root directory | backend                            |
| Build          | npm ci && npm run build            |
| Start          | npm run db:deploy && npm start     |
| Health check   | /ready                             |
| Node           | 22.18.0 or newer supported release |

The start command applies committed migrations before serving. Larger deployments should move migrations to a dedicated release job.

| Backend variable        | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| NODE_ENV                | production                                                                |
| DATABASE_URL            | Pooled Neon URL                                                           |
| DATABASE_URL_UNPOOLED   | Direct Neon URL                                                           |
| TELEGRAM_BOT_TOKEN      | BotFather token                                                           |
| DEV_AUTH_ENABLED        | false                                                                     |
| CORS_ORIGIN             | Exact frontend origin, e.g. https://lexilo.vercel.app (no trailing slash) |
| MINI_APP_URL            | HTTPS frontend URL                                                        |
| PUBLIC_API_URL          | HTTPS Render URL                                                          |
| BOT_MODE                | webhook                                                                   |
| TELEGRAM_WEBHOOK_SECRET | Random 16–256 characters using A-Z a-z 0-9 _ -                            |

Render's Blueprint generates the webhook secret; copy its exact value to the environment used for bot setup. Alternatively generate one with openssl rand -hex 32. Preserve it between deploys or repeat setup after rotating it. PORT is supplied by Render. GET /ready returns status ready/database connected or 503. [Render Blueprint reference](https://render.com/docs/blueprint-spec).

## 3. Frontend on Vercel

Import the repository, select root frontend and framework Vite, build npm run build, output dist. Set VITE_API_URL=https://your-api.onrender.com without a trailing slash. No frontend secrets are required.

After deployment, update Render CORS_ORIGIN and MINI_APP_URL to the stable frontend URL and redeploy. Vite variables are embedded at build time: redeploy after editing VITE_API_URL. Disable deployment protection for the Mini App address so Telegram users can open it. [Vercel configuration](https://vercel.com/docs/project-configuration).

## 4. Register Telegram delivery

In a local backend/.env or Render shell, set the same production token, URLs, webhook secret, and BOT_MODE=webhook:

```bash
cd backend
npm run bot:setup
```

This installs commands, the Open Lexilo menu button and POST /api/v1/telegram/webhook. The endpoint verifies X-Telegram-Bot-Api-Secret-Token. Startup does not change webhooks automatically. You may also configure the Main Mini App in BotFather settings.

For actual Telegram testing, set DEV_AUTH_ENABLED=false. Opening an ordinary browser then gives 401; launch from the bot.

For local bot replies without a public frontend: set BOT_MODE=polling, leave MINI_APP_URL unset, run bot:setup to remove any webhook, then restart npm run dev. The bot responds to commands with text; use http://localhost:5173 in your computer's browser for the frontend. Setup restores the default Telegram menu instead of leaving a stale Mini App button. A publicly reachable HTTPS MINI_APP_URL is needed to add the app button and open the full Mini App inside Telegram; the frontend must also reach a public HTTPS backend. Do not run polling and a deployed webhook with the same token. Setup preserves pending updates. BOT_MODE=disabled starts only the API and never receives Telegram commands.

PostgreSQL receipts suppress completed duplicate updates. A two-minute lease recovers interrupted processing. A crash after Telegram accepts an outgoing reply but before its receipt commits can still cause one duplicate, since Telegram does not provide an idempotency key for sendMessage. [Telegram webhooks](https://core.telegram.org/bots/api#setwebhook).

## 5. Optional AI

Default provider/model: OpenAI gpt-5-mini, Chat Completions with structured output. Configure an API project key with billing and model access:

```dotenv
AI_API_KEY=your-api-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-5-mini
AI_TIMEOUT_MS=20000
AI_REQUESTS_PER_HOUR=20
```

Only the word/phrase and source/target languages are sent. The backend requests a JSON schema and independently validates output, limits its size, and handles refusals/timeouts. Review/edit the draft, explicitly confirm it, then save. Missing AI credentials never block manual creation.

A PostgreSQL quota is shared across API instances and resets at the next clock hour. Provider failures also consume quota to bound repeated expensive attempts. Configure provider-side account spending limits separately. [Model documentation](https://developers.openai.com/api/docs/models/gpt-5-mini), [structured output request format](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

If you already use Neon AI Gateway, leave AI_API_KEY absent and configure:

```dotenv
NEON_AI_GATEWAY_TOKEN=nt_live_your-token
NEON_AI_GATEWAY_BASE_URL=https://your-branch-api.ai.eu-central-1.aws.neon.tech
AI_MODEL=gpt-5-mini
```

The Neon base URL is the bare branch host; the backend appends /v1 (an existing /v1 suffix is also accepted). AI_API_KEY takes precedence when both providers are configured. Select a structured-output-capable model available from your branch's /v1/models endpoint. Gateway availability and account requirements are described in [Neon's documentation](https://neon.com/docs/ai-gateway/overview). No gateway is created by this app.

## 6. Real-device acceptance checklist

1. Check /health and /ready, then /start in Telegram and launch Lexilo.
2. Confirm your profile, create a set with at least three distinct translations, edit/delete a spare card.
3. Test all study modes with right/wrong answers. Reload an active session and resume. Complete it and check statistics.
4. A wrong card is scheduled in 10 minutes; a first correct answer in one day. New cards remain available immediately.
5. Publish a nonempty set. In a second Telegram account, search/filter the catalog and copy it. Original edits must not change the copy, and private sets must stay inaccessible.
6. Generate, edit, confirm and save an AI draft. Remove its key and check manual creation. Verify a low configured quota returns 429.
7. Test /study, /library, /progress, /help and their buttons.
8. Test light/dark themes, a small screen, background/reopening. If launch authentication expires, close and reopen the Mini App.

## Troubleshooting

| Symptom              | Check                                                               |
| -------------------- | ------------------------------------------------------------------- |
| 401 outside Telegram | Expected with development auth off                                  |
| 401 inside Telegram  | Correct bot token; close/reopen stale launch                        |
| CORS error           | Exact origin; correct VITE_API_URL; redeploy frontend               |
| /ready returns 503   | Credentials, SSL, connectivity and migrations                       |
| Bot silent           | Run setup; inspect webhook errors; avoid concurrent polling/webhook |
| AI 503               | Missing AI/gateway credentials                                      |
| AI 502/504           | Provider/model access, billing, output support or timeout           |
| AI 429               | Hourly user quota reached                                           |

Keep real credentials in hosting settings and ignored .env files. Local tests with stubbed providers do not establish that real tokens, remote hosting or Telegram clients are configured.
