import { describe, expect, it } from "vitest";
import { buildReviewPath } from "@/lib/review-entry";

describe("buildReviewPath", () => {
  it("builds review path with normalized limit", () => {
    expect(buildReviewPath("30")).toBe("/app/review?limit=30");
    expect(buildReviewPath("0")).toBe("/app/review?limit=1");
    expect(buildReviewPath("abc")).toBe("/app/review?limit=20");
  });
});
