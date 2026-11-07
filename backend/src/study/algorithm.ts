export type ReviewProgress = {
  difficulty: number;
  intervalDays: number;
  correctStreak: number;
  totalReviews: number;
  correctReviews: number;
};

/** Deterministic spaced repetition; never depends on response latency or randomness. */
export function scheduleReview(
  previous: ReviewProgress | null,
  isCorrect: boolean,
  confidence: 1 | 2 | 3,
  now: Date,
) {
  const old = previous ?? {
    difficulty: 2.5,
    intervalDays: 0,
    correctStreak: 0,
    totalReviews: 0,
    correctReviews: 0,
  };
  const difficulty = Math.max(
    1.3,
    Math.min(
      3,
      old.difficulty + (isCorrect ? (confidence === 3 ? 0.1 : -0.1) : -0.2),
    ),
  );
  const correctStreak = isCorrect ? old.correctStreak + 1 : 0;
  const intervalDays = !isCorrect
    ? 0
    : correctStreak === 1
      ? 1
      : correctStreak === 2
        ? 3
        : Math.min(
            365,
            Math.max(
              old.intervalDays + 1,
              Math.round(old.intervalDays * difficulty),
            ),
          );
  return {
    difficulty,
    correctStreak,
    intervalDays,
    totalReviews: old.totalReviews + 1,
    correctReviews: old.correctReviews + Number(isCorrect),
    lastReviewedAt: now,
    nextReviewAt: new Date(
      now.getTime() + (isCorrect ? intervalDays * 86_400_000 : 10 * 60_000),
    ),
  };
}

export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/gu, ' ');
}
