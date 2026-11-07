import { timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Router } from 'express';
import { z } from 'zod';

import type { PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import type { AppStore } from '../store/types.js';

const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      text: z.string().max(4096).optional(),
      chat: z.object({ id: z.number().int(), type: z.string() }),
      from: z
        .object({
          id: z.number().int().positive(),
          is_bot: z.boolean().optional(),
          first_name: z.string().min(1),
          last_name: z.string().optional(),
          username: z.string().optional(),
          language_code: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

type ReceiptResult = 'acquired' | 'done' | 'busy';
export type BotReceipts = {
  claim: (updateId: number) => Promise<ReceiptResult>;
  complete: (updateId: number) => Promise<void>;
  release: (updateId: number) => Promise<void>;
};

export function createPrismaReceipts(prisma: PrismaClient): BotReceipts {
  let nextCleanupAt = 0;
  return {
    async claim(updateId) {
      const now = new Date();
      if (now.getTime() >= nextCleanupAt) {
        nextCleanupAt = now.getTime() + 3_600_000;
        // Telegram retains updates for at most 24h; seven days leaves retry history.
        await prisma.botUpdate.deleteMany({
          where: {
            processedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) },
          },
        });
      }
      const leasedUntil = new Date(now.getTime() + 120_000);
      const created = await prisma.botUpdate.createMany({
        data: [{ updateId: BigInt(updateId), processedAt: null, leasedUntil }],
        skipDuplicates: true,
      });
      if (created.count > 0) return 'acquired';
      const taken = await prisma.botUpdate.updateMany({
        where: {
          updateId: BigInt(updateId),
          processedAt: null,
          leasedUntil: { lt: now },
        },
        data: { leasedUntil },
      });
      if (taken.count > 0) return 'acquired';
      const existing = await prisma.botUpdate.findUnique({
        where: { updateId: BigInt(updateId) },
      });
      return existing?.processedAt ? 'done' : 'busy';
    },
    async complete(updateId) {
      await prisma.botUpdate.update({
        where: { updateId: BigInt(updateId) },
        data: { processedAt: new Date() },
      });
    },
    async release(updateId) {
      await prisma.botUpdate.updateMany({
        where: { updateId: BigInt(updateId), processedAt: null },
        data: { leasedUntil: new Date(0) },
      });
    },
  };
}

export class TelegramApiError extends Error {
  constructor(public readonly errorCode: number) {
    super(`Telegram API rejected the request (code ${errorCode}).`);
    this.name = 'TelegramApiError';
  }
}

export async function telegramRequest<T>(
  token: string,
  method: string,
  body: object,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetcher(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(15_000),
    },
  ).catch(() => {
    throw new Error('Telegram API is unavailable.');
  });
  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: T;
    error_code?: number;
  } | null;
  // Never include the provider's raw error, request URL or token in logs.
  if (!response.ok || !result?.ok) {
    throw new TelegramApiError(
      typeof result?.error_code === 'number'
        ? result.error_code
        : response.status,
    );
  }
  return result.result as T;
}

export type TelegramBotOptions = {
  token: string;
  miniAppUrl?: string;
  webhookSecret?: string;
  store: Pick<AppStore, 'upsertUser'>;
  countDue: (userId: string) => Promise<number>;
  receipts: BotReceipts;
  fetch?: typeof fetch;
};

