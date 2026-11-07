# Lexilo — Telegram Language Learning

A university engineering project: a Telegram Mini App and bot for learning vocabulary with adaptive spaced repetition.

[Первый запуск и подключение токенов — инструкция на русском](docs/START_HERE_RU.md).

[Деплой frontend и backend одним проектом Vercel Services](docs/VERCEL.md).

## Features

- Telegram authentication and owner-scoped personal vocabulary sets/cards.
- Flashcards, typed translations, multiple choice and mixed study sessions.
- Persistent, resumable sessions with server-side grading and adaptive reviews.
- Progress dashboard, per-set results and recent history.
- Public catalog with search, language filters, pagination and independent copies.
- Optional AI drafts with editable preview and explicit confirmation before saving.
- Bot commands: /start, /help, /library, /study and /progress.

## Architecture

Two independent TypeScript applications:

| Directory | Stack                                         | Hosting         |
| --------- | --------------------------------------------- | --------------- |
| frontend  | React, Vite, Tailwind, Telegram Mini Apps SDK | Vercel Services |
| backend   | Express, Zod, Prisma                          | Vercel Services |

The preferred deployment uses one Vercel project with two Services: the frontend at `/` and Express at `/api/`, with `/health` and `/ready` routed to Express as well. PostgreSQL stays in Neon. Services is available in Beta on all Vercel plans. The checked-in `vercel.json` owns routing and per-service build settings; import the repository root (`./`) with the **Services** preset. The backend's Vercel entrypoint exports the app without starting a listener or polling worker; `npm run dev` retains the local server workflow.

The browser calls only the backend. Database access, Telegram tokens and AI credentials stay on the server. PostgreSQL can run on Neon or locally.

## Local setup

Requires Node.js 22 (22.18 or newer within that major) and npm 10+. From the repository root:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill backend/.env with DATABASE_URL (pooled Neon URL), DATABASE_URL_UNPOOLED (direct URL), and TELEGRAM_BOT_TOKEN. For browser development, retain DEV_AUTH_ENABLED=true and a positive DEV_TELEGRAM_ID. This identity is rejected in production.

```bash
cd backend
npm ci
npm run prisma:generate
npm run db:deploy
npm run db:check
npm run dev
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. The API defaults to port 3000. AI and bot delivery can remain disabled while testing the library and study flows. Existing environments apply checked-in migrations with db:deploy; developers create new migrations with db:migrate.

## Tokens and real Telegram testing

Follow [the Vercel Services guide](docs/VERCEL.md) for the preferred single-project deployment, production variables, migrations and Telegram webhook setup. The [separate Render/Vercel guide](docs/DEPLOYMENT.md) remains an alternative.

Production API requests use the same origin, so `VITE_API_URL` can remain unset. Local development defaults to `http://localhost:3000`; set `VITE_API_URL` only for a deliberately separate API origin. Database URLs and bot/AI tokens belong in server environment variables, never in `VITE_*` variables.

AI defaults to OpenAI gpt-5-mini. Set AI_API_KEY to enable it; compatible Neon AI Gateway credentials are also supported. Missing AI configuration does not block manual cards.

Startup never registers a Telegram webhook automatically. Configure BOT_MODE and public URLs, then run npm run bot:setup.

## Verification

Run in both application directories:

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

See [testing](docs/TESTING.md), [API reference](docs/API.md) and [architecture/scheduling](docs/ARCHITECTURE.md).

GET /health checks the process; GET /ready checks PostgreSQL. Private endpoints require Authorization: tma <Telegram initData>. Telegram webhooks use a separate secret header.
