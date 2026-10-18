import { PrismaPg } from '@prisma/adapter-pg';

import { getEnvironment } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

const environment = getEnvironment();
const adapter = new PrismaPg({
  connectionString: environment.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
  max: 10,
});

export const prisma = new PrismaClient({ adapter });

export async function checkDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
