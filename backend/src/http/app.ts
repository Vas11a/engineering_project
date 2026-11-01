import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';

import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { createHealthRouter } from './routes/health.js';
import { createApiRouter } from './routes/api.js';
import type { AppStore } from '../store/types.js';

type ApiDependencies = {
  authenticate: RequestHandler;
  store: AppStore;
};

type AppDependencies = {
  corsOrigin: string;
  checkDatabase: () => Promise<void>;
  api?: ApiDependencies;
};

export function createApp({
  corsOrigin,
  checkDatabase,
  api,
}: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use(createHealthRouter(checkDatabase));

  if (api) {
    app.use('/api/v1', api.authenticate, createApiRouter(api.store));
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
