import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createAuthenticationMiddleware } from '../src/http/middleware/authenticate.js';
import { createApp } from '../src/http/app.js';
import type {
  AppStore,
  CardView,
  VocabularySetView,
} from '../src/store/types.js';

const userId = '9af688f7-9df5-461c-a90d-688e97c5da7a';
const setId = 'ec6329fc-1fb2-436d-a2eb-6dd6ba97f3b1';
const cardId = '7e240ff1-23ad-4e80-8758-0632f995ca10';

const user = {
  id: userId,
  telegramId: '987654321',
  username: 'ada',
  firstName: 'Ada',
  lastName: null,
  languageCode: 'en',
  photoUrl: null,
};

const vocabularySet: VocabularySetView = {
  id: setId,
  ownerId: userId,
  copiedFromId: null,
  title: 'Travel',
  description: null,
  sourceLanguage: 'English',
  targetLanguage: 'Polish',
  visibility: 'PRIVATE',
  cardCount: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

const card: CardView = {
  id: cardId,
  setId,
  sourceText: 'Good morning',
  translation: 'Dzień dobry',
  explanation: null,
  examples: [],
  creationSource: 'MANUAL',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

function createStore(): AppStore {
  return {
    upsertUser: vi.fn().mockResolvedValue(user),
    listSets: vi.fn().mockResolvedValue([vocabularySet]),
    createSet: vi.fn().mockResolvedValue(vocabularySet),
    getSet: vi.fn().mockResolvedValue(vocabularySet),
    updateSet: vi.fn().mockResolvedValue(vocabularySet),
    deleteSet: vi.fn().mockResolvedValue(true),
    listCards: vi.fn().mockResolvedValue([]),
    createCard: vi.fn().mockResolvedValue(card),
    updateCard: vi.fn().mockResolvedValue(card),
    deleteCard: vi.fn().mockResolvedValue(true),
  };
}

function createTestApp(store: AppStore, withDevelopmentAuth = true) {
  const authenticate = createAuthenticationMiddleware({
    store,
    verifyInitData: vi.fn(),
    developmentProfile: withDevelopmentAuth
      ? {
          telegramId: 987654321n,
          username: 'ada',
          firstName: 'Ada',
          lastName: null,
          languageCode: 'en',
          photoUrl: null,
        }
      : undefined,
  });

  return createApp({
    corsOrigin: 'http://localhost:5173',
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    api: { authenticate, store },
  });
}

describe('authenticated API', () => {
  it('rejects requests without Telegram authentication', async () => {
    const response = await request(createTestApp(createStore(), false)).get(
      '/api/v1/users/me',
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('upserts and returns the development user', async () => {
    const store = createStore();
    const response = await request(createTestApp(store)).get(
      '/api/v1/users/me',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user });
    expect(store.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ telegramId: 987654321n, firstName: 'Ada' }),
    );
  });

  it('reports storage failures as server errors instead of auth failures', async () => {
    const store = createStore();
    vi.mocked(store.upsertUser).mockRejectedValue(new Error('database down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(createTestApp(store)).get(
      '/api/v1/users/me',
    );

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('lists only the current user sets', async () => {
    const store = createStore();
    const response = await request(createTestApp(store)).get('/api/v1/sets');

    expect(response.status).toBe(200);
    expect(response.body.sets).toEqual([vocabularySet]);
    expect(store.listSets).toHaveBeenCalledWith(userId);
  });

  it('validates and creates a vocabulary set', async () => {
    const store = createStore();
    const response = await request(createTestApp(store))
      .post('/api/v1/sets')
      .send({
        title: 'Travel',
        sourceLanguage: 'English',
        targetLanguage: 'Polish',
      });

    expect(response.status).toBe(201);
    expect(store.createSet).toHaveBeenCalledWith(userId, {
      title: 'Travel',
      description: null,
      sourceLanguage: 'English',
      targetLanguage: 'Polish',
      visibility: 'PRIVATE',
    });
  });

  it('returns validation errors for malformed input', async () => {
    const response = await request(createTestApp(createStore()))
      .post('/api/v1/sets')
      .send({ title: '', sourceLanguage: 'E', targetLanguage: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('reads, updates, and deletes only an owned set', async () => {
    const store = createStore();
    const app = createTestApp(store);

    expect((await request(app).get(`/api/v1/sets/${setId}`)).status).toBe(200);
    expect(
      (
        await request(app)
          .patch(`/api/v1/sets/${setId}`)
          .send({ title: 'Updated travel set' })
      ).status,
    ).toBe(200);
    expect((await request(app).delete(`/api/v1/sets/${setId}`)).status).toBe(
      204,
    );

    expect(store.getSet).toHaveBeenCalledWith(userId, setId);
    expect(store.updateSet).toHaveBeenCalledWith(userId, setId, {
      title: 'Updated travel set',
    });
    expect(store.deleteSet).toHaveBeenCalledWith(userId, setId);
  });

  it('creates, updates, and deletes cards inside an owned set', async () => {
    const store = createStore();
    const app = createTestApp(store);

    const createResponse = await request(app)
      .post(`/api/v1/sets/${setId}/cards`)
      .send({ sourceText: 'Good morning', translation: 'Dzień dobry' });
    const updateResponse = await request(app)
      .patch(`/api/v1/sets/${setId}/cards/${cardId}`)
      .send({ explanation: 'A polite greeting.' });
    const deleteResponse = await request(app).delete(
      `/api/v1/sets/${setId}/cards/${cardId}`,
    );

    expect(createResponse.status).toBe(201);
    expect(updateResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(204);
    expect(store.createCard).toHaveBeenCalledWith(userId, setId, {
      sourceText: 'Good morning',
      translation: 'Dzień dobry',
      explanation: null,
      examples: [],
    });
    expect(store.updateCard).toHaveBeenCalledWith(userId, setId, cardId, {
      explanation: 'A polite greeting.',
    });
    expect(store.deleteCard).toHaveBeenCalledWith(userId, setId, cardId);
  });

  it('does not expose a set outside the current owner scope', async () => {
    const store = createStore();
    vi.mocked(store.listCards).mockResolvedValue(null);

    const response = await request(createTestApp(store)).get(
      `/api/v1/sets/${setId}/cards`,
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SET_NOT_FOUND');
    expect(store.listCards).toHaveBeenCalledWith(userId, setId);
  });
});
