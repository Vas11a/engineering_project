import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/http/app.js';

describe('health endpoints', () => {
  it('reports process liveness', async () => {
    const app = createApp({
      corsOrigin: 'http://localhost:5173',
      checkDatabase: vi.fn().mockResolvedValue(undefined),
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'language-learning-api',
    });
  });

  it('reports database readiness', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const app = createApp({
      corsOrigin: 'http://localhost:5173',
      checkDatabase,
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', database: 'connected' });
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it('reports an unavailable database', async () => {
    const app = createApp({
      corsOrigin: 'http://localhost:5173',
      checkDatabase: vi
        .fn()
        .mockRejectedValue(new Error('database unavailable')),
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      database: 'disconnected',
    });
  });
});
