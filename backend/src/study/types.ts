export type StudyMode =
  'FLASHCARDS' | 'TRANSLATION' | 'MULTIPLE_CHOICE' | 'MIXED';
export type QuestionMode = Exclude<StudyMode, 'MIXED'>;
export type QuestionSnapshot = {
  cardId: string;
  setId: string;
  sourceText: string;
  translation: string;
  explanation: string | null;
  examples: string[];
  mode: QuestionMode;
  options?: string[];
};
export type SessionView = {
  id: string;
  mode: StudyMode;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  total: number;
  answered: number;
  correct: number;
  current: {
    cardId: string;
    sourceText: string;
    mode: QuestionMode;
    options?: string[];
  } | null;
};
