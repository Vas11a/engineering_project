import type { PrismaClient } from '../generated/prisma/client.js';

import type { TelegramProfile } from '../auth/types.js';
import { HttpError } from '../http/errors.js';
import { serializable } from '../database/transaction.js';
import type {
  AppStore,
  CardInput,
  CardPatch,
  CardView,
  VocabularySetInput,
  VocabularySetPatch,
  VocabularySetView,
} from './types.js';

function toUserView(user: {
  id: string;
  telegramId: bigint;
  username: string | null;
  firstName: string;
  lastName: string | null;
  languageCode: string | null;
  photoUrl: string | null;
}) {
  return { ...user, telegramId: user.telegramId.toString() };
}

export function toSetView(set: {
  id: string;
  ownerId: string;
  copiedFromId: string | null;
  title: string;
  description: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  createdAt: Date;
  updatedAt: Date;
  _count: { cards: number };
}): VocabularySetView {
  return {
    id: set.id,
    ownerId: set.ownerId,
    copiedFromId: set.copiedFromId,
    title: set.title,
    description: set.description,
    sourceLanguage: set.sourceLanguage,
    targetLanguage: set.targetLanguage,
    visibility: set.visibility,
    cardCount: set._count.cards,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
  };
}

function normalizeExamples(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function toCardView(card: {
  id: string;
  setId: string;
  sourceText: string;
  translation: string;
  explanation: string | null;
  examples: unknown;
  creationSource: 'MANUAL' | 'AI' | 'COPIED';
  createdAt: Date;
  updatedAt: Date;
}): CardView {
  return {
    id: card.id,
    setId: card.setId,
    sourceText: card.sourceText,
    translation: card.translation,
    explanation: card.explanation,
    examples: normalizeExamples(card.examples),
    creationSource: card.creationSource,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

const setInclude = { _count: { select: { cards: true } } } as const;

export class PrismaAppStore implements AppStore {
  constructor(private readonly client: PrismaClient) {}

  async upsertUser(profile: TelegramProfile) {
    const user = await this.client.user.upsert({
      where: { telegramId: profile.telegramId },
      create: profile,
      update: {
        username: profile.username,
        firstName: profile.firstName,
        lastName: profile.lastName,
        languageCode: profile.languageCode,
        photoUrl: profile.photoUrl,
      },
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        languageCode: true,
        photoUrl: true,
      },
    });
    return toUserView(user);
  }

  async listSets(ownerId: string): Promise<VocabularySetView[]> {
    const sets = await this.client.vocabularySet.findMany({
      where: { ownerId },
      include: setInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return sets.map(toSetView);
  }

  async createSet(
    ownerId: string,
    input: VocabularySetInput,
  ): Promise<VocabularySetView> {
    const set = await this.client.vocabularySet.create({
      data: { ownerId, ...input },
      include: setInclude,
    });
    return toSetView(set);
  }

  async getSet(ownerId: string, setId: string) {
    const set = await this.client.vocabularySet.findFirst({
      where: { id: setId, ownerId },
      include: setInclude,
    });
    return set ? toSetView(set) : null;
  }

  async updateSet(ownerId: string, setId: string, input: VocabularySetPatch) {
    return serializable(this.client, async (transaction) => {
      const current = await transaction.vocabularySet.findFirst({
        where: { id: setId, ownerId },
        include: setInclude,
      });
      if (!current) return null;
      if (input.visibility === 'PUBLIC' && current._count.cards === 0) {
        throw new HttpError(
          409,
          'EMPTY_SET',
          'Add a card before publishing this set.',
        );
      }
      return toSetView(
        await transaction.vocabularySet.update({
          where: { id: setId },
          data: input,
          include: setInclude,
        }),
      );
    });
  }

  async deleteSet(ownerId: string, setId: string): Promise<boolean> {
    const result = await this.client.vocabularySet.deleteMany({
      where: { id: setId, ownerId },
    });
    return result.count > 0;
  }

  async listCards(ownerId: string, setId: string) {
    const set = await this.client.vocabularySet.findFirst({
      where: { id: setId, ownerId },
      select: { id: true },
    });
    if (!set) return null;

    const cards = await this.client.card.findMany({
      where: { setId },
      orderBy: { createdAt: 'desc' },
    });
    return cards.map(toCardView);
  }

  async createCard(ownerId: string, setId: string, input: CardInput) {
    return serializable(this.client, async (transaction) => {
      const set = await transaction.vocabularySet.findFirst({
        where: { id: setId, ownerId },
        select: { id: true },
      });
      if (!set) return null;

      const card = await transaction.card.create({
        data: {
          setId,
          ...input,
          creationSource: input.creationSource ?? 'MANUAL',
        },
      });
      await transaction.vocabularySet.update({
        where: { id: setId },
        data: { updatedAt: new Date() },
      });
      return toCardView(card);
    });
  }

  async updateCard(
    ownerId: string,
    setId: string,
    cardId: string,
    input: CardPatch,
  ) {
    return serializable(this.client, async (transaction) => {
      const ownedCard = await transaction.card.findFirst({
        where: { id: cardId, setId, set: { ownerId } },
        select: { id: true, sourceText: true, translation: true },
      });
      if (!ownedCard) return null;

      const card = await transaction.card.update({
        where: { id: cardId },
        data: input,
      });
      await transaction.vocabularySet.update({
        where: { id: setId },
        data: { updatedAt: new Date() },
      });
      // An edited meaning is new learning material, not a mastered old card.
      if (
        (input.sourceText !== undefined &&
          input.sourceText !== ownedCard.sourceText) ||
        (input.translation !== undefined &&
          input.translation !== ownedCard.translation)
      ) {
        await transaction.cardProgress.deleteMany({ where: { cardId } });
      }
      return toCardView(card);
    });
  }

  async deleteCard(
    ownerId: string,
    setId: string,
    cardId: string,
  ): Promise<boolean> {
    return serializable(this.client, async (transaction) => {
      const ownedCard = await transaction.card.findFirst({
        where: { id: cardId, setId, set: { ownerId } },
        select: { id: true },
      });
      if (!ownedCard) return false;

      await transaction.card.delete({ where: { id: cardId } });
      const remaining = await transaction.card.count({ where: { setId } });
      await transaction.vocabularySet.update({
        where: { id: setId },
        data: {
          updatedAt: new Date(),
          ...(remaining === 0 ? { visibility: 'PRIVATE' } : {}),
        },
      });
      return true;
    });
  }
}
