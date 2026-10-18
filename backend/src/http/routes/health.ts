import { Router } from 'express';

async function checkWithTimeout(
  checkDatabase: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      checkDatabase(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Database readiness check timed out.')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function createHealthRouter(checkDatabase: () => Promise<void>): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'ok',
      service: 'language-learning-api',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/ready', async (_request, response) => {
    try {
      await checkWithTimeout(checkDatabase, 3_000);
      response.status(200).json({ status: 'ready', database: 'connected' });
    } catch {
      response
        .status(503)
        .json({ status: 'unavailable', database: 'disconnected' });
    }
  });

  return router;
}
