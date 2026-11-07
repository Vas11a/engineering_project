import { apiRequest } from './client';

export type StudyMode =
  'FLASHCARDS' | 'TRANSLATION' | 'MULTIPLE_CHOICE' | 'MIXED';
export type StudySession = {
  id: string;
  mode: StudyMode;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  total: number;
  answered: number;
  correct: number;
  current: {
    cardId: string;
    sourceText: string;
    mode: Exclude<StudyMode, 'MIXED'>;
    options?: string[];
  } | null;
};
export type Feedback = {
  isCorrect: boolean;
  translation: string;
  explanation: string | null;
  examples: string[];
  session: StudySession;
};
export type RevealedCard = Pick<
  Feedback,
  'translation' | 'explanation' | 'examples'
>;
export type Due = { dueCount: number; newCount: number; totalCount: number };
export type Progress = {
  totalCards: number;
  learnedCards: number;
  dueCards: number;
  newCards: number;
  totalReviews: number;
  accuracy: number;
  recentSessions: {
    id: string;
    mode: StudyMode;
    status: StudySession['status'];
    startedAt: string;
    completedAt: string | null;
    answered: number;
    correct: number;
  }[];
  sets: {
    id: string;
    title: string;
    totalCards: number;
    learnedCards: number;
    dueCards: number;
    accuracy: number;
  }[];
};
export function getDue(setId?: string, signal?: AbortSignal): Promise<Due> {
  return apiRequest(
    `/study/due${setId ? `?setId=${encodeURIComponent(setId)}` : ''}`,
    { signal },
  );
}
export async function startStudy(input: {
  setId?: string;
  mode: StudyMode;
  limit: number;
}): Promise<StudySession> {
  return (
    await apiRequest<{ session: StudySession }>('/study/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).session;
}
export async function getStudy(
  id: string,
  signal?: AbortSignal,
): Promise<StudySession> {
  return (
    await apiRequest<{ session: StudySession }>(`/study/sessions/${id}`, {
      signal,
    })
  ).session;
}
export function revealStudy(id: string): Promise<RevealedCard> {
  return apiRequest(`/study/sessions/${id}/reveal`, { method: 'POST' });
}
export function answerStudy(
  id: string,
  input: {
    cardId: string;
    submittedValue?: string;
    confidence?: number;
    responseTimeMs: number;
  },
): Promise<Feedback> {
  return apiRequest(`/study/sessions/${id}/answers`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export async function abandonStudy(id: string): Promise<StudySession> {
  return (
    await apiRequest<{ session: StudySession }>(
      `/study/sessions/${id}/abandon`,
      { method: 'POST' },
    )
  ).session;
}
export function getProgress(signal?: AbortSignal): Promise<Progress> {
  return apiRequest('/progress', { signal });
}
