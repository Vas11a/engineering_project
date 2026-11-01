import { createServer } from 'node:http';

import { getEnvironment } from './config/env.js';
import {
  checkDatabaseConnection,
  disconnectDatabase,
  prisma,
} from './database/prisma.js';
import { createApp } from './http/app.js';
import { createAuthenticationMiddleware } from './http/middleware/authenticate.js';
import { verifyTelegramInitData } from './auth/telegram.js';
import { PrismaAppStore } from './store/prisma-store.js';

const environment = getEnvironment();
const store = new PrismaAppStore(prisma);
const developmentProfile = environment.DEV_AUTH_ENABLED
  ? {
      telegramId: BigInt(environment.DEV_TELEGRAM_ID!),
      username: 'local_developer',
      firstName: environment.DEV_TELEGRAM_FIRST_NAME,
      lastName: null,
      languageCode: 'en',
      photoUrl: null,
    }
  : undefined;
const authenticate = createAuthenticationMiddleware({
  store,
  developmentProfile,
  verifyInitData: (rawInitData) =>
    verifyTelegramInitData(rawInitData, {
      botToken: environment.TELEGRAM_BOT_TOKEN,
      maxAgeSeconds: environment.TELEGRAM_AUTH_MAX_AGE_SECONDS,
    }),
});
const app = createApp({
  corsOrigin: environment.CORS_ORIGIN,
  checkDatabase: checkDatabaseConnection,
  api: { authenticate, store },
});
const server = createServer(app);

server.listen(environment.PORT, () => {
  console.log(`API listening on port ${environment.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Shutting down.`);

  server.close(async (error) => {
    await disconnectDatabase();

    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
