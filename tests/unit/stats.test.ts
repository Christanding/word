import { describe, expect, it } from "vitest";
import {
  buildLearningStats,
  calculateDayStreak,
  calculateDueToday,
  calculateWordsLearned,
} from "@/lib/stats";
import type { Card, Review } from "@/lib/models";

function makeCard(input: Partial<Card>): Card {
  return {
    id: input.id ?? "card-1",
    type: "card",
    userId: input.userId ?? "u1",
    createdAt: input.createdAt ?? "2026-03-01T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-03-01T00:00:00.000Z",
    wordId: input.wordId ?? "word-1",
    definitionId: input.definitionId ?? "def-1",
    lemma: input.lemma ?? "example",
    senses: input.senses ?? ["示例"],
    pos: input.pos,
    nextDueAt: input.nextDueAt,
  };
}

function makeReview(input: Partial<Review>): Review {
  return {
    id: input.id ?? "review-1",
    type: "review",
    userId: input.userId ?? "u1",
    createdAt: input.createdAt ?? "2026-03-01T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-03-01T00:00:00.000Z",
    cardId: input.cardId ?? "card-1",
    quality: input.quality ?? 4,
    easeFactor: input.easeFactor ?? 2.5,
    intervalDays: input.intervalDays ?? 1,
    repetitions: input.repetitions ?? 1,
    nextDueAt: input.nextDueAt ?? "2026-03-02T00:00:00.000Z",
    lastReviewedAt: input.lastReviewedAt ?? "2026-03-03T00:00:00.000Z",
  };
}

describe("stats helpers", () => {
  it("calculates due cards from nextDueAt", () => {
    const cards = [
      makeCard({ id: "c1", nextDueAt: "2026-03-02T10:00:00.000Z" }),
      makeCard({ id: "c2", nextDueAt: "2026-03-03T11:00:00.000Z" }),
      makeCard({ id: "c3" }),
    ];

    expect(calculateDueToday(cards, "2026-03-03T10:00:00.000Z")).toBe(2);
  });

  it("counts learned words by reviewed cards", () => {
    const cards = [
      makeCard({ id: "c1", wordId: "w1" }),
      makeCard({ id: "c2", wordId: "w1" }),
      makeCard({ id: "c3", wordId: "w2" }),
    ];
    const reviews = [makeReview({ cardId: "c1" }), makeReview({ cardId: "c3" })];

    expect(calculateWordsLearned(cards, reviews)).toBe(2);
  });

  it("calculates streak ending today", () => {
    const reviews = [
      makeReview({ id: "r1", lastReviewedAt: "2026-03-03T08:00:00.000Z" }),
      makeReview({ id: "r2", lastReviewedAt: "2026-03-02T08:00:00.000Z" }),
      makeReview({ id: "r3", lastReviewedAt: "2026-03-01T08:00:00.000Z" }),
      makeReview({ id: "r4", lastReviewedAt: "2026-02-27T08:00:00.000Z" }),
    ];

    expect(calculateDayStreak(reviews, new Date("2026-03-03T23:00:00.000Z"))).toBe(3);
  });

  it("returns zero streak when there is no review today", () => {
    const reviews = [makeReview({ lastReviewedAt: "2026-03-02T08:00:00.000Z" })];
    expect(calculateDayStreak(reviews, new Date("2026-03-03T12:00:00.000Z"))).toBe(0);
  });

  it("builds aggregated stats", () => {
    const cards = [
      makeCard({ id: "c1", wordId: "w1", nextDueAt: "2026-03-03T08:00:00.000Z" }),
      makeCard({ id: "c2", wordId: "w2", nextDueAt: "2026-03-04T08:00:00.000Z" }),
    ];
    const reviews = [makeReview({ cardId: "c1", lastReviewedAt: "2026-03-03T01:00:00.000Z" })];

    expect(
      buildLearningStats({
        documentCount: 15,
        cards,
        reviews,
        now: new Date("2026-03-03T09:00:00.000Z"),
      })
    ).toEqual({
      documents: 15,
      wordsLearned: 1,
      dueToday: 1,
      dayStreak: 1,
    });
  });
});
