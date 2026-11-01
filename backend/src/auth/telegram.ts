import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { TelegramProfile } from './types.js';

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  photo_url: z.string().url().optional(),
});

export class TelegramAuthError extends Error {
  constructor(message = 'Invalid Telegram authentication data.') {
    super(message);
    this.name = 'TelegramAuthError';
  }
}

type VerifyTelegramInitDataOptions = {
  botToken: string;
  maxAgeSeconds: number;
  now?: Date;
};

export function verifyTelegramInitData(
  rawInitData: string,
  { botToken, maxAgeSeconds, now = new Date() }: VerifyTelegramInitDataOptions,
): TelegramProfile {
  const parameters = new URLSearchParams(rawInitData);
  const receivedHash = parameters.get('hash');
  const authDateValue = parameters.get('auth_date');
  const userValue = parameters.get('user');

  if (!receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash)) {
    throw new TelegramAuthError();
  }

  if (!authDateValue || !userValue) {
    throw new TelegramAuthError();
  }

  const dataCheckString = [...parameters.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const expectedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest();
  const receivedHashBuffer = Buffer.from(receivedHash, 'hex');

  if (
    receivedHashBuffer.length !== expectedHash.length ||
    !timingSafeEqual(receivedHashBuffer, expectedHash)
  ) {
    throw new TelegramAuthError();
  }

  const authDate = Number(authDateValue);
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (
    !Number.isInteger(authDate) ||
    authDate > nowSeconds + 30 ||
    nowSeconds - authDate > maxAgeSeconds
  ) {
    throw new TelegramAuthError('Telegram authentication data has expired.');
  }

  let parsedUser: unknown;
  try {
    parsedUser = JSON.parse(userValue);
  } catch {
    throw new TelegramAuthError();
  }

  const user = telegramUserSchema.safeParse(parsedUser);
  if (!user.success) {
    throw new TelegramAuthError();
  }

  return {
    telegramId: BigInt(user.data.id),
    username: user.data.username ?? null,
    firstName: user.data.first_name,
    lastName: user.data.last_name ?? null,
    languageCode: user.data.language_code ?? null,
    photoUrl: user.data.photo_url ?? null,
  };
}
