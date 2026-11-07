import { Router } from 'express';

import type { PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';

function accuracy(correct: number, total: number): number {
  return total ? Math.round((correct / total) * 100) : 0;
}

export async function getProgress(
  database: PrismaClient,
  userId: string,
  now = new Date(),
) {
  const [
    sets,
    totalReviews,
    correctReviews,
    recentSessions,
    answerGroups,
    progressGroups,
  ] = await Promise.all([
    database.vocabularySet.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, _count: { select: { cards: true } } },
    }),
    database.studyAnswer.count({ where: { userId } }),
    database.studyAnswer.count({ where: { userId, isCorrect: true } }),
    database.studySession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        mode: true,
        status: true,
        startedAt: true,
        completedAt: true,
        answeredCount: true,
        correctCount: true,
      },
    }),
    database.studyAnswer.groupBy({
      by: ['questionSetId', 'isCorrect'],
      where: { userId },
      _count: { _all: true },
    }),
    database.cardProgress.findMany({
      where: { userId, card: { set: { ownerId: userId } } },
      select: {
        intervalDays: true,
        nextReviewAt: true,
        card: { select: { setId: true } },
      },
    }),
  ]);
  const totals = new Map<
    string,
    { learned: number; due: number; reviews: number; correct: number }
  >();
  for (const progress of progressGroups) {
    const aggregate = totals.get(progress.card.setId) ?? {
      learned: 0,
      due: 0,
      reviews: 0,
      correct: 0,
    };
    aggregate.learned += Number(progress.intervalDays >= 7);
    aggregate.due += Number(progress.nextReviewAt <= now);
    totals.set(progress.card.setId, aggregate);
  }
  for (const group of answerGroups) {
    if (!group.questionSetId) continue;
    const aggregate = totals.get(group.questionSetId) ?? {
      learned: 0,
      due: 0,
      reviews: 0,
      correct: 0,
    };
    aggregate.reviews += group._count._all;
    aggregate.correct += group.isCorrect ? group._count._all : 0;
    totals.set(group.questionSetId, aggregate);
  }
  const perSet = sets.map((set) => {
    const aggregate = totals.get(set.id);
    return {
      id: set.id,
      title: set.title,
      totalCards: set._count.cards,
      learnedCards: aggregate?.learned ?? 0,
      dueCards: aggregate?.due ?? 0,
      accuracy: accuracy(aggregate?.correct ?? 0, aggregate?.reviews ?? 0),
    };
  });
  return {
    totalCards: perSet.reduce((sum, set) => sum + set.totalCards, 0),
    learnedCards: perSet.reduce((sum, set) => sum + set.learnedCards, 0),
    dueCards: perSet.reduce((sum, set) => sum + set.dueCards, 0),
    newCards: Math.max(
      0,
      perSet.reduce((sum, set) => sum + set.totalCards, 0) -
        progressGroups.length,
    ),
    totalReviews,
    accuracy: accuracy(correctReviews, totalReviews),
    recentSessions: recentSessions.map((session) => ({
      id: session.id,
      mode: session.mode,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      answered: session.answeredCount,
      correct: session.correctCount,
    })),
    sets: perSet,
  };
}

export function createProgressRouter(database: PrismaClient): Router {
  const router = Router();
  router.get('/', async (request, response) => {
    if (!request.currentUser)
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication is required.');
    response.json(await getProgress(database, request.currentUser.id));
  });
  return router;
}
