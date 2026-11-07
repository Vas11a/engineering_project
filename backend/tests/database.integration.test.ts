import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaAppStore } from '../src/store/prisma-store.js';
import { createApp } from '../src/http/app.js';
import { createCatalogRouter } from '../src/http/routes/catalog.js';
import { createStudyRouter } from '../src/study/routes.js';
import { createProgressRouter } from '../src/progress/routes.js';
import { createAiRouter, createPrismaQuota } from '../src/ai/router.js';
import { createPrismaReceipts } from '../src/bot/telegram.js';
import type { AuthenticatedUser } from '../src/auth/types.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
// Never fall back to DATABASE_URL: these tests must explicitly target a test database.
describe.skipIf(!databaseUrl)('PostgreSQL application flow', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const store = new PrismaAppStore(client);
  let alice: AuthenticatedUser;
  let bob: AuthenticatedUser;
  let ownerId: string;
  const routes = Router();
  routes.use('/public-sets', createCatalogRouter(client));
  routes.use('/study', createStudyRouter(client));
  routes.use('/progress', createProgressRouter(client));
  routes.use(
    '/ai',
    createAiRouter({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      timeoutMs: 1000,
      requestsPerHour: 2,
      consumeQuota: createPrismaQuota(client),
    }),
  );
  const app = createApp({
    corsOrigin: 'http://localhost:5173',
    checkDatabase: async () => {
      await client.$queryRaw`SELECT 1`;
    },
    api: {
      store,
      routes,
      authenticate: async (req, _res, next) => {
        const user = ownerId === alice.id ? alice : bob;
        req.currentUser = user;
        next();
      },
    },
  });
  beforeAll(async () => {
    const telegramId =
      BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 900));
    const profile = {
      firstName: 'Integration test',
      lastName: null,
      username: null,
      languageCode: 'en',
      photoUrl: null,
    };
    alice = await store.upsertUser({ ...profile, telegramId });
    bob = await store.upsertUser({ ...profile, telegramId: telegramId + 1n });
    ownerId = alice.id;
  });
  afterAll(async () => {
    const ids = [alice?.id, bob?.id].filter((id): id is string => Boolean(id));
    if (ids.length) {
      await client.aiRateLimit.deleteMany({ where: { userId: { in: ids } } });
      await client.user.deleteMany({ where: { id: { in: ids } } });
    }
    await client.$disconnect();
  });

  it('creates, publishes, filters, independently copies, studies and tracks a set', async () => {
    const title = `Integration ${randomUUID()}`;
    const created = await request(app)
      .post('/api/v1/sets')
      .send({ title, sourceLanguage: 'English', targetLanguage: 'Polish' })
      .expect(201);
    const setId = created.body.set.id as string;
    await request(app)
      .patch(`/api/v1/sets/${setId}`)
      .send({ visibility: 'PUBLIC' })
      .expect(409);
    for (const [sourceText, translation] of [
      ['cat', 'kot'],
      ['dog', 'pies'],
      ['house', 'dom'],
    ]) {
      await request(app)
        .post(`/api/v1/sets/${setId}/cards`)
        .send({ sourceText, translation })
        .expect(201);
    }
    await request(app)
      .patch(`/api/v1/sets/${setId}`)
      .send({ visibility: 'PUBLIC' })
      .expect(200);
    const found = await request(app)
      .get('/api/v1/public-sets')
      .query({ q: title, targetLanguage: 'polish', pageSize: 1 })
      .expect(200);
    expect(found.body.total).toBe(1);
    expect(found.body.sets[0].cardCount).toBe(3);
    await request(app)
      .get('/api/v1/public-sets')
      .query({ pageSize: 501 })
      .expect(400);
    ownerId = bob.id;
    await request(app).get(`/api/v1/sets/${setId}`).expect(404);
    await request(app)
      .patch(`/api/v1/sets/${setId}`)
      .send({ title: 'stolen' })
      .expect(404);
    const publicSet = await request(app)
      .get(`/api/v1/public-sets/${setId}`)
      .expect(200);
    expect(publicSet.body.cards).toHaveLength(3);
    const copied = await request(app)
      .post(`/api/v1/public-sets/${setId}/copy`)
      .expect(201);
    const copyId = copied.body.set.id as string;
    expect(copied.body.set.visibility).toBe('PRIVATE');
    ownerId = alice.id;
    const cards = await request(app)
      .get(`/api/v1/sets/${setId}/cards`)
      .expect(200);
    await request(app)
      .patch(`/api/v1/sets/${setId}/cards/${cards.body.cards[0].id}`)
      .send({ translation: 'changed' })
      .expect(200);
    ownerId = bob.id;
    const copyCards = await request(app)
      .get(`/api/v1/sets/${copyId}/cards`)
      .expect(200);
    expect(
      copyCards.body.cards.every(
        (card: { creationSource: string }) => card.creationSource === 'COPIED',
      ),
    ).toBe(true);
    expect(
      copyCards.body.cards.some(
        (card: { translation: string }) => card.translation === 'changed',
      ),
    ).toBe(false);
    const translations = new Map(
      copyCards.body.cards.map((card: { id: string; translation: string }) => [
        card.id,
        card.translation,
      ]),
    );
    const start = await request(app)
      .post('/api/v1/study/sessions')
      .send({ setId: copyId, mode: 'TRANSLATION', limit: 3 })
      .expect(201);
    let session = start.body.session;
    expect(JSON.stringify(session)).not.toContain('translation');
    const firstCard = session.current.cardId;
    let firstAnswer;
    while (session.status === 'ACTIVE') {
      const result = await request(app)
        .post(`/api/v1/study/sessions/${session.id}/answers`)
        .send({
          cardId: session.current.cardId,
          submittedValue: translations.get(session.current.cardId),
          responseTimeMs: 800,
        })
        .expect(200);
      firstAnswer ??= result.body;
      expect(result.body.isCorrect).toBe(true);
      session = result.body.session;
    }
    expect(session.correct).toBe(3);
    await request(app)
      .post(`/api/v1/study/sessions/${session.id}/answers`)
      .send({ cardId: firstCard, submittedValue: 'retry' })
      .expect(200);
    const stats = await request(app).get('/api/v1/progress').expect(200);
    expect(stats.body).toMatchObject({
      totalCards: 3,
      totalReviews: 3,
      accuracy: 100,
      newCards: 0,
      dueCards: 0,
    });
    const editedCard = copyCards.body.cards[0];
    // The UI submits the whole form: changing a note must preserve mastery.
    await request(app)
      .patch(`/api/v1/sets/${copyId}/cards/${editedCard.id}`)
      .send({
        sourceText: editedCard.sourceText,
        translation: editedCard.translation,
        explanation: 'An updated note',
        examples: [],
      })
      .expect(200);
    expect(await client.cardProgress.count({ where: { userId: bob.id } })).toBe(
      3,
    );
    await request(app)
      .patch(`/api/v1/sets/${copyId}/cards/${editedCard.id}`)
      .send({ translation: 'a new meaning' })
      .expect(200);
    expect(await client.cardProgress.count({ where: { userId: bob.id } })).toBe(
      2,
    );
    expect((await request(app).get('/api/v1/progress')).body.totalReviews).toBe(
      3,
    );
    // Schedule the edited card later for the following all-caught-up assertion.
    await client.cardProgress.create({
      data: {
        userId: bob.id,
        cardId: editedCard.id,
        nextReviewAt: new Date(Date.now() + 86400000),
      },
    });
    await request(app)
      .post('/api/v1/study/sessions')
      .send({ setId: copyId, mode: 'FLASHCARDS' })
      .expect(409);
    await request(app)
      .post('/api/v1/ai/card-content')
      .send({
        sourceText: 'hello',
        sourceLanguage: 'English',
        targetLanguage: 'Polish',
      })
      .expect(503);
    ownerId = alice.id;
    await request(app).get(`/api/v1/study/sessions/${session.id}`).expect(404);
    for (const card of cards.body.cards)
      await request(app)
        .delete(`/api/v1/sets/${setId}/cards/${card.id}`)
        .expect(204);
    expect(
      (await request(app).get(`/api/v1/sets/${setId}`)).body.set.visibility,
    ).toBe('PRIVATE');
    ownerId = bob.id;
    await request(app).get(`/api/v1/public-sets/${setId}`).expect(404);
    await request(app).post(`/api/v1/public-sets/${setId}/copy`).expect(404);
    await request(app).get(`/api/v1/sets/${copyId}`).expect(200);
  });

  it('atomically caps AI quotas across concurrent requests and retries bot updates', async () => {
    const quota = createPrismaQuota(client);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => quota(alice.id, 3)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    await client.aiRateLimit.update({
      where: { userId: alice.id },
      data: { windowStart: new Date(0) },
    });
    expect(await quota(alice.id, 3)).toBe(true);
    const receipts = createPrismaReceipts(client);
    const updateId = Date.now();
    try {
      expect(await receipts.claim(updateId)).toBe('acquired');
      expect(await receipts.claim(updateId)).toBe('busy');
      await receipts.release(updateId);
      expect(await receipts.claim(updateId)).toBe('acquired');
      await receipts.complete(updateId);
      expect(await receipts.claim(updateId)).toBe('done');
    } finally {
      await client.botUpdate.deleteMany({
        where: { updateId: BigInt(updateId) },
      });
    }
  });

  it('returns useful validation errors for bad JSON and oversized payloads', async () => {
    await request(app)
      .post('/api/v1/sets')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    await request(app)
      .post('/api/v1/sets')
      .send({ title: 'x'.repeat(110_000) })
      .expect(413);
  });
});
