import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createAiRouter, type AiOptions } from '../src/ai/router.js';
import { errorHandler } from '../src/http/middleware/error-handler.js';

const input = {
  sourceText: 'hello',
  sourceLanguage: 'English',
  targetLanguage: 'Polish',
};
const content = {
  translation: 'cześć',
  explanation: 'A greeting.',
  examples: ['Hello! — Cześć!'],
};
function createTestApp(overrides: Partial<AiOptions> = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.currentUser = {
      id: 'user-1',
      telegramId: '123',
      firstName: 'Ada',
      lastName: null,
      username: null,
      languageCode: null,
      photoUrl: null,
    };
    next();
  });
  app.use(
    createAiRouter({
      apiKey: 'test-key',
      baseUrl: 'https://provider.example/v1',
      model: 'gpt-5-mini',
      timeoutMs: 30,
      requestsPerHour: 20,
      consumeQuota: vi.fn().mockResolvedValue(true),
      fetch: vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(content) },
            },
          ],
        }),
      ),
      ...overrides,
    }),
  );
  app.use(errorHandler);
  return app;
}

describe('AI card drafts', () => {
  it('returns a validated draft and sends only vocabulary data to the provider', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(content) },
          },
        ],
      }),
    );
    const quota = vi.fn().mockResolvedValue(true);
    const response = await request(
      createTestApp({ fetch: fetcher, consumeQuota: quota }),
    )
      .post('/card-content')
      .send(input);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(content);
    expect(quota).toHaveBeenCalledWith('user-1', 20);
    const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://provider.example/v1/chat/completions');
    const body = JSON.parse(options.body as string) as {
      messages: { content: string }[];
      response_format: { json_schema: { strict: boolean } };
    };
    expect(body.messages[1].content).toBe(JSON.stringify(input));
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(options.body).not.toContain('user-1');
  });

  it('allows manual cards when AI is unconfigured without consuming quota', async () => {
    const quota = vi.fn();
    const response = await request(
      createTestApp({ apiKey: undefined, consumeQuota: quota }),
    )
      .post('/card-content')
      .send(input);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_NOT_CONFIGURED');
    expect(quota).not.toHaveBeenCalled();
  });

  it('rejects invalid input before spending quota', async () => {
    const quota = vi.fn();
    const response = await request(createTestApp({ consumeQuota: quota }))
      .post('/card-content')
      .send({ ...input, sourceText: '' });
    expect(response.status).toBe(400);
    expect(quota).not.toHaveBeenCalled();
  });

  it('enforces the per-user quota before calling the provider', async () => {
    const fetcher = vi.fn();
    const response = await request(
      createTestApp({
        consumeQuota: vi.fn().mockResolvedValue(false),
        fetch: fetcher,
      }),
    )
      .post('/card-content')
      .send(input);
    expect(response.status).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { choices: [{ finish_reason: 'stop', message: { content: '{invalid' } }] },
    {
      choices: [
        {
          finish_reason: 'length',
          message: { content: JSON.stringify(content) },
        },
      ],
    },
    {
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ ...content, examples: [] }) },
        },
      ],
    },
    {
      choices: [
        { finish_reason: 'stop', message: { content: null, refusal: 'No' } },
      ],
    },
  ])(
    'rejects malformed, incomplete or refused provider responses',
    async (payload) => {
      const response = await request(
        createTestApp({
          fetch: vi.fn().mockResolvedValue(Response.json(payload)),
        }),
      )
        .post('/card-content')
        .send(input);
      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe('AI_UNAVAILABLE');
    },
  );

  it('stops slow provider requests at the configured timeout', async () => {
    const fetcher: typeof fetch = (_input, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      });
    const response = await request(
      createTestApp({ fetch: fetcher, timeoutMs: 5 }),
    )
      .post('/card-content')
      .send(input);
    expect(response.status).toBe(504);
    expect(response.body.error.code).toBe('AI_TIMEOUT');
  });

  it('bounds the provider response size', async () => {
    const response = await request(
      createTestApp({
        fetch: vi.fn().mockResolvedValue(new Response('x'.repeat(33_000))),
      }),
    )
      .post('/card-content')
      .send(input);
    expect(response.status).toBe(502);
  });
});
