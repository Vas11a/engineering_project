import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../src/generated/prisma/client.js';
import { getProgress } from '../src/progress/routes.js';

const now = new Date('2026-11-07T10:00:00.000Z');

describe('progress analytics', () => {
  it('calculates due, new, learned and accuracy from persisted learning records', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        intervalDays: 14,
        nextReviewAt: new Date('2026-11-01'),
        totalReviews: 4,
        correctReviews: 3,
        card: { setId: 'set-1' },
      },
      {
        intervalDays: 1,
        nextReviewAt: new Date('2026-11-08'),
        totalReviews: 1,
        correctReviews: 1,
        card: { setId: 'set-1' },
      },
    ]);
    const db = {
      vocabularySet: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'set-1', title: 'Travel', _count: { cards: 3 } },
          { id: 'set-2', title: 'Food', _count: { cards: 1 } },
        ]),
      },
      studyAnswer: {
        groupBy: vi.fn().mockResolvedValue([
          { questionSetId: 'set-1', isCorrect: true, _count: { _all: 4 } },
          { questionSetId: 'set-1', isCorrect: false, _count: { _all: 1 } },
        ]),
        count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(4),
      },
      studySession: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'session-1',
            mode: 'TRANSLATION',
            status: 'COMPLETED',
            startedAt: now,
            completedAt: now,
            answeredCount: 5,
            correctCount: 4,
          },
        ]),
      },
      cardProgress: { findMany },
    } as unknown as PrismaClient;
    const result = await getProgress(db, 'owner-1', now);
    expect(result).toMatchObject({
      totalCards: 4,
      learnedCards: 1,
      dueCards: 1,
      newCards: 2,
      totalReviews: 5,
      accuracy: 80,
    });
    expect(result.sets).toEqual([
      {
        id: 'set-1',
        title: 'Travel',
        totalCards: 3,
        learnedCards: 1,
        dueCards: 1,
        accuracy: 80,
      },
      {
        id: 'set-2',
        title: 'Food',
        totalCards: 1,
        learnedCards: 0,
        dueCards: 0,
        accuracy: 0,
      },
    ]);
    expect(result.recentSessions[0]).toMatchObject({
      answered: 5,
      correct: 4,
      startedAt: now.toISOString(),
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner-1', card: { set: { ownerId: 'owner-1' } } },
      }),
    );
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('returns zero values instead of NaN for a new user', async () => {
    const db = {
      vocabularySet: { findMany: vi.fn().mockResolvedValue([]) },
      studyAnswer: {
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      studySession: { findMany: vi.fn().mockResolvedValue([]) },
      cardProgress: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    expect(await getProgress(db, 'owner-1', now)).toEqual({
      totalCards: 0,
      learnedCards: 0,
      dueCards: 0,
      newCards: 0,
      totalReviews: 0,
      accuracy: 0,
      recentSessions: [],
      sets: [],
    });
  });
});
