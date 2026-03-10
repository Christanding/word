import { describe, expect, it } from "vitest";
import { dedupeWordsByLemma } from "@/lib/words-list";

interface WordRow {
  id: string;
  lemma: string;
  frequency: number;
  hasDefinition: boolean;
  hasReviewed: boolean;
}

describe("dedupeWordsByLemma", () => {
  it("keeps one row per lemma and prefers entries with definitions", () => {
    const rows: WordRow[] = [
      { id: "w1", lemma: "military", frequency: 1, hasDefinition: false, hasReviewed: false },
      { id: "w2", lemma: "component", frequency: 1, hasDefinition: true, hasReviewed: false },
      { id: "w3", lemma: "military", frequency: 1, hasDefinition: true, hasReviewed: true },
    ];

    const deduped = dedupeWordsByLemma(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((row) => row.lemma === "military")?.id).toBe("w3");
  });
});
