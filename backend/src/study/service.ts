import { randomInt } from 'node:crypto';

import type {
  PrismaClient,
  Prisma,
  StudySession,
} from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { normalizeAnswer, scheduleReview } from './algorithm.js';
import type {
  QuestionSnapshot,
  SessionView,
  StudyMode,
  QuestionMode,
} from './types.js';

type Database = PrismaClient | Prisma.TransactionClient;
const notFound = () =>
  new HttpError(404, 'SESSION_NOT_FOUND', 'The study session was not found.');
const cardSelect = {
  id: true,
  setId: true,
  sourceText: true,
  translation: true,
  explanation: true,
  examples: true,
} as const;

function readQueue(session: StudySession): QuestionSnapshot[] {
  // Written exclusively by createStudySession. Never accept a queue from clients.
  return session.queue as unknown as QuestionSnapshot[];
}

export function toSessionView(session: StudySession): SessionView {
  const queue = readQueue(session);
  const question =
    session.status === 'ACTIVE' ? queue[session.answeredCount] : undefined;
  return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    total: queue.length,
    answered: session.answeredCount,
    correct: session.correctCount,
    current: question
      ? {
          cardId: question.cardId,
          sourceText: question.sourceText,
          mode: question.mode,
          ...(question.options ? { options: question.options } : {}),
        }
      : null,
  };
}

export async function countDueCards(
  database: Database,
  userId: string,
  now = new Date(),
): Promise<number> {
  return database.cardProgress.count({
    where: {
      userId,
      nextReviewAt: { lte: now },
      card: { set: { ownerId: userId } },
    },
  });
}

async function requireOwnedSet(
  database: Database,
  userId: string,
  setId?: string,
) {
  if (
    setId &&
    !(await database.vocabularySet.findFirst({
      where: { id: setId, ownerId: userId },
      select: { id: true },
    }))
  ) {
    throw new HttpError(
      404,
      'SET_NOT_FOUND',
      'The vocabulary set was not found.',
    );
  }
}

