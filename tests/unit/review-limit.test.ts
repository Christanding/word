import { describe, it, expect } from "vitest";
import { normalizeReviewLimitInput, parseReviewLimit } from "@/lib/review-limit";

describe("parseReviewLimit", () => {
  it("returns default when query is missing", () => {
    expect(parseReviewLimit(null)).toBe(20);
  });

  it("parses valid positive integer", () => {
    expect(parseReviewLimit("30")).toBe(30);
  });

  it("falls back to default for invalid value", () => {
    expect(parseReviewLimit("abc")).toBe(20);
    expect(parseReviewLimit("0")).toBe(20);
    expect(parseReviewLimit("-1")).toBe(20);
  });

  it("caps value to max", () => {
    expect(parseReviewLimit("999")).toBe(100);
  });
});

describe("normalizeReviewLimitInput", () => {
  it("normalizes empty input to default", () => {
    expect(normalizeReviewLimitInput("")).toBe("20");
  });

  it("clamps values into 1-100", () => {
    expect(normalizeReviewLimitInput("0")).toBe("1");
    expect(normalizeReviewLimitInput("101")).toBe("100");
  });

  it("keeps valid values", () => {
    expect(normalizeReviewLimitInput("37")).toBe("37");
  });
});
