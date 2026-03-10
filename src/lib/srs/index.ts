import { getDBAdapter } from "../db";
import { calculateSM2 } from "./sm2";
import type { Card, Review, Definition } from "../models";

function isUsableSense(sense: string | undefined): boolean {
  return !!sense && !sense.startsWith("[Error]") && sense !== "暂无释义";
}

export interface ReviewInput {
  cardId: string;
  quality: number; // 0-5
  userId: string;
}

export async function processReview(input: ReviewInput): Promise<Review> {
  const db = getDBAdapter();
  
  // Get card
  const card = await db.findById<Card>("cards", input.cardId);
  if (!card) {
    throw new Error(`Card ${input.cardId} not found`);
  }
  
  // Get existing review or use defaults
  const existingReviews = await db.findMany<Review>("reviews", {
    cardId: input.cardId,
  });
  
  const lastReview = existingReviews.length > 0 
    ? existingReviews.sort((a, b) => 
        new Date(b.lastReviewedAt).getTime() - new Date(a.lastReviewedAt).getTime()
      )[0]
    : null;
  
  // Calculate SM-2
  const sm2Result = calculateSM2(
    input.quality,
    lastReview?.easeFactor || 2.5,
    lastReview?.intervalDays || 0,
    lastReview?.repetitions || 0
  );
  
  // Create review record
  const review = await db.create<Review>("reviews", {
    type: "review",
    userId: input.userId,
    cardId: input.cardId,
    quality: input.quality,
    easeFactor: sm2Result.easeFactor,
    intervalDays: sm2Result.intervalDays,
    repetitions: sm2Result.repetitions,
    nextDueAt: sm2Result.nextDueAt.toISOString(),
    lastReviewedAt: new Date().toISOString(),
  });
  
  // Update card with next due date
  await db.update("cards", input.cardId, {
    nextDueAt: sm2Result.nextDueAt.toISOString(),
  });
  
  return review;
}

export async function getDueCards(userId: string, limit: number = 20): Promise<Card[]> {
  const db = getDBAdapter();
  const now = new Date().toISOString();

  await ensureCardsForUser(userId);
  
  // Find cards that are due
  const allCards = await db.findMany<Card>("cards", { userId });
  const dueCards = allCards.filter((card) => {
    if (!isUsableSense(card.senses?.[0])) {
      return false;
    }
    if (!card.nextDueAt) return true; // No due date = due now
    return card.nextDueAt <= now;
  });
  
  // Sort by due date and limit
  return dueCards
    .sort((a, b) => {
      if (!a.nextDueAt) return -1;
      if (!b.nextDueAt) return 1;
      return new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime();
    })
    .slice(0, limit);
}

async function ensureCardsForUser(userId: string): Promise<void> {
  const db = getDBAdapter();

  const definitions = await db.findMany<Definition>("definitions", { userId });
  if (definitions.length === 0) {
    return;
  }

  const existingCards = await db.findMany<Card>("cards", { userId });
  const existingDefinitionIds = new Set(existingCards.map((card) => card.definitionId));

  const cardsToCreate = definitions
    .filter((definition) => isUsableSense(definition.senses?.[0]))
    .filter((definition) => !existingDefinitionIds.has(definition.id))
    .map((definition) => ({
      type: "card" as const,
      userId,
      wordId: definition.wordId,
      definitionId: definition.id,
      lemma: definition.lemma,
      pos: definition.pos,
      senses: definition.senses,
    }));

  if (cardsToCreate.length === 0) {
    return;
  }

  await db.batchCreate<Card>("cards", cardsToCreate);
}
