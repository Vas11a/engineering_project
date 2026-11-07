import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../errors.js';
import type { AppStore } from '../../store/types.js';

const identifierSchema = z.string().uuid();
const nullableDescriptionSchema = z.string().trim().max(500).nullable();
const nullableExplanationSchema = z.string().trim().max(1_000).nullable();
const examplesSchema = z.array(z.string().trim().min(1).max(500)).max(5);

const setFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: nullableDescriptionSchema,
    sourceLanguage: z.string().trim().min(2).max(50),
    targetLanguage: z.string().trim().min(2).max(50),
  })
  .strict();

const setInputSchema = setFieldsSchema.extend({
  description: nullableDescriptionSchema.default(null),
});

const setPatchSchema = setFieldsSchema
  .extend({ visibility: z.enum(['PRIVATE', 'PUBLIC']) })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required.',
  );

const cardFieldsSchema = z
  .object({
    sourceText: z.string().trim().min(1).max(250),
    translation: z.string().trim().min(1).max(250),
    explanation: nullableExplanationSchema,
    examples: examplesSchema,
    creationSource: z.enum(['MANUAL', 'AI']).optional(),
  })
  .strict();

const cardInputSchema = cardFieldsSchema.extend({
  explanation: nullableExplanationSchema.default(null),
  examples: examplesSchema.default([]),
});

const cardPatchSchema = cardFieldsSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required.',
  );

function currentUserId(request: Express.Request): string {
  if (!request.currentUser) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  return request.currentUser.id;
}

function notFound(resource: 'set' | 'card'): HttpError {
  return new HttpError(
    404,
    resource === 'set' ? 'SET_NOT_FOUND' : 'CARD_NOT_FOUND',
    resource === 'set'
      ? 'The vocabulary set was not found.'
      : 'The card was not found.',
  );
}

export function createApiRouter(store: AppStore): Router {
  const router = Router();

  router.get('/users/me', (request, response) => {
    response.json({ user: request.currentUser });
  });

  router.get('/sets', async (request, response) => {
    response.json({ sets: await store.listSets(currentUserId(request)) });
  });

  router.post('/sets', async (request, response) => {
    const set = await store.createSet(currentUserId(request), {
      ...setInputSchema.parse(request.body),
      visibility: 'PRIVATE',
    });
    response.status(201).json({ set });
  });

  router.get('/sets/:setId', async (request, response) => {
    const setId = identifierSchema.parse(request.params.setId);
    const set = await store.getSet(currentUserId(request), setId);
    if (!set) throw notFound('set');
    response.json({ set });
  });

  router.patch('/sets/:setId', async (request, response) => {
    const setId = identifierSchema.parse(request.params.setId);
    const set = await store.updateSet(
      currentUserId(request),
      setId,
      setPatchSchema.parse(request.body),
    );
    if (!set) throw notFound('set');
    response.json({ set });
  });

  router.delete('/sets/:setId', async (request, response) => {
    const setId = identifierSchema.parse(request.params.setId);
    if (!(await store.deleteSet(currentUserId(request), setId))) {
      throw notFound('set');
    }
    response.status(204).send();
  });

  router.get('/sets/:setId/cards', async (request, response) => {
    const setId = identifierSchema.parse(request.params.setId);
    const cards = await store.listCards(currentUserId(request), setId);
    if (!cards) throw notFound('set');
    response.json({ cards });
  });

  router.post('/sets/:setId/cards', async (request, response) => {
    const setId = identifierSchema.parse(request.params.setId);
    const card = await store.createCard(
      currentUserId(request),
      setId,
      cardInputSchema.parse(request.body),
    );
    if (!card) throw notFound('set');
    response.status(201).json({ card });
  });

  router.patch('/sets/:setId/cards/:cardId', async (request, response) => {
    const setId = identifierSchema.parse(request.params.setId);
    const cardId = identifierSchema.parse(request.params.cardId);
    const card = await store.updateCard(
      currentUserId(request),
      setId,
      cardId,
      cardPatchSchema.parse(request.body),
    );
    if (!card) throw notFound('card');
    response.json({ card });
  });

  router.delete('/sets/:setId/cards/:cardId', async (request, response) => {
    const setId = identifierSchema.parse(request.params.setId);
    const cardId = identifierSchema.parse(request.params.cardId);
    if (!(await store.deleteCard(currentUserId(request), setId, cardId))) {
      throw notFound('card');
    }
    response.status(204).send();
  });

  return router;
}
