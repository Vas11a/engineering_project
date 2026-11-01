import { apiRequest } from './client';

export type User = {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  languageCode: string | null;
  photoUrl: string | null;
};

export type VocabularySet = {
  id: string;
  ownerId: string;
  copiedFromId: string | null;
  title: string;
  description: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  cardCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SetInput = Pick<
  VocabularySet,
  'title' | 'description' | 'sourceLanguage' | 'targetLanguage'
>;

export type Card = {
  id: string;
  setId: string;
  sourceText: string;
  translation: string;
  explanation: string | null;
  examples: string[];
  creationSource: 'MANUAL' | 'AI' | 'COPIED';
  createdAt: string;
  updatedAt: string;
};

export type CardInput = Pick<
  Card,
  'sourceText' | 'translation' | 'explanation' | 'examples'
>;

export async function getCurrentUser(): Promise<User> {
  return (await apiRequest<{ user: User }>('/users/me')).user;
}

export async function listSets(): Promise<VocabularySet[]> {
  return (await apiRequest<{ sets: VocabularySet[] }>('/sets')).sets;
}

export async function createSet(input: SetInput): Promise<VocabularySet> {
  return (
    await apiRequest<{ set: VocabularySet }>('/sets', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).set;
}

export async function updateSet(
  setId: string,
  input: Partial<SetInput>,
): Promise<VocabularySet> {
  return (
    await apiRequest<{ set: VocabularySet }>(`/sets/${setId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  ).set;
}

export async function deleteSet(setId: string): Promise<void> {
  await apiRequest<void>(`/sets/${setId}`, { method: 'DELETE' });
}

export async function listCards(setId: string): Promise<Card[]> {
  return (await apiRequest<{ cards: Card[] }>(`/sets/${setId}/cards`)).cards;
}

export async function createCard(
  setId: string,
  input: CardInput,
): Promise<Card> {
  return (
    await apiRequest<{ card: Card }>(`/sets/${setId}/cards`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).card;
}

export async function updateCard(
  setId: string,
  cardId: string,
  input: Partial<CardInput>,
): Promise<Card> {
  return (
    await apiRequest<{ card: Card }>(`/sets/${setId}/cards/${cardId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  ).card;
}

export async function deleteCard(setId: string, cardId: string): Promise<void> {
  await apiRequest<void>(`/sets/${setId}/cards/${cardId}`, {
    method: 'DELETE',
  });
}
