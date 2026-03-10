import type { Card, Review } from "@/lib/models";

export interface LearningStats {
  documents: number;
  wordsLearned: number;
  dueToday: number;
  dayStreak: number;
}

function toUtcDateKey(value: string): string {
  return value.slice(0, 10);
}

export function calculateDayStreak(reviews: Review[], now: Date = new Date()): number {
  if (reviews.length === 0) {
    return 0;
  }

  const reviewDays = new Set(reviews.map((review) => toUtcDateKey(review.lastReviewedAt)));
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let streak = 0;

  while (reviewDays.has(toUtcDateKey(cursor.toISOString()))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

export function calculateDueToday(cards: Card[], nowIso: string = new Date().toISOString()): number {
  return cards.filter((card) => !card.nextDueAt || card.nextDueAt <= nowIso).length;
}

export function calculateWordsLearned(cards: Card[], reviews: Review[]): number {
  const reviewedCardIds = new Set(reviews.map((review) => review.cardId));
  const reviewedWordIds = new Set(
    cards.filter((card) => reviewedCardIds.has(card.id)).map((card) => card.wordId)
  );

  return reviewedWordIds.size;
}

export function buildLearningStats(input: {
  documentCount: number;
  cards: Card[];
  reviews: Review[];
  now?: Date;
}): LearningStats {
  const now = input.now ?? new Date();
  return {
    documents: input.documentCount,
    wordsLearned: calculateWordsLearned(input.cards, input.reviews),
    dueToday: calculateDueToday(input.cards, now.toISOString()),
    dayStreak: calculateDayStreak(input.reviews, now),
  };
}
