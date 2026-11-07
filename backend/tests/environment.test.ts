import { describe, expect, it } from 'vitest';
import { environmentSchema } from '../src/config/env.js';

const base = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  TELEGRAM_BOT_TOKEN: 'test-token',
};
describe('deployment configuration guardrails', () => {
  it('rejects development authentication and polling in production', () => {
    expect(
      environmentSchema.safeParse({
        ...base,
        NODE_ENV: 'production',
        DEV_AUTH_ENABLED: 'true',
        DEV_TELEGRAM_ID: '1',
      }).success,
    ).toBe(false);
    expect(
      environmentSchema.safeParse({
        ...base,
        NODE_ENV: 'production',
        BOT_MODE: 'polling',
        MINI_APP_URL: 'https://example.com',
      }).success,
    ).toBe(false);
  });
  it('requires HTTPS Mini App and a strong secret for a webhook bot', () => {
    expect(
      environmentSchema.safeParse({ ...base, BOT_MODE: 'webhook' }).success,
    ).toBe(false);
    expect(
      environmentSchema.safeParse({
        ...base,
        BOT_MODE: 'webhook',
        MINI_APP_URL: 'http://example.com',
        TELEGRAM_WEBHOOK_SECRET: 'short',
      }).success,
    ).toBe(false);
    expect(
      environmentSchema.safeParse({
        ...base,
        NODE_ENV: 'production',
        BOT_MODE: 'webhook',
        MINI_APP_URL: 'https://example.com',
        TELEGRAM_WEBHOOK_SECRET: 'long-secret-for-tests',
      }).success,
    ).toBe(true);
  });
  it('accepts blank optional integrations for manual browser development', () => {
    const settings = environmentSchema.parse({
      ...base,
      BOT_MODE: 'disabled',
      MINI_APP_URL: '',
      PUBLIC_API_URL: '',
      TELEGRAM_WEBHOOK_SECRET: '',
      AI_API_KEY: '',
      NEON_AI_GATEWAY_TOKEN: '',
      NEON_AI_GATEWAY_BASE_URL: '',
    });
    expect(settings.AI_API_KEY).toBeUndefined();
    expect(settings.MINI_APP_URL).toBeUndefined();
  });
  it('allows development polling without a public Mini App URL', () => {
    expect(
      environmentSchema.safeParse({
        ...base,
        BOT_MODE: 'polling',
        MINI_APP_URL: '',
      }).success,
    ).toBe(true);
    expect(
      environmentSchema.safeParse({
        ...base,
        BOT_MODE: 'polling',
        MINI_APP_URL: 'http://localhost:5173',
      }).success,
    ).toBe(false);
  });
  it('still requires a Mini App URL for a production webhook with a valid secret', () => {
    expect(
      environmentSchema.safeParse({
        ...base,
        NODE_ENV: 'production',
        BOT_MODE: 'webhook',
        TELEGRAM_WEBHOOK_SECRET: 'long-secret-for-tests',
      }).success,
    ).toBe(false);
  });

  it('rejects unsafe local modes on Vercel even if NODE_ENV is accidentally development', () => {
    for (const overrides of [
      { DEV_AUTH_ENABLED: 'true', DEV_TELEGRAM_ID: '1' },
      { BOT_MODE: 'polling' },
    ]) {
      expect(
        environmentSchema.safeParse({
          ...base,
          VERCEL: '1',
          NODE_ENV: 'development',
          ...overrides,
        }).success,
      ).toBe(false);
    }
  });

  it('derives stable bot URLs and deployment CORS from Vercel hostnames', () => {
    const settings = environmentSchema.parse({
      ...base,
      VERCEL: '1',
      VERCEL_PROJECT_PRODUCTION_URL: 'lexilo.vercel.app',
      VERCEL_URL: 'lexilo-preview-123.vercel.app',
      BOT_MODE: 'webhook',
      TELEGRAM_WEBHOOK_SECRET: 'long-secret-for-tests',
    });
    expect(settings).toMatchObject({
      NODE_ENV: 'production',
      MINI_APP_URL: 'https://lexilo.vercel.app',
      PUBLIC_API_URL: 'https://lexilo.vercel.app',
      CORS_ORIGIN: 'https://lexilo-preview-123.vercel.app',
    });
  });

  it('uses a deployment URL on a first deploy and preserves explicit domains', () => {
    expect(
      environmentSchema.parse({
        ...base,
        VERCEL: '1',
        VERCEL_URL: 'first-deploy.vercel.app',
      }).MINI_APP_URL,
    ).toBe('https://first-deploy.vercel.app');
    expect(
      environmentSchema.parse({
        ...base,
        VERCEL: '1',
        VERCEL_URL: 'first-deploy.vercel.app',
        MINI_APP_URL: 'https://learn.example.com',
        PUBLIC_API_URL: 'https://api.example.com',
        CORS_ORIGIN: 'https://learn.example.com',
      }),
    ).toMatchObject({
      MINI_APP_URL: 'https://learn.example.com',
      PUBLIC_API_URL: 'https://api.example.com',
      CORS_ORIGIN: 'https://learn.example.com',
    });
  });

  it('does not derive URLs from request-shaped values or outside Vercel', () => {
    for (const platformFields of [
      { VERCEL: '1', VERCEL_URL: 'evil.example.com/path' },
      { VERCEL: '1', VERCEL_URL: 'user:password@evil.example.com' },
      { VERCEL_URL: 'lexilo.vercel.app' },
    ]) {
      expect(
        environmentSchema.safeParse({
          ...base,
          BOT_MODE: 'webhook',
          TELEGRAM_WEBHOOK_SECRET: 'long-secret-for-tests',
          ...platformFields,
        }).success,
      ).toBe(false);
    }
  });
});
