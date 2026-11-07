import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import {
  createTelegramBot,
  telegramRequest,
  type BotReceipts,
} from '../src/bot/telegram.js';
import { errorHandler } from '../src/http/middleware/error-handler.js';

const user = {
  id: 'user-1',
  telegramId: '123',
  firstName: 'Ada',
  lastName: null,
  username: null,
  languageCode: null,
  photoUrl: null,
};
const update = {
  update_id: 42,
  message: {
    text: '/study',
    chat: { id: 123, type: 'private' },
    from: { id: 123, first_name: 'Ada' },
  },
};
function setup(miniAppUrl: string | null = 'https://lexilo.example') {
  const receipts: BotReceipts = {
    claim: vi.fn().mockResolvedValue('acquired'),
    complete: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({ ok: true, result: true }));
  const store = { upsertUser: vi.fn().mockResolvedValue(user) };
  const countDue = vi.fn().mockResolvedValue(3);
  const bot = createTelegramBot({
    token: 'test-token',
    miniAppUrl: miniAppUrl ?? undefined,
    webhookSecret: 'secret-123456789',
    receipts,
    fetch: fetcher,
    store,
    countDue,
  });
  const app = express();
  app.use(express.json());
  app.use(bot.webhookRouter);
  app.use(errorHandler);
  return { bot, app, fetcher, receipts, store, countDue };
}

describe('Telegram bot', () => {
  it('does not call Telegram until explicitly invoked', () => {
    const { fetcher } = setup();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated webhook before processing an update', async () => {
    const { app, fetcher, receipts } = setup();
    const response = await request(app).post('/webhook').send(update);
    expect(response.status).toBe(403);
    expect(receipts.claim).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns due count and a Mini App link for the study command', async () => {
    const { app, fetcher, receipts, store, countDue } = setup();
    const response = await request(app)
      .post('/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'secret-123456789')
      .send(update);
    expect(response.status).toBe(200);
    expect(store.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ telegramId: 123n }),
    );
    expect(countDue).toHaveBeenCalledWith('user-1');
    const payload = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(payload.text).toContain('3 cards due');
    expect(payload.reply_markup.inline_keyboard[0][0].web_app.url).toBe(
      'https://lexilo.example/?start=study',
    );
    expect(receipts.complete).toHaveBeenCalledWith(42);
  });

  it('acknowledges completed retries without duplicate messages', async () => {
    const { bot, fetcher, receipts } = setup();
    vi.mocked(receipts.claim).mockResolvedValue('done');
    await bot.handleUpdate(update);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('answers start during local polling without an unusable Mini App button', async () => {
    const { bot, fetcher, receipts } = setup(null);
    await bot.handleUpdate({
      ...update,
      message: { ...update.message, text: '/start' },
    });
    const payload = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(payload.text).toContain('Welcome to Lexilo!');
    expect(payload.text).toContain('3 cards due');
    expect(payload.text).toContain('not connected yet');
    expect(payload.text).not.toContain('localhost');
    expect(payload.reply_markup).toBeUndefined();
    expect(receipts.complete).toHaveBeenCalledWith(42);
  });

  it('retains safe API error codes without exposing provider details or credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(
        {
          ok: false,
          error_code: 409,
          description: 'Private provider details secret-test-token',
        },
        { status: 409 },
      ),
    );
    const result = telegramRequest(
      'secret-test-token',
      'getUpdates',
      {},
      fetcher,
    );
    await expect(result).rejects.toMatchObject({
      errorCode: 409,
      message: 'Telegram API rejected the request (code 409).',
    });
  });

  it('asks Telegram to retry when another worker holds the update lease', async () => {
    const { app, receipts, fetcher } = setup();
    vi.mocked(receipts.claim).mockResolvedValue('busy');
    const response = await request(app)
      .post('/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'secret-123456789')
      .send(update);
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('releases the lease if Telegram rejects sending a reply', async () => {
    const { bot, fetcher, receipts } = setup();
    fetcher.mockResolvedValue(Response.json({ ok: false }));
    await expect(bot.handleUpdate(update)).rejects.toThrow(
      'Telegram API rejected',
    );
    expect(receipts.release).toHaveBeenCalledWith(42);
    expect(receipts.complete).not.toHaveBeenCalled();
  });

  it('ignores groups and non-command messages', async () => {
    const { bot, receipts } = setup();
    await bot.handleUpdate({
      ...update,
      message: { ...update.message, chat: { id: -100, type: 'group' } },
    });
    await bot.handleUpdate({
      ...update,
      message: { ...update.message, text: 'Hello' },
    });
    expect(receipts.claim).not.toHaveBeenCalled();
  });

  it('validates incoming update payloads', async () => {
    const { app } = setup();
    const response = await request(app)
      .post('/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'secret-123456789')
      .send({ update_id: 'bad' });
    expect(response.status).toBe(400);
  });
});
