# Telegram Language Learning Application

A university engineering project for learning foreign-language vocabulary through a Telegram Mini App and a Telegram bot.

## Architecture

The repository contains two independent TypeScript applications:

- `frontend` — React, Vite, Tailwind CSS, and the Telegram Mini Apps SDK
- `backend` — Node.js, Express, Prisma ORM, and PostgreSQL hosted on Neon

The frontend is intended for Vercel. The backend and Telegram bot are intended for Render.

## Requirements

- Node.js 22.18 or newer
- npm 10 or newer
- A Neon project with pooled and direct PostgreSQL connection strings

## Local setup

Install dependencies for both applications:

```bash
cd frontend
npm install

cd ../backend
npm install
```

Create local environment files from the examples:

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Use the pooled Neon connection string for `DATABASE_URL`. Use the direct connection string for `DATABASE_URL_UNPOOLED`, because schema migrations must not run through PgBouncer.

Generate the Prisma client and apply the database migration:

```bash
cd backend
npm run prisma:generate
npm run db:migrate
npm run db:check
```

Start the backend and frontend in separate terminals:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

The frontend runs at `http://localhost:5173` and expects the backend at `http://localhost:3000` by default.

## Quality checks

Run these commands in both `frontend` and `backend` before committing:

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

## Health endpoints

- `GET /health` — process liveness
- `GET /ready` — database readiness
