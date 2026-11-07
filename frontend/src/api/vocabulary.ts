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
> & { creationSource?: 'MANUAL' | 'AI' };

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
  input: Partial<SetInput> & { visibility?: VocabularySet['visibility'] },
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

export async function listCards(
  setId: string,
  signal?: AbortSignal,
): Promise<Card[]> {
  return (
    await apiRequest<{ cards: Card[] }>(`/sets/${setId}/cards`, { signal })
  ).cards;
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

export type CatalogResult = {
  sets: VocabularySet[];
  total: number;
  page: number;
  pageSize: number;
};
export async function listPublicSets(
  filters: {
    q: string;
    sourceLanguage: string;
    targetLanguage: string;
    page: number;
  },
  signal?: AbortSignal,
): Promise<CatalogResult> {
  const query = new URLSearchParams({
    ...filters,
    page: String(filters.page),
    pageSize: '12',
  });
  return apiRequest<CatalogResult>(`/public-sets?${query}`, { signal });
}
export async function getPublicSet(
  id: string,
  signal?: AbortSignal,
): Promise<{ set: VocabularySet; cards: Card[] }> {
  return apiRequest(`/public-sets/${id}`, { signal });
}
export async function copyPublicSet(id: string): Promise<VocabularySet> {
  return (
    await apiRequest<{ set: VocabularySet }>(`/public-sets/${id}/copy`, {
      method: 'POST',
    })
  ).set;
}
export type GeneratedContent = {
  translation: string;
  explanation: string | null;
  examples: string[];
};
export async function generateCardContent(
  input: { sourceText: string; sourceLanguage: string; targetLanguage: string },
  signal?: AbortSignal,
): Promise<GeneratedContent> {
  return apiRequest('/ai/card-content', {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  });
}
