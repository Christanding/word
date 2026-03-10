import { describe, expect, it } from "vitest";
import {
  FIREWORK_ROUNDS,
  FIREWORK_ROUND_MS,
  FIREWORK_FADE_MS,
  getCelebrationTimings,
} from "@/lib/review-celebration";

describe("review celebration timings", () => {
  it("uses three rounds with 3s each by default", () => {
    expect(FIREWORK_ROUNDS).toBe(3);
    expect(FIREWORK_ROUND_MS).toBe(3000);
  });

  it("computes fade and redirect moments", () => {
    const timings = getCelebrationTimings();
    expect(timings.celebrationMs).toBe(9000);
    expect(timings.redirectMs).toBe(9000 + FIREWORK_FADE_MS);
  });
});
