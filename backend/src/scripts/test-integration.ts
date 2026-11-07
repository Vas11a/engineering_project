import { spawnSync } from 'node:child_process';

// Explicit opt-in prevents this command from using the application's real DB.
if (!process.env.TEST_DATABASE_URL) {
  console.error(
    'Set TEST_DATABASE_URL to a separate, migrated PostgreSQL test database. DATABASE_URL is never used as a fallback.',
  );
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      'tests/database.integration.test.ts',
      'tests/study.integration.test.ts',
    ],
    { stdio: 'inherit', env: process.env },
  );
  process.exitCode = result.status ?? 1;
}
