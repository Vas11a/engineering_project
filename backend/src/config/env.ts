import { config } from 'dotenv';
import { z } from 'zod';

config({ quiet: true });

const environmentSchema = z
  .object({
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
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.DEV_AUTH_ENABLED) {
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

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export function getEnvironment(): Environment {
  cachedEnvironment ??= environmentSchema.parse(process.env);
  return cachedEnvironment;
}
