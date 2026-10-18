import { createServer } from 'node:http';

import { getEnvironment } from './config/env.js';
import {
  checkDatabaseConnection,
  disconnectDatabase,
} from './database/prisma.js';
import { createApp } from './http/app.js';

const environment = getEnvironment();
const app = createApp({
  corsOrigin: environment.CORS_ORIGIN,
  checkDatabase: checkDatabaseConnection,
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
