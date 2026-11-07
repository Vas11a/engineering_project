import { Router } from 'express';
import { z } from 'zod';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { serializable } from '../../database/transaction.js';
import { toCardView, toSetView } from '../../store/prisma-store.js';
import { HttpError } from '../errors.js';

const querySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    sourceLanguage: z.string().trim().max(50).optional(),
    targetLanguage: z.string().trim().max(50).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();
const identifier = z.string().uuid();
const include = { _count: { select: { cards: true } } } as const;
const notFound = () =>
  new HttpError(404, 'SET_NOT_FOUND', 'The public set was not found.');

export function createCatalogRouter(client: PrismaClient): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const query = querySchema.parse(request.query);
    const where = {
      visibility: 'PUBLIC' as const,
      cards: { some: {} },
      ...(query.q
        ? { title: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
      ...(query.sourceLanguage
        ? {
            sourceLanguage: {
              equals: query.sourceLanguage,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(query.targetLanguage
        ? {
            targetLanguage: {
              equals: query.targetLanguage,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
    const [sets, total] = await client.$transaction([
      client.vocabularySet.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      client.vocabularySet.count({ where }),
    ]);
    response.json({
      sets: sets.map(toSetView),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  });

  router.get('/:setId', async (request, response) => {
    const id = identifier.parse(request.params.setId);
    const set = await client.vocabularySet.findFirst({
      where: { id, visibility: 'PUBLIC', cards: { some: {} } },
      include: { ...include, cards: { orderBy: { createdAt: 'asc' } } },
    });
    if (!set) throw notFound();
    response.json({ set: toSetView(set), cards: set.cards.map(toCardView) });
  });

  router.post('/:setId/copy', async (request, response) => {
    if (!request.currentUser)
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication is required.');
    const ownerId = request.currentUser.id;
    const id = identifier.parse(request.params.setId);
    const set = await serializable(client, async (transaction) => {
      const original = await transaction.vocabularySet.findFirst({
        where: { id, visibility: 'PUBLIC', cards: { some: {} } },
        include: { cards: true },
      });
      if (!original) throw notFound();
      return transaction.vocabularySet.create({
        data: {
          ownerId,
          copiedFromId: original.id,
          title: original.title,
          description: original.description,
          sourceLanguage: original.sourceLanguage,
          targetLanguage: original.targetLanguage,
          visibility: 'PRIVATE',
          cards: {
            create: original.cards.map((card) => ({
              sourceText: card.sourceText,
              translation: card.translation,
              explanation: card.explanation,
              examples: toCardView(card).examples,
              creationSource: 'COPIED',
            })),
          },
        },
        include,
      });
    });
    response.status(201).json({ set: toSetView(set) });
  });

  return router;
}
