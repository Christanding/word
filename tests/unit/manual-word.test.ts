import { describe, expect, it } from "vitest";
import {
  mergeDefinitionsByPos,
  normalizeManualLemma,
  normalizeManualDefinitions,
  shouldSkipDefinitionVerification,
  type ManualDefinitionInput,
} from "@/lib/manual-word";

describe("manual-word helpers", () => {
  it("normalizes lemma casing and spaces", () => {
    expect(normalizeManualLemma("  Military  ")).toBe("military");
  });

  it("normalizes definitions and drops empty rows", () => {
    const defs: ManualDefinitionInput[] = [
      { pos: "adj.", sensesText: "军事的； 军队的" },
      { pos: " ", sensesText: "   " },
      { pos: "n.", sensesText: "军方\n军队" },
    ];

    expect(normalizeManualDefinitions(defs)).toEqual([
      { pos: "adj.", senses: ["军事的", "军队的"] },
      { pos: "n.", senses: ["军方", "军队"] },
    ]);
  });

  it("merges definitions by part of speech and deduplicates senses", () => {
    const merged = mergeDefinitionsByPos(
      [
        { pos: "adj.", senses: ["军事的"] },
        { pos: "n.", senses: ["军方", "军队"] },
      ],
      [
        { pos: "adj.", senses: ["军队的", "军事的"] },
        { pos: "n.", senses: ["军队"] },
      ]
    );

    expect(merged).toEqual([
      { pos: "adj.", senses: ["军事的", "军队的"] },
      { pos: "n.", senses: ["军方", "军队"] },
    ]);
  });

  it("skips verification when generated successfully", () => {
    expect(shouldSkipDefinitionVerification(true)).toBe(true);
    expect(shouldSkipDefinitionVerification(false)).toBe(false);
  });
});
