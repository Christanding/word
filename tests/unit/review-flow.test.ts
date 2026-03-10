import { describe, expect, it } from "vitest";
import {
  applyReviewAnswer,
  createInitialReviewSession,
  type ReviewSession,
} from "@/lib/review-flow";

describe("createInitialReviewSession", () => {
  it("creates two passes per word", () => {
    const session = createInitialReviewSession(["w1", "w2"]);

    expect(session.currentIndex).toBe(0);
    expect(session.steps).toEqual([
      { cardId: "w1", direction: "en-zh" },
      { cardId: "w1", direction: "zh-en" },
      { cardId: "w2", direction: "en-zh" },
      { cardId: "w2", direction: "zh-en" },
    ]);
  });
});

describe("applyReviewAnswer", () => {
  const baseSession: ReviewSession = {
    currentIndex: 0,
    steps: [
      { cardId: "w1", direction: "en-zh" },
      { cardId: "w1", direction: "zh-en" },
      { cardId: "w2", direction: "en-zh" },
    ],
  };

  it("advances to next step when correct", () => {
    const next = applyReviewAnswer(baseSession, true);

    expect(next.currentIndex).toBe(1);
    expect(next.steps).toHaveLength(3);
  });

  it("appends wrong step to end and continues", () => {
    const next = applyReviewAnswer(baseSession, false);

    expect(next.currentIndex).toBe(1);
    expect(next.steps).toEqual([
      { cardId: "w1", direction: "en-zh" },
      { cardId: "w1", direction: "zh-en" },
      { cardId: "w2", direction: "en-zh" },
      { cardId: "w1", direction: "en-zh" },
    ]);
  });

  it("keeps session unchanged if already finished", () => {
    const finished: ReviewSession = {
      currentIndex: 3,
      steps: [
        { cardId: "w1", direction: "en-zh" },
        { cardId: "w1", direction: "zh-en" },
        { cardId: "w2", direction: "en-zh" },
      ],
    };
    expect(applyReviewAnswer(finished, false)).toEqual(finished);
  });
});
