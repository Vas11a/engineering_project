import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../src/generated/prisma/client.js';
import { errorHandler } from '../src/http/middleware/error-handler.js';
import { normalizeAnswer, scheduleReview } from '../src/study/algorithm.js';
import { createStudyRouter } from '../src/study/routes.js';
import {
  answerQuestion,
  createStudySession,
  getDueSummary,
  revealCurrentCard,
  toSessionView,
} from '../src/study/service.js';

const userId = '9af688f7-9df5-461c-a90d-688e97c5da7a';
const setId = 'ec6329fc-1fb2-436d-a2eb-6dd6ba97f3b1';
const cardId = '7e240ff1-23ad-4e80-8758-0632f995ca10';
const sessionId = '22785d23-fc8e-4746-a4f2-5beb30e00f8b';
const now = new Date('2026-11-07T10:00:00.000Z');
const question = {
  cardId,
  setId,
  sourceText: 'Good morning',
  translation: 'Dzień dobry',
  explanation: 'A greeting',
  examples: ['Good morning, Ada'],
  mode: 'TRANSLATION',
};
const session = {
  id: sessionId,
  userId,
  setId,
  mode: 'TRANSLATION',
  status: 'ACTIVE',
  queue: [question],
  answeredCount: 0,
  correctCount: 0,
  startedAt: now,
  completedAt: null,
};

