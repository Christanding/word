import { describe, expect, it } from "vitest";
import type { VocabAssessmentState, VocabAnswerRecord } from "@/lib/vocab-test/types";
import { canManuallyFinishState, estimateCompositeProgress, estimateRemainingQuestionRange } from "@/lib/vocab-test/progress";

function answer(overrides: Partial<VocabAnswerRecord> = {}): VocabAnswerRecord {
  return {
    questionId: "q-1",
    word: "assess",
    pos: "v.",
    level: "cet6",
    responseType: "option",
    correctMeaning: "评估",
    selectedMeaning: "评估",
    knew: true,
    isCorrect: true,
    explanation: "",
    answeredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function state(overrides: Partial<VocabAssessmentState> = {}): VocabAssessmentState {
  return {
    sessionId: "session-1",
    status: "in_progress",
    startedAt: "2026-01-01T00:00:00.000Z",
    startedLevel: "cet6",
    currentLevel: "cet6",
    questionCount: 25,
    aiQuestionCount: 0,
    confidence: 0.45,
    estimatedVocab: 5000,
    recommendedLevel: "cet6",
    askedWords: [],
    answers: [],
    correctStreak: 0,
    seenOptionMeanings: [],
    currentQuestion: undefined,
    ...overrides,
  };
}

describe("vocab-test progress", () => {
  it("estimateCompositeProgress: should combine volume, confidence, and stability with 40/40/20 weights", () => {
    const progress = estimateCompositeProgress(state());

    expect(progress).toBeCloseTo(0.4, 5);
  });

  it("estimateCompositeProgress: should reach full progress when thresholds and stability are satisfied", () => {
    const stableAnswers = Array.from({ length: 80 }).map((_, idx) =>
      answer({
        questionId: `q-${idx}`,
        level: idx % 2 === 0 ? "cet6" : "ielts",
        isCorrect: true,
      })
    );

    const progress = estimateCompositeProgress(
      state({
        questionCount: 80,
        confidence: 0.95,
        answers: stableAnswers,
      })
    );

    expect(progress).toBe(1);
  });

  it("estimateRemainingQuestionRange: should use the 150-question ceiling", () => {
    const remaining = estimateRemainingQuestionRange(
      state({
        questionCount: 149,
        confidence: 0.2,
      })
    );

    expect(remaining.max).toBe(1);
  });

  it("estimateRemainingQuestionRange: should show near-finish for clearly stable low-level sessions", () => {
    const lowStableAnswers = Array.from({ length: 84 }).map((_, idx) =>
      answer({
        questionId: `q-${idx}`,
        level: "cet4",
        responseType: idx % 3 === 0 ? "unknown" : "option",
        isCorrect: false,
        knew: false,
        selectedMeaning: idx % 3 === 0 ? null : "错误释义",
      })
    );

    const remaining = estimateRemainingQuestionRange(
      state({
        questionCount: 84,
        currentLevel: "cet4",
        confidence: 0.84,
        estimatedVocab: 2300,
        recommendedLevel: "cet4",
        answers: lowStableAnswers,
      })
    );

    expect(remaining.min).toBe(0);
    expect(remaining.max).toBeLessThanOrEqual(3);
  });

  it("canManuallyFinishState: should allow converged mixed cet4 sessions to finish early", () => {
    const mixedCet4Answers = Array.from({ length: 120 }).map((_, idx) =>
      (() => {
        const mod = idx % 8;
        if (mod === 0 || mod === 3 || mod === 6) {
          return answer({ questionId: `q-${idx}`, level: "cet4", isCorrect: true, knew: true, selectedMeaning: "正确释义" });
        }
        if (mod === 1 || mod === 4 || mod === 7) {
          return answer({ questionId: `q-${idx}`, level: "cet4", responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null });
        }
        return answer({ questionId: `q-${idx}`, level: "cet4", isCorrect: false, knew: true, selectedMeaning: "错误释义" });
      })()
    );

    expect(
      canManuallyFinishState(
        state({
          questionCount: 120,
          currentLevel: "cet4",
          confidence: 0.895,
          estimatedVocab: 2600,
          recommendedLevel: "cet4",
          answers: mixedCet4Answers,
        })
      )
    ).toBe(true);
  });

  it("canManuallyFinishState: should keep borderline gre sessions running when only ielts is recommended", () => {
    const borderlineGreAnswers = Array.from({ length: 67 }).map((_, idx) =>
      answer({
        questionId: `q-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 4 === 0 ? "unknown" : "option",
        isCorrect: idx % 5 === 0,
        knew: idx % 4 !== 0,
        selectedMeaning: idx % 5 === 0 ? "正确释义" : idx % 4 === 0 ? null : "错误释义",
      })
    );

    expect(
      canManuallyFinishState(
        state({
          questionCount: 67,
          currentLevel: "gre",
          confidence: 0.907,
          estimatedVocab: 7729,
          recommendedLevel: "ielts",
          answers: borderlineGreAnswers,
        })
      )
    ).toBe(false);
  });

  it("canManuallyFinishState: should allow strong gre sessions to finish without dragging into a long tail", () => {
    const strongGreAnswers = Array.from({ length: 96 }).map((_, idx) =>
      answer({
        questionId: `q-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 12 === 0 ? "unknown" : "option",
        isCorrect: idx % 12 !== 0,
        knew: idx % 12 !== 0,
        selectedMeaning: idx % 12 === 0 ? null : "正确释义",
      })
    );

    expect(
      canManuallyFinishState(
        state({
          startedLevel: "gre",
          questionCount: 96,
          currentLevel: "gre",
          confidence: 0.87,
          estimatedVocab: 9300,
          recommendedLevel: "gre",
          answers: strongGreAnswers,
        })
      )
    ).toBe(true);
  });

  it("canManuallyFinishState: should allow late gre recovery sessions to finish once high-level performance rebounds", () => {
    const lateRecoveryAnswers = Array.from({ length: 120 }).map((_, idx) =>
      answer({
        questionId: `q-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 8 === 0 ? "unknown" : "option",
        isCorrect: idx % 8 !== 0,
        knew: idx % 8 !== 0,
        selectedMeaning: idx % 8 === 0 ? null : "正确释义",
      })
    );

    expect(
      canManuallyFinishState(
        state({
          startedLevel: "gre",
          questionCount: 120,
          currentLevel: "gre",
          confidence: 0.462,
          estimatedVocab: 3250,
          recommendedLevel: "cet4",
          answers: lateRecoveryAnswers,
        })
      )
    ).toBe(true);
  });
});
