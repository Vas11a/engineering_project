import { randomInt } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { getProgress } from '../src/progress/routes.js';
import {
  answerQuestion,
  createStudySession,
  getDueSummary,
  getSession,
  revealCurrentCard,
  toSessionView,
} from '../src/study/service.js';

const connectionString = process.env.TEST_DATABASE_URL;
const now = new Date('2026-11-07T10:00:00.000Z');

describe.skipIf(!connectionString)('learning with real PostgreSQL', () => {
  let db: PrismaClient;
  let userId: string;
  let strangerId: string;
  let setId: string;
  let cards: { id: string; sourceText: string; translation: string }[];
  const createdUsers: string[] = [];

  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  });
  beforeEach(async () => {
    for (const name of [
      'Study integration owner',
      'Study integration stranger',
    ]) {
      const user = await db.user.create({
        data: { telegramId: BigInt(randomInt(2 ** 47)), firstName: name },
      });
      createdUsers.push(user.id);
    }
    userId = createdUsers.at(-2)!;
    strangerId = createdUsers.at(-1)!;
    const set = await db.vocabularySet.create({
      data: {
        ownerId: userId,
        title: 'Integration lesson',
        sourceLanguage: 'English',
        targetLanguage: 'Polish',
        cards: {
          create: [
            { sourceText: 'one', translation: 'jeden' },
            { sourceText: 'two', translation: 'dwa' },
            { sourceText: 'three', translation: 'trzy' },
          ],
        },
      },
      include: {
        cards: { select: { id: true, sourceText: true, translation: true } },
      },
    });
    setId = set.id;
    cards = set.cards;
  }, 20_000);
  afterEach(async () => {
    // Clean up only records created by this suite. Never truncate a supplied DB.
    await db.user.deleteMany({ where: { id: { in: createdUsers } } });
    createdUsers.length = 0;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('selects overdue cards before new cards, excludes future reviews and persists questions', async () => {
    await db.cardProgress.createMany({
      data: [
        {
          userId,
          cardId: cards[0].id,
          intervalDays: 7,
          nextReviewAt: new Date('2026-11-06'),
        },
        {
          userId,
          cardId: cards[1].id,
          intervalDays: 14,
          nextReviewAt: new Date('2026-11-09'),
        },
      ],
    });
    expect(await getDueSummary(db, userId, setId, now)).toEqual({
      dueCount: 1,
      newCount: 1,
      totalCount: 3,
    });
    const session = await createStudySession(
      db,
      userId,
      { setId, mode: 'TRANSLATION', limit: 10 },
      now,
    );
    expect(session.total).toBe(2);
    expect(session.current?.cardId).toBe(cards[0].id);
    expect(toSessionView(await getSession(db, userId, session.id))).toEqual(
      session,
    );
    const result = await answerQuestion(
      db,
      userId,
      session.id,
      { cardId: cards[0].id, submittedValue: cards[0].translation },
      now,
    );
    expect(result.session.current?.cardId).toBe(cards[2].id);
  }, 20_000);

  it('serializes simultaneous duplicate submissions and records one review', async () => {
    const session = await createStudySession(
      db,
      userId,
      { setId, mode: 'TRANSLATION', limit: 1 },
      now,
    );
    const card = cards.find((item) => item.id === session.current!.cardId)!;
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        answerQuestion(
          db,
          userId,
          session.id,
          { cardId: card.id, submittedValue: card.translation },
          now,
        ),
      ),
    );
    expect(results.every((result) => result.isCorrect)).toBe(true);
    expect(
      await db.studyAnswer.count({ where: { sessionId: session.id } }),
    ).toBe(1);
    expect(
      await db.cardProgress.findUnique({
        where: { userId_cardId: { userId, cardId: card.id } },
      }),
    ).toMatchObject({ totalReviews: 1, correctReviews: 1 });
    expect(await getSession(db, userId, session.id)).toMatchObject({
      answeredCount: 1,
      correctCount: 1,
      status: 'COMPLETED',
    });
  }, 20_000);

  it('enforces session ownership and reveal is limited to flashcards', async () => {
    const flash = await createStudySession(
      db,
      userId,
      { setId, mode: 'FLASHCARDS', limit: 1 },
      now,
    );
    await expect(
      revealCurrentCard(db, strangerId, flash.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      answerQuestion(
        db,
        strangerId,
        flash.id,
        { cardId: flash.current!.cardId, confidence: 3 },
        now,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(await revealCurrentCard(db, userId, flash.id)).toHaveProperty(
      'translation',
    );
    const quiz = await createStudySession(
      db,
      userId,
      { setId, mode: 'TRANSLATION', limit: 1 },
      now,
    );
    await expect(revealCurrentCard(db, userId, quiz.id)).rejects.toMatchObject({
      code: 'CANNOT_REVEAL',
    });
    expect(JSON.stringify(quiz.current)).not.toContain('translation');
  }, 20_000);

  it('finishes immutable snapshots after deleting a whole set and retains answer history', async () => {
    const session = await createStudySession(
      db,
      userId,
      { setId, mode: 'TRANSLATION', limit: 1 },
      now,
    );
    const card = cards.find((item) => item.id === session.current!.cardId)!;
    await db.vocabularySet.delete({ where: { id: setId } });
    const result = await answerQuestion(
      db,
      userId,
      session.id,
      { cardId: card.id, submittedValue: card.translation },
      now,
    );
    expect(result.session.status).toBe('COMPLETED');
    expect(
      await db.studyAnswer.findFirst({ where: { sessionId: session.id } }),
    ).toMatchObject({
      cardId: null,
      questionCardId: card.id,
      questionSetId: setId,
    });
    expect(await db.cardProgress.count({ where: { userId } })).toBe(0);
    expect(await getProgress(db, userId, now)).toMatchObject({
      totalCards: 0,
      totalReviews: 1,
      accuracy: 100,
    });
  }, 20_000);

  it('keeps historical per-set accuracy after editing a card and resetting its progress', async () => {
    const session = await createStudySession(
      db,
      userId,
      { setId, mode: 'TRANSLATION', limit: 1 },
      now,
    );
    const card = cards.find((item) => item.id === session.current!.cardId)!;
    await db.card.update({
      where: { id: card.id },
      data: { translation: 'new meaning' },
    });
    const result = await answerQuestion(
      db,
      userId,
      session.id,
      { cardId: card.id, submittedValue: card.translation },
      now,
    );
    expect(result.isCorrect).toBe(true);
    expect(
      await db.cardProgress.count({ where: { userId, cardId: card.id } }),
    ).toBe(0);
    expect((await getProgress(db, userId, now)).sets[0]).toMatchObject({
      accuracy: 100,
      totalCards: 3,
    });
  }, 20_000);

  it('persists multiple-choice options and rejects answers outside those options', async () => {
    const session = await createStudySession(
      db,
      userId,
      { setId, mode: 'MULTIPLE_CHOICE', limit: 1 },
      now,
    );
    expect(session.current?.mode).toBe('MULTIPLE_CHOICE');
    expect(session.current?.options).toHaveLength(3);
    expect(
      toSessionView(await getSession(db, userId, session.id)).current?.options,
    ).toEqual(session.current?.options);
    await expect(
      answerQuestion(
        db,
        userId,
        session.id,
        { cardId: session.current!.cardId, submittedValue: 'made-up option' },
        now,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_OPTION' });
    expect(
      await db.studyAnswer.count({ where: { sessionId: session.id } }),
    ).toBe(0);
  }, 20_000);
});