function createDatabase() {
  const tx = {
    vocabularySet: { findFirst: vi.fn().mockResolvedValue({ id: setId }) },
    card: {
      findFirst: vi.fn().mockResolvedValue({
        id: cardId,
        sourceText: question.sourceText,
        translation: question.translation,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    cardProgress: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    studySession: {
      findFirst: vi.fn().mockResolvedValue(session),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({
        ...session,
        answeredCount: 1,
        correctCount: 1,
        status: 'COMPLETED',
        completedAt: now,
      }),
    },
    studyAnswer: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const transaction = vi.fn(async (work: (database: typeof tx) => unknown) =>
    work(tx),
  );
  const db = { ...tx, $transaction: transaction } as unknown as PrismaClient;
  return { db, tx, transaction };
}

describe('adaptive review scheduling', () => {
  it('schedules new correct answers after one day, then three days, then longer', () => {
    const first = scheduleReview(null, true, 2, now);
    const second = scheduleReview(first, true, 2, first.nextReviewAt);
    const third = scheduleReview(second, true, 3, second.nextReviewAt);
    expect(first.intervalDays).toBe(1);
    expect(first.nextReviewAt.toISOString()).toBe('2026-11-08T10:00:00.000Z');
    expect(second.intervalDays).toBe(3);
    expect(third.intervalDays).toBeGreaterThan(second.intervalDays);
    expect(third.correctReviews).toBe(3);
  });

  it('resets a wrong answer for a short retry and preserves historical counts', () => {
    const result = scheduleReview(
      {
        difficulty: 2.5,
        intervalDays: 30,
        correctStreak: 5,
        totalReviews: 8,
        correctReviews: 5,
      },
      false,
      1,
      now,
    );
    expect(result.correctStreak).toBe(0);
    expect(result.intervalDays).toBe(0);
    expect(result.nextReviewAt.toISOString()).toBe('2026-11-07T10:10:00.000Z');
    expect(result.totalReviews).toBe(9);
    expect(result.correctReviews).toBe(5);
  });

  it('is deterministic, bounds difficulty, and schedules easy answers later', () => {
    const old = {
      difficulty: 1.3,
      intervalDays: 30,
      correctStreak: 3,
      totalReviews: 4,
      correctReviews: 4,
    };
    expect(scheduleReview(old, false, 1, now).difficulty).toBe(1.3);
    expect(scheduleReview(old, true, 3, now).intervalDays).toBeGreaterThan(
      scheduleReview(old, true, 2, now).intervalDays,
    );
    expect(scheduleReview(old, true, 3, now)).toEqual(
      scheduleReview(old, true, 3, now),
    );
  });

  it('normalizes Unicode, spacing, and case without removing meaningful diacritics', () => {
    expect(normalizeAnswer('  DZIEŃ   dobry  ')).toBe('dzień dobry');
    expect(normalizeAnswer('ｈｅｌｌｏ')).toBe('hello');
    expect(normalizeAnswer('café')).not.toBe(normalizeAnswer('cafe'));
  });
});

describe('durable study sessions', () => {
  it('does not leak translations or explanations before an answer', () => {
    const view = toSessionView(session as never);
    expect(view.current).toEqual({
      cardId,
      sourceText: 'Good morning',
      mode: 'TRANSLATION',
    });
    expect(JSON.stringify(view)).not.toContain('Dzień dobry');
    expect(JSON.stringify(view)).not.toContain('A greeting');
  });

  it('rejects a session that belongs to another user', async () => {
    const { db, tx } = createDatabase();
    tx.studySession.findFirst.mockResolvedValue(null);
    await expect(
      answerQuestion(
        db,
        userId,
        sessionId,
        { cardId, submittedValue: 'x' },
        now,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(tx.studySession.findFirst).toHaveBeenCalledWith({
      where: { id: sessionId, userId },
    });
    expect(tx.studyAnswer.create).not.toHaveBeenCalled();
  });

  it('grades on the server and writes answer, progress, and completion atomically', async () => {
    const { db, tx, transaction } = createDatabase();
    const result = await answerQuestion(
      db,
      userId,
      sessionId,
      { cardId, submittedValue: ' DZIEŃ   DOBRY ', responseTimeMs: 1800 },
      now,
    );
    expect(result.isCorrect).toBe(true);
    expect(result.translation).toBe('Dzień dobry');
    expect(result.session.status).toBe('COMPLETED');
    expect(tx.studyAnswer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        questionCardId: cardId,
        isCorrect: true,
        responseTimeMs: 1800,
      }),
    });
    expect(tx.cardProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ totalReviews: 1, intervalDays: 1 }),
      }),
    );
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });

  it('returns original feedback for a duplicate retry without counting it twice', async () => {
    const { db, tx } = createDatabase();
    tx.studyAnswer.findUnique.mockResolvedValue({ isCorrect: false });
    tx.studySession.findFirst.mockResolvedValue({
      ...session,
      status: 'COMPLETED',
      answeredCount: 1,
      correctCount: 0,
    });
    const result = await answerQuestion(
      db,
      userId,
      sessionId,
      { cardId, submittedValue: 'Dzień dobry' },
      now,
    );
    expect(result.isCorrect).toBe(false);
    expect(tx.studyAnswer.create).not.toHaveBeenCalled();
    expect(tx.cardProgress.upsert).not.toHaveBeenCalled();
  });

  it('retries serialization conflicts', async () => {
    const { db, tx, transaction } = createDatabase();
    transaction.mockRejectedValueOnce({ code: 'P2034' });
    await answerQuestion(
      db,
      userId,
      sessionId,
      { cardId, submittedValue: 'Dzień dobry' },
      now,
    );
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(tx.studyAnswer.create).toHaveBeenCalledTimes(1);
  });

  it('continues from question snapshots if a card was deleted mid-session', async () => {
    const { db, tx } = createDatabase();
    tx.card.findFirst.mockResolvedValue(null);
    const result = await answerQuestion(
      db,
      userId,
      sessionId,
      { cardId, submittedValue: 'Dzień dobry' },
      now,
    );
    expect(result.session.status).toBe('COMPLETED');
    expect(tx.cardProgress.upsert).not.toHaveBeenCalled();
    expect(tx.studyAnswer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ cardId: null, questionCardId: cardId }),
    });
  });

  it('does not apply stale question progress after the card meaning changes', async () => {
    const { db, tx } = createDatabase();
    tx.card.findFirst.mockResolvedValue({
      id: cardId,
      sourceText: 'Good morning',
      translation: 'New translation',
    });
    const result = await answerQuestion(
      db,
      userId,
      sessionId,
      { cardId, submittedValue: 'Dzień dobry' },
      now,
    );
    expect(result.isCorrect).toBe(true);
    expect(tx.cardProgress.upsert).not.toHaveBeenCalled();
    expect(tx.studyAnswer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ questionSetId: setId }),
    });
  });

  it('rejects answers to a question that is not current', async () => {
    const { db, tx } = createDatabase();
    await expect(
      answerQuestion(
        db,
        userId,
        sessionId,
        { cardId: setId, submittedValue: 'x' },
        now,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'QUESTION_OUT_OF_ORDER' });
    expect(tx.studyAnswer.create).not.toHaveBeenCalled();
  });

  it('requires flashcard self-assessment and blocks revealing quiz answers', async () => {
    const { db, tx } = createDatabase();
    await expect(
      revealCurrentCard(db, userId, sessionId),
    ).rejects.toMatchObject({ code: 'CANNOT_REVEAL' });
    tx.studySession.findFirst.mockResolvedValue({
      ...session,
      queue: [{ ...question, mode: 'FLASHCARDS' }],
    });
    expect(await revealCurrentCard(db, userId, sessionId)).toMatchObject({
      translation: 'Dzień dobry',
    });
    await expect(
      answerQuestion(db, userId, sessionId, { cardId }, now),
    ).rejects.toMatchObject({ code: 'CONFIDENCE_REQUIRED' });
  });

  it('uses overdue cards before new ones and persists a fallback quiz if distractors are missing', async () => {
    const { db, tx } = createDatabase();
    tx.cardProgress.findMany.mockResolvedValue([
      {
        card: {
          id: cardId,
          setId,
          sourceText: question.sourceText,
          translation: question.translation,
          explanation: null,
          examples: [],
        },
      },
    ]);
    tx.studySession.create.mockImplementation(
      async ({ data }: { data: object }) => ({ ...session, ...data }),
    );
    const result = await createStudySession(
      db,
      userId,
      { setId, mode: 'MULTIPLE_CHOICE', limit: 1 },
      now,
    );
    expect(result.current?.mode).toBe('TRANSLATION');
    expect(tx.cardProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ nextReviewAt: 'asc' }, { cardId: 'asc' }],
      }),
    );
    expect(tx.studySession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queue: [
          expect.objectContaining({ cardId, translation: 'Dzień dobry' }),
        ],
      }),
    });
  });

  it('rejects study of another users set before querying cards', async () => {
    const { db, tx } = createDatabase();
    tx.vocabularySet.findFirst.mockResolvedValue(null);
    await expect(getDueSummary(db, userId, setId, now)).rejects.toMatchObject({
      status: 404,
    });
    expect(tx.card.count).not.toHaveBeenCalled();
  });

  it('rejects empty study sessions with an actionable message', async () => {
    const { db } = createDatabase();
    await expect(
      createStudySession(db, userId, { mode: 'FLASHCARDS', limit: 10 }, now),
    ).rejects.toMatchObject({ code: 'NO_CARDS_DUE', status: 409 });
  });
});

describe('study request validation', () => {
  function app() {
    const { db } = createDatabase();
    const server = express();
    server.use(express.json());
    server.use((_request, _response, next) => {
      _request.currentUser = {
        id: userId,
        telegramId: '1',
        firstName: 'Test',
        username: null,
        lastName: null,
        languageCode: null,
        photoUrl: null,
      };
      next();
    });
    server.use(createStudyRouter(db));
    server.use(errorHandler);
    return server;
  }

  it('rejects arbitrary grading, excessive session sizes, and negative response times', async () => {
    expect(
      (
        await request(app())
          .post('/sessions')
          .send({ mode: 'TRANSLATION', limit: 500 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app())
          .post(`/sessions/${sessionId}/answers`)
          .send({ cardId, isCorrect: true })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app())
          .post(`/sessions/${sessionId}/answers`)
          .send({ cardId, responseTimeMs: -1 })
      ).status,
    ).toBe(400);
  });
});
