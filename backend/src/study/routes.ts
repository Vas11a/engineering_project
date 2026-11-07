import { Router, type Request } from 'express';
import { z } from 'zod';

import type { PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import {
  abandonSession,
  answerQuestion,
  createStudySession,
  getDueSummary,
  getSession,
  revealCurrentCard,
  toSessionView,
} from './service.js';

const id = z.string().uuid();
const createSchema = z
  .object({
    setId: id.optional(),
    mode: z.enum(['FLASHCARDS', 'TRANSLATION', 'MULTIPLE_CHOICE', 'MIXED']),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();
const answerSchema = z
  .object({
    cardId: id,
    submittedValue: z.string().trim().max(500).optional(),
    confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    responseTimeMs: z.number().int().min(0).max(86_400_000).optional(),
  })
  .strict();

function currentUserId(request: Request) {
  if (!request.currentUser)
    throw new HttpError(401, 'UNAUTHORIZED', 'Authentication is required.');
  return request.currentUser.id;
}

export function createStudyRouter(database: PrismaClient): Router {
  const router = Router();
  router.get('/due', async (request, response) => {
    const setId = id.optional().parse(request.query.setId);
    response.json(await getDueSummary(database, currentUserId(request), setId));
  });
  router.post('/sessions', async (request, response) => {
    const session = await createStudySession(
      database,
      currentUserId(request),
      createSchema.parse(request.body),
    );
    response.status(201).json({ session });
  });
  router.get('/sessions/:sessionId', async (request, response) => {
    response.json({
      session: toSessionView(
        await getSession(
          database,
          currentUserId(request),
          id.parse(request.params.sessionId),
        ),
      ),
    });
  });
  router.post('/sessions/:sessionId/reveal', async (request, response) => {
    response.json(
      await revealCurrentCard(
        database,
        currentUserId(request),
        id.parse(request.params.sessionId),
      ),
    );
  });
  router.post('/sessions/:sessionId/answers', async (request, response) => {
    response.json(
      await answerQuestion(
        database,
        currentUserId(request),
        id.parse(request.params.sessionId),
        answerSchema.parse(request.body),
      ),
    );
  });
  router.post('/sessions/:sessionId/abandon', async (request, response) => {
    response.json({
      session: await abandonSession(
        database,
        currentUserId(request),
        id.parse(request.params.sessionId),
      ),
    });
  });
  return router;
}
