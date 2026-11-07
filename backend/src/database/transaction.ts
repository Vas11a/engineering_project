import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';

// Retry the whole transaction on write conflicts, never individual statements.
export async function serializable<T>(
  client: PrismaClient,
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.$transaction(work, {
        isolationLevel: 'Serializable',
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error) {
      if (
        attempt >= 3 ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2034'
      ) {
        throw error;
      }
    }
  }
}
