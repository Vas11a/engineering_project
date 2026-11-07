import { Router } from 'express';

import { getEnvironment } from './config/env.js';
import { checkDatabaseConnection, prisma } from './database/prisma.js';
import { createApp } from './http/app.js';
import { createAuthenticationMiddleware } from './http/middleware/authenticate.js';
import { verifyTelegramInitData } from './auth/telegram.js';
import { PrismaAppStore } from './store/prisma-store.js';
import { createCatalogRouter } from './http/routes/catalog.js';
import { createStudyRouter } from './study/routes.js';
import { createProgressRouter } from './progress/routes.js';
import { countDueCards } from './study/service.js';
import { createAiRouter, createPrismaQuota } from './ai/router.js';
import { createTelegramBot, createPrismaReceipts } from './bot/telegram.js';

export function createRuntime() {
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
  const routes = Router();
  routes.use('/public-sets', createCatalogRouter(prisma));
  routes.use('/study', createStudyRouter(prisma));
  routes.use('/progress', createProgressRouter(prisma));
  const gatewayUrl = environment.NEON_AI_GATEWAY_BASE_URL?.replace(/\/$/, '');
  routes.use(
    '/ai',
    createAiRouter({
      apiKey: environment.AI_API_KEY ?? environment.NEON_AI_GATEWAY_TOKEN,
      baseUrl:
        !environment.AI_API_KEY && gatewayUrl
          ? `${gatewayUrl.replace(/\/v1$/, '')}/v1`
          : environment.AI_BASE_URL,
      model: environment.AI_MODEL,
      timeoutMs: environment.AI_TIMEOUT_MS,
      requestsPerHour: environment.AI_REQUESTS_PER_HOUR,
      consumeQuota: createPrismaQuota(prisma),
    }),
  );
  const bot =
    environment.BOT_MODE !== 'disabled'
      ? createTelegramBot({
          token: environment.TELEGRAM_BOT_TOKEN,
          miniAppUrl: environment.MINI_APP_URL,
          webhookSecret: environment.TELEGRAM_WEBHOOK_SECRET,
          store,
          countDue: (userId) => countDueCards(prisma, userId),
          receipts: createPrismaReceipts(prisma),
        })
      : undefined;
  const app = createApp({
    corsOrigin: environment.CORS_ORIGIN,
    checkDatabase: checkDatabaseConnection,
    api: { authenticate, store, routes },
    telegram:
      environment.BOT_MODE === 'webhook' ? bot?.webhookRouter : undefined,
  });
  return { app, environment, bot };
}
