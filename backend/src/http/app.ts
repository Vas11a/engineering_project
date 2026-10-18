import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { createHealthRouter } from './routes/health.js';

type AppDependencies = {
  corsOrigin: string;
  checkDatabase: () => Promise<void>;
};

export function createApp({
  corsOrigin,
  checkDatabase,
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

  app.use('/api/v1', express.Router());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
