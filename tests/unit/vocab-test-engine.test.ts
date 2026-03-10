import { describe, expect, it, vi } from "vitest";
import {
  applyLowConfidenceResultPolicy,
  applyEstimatedVocabGuardrail,
  adjustConfidenceForEarlySession,
  adjustConfidenceForLateSession,
  buildBankQuestion,
  estimateConfidence,
  estimateRemainingQuestionRange,
  estimateVocabSize,
  getSameLevelEdgeBias,
  getUpperEdgeChallengeLevel,
  getNextLevelAfterCalibration,
  getRecommendedLevel,
  getSessionStartLevel,
  applyFinalLevelPriorityAdjustment,
  resolveGuardedEstimatedVocab,
  shouldFinishTest,
  TEST_POLICY,
} from "@/lib/vocab-test/engine";
import type { QuestionBank } from "@/lib/vocab-test/bank";
import type { VocabAnswerRecord, VocabAssessmentState } from "@/lib/vocab-test/types";

function answer(overrides: Partial<VocabAnswerRecord>): VocabAnswerRecord {
  return {
    questionId: "q-1",
    word: "assess",
    pos: "v.",
    level: "cet6",
    responseType: "option",
    correctMeaning: "【v.】评估；评价；进行判断",
    selectedMeaning: "【v.】评估；评价；进行判断",
    knew: true,
    isCorrect: true,
    explanation: "表示对对象作出价值或水平判断。",
    answeredAt: new Date().toISOString(),
    ...overrides,
  };
}

function state(overrides: Partial<VocabAssessmentState>): VocabAssessmentState {
  return {
    sessionId: "s-1",
    status: "in_progress",
    startedAt: new Date().toISOString(),
    currentLevel: "cet6",
    startedLevel: "cet4",
    questionCount: 0,
    aiQuestionCount: 0,
    confidence: 0,
    estimatedVocab: 0,
    recommendedLevel: "cet4",
    askedWords: [],
    answers: [],
    correctStreak: 0,
    ...overrides,
  };
}

function similarityLikeProduct(a: string, b: string): number {
  const norm = (raw: string) =>
    raw
      .replace(/^【[^】]+】\s*/u, "")
      .replace(/[；。\s]+/gu, "")
      .trim();
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) {
    return 0;
  }
  const setA = new Set(left.split(""));
  const setB = new Set(right.split(""));
  let hit = 0;
  for (const ch of setA) {
    if (setB.has(ch)) hit += 1;
  }
  return hit / Math.max(setA.size + setB.size - hit, 1);
}