export async function getDueSummary(
  database: Database,
  userId: string,
  setId?: string,
  now = new Date(),
) {
  await requireOwnedSet(database, userId, setId);
  const cardScope = { set: { ownerId: userId }, ...(setId ? { setId } : {}) };
  const [dueCount, newCount, totalCount] = await Promise.all([
    database.cardProgress.count({
      where: { userId, nextReviewAt: { lte: now }, card: cardScope },
    }),
    database.card.count({
      where: { ...cardScope, progress: { none: { userId } } },
    }),
    database.card.count({ where: cardScope }),
  ]);
  return { dueCount, newCount, totalCount };
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export async function createStudySession(
  database: PrismaClient,
  userId: string,
  input: { setId?: string; mode: StudyMode; limit: number },
  now = new Date(),
) {
  return database.$transaction(async (tx) => {
    await requireOwnedSet(tx, userId, input.setId);
    const scope = {
      set: { ownerId: userId },
      ...(input.setId ? { setId: input.setId } : {}),
    };
    const due = await tx.cardProgress.findMany({
      where: { userId, nextReviewAt: { lte: now }, card: scope },
      orderBy: [{ nextReviewAt: 'asc' }, { cardId: 'asc' }],
      take: input.limit,
      select: { card: { select: cardSelect } },
    });
    const newCards =
      due.length < input.limit
        ? await tx.card.findMany({
            where: { ...scope, progress: { none: { userId } } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: input.limit - due.length,
            select: cardSelect,
          })
        : [];
    const cards = [...due.map(({ card }) => card), ...newCards];
    if (!cards.length)
      throw new HttpError(
        409,
        'NO_CARDS_DUE',
        'No cards are due. Add new cards or come back when your next review is ready.',
      );
    const pools = new Map<string, string[]>();
    if (input.mode === 'MULTIPLE_CHOICE' || input.mode === 'MIXED') {
      // One bounded query, even when a global lesson spans many sets.
      const candidates = await tx.card.findMany({
        where: {
          setId: { in: [...new Set(cards.map((card) => card.setId))] },
          set: { ownerId: userId },
        },
        select: { setId: true, translation: true },
        orderBy: [{ setId: 'asc' }, { id: 'asc' }],
        take: 2500,
      });
      for (const card of [...cards, ...candidates]) {
        const pool = pools.get(card.setId) ?? [];
        pool.push(card.translation);
        pools.set(card.setId, pool);
      }
    }
    const mixedModes: QuestionMode[] = [
      'FLASHCARDS',
      'TRANSLATION',
      'MULTIPLE_CHOICE',
    ];
    const queue: QuestionSnapshot[] = cards.map((card, index) => {
      let mode: QuestionMode =
        input.mode === 'MIXED'
          ? mixedModes[index % mixedModes.length]
          : input.mode;
      let options: string[] | undefined;
      if (mode === 'MULTIPLE_CHOICE') {
        const unique = new Map<string, string>();
        for (const translation of pools.get(card.setId) ?? []) {
          const normalized = normalizeAnswer(translation);
          if (normalized !== normalizeAnswer(card.translation))
            unique.set(normalized, translation);
        }
        const distractors = shuffle([...unique.values()]).slice(0, 3);
        if (!distractors.length) mode = 'TRANSLATION';
        else options = shuffle([card.translation, ...distractors]);
      }
      return {
        cardId: card.id,
        setId: card.setId,
        sourceText: card.sourceText,
        translation: card.translation,
        explanation: card.explanation,
        examples: Array.isArray(card.examples)
          ? card.examples.filter(
              (example): example is string => typeof example === 'string',
            )
          : [],
        mode,
        ...(options ? { options } : {}),
      };
    });
    const session = await tx.studySession.create({
      data: {
        userId,
        setId: input.setId,
        mode: input.mode,
        queue: queue as unknown as Prisma.InputJsonValue,
      },
    });
    return toSessionView(session);
  });
}

export async function getSession(
  database: Database,
  userId: string,
  sessionId: string,
) {
  const session = await database.studySession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) throw notFound();
  return session;
}

function feedback(question: QuestionSnapshot) {
  return {
    translation: question.translation,
    explanation: question.explanation,
    examples: question.examples,
  };
}

export async function revealCurrentCard(
  database: Database,
  userId: string,
  sessionId: string,
) {
  const session = await getSession(database, userId, sessionId);
  const question = readQueue(session)[session.answeredCount];
  if (
    session.status !== 'ACTIVE' ||
    !question ||
    question.mode !== 'FLASHCARDS'
  ) {
    throw new HttpError(
      409,
      'CANNOT_REVEAL',
      'Only the current flashcard can be revealed.',
    );
  }
  return feedback(question);
}

type AnswerInput = {
  cardId: string;
  submittedValue?: string;
  confidence?: 1 | 2 | 3;
  responseTimeMs?: number;
};

export async function answerQuestion(
  database: PrismaClient,
  userId: string,
  sessionId: string,
  input: AnswerInput,
  now = new Date(),
) {
  // Retrying serialization failures makes simultaneous retries safe across API instances.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await database.$transaction(
        async (tx) => {
          const session = await getSession(tx, userId, sessionId);
          const queue = readQueue(session);
          const previousAnswer = await tx.studyAnswer.findUnique({
            where: {
              sessionId_questionCardId: {
                sessionId,
                questionCardId: input.cardId,
              },
            },
          });
          if (previousAnswer) {
            const previousQuestion = queue.find(
              (question) => question.cardId === input.cardId,
            );
            if (!previousQuestion)
              throw new HttpError(
                409,
                'QUESTION_NOT_FOUND',
                'This question is no longer available.',
              );
            return {
              isCorrect: previousAnswer.isCorrect,
              ...feedback(previousQuestion),
              session: toSessionView(session),
            };
          }
          const question = queue[session.answeredCount];
          if (session.status !== 'ACTIVE' || !question)
            throw new HttpError(
              409,
              'SESSION_FINISHED',
              'This session has already ended.',
            );
          if (question.cardId !== input.cardId)
            throw new HttpError(
              409,
              'QUESTION_OUT_OF_ORDER',
              'Please answer the current question.',
            );
          const card = await tx.card.findFirst({
            where: { id: input.cardId, set: { ownerId: userId } },
            select: { id: true, sourceText: true, translation: true },
          });
          const meaningUnchanged =
            card?.sourceText === question.sourceText &&
            card?.translation === question.translation;
          if (question.mode === 'FLASHCARDS' && input.confidence === undefined)
            throw new HttpError(
              400,
              'CONFIDENCE_REQUIRED',
              'Choose Again, Good, or Easy for this flashcard.',
            );
          if (question.mode !== 'FLASHCARDS' && !input.submittedValue?.trim())
            throw new HttpError(400, 'ANSWER_REQUIRED', 'Enter an answer.');
          if (
            question.mode === 'MULTIPLE_CHOICE' &&
            !question.options?.includes(input.submittedValue!)
          )
            throw new HttpError(
              400,
              'INVALID_OPTION',
              'Choose one of the offered answers.',
            );
          const isCorrect =
            question.mode === 'FLASHCARDS'
              ? input.confidence! > 1
              : normalizeAnswer(input.submittedValue!) ===
                normalizeAnswer(question.translation);
          const previous = meaningUnchanged
            ? await tx.cardProgress.findUnique({
                where: { userId_cardId: { userId, cardId: input.cardId } },
              })
            : null;
          const progress = scheduleReview(
            previous,
            isCorrect,
            question.mode === 'FLASHCARDS' ? input.confidence! : 2,
            now,
          );
          if (meaningUnchanged)
            await tx.cardProgress.upsert({
              where: { userId_cardId: { userId, cardId: input.cardId } },
              create: { userId, cardId: input.cardId, ...progress },
              update: progress,
            });
          await tx.studyAnswer.create({
            data: {
              sessionId,
              userId,
              cardId: card?.id ?? null,
              questionCardId: input.cardId,
              questionSetId: question.setId,
              submittedValue: input.submittedValue,
              confidence: input.confidence,
              responseTimeMs: input.responseTimeMs,
              isCorrect,
              answeredAt: now,
            },
          });
          const completed = session.answeredCount + 1 >= queue.length;
          const updated = await tx.studySession.update({
            where: { id: sessionId },
            data: {
              answeredCount: { increment: 1 },
              correctCount: { increment: Number(isCorrect) },
              ...(completed ? { status: 'COMPLETED', completedAt: now } : {}),
            },
          });
          return {
            isCorrect,
            ...feedback(question),
            session: toSessionView(updated),
          };
        },
        { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 10_000 },
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'P2034' || error.code === 'P2002')
      ) {
        if (attempt < 3) continue;
        throw new HttpError(
          409,
          'CONCURRENT_REVIEW',
          'Another answer was submitted. Reload your session and try again.',
        );
      }
      throw error;
    }
  }
  throw new HttpError(
    409,
    'CONCURRENT_REVIEW',
    'Another answer was submitted. Reload your session and try again.',
  );
}

export async function abandonSession(
  database: PrismaClient,
  userId: string,
  sessionId: string,
) {
  await database.studySession.updateMany({
    where: { id: sessionId, userId, status: 'ACTIVE' },
    data: { status: 'ABANDONED', completedAt: new Date() },
  });
  return toSessionView(await getSession(database, userId, sessionId));
}
