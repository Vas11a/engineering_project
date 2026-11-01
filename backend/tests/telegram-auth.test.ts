import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  TelegramAuthError,
  verifyTelegramInitData,
} from '../src/auth/telegram.js';

const botToken = '123456789:test-token';
const now = new Date('2026-11-01T10:00:00.000Z');

function createInitData(
  user: Record<string, unknown>,
  authDate = Math.floor(now.getTime() / 1000),
): string {
  const parameters = new URLSearchParams({
    auth_date: authDate.toString(),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(user),
  });
  const dataCheckString = [...parameters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const hash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  parameters.set('hash', hash);
  return parameters.toString();
}

describe('Telegram initData verification', () => {
  it('verifies the signature and returns a normalized profile', () => {
    const rawInitData = createInitData({
      id: 987654321,
      first_name: 'Ada',
      last_name: 'Lovelace',
      username: 'ada',
      language_code: 'en',
    });

    expect(
      verifyTelegramInitData(rawInitData, {
        botToken,
        maxAgeSeconds: 86_400,
        now,
      }),
    ).toEqual({
      telegramId: 987654321n,
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      languageCode: 'en',
      photoUrl: null,
    });
  });

  it('rejects tampered data', () => {
    const rawInitData = createInitData({
      id: 987654321,
      first_name: 'Ada',
    }).replace('Ada', 'Grace');

    expect(() =>
      verifyTelegramInitData(rawInitData, {
        botToken,
        maxAgeSeconds: 86_400,
        now,
      }),
    ).toThrow(TelegramAuthError);
  });

  it('rejects expired data', () => {
    const rawInitData = createInitData(
      { id: 987654321, first_name: 'Ada' },
      Math.floor(now.getTime() / 1000) - 86_401,
    );

    expect(() =>
      verifyTelegramInitData(rawInitData, {
        botToken,
        maxAgeSeconds: 86_400,
        now,
      }),
    ).toThrow('expired');
  });
});
