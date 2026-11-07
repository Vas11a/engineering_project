import type { AuthenticatedUser, TelegramProfile } from '../auth/types.js';

export type VocabularySetInput = {
  title: string;
  description: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  visibility: 'PRIVATE' | 'PUBLIC';
};

export type VocabularySetPatch = Partial<VocabularySetInput>;

export type VocabularySetView = VocabularySetInput & {
  id: string;
  ownerId: string;
  copiedFromId: string | null;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CardInput = {
  sourceText: string;
  translation: string;
  explanation: string | null;
  examples: string[];
  creationSource?: 'MANUAL' | 'AI';
};

export type CardPatch = Partial<CardInput>;

export type CardView = Omit<CardInput, 'creationSource'> & {
  id: string;
  setId: string;
  creationSource: 'MANUAL' | 'AI' | 'COPIED';
  createdAt: string;
  updatedAt: string;
};

export interface AppStore {
  upsertUser(profile: TelegramProfile): Promise<AuthenticatedUser>;
  listSets(ownerId: string): Promise<VocabularySetView[]>;
  createSet(
    ownerId: string,
    input: VocabularySetInput,
  ): Promise<VocabularySetView>;
  getSet(ownerId: string, setId: string): Promise<VocabularySetView | null>;
  updateSet(
    ownerId: string,
    setId: string,
    input: VocabularySetPatch,
  ): Promise<VocabularySetView | null>;
  deleteSet(ownerId: string, setId: string): Promise<boolean>;
  listCards(ownerId: string, setId: string): Promise<CardView[] | null>;
  createCard(
    ownerId: string,
    setId: string,
    input: CardInput,
  ): Promise<CardView | null>;
  updateCard(
    ownerId: string,
    setId: string,
    cardId: string,
    input: CardPatch,
  ): Promise<CardView | null>;
  deleteCard(ownerId: string, setId: string, cardId: string): Promise<boolean>;
}