describe("vocab-test engine", () => {
  it("TEST_POLICY: should expose the slightly reduced correct-answer score", () => {
    expect(TEST_POLICY.correctScore).toBe(0.96);
  });

  it("TEST_POLICY: should expose the moderately reduced unknown and unsure scores", () => {
    expect(TEST_POLICY.unknownScore).toBe(0.14);
    expect(TEST_POLICY.unsureScore).toBe(0.26);
  });

  it("applyEstimatedVocabGuardrail: stronger unknown evidence should pull estimates down more aggressively", () => {
    const baselineAnswers = Array.from({ length: 60 }).map((_, idx) =>
      answer({
        questionId: `q-${idx}`,
        level: idx % 2 === 0 ? "cet6" : "ielts",
        responseType: idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx % 3 !== 0 && idx % 2 === 0,
        knew: idx % 3 !== 0,
        selectedMeaning: idx % 3 === 0 ? null : idx % 2 === 0 ? "【v.】评估；评价；进行判断" : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 95,
      estimatedVocab: estimateVocabSize(baselineAnswers, 6000),
      confidence: 0.9,
      currentLevel: "cet6",
      recommendedLevel: "cet6",
      answers: baselineAnswers,
    });
    expect(guarded).toBeLessThan(5200);
  });

  it("estimateVocabSize: more correct answers should increase estimate", () => {
    const low = [answer({ isCorrect: false, knew: true, selectedMeaning: "错误释义" })];
    const high = [answer({ isCorrect: true }), answer({ isCorrect: true })];

    expect(estimateVocabSize(high)).toBeGreaterThan(estimateVocabSize(low));
  });

  it("estimateVocabSize: GRE correct should contribute more than CET4 correct", () => {
    const cet4Only = [answer({ level: "cet4", responseType: "option", isCorrect: true })];
    const greOnly = [answer({ level: "gre", responseType: "option", isCorrect: true })];
    expect(estimateVocabSize(greOnly)).toBeGreaterThan(estimateVocabSize(cet4Only));
  });

  it("estimateVocabSize: unknown should be lighter penalty than wrong-known", () => {
    const unknown = [answer({ responseType: "unknown", knew: false, isCorrect: false, selectedMeaning: null })];
    const wrongKnown = [answer({ responseType: "option", knew: true, isCorrect: false, selectedMeaning: "错误释义" })];

    expect(estimateVocabSize(unknown)).toBeGreaterThan(estimateVocabSize(wrongKnown));
  });

  it("estimateVocabSize: unsure should ignore impossible correct-state variance", () => {
    const unsureWrong = [
      answer({ responseType: "unsure", knew: true, isCorrect: false, selectedMeaning: null }),
    ];
    const unsureLegacyCorrect = [
      answer({ responseType: "unsure", knew: true, isCorrect: true, selectedMeaning: "【v.】评估；评价；进行判断" }),
    ];

    expect(estimateVocabSize(unsureLegacyCorrect)).toBe(estimateVocabSize(unsureWrong));
  });

  it("estimateVocabSize: unsure wrong should still score above unknown", () => {
    const unknown = [answer({ responseType: "unknown", knew: false, isCorrect: false, selectedMeaning: null })];
    const unsureWrong = [
      answer({ responseType: "unsure", knew: true, isCorrect: false, selectedMeaning: null }),
    ];

    expect(estimateVocabSize(unsureWrong)).toBeGreaterThan(estimateVocabSize(unknown));
  });

  it("shouldFinishTest: follows min/max/confidence rules", () => {
    expect(shouldFinishTest(state({ questionCount: 49, confidence: 0.99 }))).toBe(false);
    expect(shouldFinishTest(state({ questionCount: 50, confidence: 0.91 }))).toBe(true);
    expect(shouldFinishTest(state({ questionCount: 150, confidence: 0.2 }))).toBe(true);
  });

  it("shouldFinishTest: should allow clearly stable low-level sessions to finish before 150", () => {
    const lowStableAnswers = Array.from({ length: 82 }).map((_, idx) =>
      answer({
        questionId: `q-low-${idx}`,
        word: `low-${idx}`,
        level: "cet4",
        responseType: idx % 3 === 0 ? "unknown" : "option",
        isCorrect: false,
        knew: false,
        selectedMeaning: idx % 3 === 0 ? null : "错误释义",
      })
    );

    expect(
      shouldFinishTest(
        state({
          questionCount: 82,
          confidence: 0.84,
          currentLevel: "cet4",
          recommendedLevel: "cet4",
          answers: lowStableAnswers,
        })
      )
    ).toBe(true);
  });

  it("estimateRemainingQuestionRange: should stay conservative before reaching target", () => {
    const remaining = estimateRemainingQuestionRange(
      state({
        questionCount: 52,
        confidence: 0.86,
        answers: Array.from({ length: 52 }).map((_, idx) =>
          answer({ questionId: `q-${idx}`, level: idx % 2 === 0 ? "cet6" : "ielts", isCorrect: true })
        ),
      })
    );

    expect(remaining.min).toBeGreaterThanOrEqual(3);
    expect(remaining.max).toBeGreaterThan(remaining.min);
  });

  it("estimateRemainingQuestionRange: should allow near-finish range when state is finish-ready", () => {
    const answers = Array.from({ length: 60 }).map((_, idx) =>
      answer({ questionId: `q-${idx}`, level: "cet6", isCorrect: idx < 45 })
    );
    const remaining = estimateRemainingQuestionRange(
      state({
        questionCount: 60,
        confidence: 0.91,
        answers,
      })
    );

    expect(remaining.min).toBe(0);
    expect(remaining.max).toBeLessThanOrEqual(3);
  });

  it("estimateConfidence: should rise with more evidence", () => {
    const shortSet = [answer({ level: "cet6", isCorrect: true })];
    const longSet = [
      answer({ level: "cet6", isCorrect: true }),
      answer({ level: "ielts", isCorrect: true }),
      answer({ level: "gre", isCorrect: false, selectedMeaning: "错误释义" }),
      answer({ level: "cet4", isCorrect: true }),
    ];
    expect(estimateConfidence(longSet)).toBeGreaterThan(estimateConfidence(shortSet));
  });

  it("adjustConfidenceForEarlySession: should cap the first 5 questions more conservatively", () => {
    expect(adjustConfidenceForEarlySession(0.91, 1)).toBe(0.58);
    expect(adjustConfidenceForEarlySession(0.91, 5)).toBe(0.58);
  });

  it("adjustConfidenceForEarlySession: should keep questions 6-8 on the previous 68% cap", () => {
    expect(adjustConfidenceForEarlySession(0.91, 6)).toBe(0.64);
    expect(adjustConfidenceForEarlySession(0.91, 8)).toBe(0.64);
  });

  it("adjustConfidenceForEarlySession: should linearly release between questions 9 and 12", () => {
    expect(adjustConfidenceForEarlySession(0.95, 9)).toBe(0.72);
    expect(adjustConfidenceForEarlySession(0.95, 10)).toBe(0.8);
    expect(adjustConfidenceForEarlySession(0.95, 11)).toBe(0.92);
    expect(adjustConfidenceForEarlySession(0.95, 12)).toBe(0.95);
  });

  it("adjustConfidenceForEarlySession: should lightly slow raw confidence even when below the cap", () => {
    expect(adjustConfidenceForEarlySession(0.37, 1)).toBeCloseTo(0.34, 6);
    expect(adjustConfidenceForEarlySession(0.55, 6)).toBeCloseTo(0.53, 6);
    expect(adjustConfidenceForEarlySession(0.63, 10)).toBeCloseTo(0.62, 6);
  });

  it("adjustConfidenceForEarlySession: should stop capping from question 13 onward", () => {
    expect(adjustConfidenceForEarlySession(0.91, 13)).toBe(0.91);
  });

  it("adjustConfidenceForLateSession: should not accelerate before question 40", () => {
    expect(adjustConfidenceForLateSession(0.7, 39, "gre")).toBe(0.7);
  });

  it("adjustConfidenceForLateSession: should keep cet4 unchanged after question 40", () => {
    expect(adjustConfidenceForLateSession(0.7, 80, "cet4")).toBe(0.7);
  });

  it("adjustConfidenceForLateSession: should accelerate cet6/ielts/gre after question 40", () => {
    const cet6 = adjustConfidenceForLateSession(0.7, 80, "cet6");
    const ielts = adjustConfidenceForLateSession(0.7, 80, "ielts");
    const gre = adjustConfidenceForLateSession(0.7, 80, "gre");

    expect(cet6).toBeGreaterThan(0.7);
    expect(ielts).toBeGreaterThan(cet6);
    expect(gre).toBeGreaterThan(ielts);
  });

  it("adjustConfidenceForLateSession: should give extra boost for sustained gre mastery", () => {
    const masteryAnswers = Array.from({ length: 24 }).map((_, idx) =>
      answer({ questionId: `q-gre-${idx}`, word: `gre-${idx}`, level: "gre", isCorrect: true })
    );

    const base = adjustConfidenceForLateSession(0.83, 110, "gre");
    const boosted = adjustConfidenceForLateSession(0.83, 110, "gre", masteryAnswers);

    expect(boosted).toBeGreaterThan(base);
    expect(boosted).toBeGreaterThanOrEqual(0.9);
  });

  it("applyLowConfidenceResultPolicy: should strongly clamp max-question low-confidence results", () => {
    const result = applyLowConfidenceResultPolicy({
      questionCount: 150,
      confidence: 0.4674,
      estimatedVocab: 12870,
      recommendedLevel: "gre",
    });

    expect(result.lowConfidenceResult).toBe(true);
    expect(result.estimatedVocab).toBeLessThanOrEqual(5999);
    expect(result.recommendedLevel).toBe("cet6");
  });

  it("applyLowConfidenceResultPolicy: should leave confident results unchanged", () => {
    const result = applyLowConfidenceResultPolicy({
      questionCount: 120,
      confidence: 0.91,
      estimatedVocab: 12745,
      recommendedLevel: "gre",
    });

    expect(result).toEqual({
      questionCount: 120,
      confidence: 0.91,
      estimatedVocab: 12745,
      recommendedLevel: "gre",
      lowConfidenceResult: false,
    });
  });

  it("applyLowConfidenceResultPolicy: should not clamp strong gre mastery sessions at the max-question cap", () => {
    const masteryAnswers = Array.from({ length: 80 }).map((_, idx) =>
      answer({ questionId: `q-gre-${idx}`, word: `gre-${idx}`, level: "gre", isCorrect: true })
    );

    const result = applyLowConfidenceResultPolicy({
      questionCount: 150,
      confidence: 0.885,
      estimatedVocab: 12680,
      recommendedLevel: "gre",
      currentLevel: "gre",
      answers: masteryAnswers,
    });

    expect(result.lowConfidenceResult).toBe(false);
    expect(result.estimatedVocab).toBe(12680);
    expect(result.recommendedLevel).toBe("gre");
  });

  it("applyEstimatedVocabGuardrail: should make mid-session estimates slightly more conservative", () => {
    const answers = Array.from({ length: 90 }).map((_, idx) =>
      answer({
        questionId: `q-mid-${idx}`,
        level: idx % 2 === 0 ? "cet6" : "ielts",
        responseType: idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx % 3 !== 0 && idx % 2 === 0,
        knew: idx % 3 !== 0,
        selectedMeaning: idx % 3 === 0 ? null : idx % 2 === 0 ? "【v.】评估；评价；进行判断" : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 90,
      estimatedVocab: 6400,
      confidence: 0.88,
      currentLevel: "cet6",
      recommendedLevel: "ielts",
      answers,
    });

    expect(guarded).toBeLessThan(6400);
    expect(guarded).toBeGreaterThan(5800);
  });

  it("applyEstimatedVocabGuardrail: should strongly pull down overreaching gre estimates without strong mastery", () => {
    const answers = Array.from({ length: 72 }).map((_, idx) =>
      answer({
        questionId: `q-greish-${idx}`,
        level: idx < 16 ? "gre" : idx % 2 === 0 ? "ielts" : "cet6",
        responseType: idx < 16 ? (idx % 3 === 0 ? "option" : idx % 2 === 0 ? "unknown" : "option") : idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx < 16 ? idx % 3 === 0 : idx % 2 === 0,
        knew: idx % 3 !== 0,
        selectedMeaning: idx % 3 === 0 ? "【v.】评估；评价；进行判断" : idx % 2 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 72,
      estimatedVocab: 10000,
      confidence: 0.901,
      currentLevel: "gre",
      recommendedLevel: "gre",
      answers,
    });

    expect(guarded).toBeLessThanOrEqual(8400);
  });

  it("applyEstimatedVocabGuardrail: should clamp low-band overestimation when current level is still one tier above cet4", () => {
    const answers = Array.from({ length: 98 }).map((_, idx) =>
      answer({
        questionId: `q-lowish-${idx}`,
        level: idx % 2 === 0 ? "cet6" : "cet4",
        responseType: idx % 3 === 0 ? "unknown" : idx % 4 === 0 ? "option" : "option",
        isCorrect: idx % 4 === 0,
        knew: idx % 3 !== 0,
        selectedMeaning: idx % 3 === 0 ? null : idx % 4 === 0 ? "【v.】评估；评价；进行判断" : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 98,
      estimatedVocab: 4000,
      confidence: 0.9,
      currentLevel: "cet6",
      recommendedLevel: "cet4",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(3200);
    expect(guarded).toBeLessThanOrEqual(3300);
    expect(guarded).toBeLessThan(3400);
  });

  it("applyEstimatedVocabGuardrail: should clamp stable low-band early finishes even when current level already converged to cet4", () => {
    const answers = Array.from({ length: 81 }).map((_, idx) =>
      answer({
        questionId: `q-cet4-stable-${idx}`,
        level: "cet4",
        responseType: idx >= 69 ? (idx % 3 === 0 ? "unknown" : "option") : idx % 4 === 0 ? "option" : "unknown",
        isCorrect: idx >= 69 ? false : idx % 5 === 0,
        knew: idx >= 69 ? false : idx % 5 === 0,
        selectedMeaning: idx % 5 === 0 ? "【v.】评估；评价；进行判断" : idx % 3 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 81,
      estimatedVocab: 4200,
      confidence: 0.901,
      currentLevel: "cet4",
      recommendedLevel: "cet4",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(3200);
    expect(guarded).toBeLessThanOrEqual(3300);
    expect(guarded).toBeLessThan(3400);
  });

  it("applyEstimatedVocabGuardrail: should clamp cautious cet6 early finishes to the lower mid-band", () => {
    const answers = Array.from({ length: 76 }).map((_, idx) =>
      answer({
        questionId: `q-cet6-cautious-${idx}`,
        level: idx % 5 === 0 ? "ielts" : "cet6",
        responseType: idx >= 64 ? (idx % 3 === 0 ? "unknown" : "option") : idx % 4 === 0 ? "unknown" : "option",
        isCorrect: idx >= 64 ? idx % 6 === 0 : idx % 3 === 0,
        knew: idx % 4 === 0,
        selectedMeaning: idx % 3 === 0 ? "【v.】评估；评价；进行判断" : idx % 4 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 76,
      estimatedVocab: 5118,
      confidence: 0.904,
      currentLevel: "cet6",
      recommendedLevel: "cet6",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(4700);
    expect(guarded).toBeLessThanOrEqual(4800);
    expect(guarded).toBeLessThan(4900);
  });

  it("applyEstimatedVocabGuardrail: should downshift weak cet6 early finishes into the cet4 soft band", () => {
    const answers = Array.from({ length: 80 }).map((_, idx) =>
      answer({
        questionId: `q-cet6-downshift-${idx}`,
        level: idx % 5 === 0 ? "ielts" : "cet6",
        responseType: idx >= 68 ? (idx % 4 === 0 ? "unknown" : "option") : idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx >= 68 ? false : idx % 7 === 0,
        knew: idx >= 68 ? false : idx % 7 === 0,
        selectedMeaning: idx % 7 === 0 ? "【v.】评估；评价；进行判断" : idx % 3 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 80,
      estimatedVocab: 4734,
      confidence: 0.901,
      currentLevel: "cet6",
      recommendedLevel: "cet6",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(3200);
    expect(guarded).toBeLessThanOrEqual(3300);
    expect(guarded).toBeLessThan(3400);
  });

  it("applyEstimatedVocabGuardrail: should downshift very early gre-to-cet6 finishes into the cet4 soft band", () => {
    const answers = Array.from({ length: 76 }).map((_, idx) =>
      answer({
        questionId: `q-gre-cet6-downshift-${idx}`,
        level: idx % 4 === 0 ? "gre" : "cet6",
        responseType: idx >= 64 ? (idx % 4 === 0 ? "unknown" : "option") : idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx >= 64 ? false : idx % 8 === 0,
        knew: idx >= 64 ? false : idx % 8 === 0,
        selectedMeaning: idx % 8 === 0 ? "【v.】评估；评价；进行判断" : idx % 3 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 76,
      estimatedVocab: 4737,
      confidence: 0.91,
      currentLevel: "gre",
      recommendedLevel: "cet6",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(3200);
    expect(guarded).toBeLessThanOrEqual(3300);
    expect(guarded).toBeLessThan(3400);
  });

  it("applyEstimatedVocabGuardrail: should clamp cet6 mismatch early finishes when current level is still above cet6", () => {
    const answers = Array.from({ length: 73 }).map((_, idx) =>
      answer({
        questionId: `q-cet6-mismatch-${idx}`,
        level: idx % 4 === 0 ? "ielts" : "cet6",
        responseType: idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx % 5 === 0,
        knew: idx % 3 !== 0,
        selectedMeaning: idx % 5 === 0 ? "【v.】评估；评价；进行判断" : idx % 3 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 73,
      estimatedVocab: 5452,
      confidence: 0.907,
      currentLevel: "gre",
      recommendedLevel: "cet6",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(4700);
    expect(guarded).toBeLessThanOrEqual(4800);
    expect(guarded).toBeLessThan(4900);
  });

  it("applyEstimatedVocabGuardrail: should downshift ielts-to-cet6 mismatches into the cet4 soft band", () => {
    const answers = Array.from({ length: 77 }).map((_, idx) =>
      answer({
        questionId: `q-ielts-cet6-downshift-${idx}`,
        level: idx % 4 === 0 ? "ielts" : "cet6",
        responseType: idx >= 65 ? (idx % 4 === 0 ? "unknown" : "option") : idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx >= 65 ? false : idx % 8 === 0,
        knew: idx >= 65 ? false : idx % 8 === 0,
        selectedMeaning: idx % 8 === 0 ? "【v.】评估；评价；进行判断" : idx % 3 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 77,
      estimatedVocab: 4727,
      confidence: 0.908,
      currentLevel: "ielts",
      recommendedLevel: "cet6",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(3200);
    expect(guarded).toBeLessThanOrEqual(3300);
    expect(guarded).toBeLessThan(3400);
  });

  it("applyEstimatedVocabGuardrail: should clamp ielts mismatch early finishes to the upper-mid band", () => {
    const answers = Array.from({ length: 69 }).map((_, idx) =>
      answer({
        questionId: `q-ielts-mismatch-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 4 === 0 ? "unknown" : "option",
        isCorrect: idx % 5 === 0,
        knew: idx % 4 !== 0,
        selectedMeaning: idx % 5 === 0 ? "【v.】评估；评价；进行判断" : idx % 4 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 69,
      estimatedVocab: 6922,
      confidence: 0.906,
      currentLevel: "gre",
      recommendedLevel: "ielts",
      answers,
    });

    expect(guarded).toBeLessThanOrEqual(6400);
    expect(guarded).toBeLessThan(6922);
  });

  it("applyEstimatedVocabGuardrail: should clamp cautious gre early finishes when they appear too early", () => {
    const answers = Array.from({ length: 69 }).map((_, idx) =>
      answer({
        questionId: `q-gre-early-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 4 === 0 ? "unknown" : "option",
        isCorrect: idx % 5 === 0,
        knew: idx % 4 !== 0,
        selectedMeaning: idx % 5 === 0 ? "【v.】评估；评价；进行判断" : idx % 4 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 69,
      estimatedVocab: 7340,
      confidence: 0.906,
      currentLevel: "ielts",
      recommendedLevel: "gre",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(7000);
    expect(guarded).toBeLessThanOrEqual(7600);
    expect(guarded).toBeLessThan(8000);
  });

  it("applyEstimatedVocabGuardrail: should keep authentic ielts finishes inside an ielts band instead of promoting to gre", () => {
    const answers = Array.from({ length: 67 }).map((_, idx) =>
      answer({
        questionId: `q-auth-ielts-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 4 === 0 ? "unknown" : "option",
        isCorrect: idx % 5 === 0,
        knew: idx % 4 !== 0,
        selectedMeaning: idx % 5 === 0 ? "【v.】评估；评价；进行判断" : idx % 4 === 0 ? null : "错误释义",
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 67,
      estimatedVocab: 8938,
      confidence: 0.902,
      currentLevel: "ielts",
      recommendedLevel: "gre",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(7000);
    expect(guarded).toBeLessThanOrEqual(7800);
    expect(guarded).toBeLessThan(8000);
  });

  it("applyFinalLevelPriorityAdjustment: should downshift final cet6 low-band states into cet4", () => {
    const answers = Array.from({ length: 77 }).map((_, idx) =>
      answer({
        questionId: `q-final-cet4-${idx}`,
        level: idx % 4 === 0 ? "ielts" : "cet6",
        responseType: idx >= 65 ? (idx % 4 === 0 ? "unknown" : "option") : idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx >= 65 ? false : idx % 8 === 0,
        knew: idx >= 65 ? false : idx % 8 === 0,
        selectedMeaning: idx % 8 === 0 ? "【v.】评估；评价；进行判断" : idx % 3 === 0 ? null : "错误释义",
      })
    );

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 77,
      estimatedVocab: 4727,
      confidence: 0.908,
      currentLevel: "ielts",
      recommendedLevel: "cet6",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet4");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(3200);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(3300);
  });

  it("applyFinalLevelPriorityAdjustment: should downshift 74-question cet6 low-band states into cet4", () => {
    const answers = Array.from({ length: 74 }).map((_, idx) =>
      answer({
        questionId: `q-final-cet4-74-${idx}`,
        level: idx % 4 === 0 ? "ielts" : "cet6",
        responseType: idx >= 62 ? (idx % 4 === 0 ? "unknown" : "option") : idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx >= 62 ? false : idx % 8 === 0,
        knew: idx >= 62 ? false : idx % 8 === 0,
        selectedMeaning: idx % 8 === 0 ? "【v.】评估；评价；进行判断" : idx % 3 === 0 ? null : "错误释义",
      })
    );

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 74,
      estimatedVocab: 4731,
      confidence: 0.904,
      currentLevel: "ielts",
      recommendedLevel: "cet6",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet4");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(3200);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(3300);
  });

  it("applyFinalLevelPriorityAdjustment: should downshift final weak ielts states into cet6", () => {
    const answers = Array.from({ length: 69 }).map((_, idx) =>
      answer({
        questionId: `q-final-cet6-${idx}`,
        level: idx % 4 === 0 ? "gre" : "ielts",
        responseType: idx >= 57 ? (idx % 4 === 0 ? "unknown" : "option") : idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx >= 57 ? idx % 6 === 0 : idx % 5 === 0,
        knew: idx % 3 !== 0,
        selectedMeaning: idx % 5 === 0 ? "【v.】评估；评价；进行判断" : idx % 3 === 0 ? null : "错误释义",
      })
    );

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 69,
      estimatedVocab: 6256,
      confidence: 0.901,
      currentLevel: "ielts",
      recommendedLevel: "ielts",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet6");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(4700);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(4800);
  });

  it("applyFinalLevelPriorityAdjustment: should keep authentic ielts states inside ielts", () => {
    const answers = Array.from({ length: 67 }).map((_, idx) =>
      answer({
        questionId: `q-final-ielts-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 4 === 0 ? "unknown" : "option",
        isCorrect: idx % 5 === 0,
        knew: idx % 4 !== 0,
        selectedMeaning: idx % 5 === 0 ? "【v.】评估；评价；进行判断" : idx % 4 === 0 ? null : "错误释义",
      })
    );

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 67,
      estimatedVocab: 8938,
      confidence: 0.902,
      currentLevel: "ielts",
      recommendedLevel: "gre",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("ielts");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(7000);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(7600);
  });

  it("applyFinalLevelPriorityAdjustment: should not drag gre-started sessions into low-mid soft bands", () => {
    const answers = Array.from({ length: 90 }).map((_, idx) =>
      answer({
        questionId: `q-final-gre-start-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 5 === 0 ? "unknown" : "option",
        isCorrect: idx % 5 !== 0,
        knew: idx % 5 !== 0,
        selectedMeaning: idx % 5 === 0 ? null : "正确释义",
      })
    );

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 90,
      estimatedVocab: 3230,
      confidence: 0.39,
      currentLevel: "gre",
      recommendedLevel: "cet4",
      startedLevel: "gre",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet4");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(3200);
    expect(adjusted.estimatedVocab).toBeLessThan(3400);
  });

  it("applyFinalLevelPriorityAdjustment: should recover late gre sessions back into gre", () => {
    const answers = Array.from({ length: 120 }).map((_, idx) =>
      answer({
        questionId: `q-final-gre-recovery-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 8 === 0 ? "unknown" : "option",
        isCorrect: idx % 8 !== 0,
        knew: idx % 8 !== 0,
        selectedMeaning: idx % 8 === 0 ? null : "正确释义",
      })
    );

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 120,
      estimatedVocab: 3250,
      confidence: 0.462,
      currentLevel: "gre",
      recommendedLevel: "cet4",
      startedLevel: "gre",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("gre");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(9000);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(9600);
  });

  it("resolveGuardedEstimatedVocab: should re-run guardrail into the softer lower band when evidence stays weak", () => {
    const answers = Array.from({ length: 80 }).map((_, idx) =>
      answer({
        questionId: `q-mismatch-rerun-${idx}`,
        level: idx % 4 === 0 ? "ielts" : "cet6",
        responseType: idx % 3 === 0 ? "unknown" : "option",
        isCorrect: idx % 6 === 0,
        knew: idx % 3 !== 0,
        selectedMeaning: idx % 6 === 0 ? "【v.】评估；评价；进行判断" : idx % 3 === 0 ? null : "错误释义",
      })
    );

    const resolved = resolveGuardedEstimatedVocab({
      questionCount: 80,
      estimatedVocab: 4700,
      confidence: 0.904,
      currentLevel: "gre",
      answers,
    });

    expect(getRecommendedLevel(4700)).toBe("cet6");
    expect(resolved.recommendedLevel).toBe("cet4");
    expect(resolved.estimatedVocab).toBeGreaterThanOrEqual(3200);
    expect(resolved.estimatedVocab).toBeLessThanOrEqual(3300);
    expect(resolved.estimatedVocab).toBeLessThan(3400);
  });

  it("getSessionStartLevel: should use conservative history prior", () => {
    expect(getSessionStartLevel(undefined)).toBe("cet4");
    expect(getSessionStartLevel(5000)).toBe("cet4");
    expect(getSessionStartLevel(9800)).toBe("cet6");
  });

  it("getNextLevelAfterCalibration: should not jump after a single early correct answer", () => {
    const next = getNextLevelAfterCalibration(
      state({ questionCount: 0, currentLevel: "cet6", answers: [] }),
      answer({ level: "cet6", isCorrect: true })
    );

    expect(next).toBe("cet6");
  });

  it("getNextLevelAfterCalibration: should jump after two consecutive early correct answers", () => {
    const next = getNextLevelAfterCalibration(
      state({
        startedLevel: "gre",
        questionCount: 1,
        currentLevel: "cet6",
        answers: [answer({ questionId: "q-0", level: "cet6", isCorrect: true })],
      }),
      answer({ questionId: "q-1", level: "cet6", isCorrect: true })
    );

    expect(next).toBe("ielts");
  });


  it("getSameLevelEdgeBias: should prefer harder same-level evidence after question 40 when current level is unstable", () => {
    const bias = getSameLevelEdgeBias(
      state({
        questionCount: 45,
        currentLevel: "ielts",
        answers: [
          answer({ questionId: "q-1", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-2", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-3", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-4", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-5", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-6", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-7", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-8", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-9", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-10", level: "ielts", isCorrect: true }),
        ],
      })
    );

    expect(bias).toBe("harder");
  });

  it("getSameLevelEdgeBias: should prefer easier same-level evidence when recent answers are weak", () => {
    const bias = getSameLevelEdgeBias(
      state({
        questionCount: 45,
        currentLevel: "ielts",
        answers: [
          answer({ questionId: "q-1", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-2", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-3", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-4", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-5", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-6", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-7", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-8", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-5", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-6", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
        ],
      })
    );

    expect(bias).toBe("easier");
  });

  it("buildBankQuestion: should avoid asked words and provide detailed Chinese meanings", () => {
    const q = buildBankQuestion("cet6", ["assess"]);
    expect(q).toBeTruthy();
    expect(q!.word.toLowerCase()).not.toBe("assess");
    expect(q!.options).toHaveLength(4);
    expect(q!.options).toContain(q!.correctMeaning);
  });

  it("buildBankQuestion: should prefer harder same-level edge words after question 40", () => {
    const bank: QuestionBank = {
      cet4: [
        { word: "brook", pos: "n.", meaning: "小溪；溪流", explanation: "" },
        { word: "cabin", pos: "n.", meaning: "小屋；船舱", explanation: "" },
      ],
      cet6: [
        { word: "docket", pos: "n.", meaning: "清单；摘要", explanation: "" },
        { word: "embassy", pos: "n.", meaning: "大使馆；使节团", explanation: "" },
      ],
      ielts: [
        { word: "atlas", pos: "n.", meaning: "地图集；图册", explanation: "" },
        { word: "beacon", pos: "n.", meaning: "灯塔；信号标", explanation: "" },
        { word: "citadel", pos: "n.", meaning: "堡垒；据点", explanation: "" },
        { word: "drift", pos: "n.", meaning: "趋势；漂流物", explanation: "" },
        { word: "zenith", pos: "n.", meaning: "顶点；鼎盛时期", explanation: "" },
        { word: "zephyr", pos: "n.", meaning: "和风；微风", explanation: "" },
      ],
      gre: [
        { word: "forgery", pos: "n.", meaning: "伪造；伪作", explanation: "" },
        { word: "gambit", pos: "n.", meaning: "开局策略；话题切入点", explanation: "" },
      ],
    };

    const q = buildBankQuestion(
      "ielts",
      [],
      bank,
      [],
      state({
        startedLevel: "gre",
        questionCount: 45,
        currentLevel: "ielts",
        answers: [
          answer({ questionId: "q-1", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-2", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-3", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-4", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-5", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-6", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-7", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-8", level: "ielts", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-9", level: "ielts", isCorrect: true }),
          answer({ questionId: "q-10", level: "ielts", isCorrect: true }),
        ],
      })
    );

    expect(q).toBeTruthy();
    expect(["zenith", "zephyr"]).toContain(q!.word);
  });

  it("buildBankQuestion: should prefer lower-level questions for weak later cet6 sessions", () => {
    const bank: QuestionBank = {
      cet4: [
        { word: "brook", pos: "n.", meaning: "小溪；溪流", explanation: "" },
        { word: "cabin", pos: "n.", meaning: "小屋；船舱", explanation: "" },
        { word: "dew", pos: "n.", meaning: "露水；清露", explanation: "" },
        { word: "elm", pos: "n.", meaning: "榆树", explanation: "" },
      ],
      cet6: [
        { word: "docket", pos: "n.", meaning: "清单；摘要", explanation: "" },
        { word: "embassy", pos: "n.", meaning: "大使馆；使节团", explanation: "" },
      ],
      ielts: [
        { word: "citadel", pos: "n.", meaning: "堡垒；据点", explanation: "" },
        { word: "drift", pos: "n.", meaning: "趋势；漂流物", explanation: "" },
        { word: "zenith", pos: "n.", meaning: "顶点；鼎盛时期", explanation: "" },
        { word: "zephyr", pos: "n.", meaning: "和风；微风", explanation: "" },
      ],
      gre: [
        { word: "forgery", pos: "n.", meaning: "伪造；伪作", explanation: "" },
        { word: "gambit", pos: "n.", meaning: "开局策略；话题切入点", explanation: "" },
      ],
    };

    const q = buildBankQuestion(
      "cet6",
      ["docket", "embassy"],
      bank,
      [],
      state({
        questionCount: 60,
        currentLevel: "cet6",
        answers: Array.from({ length: 10 }).map((_, idx) =>
          answer({
            questionId: `q-low-${idx}`,
            word: `low-${idx}`,
            level: "cet6",
            responseType: idx % 2 === 0 ? "unknown" : "option",
            isCorrect: false,
            knew: false,
            selectedMeaning: idx % 2 === 0 ? null : "错误释义",
          })
        ),
      })
    );

    expect(q).toBeTruthy();
    expect(["brook", "cabin", "dew", "elm"]).toContain(q!.word);
  });

  it("buildBankQuestion: should focus unstable boundary levels for mixed later sessions", () => {
    const bank: QuestionBank = {
      cet4: [
        { word: "brook", pos: "n.", meaning: "小溪；溪流", explanation: "" },
        { word: "cabin", pos: "n.", meaning: "小屋；船舱", explanation: "" },
      ],
      cet6: [
        { word: "docket", pos: "n.", meaning: "清单；摘要", explanation: "" },
        { word: "embassy", pos: "n.", meaning: "大使馆；使节团", explanation: "" },
      ],
      ielts: [
        { word: "citadel", pos: "n.", meaning: "堡垒；据点", explanation: "" },
        { word: "drift", pos: "n.", meaning: "趋势；漂流物", explanation: "" },
      ],
      gre: [
        { word: "forgery", pos: "n.", meaning: "伪造；伪作", explanation: "" },
        { word: "gambit", pos: "n.", meaning: "开局策略；话题切入点", explanation: "" },
      ],
    };

    const q = buildBankQuestion(
      "gre",
      [],
      bank,
      [],
      state({
        questionCount: 92,
        currentLevel: "gre",
        answers: [
          answer({ questionId: "q-1", level: "cet6", isCorrect: true }),
          answer({ questionId: "q-2", level: "cet6", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-3", level: "cet6", isCorrect: true }),
          answer({ questionId: "q-4", level: "cet6", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-5", level: "cet6", isCorrect: false, selectedMeaning: "错误释义" }),
          answer({ questionId: "q-6", level: "cet6", isCorrect: true }),
          answer({ questionId: "q-7", level: "cet4", responseType: "unknown", knew: false, isCorrect: false, selectedMeaning: null }),
          answer({ questionId: "q-8", level: "cet4", responseType: "unknown", knew: false, isCorrect: false, selectedMeaning: null }),
        ],
      })
    );

    expect(q).toBeTruthy();
    expect(["brook", "cabin", "docket", "embassy", "citadel", "drift"]).toContain(q!.word);
    expect(["forgery", "gambit"]).not.toContain(q!.word);
  });

  it("getUpperEdgeChallengeLevel: should slightly encourage the next level for late cet4 sessions", () => {
    const level = getUpperEdgeChallengeLevel(
      state({
        startedLevel: "gre",
        questionCount: 120,
        currentLevel: "cet4",
        recommendedLevel: "cet4",
        confidence: 0.88,
      })
    );

    expect(level).toBe("cet6");
  });

  it("buildBankQuestion: should use primary sense only for tested meaning", () => {
    const bank: QuestionBank = {
      cet4: [],
      cet6: [
        { word: "save", pos: "v.", meaning: "保存；拯救；节省；积攒", explanation: "" },
        { word: "anchor", pos: "v.", meaning: "固定；抛锚；使扎根", explanation: "" },
        { word: "launch", pos: "v.", meaning: "发射；启动；发动", explanation: "" },
        { word: "harbor", pos: "v.", meaning: "庇护；藏匿；怀有", explanation: "" },
      ],
      ielts: [],
      gre: [],
    };

    const q = buildBankQuestion("cet6", ["anchor", "launch", "harbor", "preserve"], bank);
    expect(q).toBeTruthy();
    expect(q!.word).toBe("save");
    expect(q!.correctMeaning).toBe("保存；拯救；节省；积攒");
  });

  it("buildBankQuestion: should keep complete meaning when same lemma has multiple POS", () => {
    const bank: QuestionBank = {
      cet4: [],
      cet6: [
        { word: "save", pos: "prep.", meaning: "prep. 沿着；除...之外；除去", explanation: "" },
        { word: "save", pos: "v.", meaning: "v. 保存；拯救；节省", explanation: "" },
        { word: "anchor", pos: "v.", meaning: "固定；抛锚", explanation: "" },
        { word: "launch", pos: "v.", meaning: "发射；启动", explanation: "" },
        { word: "harbor", pos: "v.", meaning: "庇护；藏匿", explanation: "" },
      ],
      ielts: [
        { word: "shield", pos: "v.", meaning: "保护；掩护", explanation: "" },
        { word: "rescue", pos: "v.", meaning: "营救；挽救", explanation: "" },
      ],
      gre: [{ word: "preserve", pos: "v.", meaning: "保存；保护", explanation: "" }],
    };

    const q = buildBankQuestion("cet6", ["anchor", "launch", "harbor", "shield", "rescue", "preserve"], bank);
    expect(q).toBeTruthy();
    expect(q!.word).toBe("save");
    expect(q!.correctMeaning).toContain("保存；拯救；节省");
  });

  it("buildBankQuestion: should prefer unseen options across questions", () => {
    const q1 = buildBankQuestion("cet6", ["assess"]);
    expect(q1).toBeTruthy();

    const q2 = buildBankQuestion("cet6", ["assess", q1!.word], undefined, q1!.options);
    expect(q2).toBeTruthy();

    const overlap = q2!.options.filter((item) => q1!.options.includes(item));
    expect(overlap.length).toBeLessThanOrEqual(1);
  });

  it("buildBankQuestion: should avoid clustered near-synonym options", () => {
    const bank: QuestionBank = {
      cet4: [
        { word: "alpha", pos: "n.", meaning: "容器；盒子", explanation: "" },
        { word: "beta", pos: "n.", meaning: "桥梁；河流", explanation: "" },
      ],
      cet6: [
        { word: "satisfaction", pos: "n.", meaning: "满足；满意；自满", explanation: "" },
        { word: "gratification", pos: "n.", meaning: "满足；快感；称心", explanation: "" },
        { word: "contentment", pos: "n.", meaning: "知足；安心；心安", explanation: "" },
        { word: "catalog", pos: "n.", meaning: "目录；清单；分类", explanation: "" },
        { word: "artifact", pos: "n.", meaning: "器物；人工制品；文物", explanation: "" },
        { word: "terrain", pos: "n.", meaning: "地形；地势；地带", explanation: "" },
      ],
      ielts: [
        { word: "gamma", pos: "n.", meaning: "山谷；平原", explanation: "" },
      ],
      gre: [
        { word: "delta", pos: "n.", meaning: "区域；界限", explanation: "" },
      ],
    };

    const q = buildBankQuestion("cet6", ["satisfaction", "gratification", "contentment", "artifact", "terrain"], bank);
    expect(q).toBeTruthy();
    expect(q!.word).toBe("catalog");

    const strongLike = q!.options.filter((item) => item.includes("满足") && item !== q!.correctMeaning);
    expect(strongLike.length).toBeLessThanOrEqual(1);
  });

  it("getRecommendedLevel: should use updated thresholds", () => {
    expect(getRecommendedLevel(4499)).toBe("cet4");
    expect(getRecommendedLevel(4500)).toBe("cet6");
    expect(getRecommendedLevel(5999)).toBe("cet6");
    expect(getRecommendedLevel(6000)).toBe("ielts");
    expect(getRecommendedLevel(7999)).toBe("ielts");
    expect(getRecommendedLevel(8000)).toBe("gre");
  });

  it("buildBankQuestion: should keep four options when POS is mixed", () => {
    const bank: QuestionBank = {
      cet4: [{ word: "river", pos: "n.", meaning: "河流", explanation: "" }],
      cet6: [
        { word: "citizen", pos: "n.", meaning: "市民；公民；国民", explanation: "" },
        { word: "resident", pos: "n.", meaning: "居民；住户", explanation: "" },
        { word: "inhabitant", pos: "n.", meaning: "居民；栖居者", explanation: "" },
        { word: "townsfolk", pos: "n.", meaning: "市民；镇民", explanation: "" },
        { word: "civil", pos: "adj.", meaning: "市民的；公民的；有礼貌的", explanation: "" },
        { word: "urban", pos: "adj.", meaning: "城市的；都市的", explanation: "" },
        { word: "rural", pos: "adj.", meaning: "乡村的；农村的", explanation: "" },
      ],
      ielts: [{ word: "formal", pos: "adj.", meaning: "正式的；礼节性的", explanation: "" }],
      gre: [{ word: "civic", pos: "adj.", meaning: "公民的；城市的", explanation: "" }],
    };

    const q = buildBankQuestion("cet6", ["civil", "urban", "rural"], bank);
    expect(q).toBeTruthy();
    expect(["citizen", "resident", "inhabitant", "townsfolk", "river", "formal", "civic"]).toContain(q!.word);

    expect(q!.options).toHaveLength(4);
    expect(q!.options).toContain(q!.correctMeaning);
  });

  it("buildBankQuestion: should return four complete meanings from bank", () => {
    const bank: QuestionBank = {
      cet4: [{ word: "ratio", pos: "n.", meaning: "比例；比率", explanation: "" }],
      cet6: [
        { word: "percent", pos: "n.", meaning: "百分比；比率；部分", explanation: "" },
        { word: "fraction", pos: "n.", meaning: "小部分；分数；碎片", explanation: "" },
        { word: "percentage", pos: "n.", meaning: "百分比；百分数；部分", explanation: "" },
        { word: "proportion", pos: "n.", meaning: "比例；比率；均衡；部分", explanation: "" },
        { word: "segment", pos: "n.", meaning: "片段；部分；区段", explanation: "" },
      ],
      ielts: [{ word: "portion", pos: "n.", meaning: "部分；份额", explanation: "" }],
      gre: [{ word: "quota", pos: "n.", meaning: "配额；限额", explanation: "" }],
    };

    const q = buildBankQuestion("cet6", ["fraction", "percentage", "proportion", "segment"], bank);
    expect(q).toBeTruthy();

    expect(q!.options).toHaveLength(4);
    expect(q!.options).toContain(q!.correctMeaning);
    expect(new Set(q!.options).size).toBeGreaterThanOrEqual(3);
  });

  it("buildBankQuestion: should provide 3 distractors for complete-bank mode", () => {
    const bank: QuestionBank = {
      cet4: [{ word: "river", pos: "n.", meaning: "河流；河道", explanation: "" }],
      cet6: [
        { word: "blood", pos: "n.", meaning: "血；血统；流血；气质", explanation: "" },
        { word: "lineage", pos: "n.", meaning: "血统；世系；家系", explanation: "" },
        { word: "plasma", pos: "n.", meaning: "血浆；等离子体", explanation: "" },
        { word: "hemorrhage", pos: "n.", meaning: "出血；大出血", explanation: "" },
        { word: "absence", pos: "n.", meaning: "缺席；缺乏；没有", explanation: "" },
        { word: "ability", pos: "n.", meaning: "能力；才干", explanation: "" },
        { word: "abandon", pos: "n.", meaning: "放任；无拘束；狂热", explanation: "" },
      ],
      ielts: [{ word: "vessel", pos: "n.", meaning: "血管；容器；船只", explanation: "" }],
      gre: [{ word: "artery", pos: "n.", meaning: "动脉；干道", explanation: "" }],
    };

    const q = buildBankQuestion(
      "cet6",
      ["lineage", "plasma", "hemorrhage", "absence", "ability", "abandon", "vessel", "artery"],
      bank
    );
    expect(q).toBeTruthy();
    expect(q!.word).toBe("blood");

    const distractors = q!.options.filter((item) => item !== q!.correctMeaning);
    expect(distractors).toHaveLength(3);
    expect(new Set(distractors).size).toBeGreaterThanOrEqual(2);
  });

  it("buildBankQuestion: should fallback to available options instead of returning null", () => {
    const bank: QuestionBank = {
      cet4: [{ word: "alpha", pos: "n.", meaning: "符号；记号", explanation: "" }],
      cet6: [
        { word: "blood", pos: "n.", meaning: "血；血统；流血", explanation: "" },
        { word: "absence", pos: "n.", meaning: "缺席；缺乏；没有", explanation: "" },
        { word: "ability", pos: "n.", meaning: "能力；才干", explanation: "" },
        { word: "abandon", pos: "n.", meaning: "放任；无拘束；狂热", explanation: "" },
      ],
      ielts: [{ word: "random", pos: "n.", meaning: "随机性；偶然", explanation: "" }],
      gre: [{ word: "entropy", pos: "n.", meaning: "熵；混乱程度", explanation: "" }],
    };

    const q = buildBankQuestion(
      "cet6",
      ["absence", "ability", "abandon", "alpha", "random", "entropy"],
      bank
    );
    expect(q).toBeTruthy();
    expect(q!.word).toBe("blood");
    expect(q!.options).toHaveLength(4);
  });

  it("buildBankQuestion: should provide three distractors even with overlapping leading segments", () => {
    const bank: QuestionBank = {
      cet4: [],
      cet6: [
        { word: "imposing", pos: "adj.", meaning: "给人深刻印象的；威严的", explanation: "" },
        { word: "coarse", pos: "adj.", meaning: "粗糙的；下等的；粗俗的", explanation: "" },
        { word: "acerbic", pos: "adj.", meaning: "粗糙的；严厉的；苛刻的", explanation: "" },
        { word: "strict", pos: "adj.", meaning: "精确的；严谨的；明确的", explanation: "" },
        { word: "severe", pos: "adj.", meaning: "严厉的；苛刻的；严重的", explanation: "" },
      ],
      ielts: [],
      gre: [],
    };

    const q = buildBankQuestion("cet6", ["coarse", "acerbic", "strict", "severe"], bank);
    expect(q).toBeTruthy();
    expect(q!.word).toBe("imposing");

    const distractors = q!.options.filter((item) => item !== q!.correctMeaning);
    expect(distractors).toHaveLength(3);
    expect(new Set(distractors).size).toBeGreaterThanOrEqual(2);
  });

  it("buildBankQuestion: should avoid distractors sharing core sense with the correct answer", () => {
    const bank: QuestionBank = {
      cet4: [],
      cet6: [
        { word: "shave", pos: "vt.", meaning: "修面；剃；修剪；掠过", explanation: "" },
        { word: "reap", pos: "vt.", meaning: "收割；修剪；种植", explanation: "" },
        { word: "scan", pos: "vt.", meaning: "扫描；反射；使掠过", explanation: "" },
        { word: "flatten", pos: "vt.", meaning: "压平；夷平；抹过水面", explanation: "" },
        { word: "nurture", pos: "vt.", meaning: "培养；培育；滋养", explanation: "" },
        { word: "repair", pos: "vt.", meaning: "修理；修复；补救", explanation: "" },
        { word: "ignite", pos: "vt.", meaning: "点燃；使激动；引发", explanation: "" },
      ],
      ielts: [],
      gre: [],
    };

    const q = buildBankQuestion("cet6", ["shave", "reap", "scan", "flatten"], bank);
    expect(q).toBeTruthy();

    const core = (value: string) =>
      value
        .replace(/^【[^】]+】\s*/u, "")
        .split(/[；;，,、]+/u)
        .map((part) => part.trim())
        .filter(Boolean);

    const targetSegments = new Set(core(q!.correctMeaning));
    const distractors = q!.options.filter((item) => item !== q!.correctMeaning);
    const overlapCount = distractors.filter((item) => core(item).some((segment) => targetSegments.has(segment))).length;

    expect(distractors).toHaveLength(3);
    expect(overlapCount).toBe(0);
  });

  it("buildBankQuestion: should allow mixed POS options when enabled", () => {
    const bank: QuestionBank = {
      cet4: [
        { word: "monster", pos: "n.", meaning: "怪物；巨兽", explanation: "" },
        { word: "beast", pos: "n.", meaning: "野兽；猛兽", explanation: "" },
        { word: "giant", pos: "n.", meaning: "巨人；巨物", explanation: "" },
        { word: "creature", pos: "n.", meaning: "生物；动物；人", explanation: "" },
        { word: "dragon", pos: "n.", meaning: "龙；凶悍的人", explanation: "" },
        { word: "phantom", pos: "n.", meaning: "幻影；幽灵", explanation: "" },
        { word: "titan", pos: "n.", meaning: "巨头；泰坦", explanation: "" },
        { word: "abrupt", pos: "adj.", meaning: "突然的；唐突的", explanation: "" },
      ],
      cet6: [],
      ielts: [],
      gre: [],
    };

    const q = buildBankQuestion("cet4", ["beast", "giant", "creature", "abrupt"], bank);
    expect(q).toBeTruthy();
    expect(q!.options).toHaveLength(4);
    expect(q!.options).toContain(q!.correctMeaning);
  });

  it("buildBankQuestion: should avoid exceeding recent POS streak limit", () => {
    const bank: QuestionBank = {
      cet4: [
        { word: "accept", pos: "v.", meaning: "接受", explanation: "" },
        { word: "adapt", pos: "v.", meaning: "适应", explanation: "" },
        { word: "admit", pos: "v.", meaning: "承认", explanation: "" },
        { word: "adopt", pos: "v.", meaning: "采用", explanation: "" },
        { word: "allow", pos: "v.", meaning: "允许", explanation: "" },
        { word: "ability", pos: "n.", meaning: "能力", explanation: "" },
        { word: "campus", pos: "n.", meaning: "校园", explanation: "" },
        { word: "benefit", pos: "n.", meaning: "益处", explanation: "" },
        { word: "average", pos: "adj.", meaning: "平均的", explanation: "" },
      ],
      cet6: [
        { word: "coherent", pos: "adj.", meaning: "连贯的", explanation: "" },
        { word: "criteria", pos: "n.", meaning: "标准", explanation: "" },
      ],
      ielts: [
        { word: "diversity", pos: "n.", meaning: "多样性", explanation: "" },
        { word: "feasible", pos: "adj.", meaning: "可行的", explanation: "" },
      ],
      gre: [
        { word: "anomaly", pos: "n.", meaning: "反常现象", explanation: "" },
        { word: "lucid", pos: "adj.", meaning: "清晰易懂的", explanation: "" },
      ],
    };

    const q = buildBankQuestion("cet4", ["accept", "adapt", "admit", "campus"], bank);
    expect(q).toBeTruthy();
    expect(q!.pos).not.toBe("v.");
  });

  it("buildBankQuestion: should rotate the correct option position evenly", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.18);
    const bank: QuestionBank = {
      cet4: [
        { word: "ability", pos: "n.", meaning: "能力", explanation: "" },
        { word: "campus", pos: "n.", meaning: "校园", explanation: "" },
        { word: "benefit", pos: "n.", meaning: "益处", explanation: "" },
        { word: "average", pos: "adj.", meaning: "平均的", explanation: "" },
        { word: "accept", pos: "v.", meaning: "接受", explanation: "" },
        { word: "borrow", pos: "v.", meaning: "借入", explanation: "" },
        { word: "compare", pos: "v.", meaning: "比较", explanation: "" },
        { word: "create", pos: "v.", meaning: "创造", explanation: "" },
      ],
      cet6: [
        { word: "criteria", pos: "n.", meaning: "标准", explanation: "" },
        { word: "coherent", pos: "adj.", meaning: "连贯的", explanation: "" },
      ],
      ielts: [
        { word: "diversity", pos: "n.", meaning: "多样性", explanation: "" },
        { word: "ethical", pos: "adj.", meaning: "道德的", explanation: "" },
      ],
      gre: [
        { word: "anomaly", pos: "n.", meaning: "反常现象", explanation: "" },
        { word: "candid", pos: "adj.", meaning: "坦率的", explanation: "" },
      ],
    };

    const positions = [[], ["ability"], ["ability", "campus"], ["ability", "campus", "benefit"]].map((asked) => {
      const q = buildBankQuestion("cet4", asked, bank);
      expect(q).toBeTruthy();
      return q!.options.indexOf(q!.correctMeaning);
    });

    expect(positions).toEqual([0, 1, 2, 3]);
    randomSpy.mockRestore();
  });

  it("buildBankQuestion: should strongly avoid recently seen option meanings when enough global choices exist", () => {
    const bank: QuestionBank = {
      cet4: [
        { word: "ability", pos: "n.", meaning: "能力", explanation: "" },
        { word: "campus", pos: "n.", meaning: "校园", explanation: "" },
        { word: "benefit", pos: "n.", meaning: "益处", explanation: "" },
        { word: "average", pos: "adj.", meaning: "平均的", explanation: "" },
      ],
      cet6: [
        { word: "criteria", pos: "n.", meaning: "标准", explanation: "" },
        { word: "coherent", pos: "adj.", meaning: "连贯的", explanation: "" },
        { word: "assess", pos: "v.", meaning: "评估", explanation: "" },
      ],
      ielts: [
        { word: "diversity", pos: "n.", meaning: "多样性", explanation: "" },
        { word: "ethical", pos: "adj.", meaning: "道德的", explanation: "" },
        { word: "generate", pos: "v.", meaning: "产生", explanation: "" },
      ],
      gre: [
        { word: "anomaly", pos: "n.", meaning: "反常现象", explanation: "" },
        { word: "candid", pos: "adj.", meaning: "坦率的", explanation: "" },
        { word: "bolster", pos: "v.", meaning: "加强", explanation: "" },
      ],
    };

    const seen = ["校园", "益处", "平均的", "标准", "连贯的", "多样性", "道德的", "反常现象"];
    const q = buildBankQuestion("cet6", ["criteria"], bank, seen);

    expect(q).toBeTruthy();
    const distractors = q!.options.filter((item) => item !== q!.correctMeaning);
    expect(distractors.some((item) => seen.includes(item))).toBe(false);
  });

});
