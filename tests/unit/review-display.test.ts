import { describe, expect, it } from "vitest";
import { getCardDisplayMeaning, getDisplayMeaning } from "@/lib/review-display";

describe("getDisplayMeaning", () => {
  it("returns fallback when senses are empty", () => {
    expect(getDisplayMeaning([], "暂无释义")).toBe("暂无释义");
  });

  it("joins multiple senses for richer display", () => {
    const senses = ["传输", "传播", "传送"];
    expect(getDisplayMeaning(senses, "暂无释义")).toBe("传输；传播；传送");
  });

  it("limits max displayed senses", () => {
    const senses = ["传输", "传播", "传送", "输送"];
    expect(getDisplayMeaning(senses, "暂无释义", 2)).toBe("传输；传播");
  });
});

describe("getCardDisplayMeaning", () => {
  it("formats full meaning with mixed part of speech", () => {
    const result = getCardDisplayMeaning(
      "adj./n.",
      ["军事的", "军队的", "军用的", "军方", "军队"],
      "暂无释义"
    );

    expect(result).toBe("【adj.】军事的；军队的；军用的；【n.】军方；军队");
  });
});
