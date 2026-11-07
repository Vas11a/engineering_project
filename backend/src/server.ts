import { createServer } from 'node:http';

import { disconnectDatabase } from './database/prisma.js';
import { createRuntime } from './runtime.js';

const { app, environment, bot } = createRuntime();
const server = createServer(app);
const stopPolling =
  environment.BOT_MODE === 'polling' ? bot?.startPolling() : undefined;

server.listen(environment.PORT, () => {
  console.log(`API listening on port ${environment.PORT}`);
  if (environment.BOT_MODE === 'disabled') {
    console.log(
      'Telegram bot is disabled. Set BOT_MODE=polling for local bot testing.',
    );
  } else {
    console.log(
      `Telegram bot mode: ${environment.BOT_MODE}${environment.MINI_APP_URL ? '' : ' (text commands only; MINI_APP_URL is not configured)'}`,
    );
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Shutting down.`);
  stopPolling?.();
  const forcedShutdown = setTimeout(() => process.exit(1), 10_000);
  forcedShutdown.unref();

  server.close(async (error) => {
    await disconnectDatabase();
    clearTimeout(forcedShutdown);

    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