export function createTelegramBot(options: TelegramBotOptions) {
  const call = <T>(method: string, body: object, signal?: AbortSignal) =>
    telegramRequest<T>(options.token, method, body, options.fetch, signal);

  async function handleUpdate(raw: unknown): Promise<void> {
    const update = updateSchema.parse(raw);
    const message = update.message;
    if (
      !message ||
      message.chat.type !== 'private' ||
      !message.from ||
      message.from.is_bot ||
      !message.text?.startsWith('/')
    )
      return;
    const result = await options.receipts.claim(update.update_id);
    if (result === 'done') return;
    if (result === 'busy')
      throw new HttpError(
        503,
        'BOT_UPDATE_BUSY',
        'This update is being processed.',
      );
    try {
      const profile = message.from;
      const user = await options.store.upsertUser({
        telegramId: BigInt(profile.id),
        firstName: profile.first_name,
        lastName: profile.last_name ?? null,
        username: profile.username ?? null,
        languageCode: profile.language_code ?? null,
        photoUrl: null,
      });
      const command = message.text.split(/\s/)[0].split('@')[0].toLowerCase();
      const view =
        command === '/progress'
          ? 'progress'
          : command === '/study'
            ? 'study'
            : 'library';
      const due =
        command === '/study' || command === '/start'
          ? await options.countDue(user.id)
          : undefined;
      const text =
        command === '/help'
          ? 'Lexilo helps you learn vocabulary with adaptive reviews.\n/library — manage your vocabulary\n/study — review due cards\n/progress — see your results\nOpen the app to create cards manually or with AI.'
          : command === '/progress'
            ? 'Open your learning progress and recent sessions.'
            : command === '/library'
              ? 'Open your vocabulary library to add words or explore public sets.'
              : command === '/study'
                ? `${due} card${due === 1 ? '' : 's'} due for review. Open the app to review or learn new cards.`
                : command === '/start'
                  ? `Welcome to Lexilo! Create a vocabulary set, add words and start learning.\n${due} card${due === 1 ? '' : 's'} due for review.`
                  : 'Use /library, /study, /progress or /help to get started.';
      const appUrl = options.miniAppUrl
        ? new URL(options.miniAppUrl)
        : undefined;
      appUrl?.searchParams.set('start', view);
      await call('sendMessage', {
        chat_id: message.chat.id,
        text: appUrl
          ? text
          : `${text}\n\nThe Mini App is not connected yet. For local testing, open the frontend in your computer's browser. Set a public HTTPS MINI_APP_URL to enable the Telegram app button.`,
        ...(appUrl
          ? {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text:
                        view === 'study'
                          ? 'Start learning'
                          : view === 'progress'
                            ? 'View progress'
                            : 'Open Lexilo',
                      web_app: { url: appUrl.toString() },
                    },
                  ],
                ],
              },
            }
          : {}),
      });
      await options.receipts.complete(update.update_id);
    } catch (error) {
      await options.receipts.release(update.update_id).catch(() => undefined);
      throw error;
    }
  }

  const webhookRouter = Router();
  webhookRouter.post('/webhook', async (request, response) => {
    const received = request.header('x-telegram-bot-api-secret-token') ?? '';
    const expected = options.webhookSecret ?? '';
    const receivedBytes = Buffer.from(received);
    const expectedBytes = Buffer.from(expected);
    if (
      !expected ||
      receivedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(receivedBytes, expectedBytes)
    ) {
      throw new HttpError(
        403,
        'INVALID_WEBHOOK_SECRET',
        'Invalid webhook secret.',
      );
    }
    await handleUpdate(request.body);
    response.json({ ok: true });
  });

  // Polling is opt-in. No Telegram request is sent merely by constructing the bot.
  function startPolling(): () => void {
    const controller = new AbortController();
    void (async () => {
      let offset = 0;
      while (!controller.signal.aborted) {
        try {
          const updates = await call<unknown[]>(
            'getUpdates',
            { offset, timeout: 25, allowed_updates: ['message'] },
            AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
          );
          for (const raw of updates) {
            if (controller.signal.aborted) break;
            await handleUpdate(raw);
            offset = updateSchema.parse(raw).update_id + 1;
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          const reason =
            error instanceof TelegramApiError
              ? error.errorCode === 409
                ? 'Conflict: disable the active webhook or stop the other polling process.'
                : error.errorCode === 401 || error.errorCode === 404
                  ? 'Authentication failed: check TELEGRAM_BOT_TOKEN.'
                  : `Telegram API code ${error.errorCode}.`
              : 'Check network access, database connection and applied migrations.';
          console.error(`Telegram polling failed; retrying. ${reason}`);
          await delay(3_000, undefined, { signal: controller.signal }).catch(
            () => undefined,
          );
        }
      }
    })();
    return () => controller.abort();
  }

  return { webhookRouter, handleUpdate, startPolling };
}
