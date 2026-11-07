import { config } from 'dotenv';
import { z } from 'zod';

config({ quiet: true });

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
const optionalHttpsUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .url()
    .refine(
      (value) => new URL(value).protocol === 'https:',
      'Use an HTTPS URL.',
    )
    .optional(),
);

function platformOrigin(value: unknown): string | undefined {
  // These are Vercel-provided hostnames, not untrusted request Host headers.
  if (
    typeof value !== 'string' ||
    !value.includes('.') ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value)
  ) {
    return undefined;
  }
  return `https://${value.toLowerCase()}`;
}

function resolvePlatformDefaults(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return value;
  const environment = value as Record<string, unknown>;
  if (environment.VERCEL !== '1') return environment;
  const deploymentOrigin = platformOrigin(environment.VERCEL_URL);
  const productionOrigin =
    platformOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL) ??
    deploymentOrigin;
  return {
    ...environment,
    NODE_ENV: environment.NODE_ENV ?? 'production',
    MINI_APP_URL: environment.MINI_APP_URL || productionOrigin,
    PUBLIC_API_URL: environment.PUBLIC_API_URL || productionOrigin,
    CORS_ORIGIN:
      environment.CORS_ORIGIN || deploymentOrigin || productionOrigin,
  };
}

const resolvedEnvironmentSchema = z
  .object({
    VERCEL: z
      .enum(['0', '1'])
      .default('0')
      .transform((value) => value === '1'),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(3000),
    CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_AUTH_MAX_AGE_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(86_400),
    DEV_AUTH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    DEV_TELEGRAM_ID: z.coerce.number().int().positive().optional(),
    DEV_TELEGRAM_FIRST_NAME: z.string().min(1).default('Local developer'),
    BOT_MODE: z.enum(['disabled', 'polling', 'webhook']).default('disabled'),
    MINI_APP_URL: optionalHttpsUrl,
    PUBLIC_API_URL: optionalHttpsUrl,
    TELEGRAM_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[A-Za-z0-9_-]{16,256}$/)
        .optional(),
    ),
    AI_API_KEY: optionalString,
    AI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    AI_MODEL: z.string().min(1).default('gpt-5-mini'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(20000),
    AI_REQUESTS_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(20),
    NEON_AI_GATEWAY_TOKEN: optionalString,
    NEON_AI_GATEWAY_BASE_URL: optionalHttpsUrl,
  })
  .superRefine((environment, context) => {
    if (environment.BOT_MODE === 'webhook' && !environment.MINI_APP_URL) {
      context.addIssue({
        code: 'custom',
        path: ['MINI_APP_URL'],
        message: 'MINI_APP_URL is required in webhook mode.',
      });
    }
    if (
      environment.BOT_MODE === 'webhook' &&
      !environment.TELEGRAM_WEBHOOK_SECRET
    ) {
      context.addIssue({
        code: 'custom',
        path: ['TELEGRAM_WEBHOOK_SECRET'],
        message: 'A webhook secret is required in webhook mode.',
      });
    }
    if (
      (environment.NODE_ENV === 'production' || environment.VERCEL) &&
      environment.BOT_MODE === 'polling'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['BOT_MODE'],
        message: 'Use webhook mode in production.',
      });
    }
    if (
      environment.NEON_AI_GATEWAY_TOKEN &&
      !environment.NEON_AI_GATEWAY_BASE_URL &&
      !environment.AI_API_KEY
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEON_AI_GATEWAY_BASE_URL'],
        message: 'Set the gateway base URL for the Neon token.',
      });
    }
    if (
      (environment.NODE_ENV === 'production' || environment.VERCEL) &&
      environment.DEV_AUTH_ENABLED
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DEV_AUTH_ENABLED'],
        message: 'Development authentication cannot be enabled in production.',
      });
    }

    if (environment.DEV_AUTH_ENABLED && !environment.DEV_TELEGRAM_ID) {
      context.addIssue({
        code: 'custom',
        path: ['DEV_TELEGRAM_ID'],
        message:
          'DEV_TELEGRAM_ID is required when development auth is enabled.',
      });
    }
  });

export const environmentSchema = z.preprocess(
  resolvePlatformDefaults,
  resolvedEnvironmentSchema,
);

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export function getEnvironment(): Environment {
  cachedEnvironment ??= environmentSchema.parse(process.env);
  return cachedEnvironment;
}
