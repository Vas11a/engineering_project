import 'dotenv/config';
import { z } from 'zod';

import { telegramRequest } from '../bot/telegram.js';

const settings = z
  .object({
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    MINI_APP_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().startsWith('https://').optional(),
    ),
    BOT_MODE: z.enum(['polling', 'webhook']),
    PUBLIC_API_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().startsWith('https://').optional(),
    ),
    TELEGRAM_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[A-Za-z0-9_-]{16,256}$/)
        .optional(),
    ),
  })
  .safeParse(process.env);

if (!settings.success) {
  console.error(
    'Set TELEGRAM_BOT_TOKEN and BOT_MODE=polling or webhook. MINI_APP_URL, when set, must use HTTPS.',
  );
  process.exitCode = 1;
} else {
  const env = settings.data;
  try {
    if (
      env.BOT_MODE === 'webhook' &&
      (!env.PUBLIC_API_URL || !env.TELEGRAM_WEBHOOK_SECRET || !env.MINI_APP_URL)
    ) {
      throw new Error(
        'Webhook setup requires MINI_APP_URL, PUBLIC_API_URL and TELEGRAM_WEBHOOK_SECRET.',
      );
    }
    await telegramRequest(env.TELEGRAM_BOT_TOKEN, 'setMyCommands', {
      commands: [
        { command: 'start', description: 'Open Lexilo' },
        { command: 'library', description: 'Your vocabulary sets' },
        { command: 'study', description: 'Review and learn words' },
        { command: 'progress', description: 'Your learning progress' },
        { command: 'help', description: 'How to use Lexilo' },
      ],
    });
    await telegramRequest(env.TELEGRAM_BOT_TOKEN, 'setChatMenuButton', {
      menu_button: env.MINI_APP_URL
        ? {
            type: 'web_app',
            text: 'Open Lexilo',
            web_app: { url: env.MINI_APP_URL },
          }
        : { type: 'default' },
    });
    if (env.BOT_MODE === 'webhook') {
      await telegramRequest(env.TELEGRAM_BOT_TOKEN, 'setWebhook', {
        url: `${env.PUBLIC_API_URL!.replace(/\/$/, '')}/api/v1/telegram/webhook`,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message'],
        max_connections: 10,
      });
    } else {
      await telegramRequest(env.TELEGRAM_BOT_TOKEN, 'deleteWebhook', {
        drop_pending_updates: false,
      });
    }
    console.log(
      `Telegram commands, menu and ${env.BOT_MODE} delivery configured.${env.MINI_APP_URL ? '' : ' Local text replies enabled; Mini App button needs an HTTPS MINI_APP_URL.'}`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Telegram setup failed.',
    );
    process.exitCode = 1;
  }
}
