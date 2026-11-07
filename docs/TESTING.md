# Verification

Run format, lint, typecheck, test and build in backend and frontend. Tests call no real AI/Telegram services: they validate schemas, payloads, errors and quotas using controlled stubs. Frontend tests exercise interactions against stubbed HTTP responses.

The scheduler has deterministic tests for wrong/correct answers, streak resets, interval growth and bounds. API tests cover ownership, validation and lifecycle transitions. Use a dedicated disposable database for PostgreSQL integration tests, never a real user's database.

## Real PostgreSQL integration tests

Create a separate PostgreSQL database, then run from backend:

```bash
export TEST_DATABASE_URL='postgresql://test-user:test-password@localhost:5432/lexilo_test'
DATABASE_URL_UNPOOLED="$TEST_DATABASE_URL" npm run db:deploy
npm run prisma:generate
npm run test:integration
```

`test:integration` refuses to run without `TEST_DATABASE_URL`; it never falls back to the application's `DATABASE_URL`. The regular unit-test command skips these suites when no test URL is provided. Tests create isolated users and remove only their own records, without truncating tables. They exercise real migrations, catalog isolation/copying, publishing, grading, saved sessions, concurrent duplicate answers, deletion/editing during study, progress retention, shared AI quotas and bot receipts. CI runs these suites against a PostgreSQL 18 service as a separate job.

The verified local run passed 55 backend unit/HTTP tests, nine PostgreSQL integration tests and 16 frontend tests. Formatting, lint, type checking and production builds also passed. The compiled production server returned 200 from `/health` and `/ready` and 401 from `/api/v1/users/me` without authentication. Browser QA covered manual creation after missing AI configuration, publishing, catalog copying, session resume and completion, statistics and a 390px viewport with no horizontal overflow.

## Manual core flow

1. Create a set and three cards with distinct translations.
2. Run mixed study; submit right and wrong answers; finish.
3. Reload an active session and resume. Verify retries do not count an answer twice.
4. Inspect statistics, publish a set, copy from a second identity and check isolation.
5. Check manual creation after AI failure and verify drafts never save without confirmation.
6. Repeat inside Telegram with development auth disabled.

Remote PostgreSQL TLS, actual signed launches, provider billing/model access and hosting settings still require the [real-device acceptance checklist](DEPLOYMENT.md#6-real-device-acceptance-checklist).
