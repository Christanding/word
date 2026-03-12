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

function evaluateSessionOutcome(input: {
  answers: VocabAnswerRecord[];
  currentLevel: VocabAssessmentState["currentLevel"];
  startedLevel: VocabAssessmentState["startedLevel"];
  priorVocab?: number;
}) {
  const questionCount = input.answers.length;
  const rawEstimatedVocab = estimateVocabSize(input.answers, input.priorVocab);
  const rawConfidence = estimateConfidence(input.answers, input.priorVocab);
  const confidence = adjustConfidenceForLateSession(
    adjustConfidenceForEarlySession(rawConfidence, questionCount),
    questionCount,
    input.currentLevel,
    input.answers,
  );
  const guardedEstimate = resolveGuardedEstimatedVocab({
    questionCount,
    estimatedVocab: rawEstimatedVocab,
    confidence,
    currentLevel: input.currentLevel,
    startedLevel: input.startedLevel,
    answers: input.answers,
  });
  const lowConfidenceResult = applyLowConfidenceResultPolicy({
    questionCount,
    confidence,
    estimatedVocab: guardedEstimate.estimatedVocab,
    recommendedLevel: guardedEstimate.recommendedLevel,
    currentLevel: input.currentLevel,
    answers: input.answers,
  });

  const finalResult = applyFinalLevelPriorityAdjustment({
    questionCount,
    confidence: lowConfidenceResult.confidence,
    estimatedVocab: lowConfidenceResult.estimatedVocab,
    recommendedLevel: lowConfidenceResult.recommendedLevel,
    currentLevel: input.currentLevel,
    startedLevel: input.startedLevel,
    answers: input.answers,
  });

  return {
    confidence: lowConfidenceResult.confidence,
    estimatedVocab: finalResult.estimatedVocab,
    recommendedLevel: finalResult.recommendedLevel,
  };
}

function buildStageAnswers(input: {
  prefix: string;
  level: VocabAnswerRecord["level"];
  count: number;
  responseAt: (index: number) => Pick<VocabAnswerRecord, "responseType" | "isCorrect" | "knew" | "selectedMeaning">;
}): VocabAnswerRecord[] {
  return Array.from({ length: input.count }).map((_, index) => {
    const response = input.responseAt(index);
    return answer({
      questionId: `${input.prefix}-${index}`,
      word: `${input.prefix}-${index}`,
      level: input.level,
      responseType: response.responseType,
      isCorrect: response.isCorrect,
      knew: response.knew,
      selectedMeaning: response.selectedMeaning,
    });
  });
}

function stageWarmup(prefix: string, level: VocabAnswerRecord["level"], count: number): VocabAnswerRecord[] {
  return buildStageAnswers({
    prefix,
    level,
    count,
    responseAt: (index) => ({
      responseType: "option",
      isCorrect: index % 7 !== 0,
      knew: true,
      selectedMeaning: index % 7 !== 0 ? "【v.】评估；评价；进行判断" : "错误释义",
    }),
  });
}

function stageBoundary(prefix: string, level: VocabAnswerRecord["level"], count: number): VocabAnswerRecord[] {
  return buildStageAnswers({
    prefix,
    level,
    count,
    responseAt: (index) => {
      if (index % 8 === 0) {
        return { responseType: "unsure", isCorrect: false, knew: true, selectedMeaning: null };
      }
      if (index % 5 === 0) {
        return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
      }
      if (index % 3 === 0) {
        return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
      }
      return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "【v.】评估；评价；进行判断" };
    },
  });
}

function stageChallenge(prefix: string, level: VocabAnswerRecord["level"], count: number): VocabAnswerRecord[] {
  return buildStageAnswers({
    prefix,
    level,
    count,
    responseAt: (index) => {
      if (index % 3 === 0) {
        return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
      }
      if (index % 4 === 0) {
        return { responseType: "unsure", isCorrect: false, knew: true, selectedMeaning: null };
      }
      if (index % 10 === 0) {
        return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "【v.】评估；评价；进行判断" };
      }
      return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
    },
  });
}

function stageLateDrift(prefix: string, level: VocabAnswerRecord["level"], count: number): VocabAnswerRecord[] {
  return buildStageAnswers({
    prefix,
    level,
    count,
    responseAt: (index) => {
      if (index % 6 === 0) {
        return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
      }
      if (index % 5 === 0) {
        return { responseType: "unsure", isCorrect: false, knew: true, selectedMeaning: null };
      }
      if (index % 4 === 0) {
        return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
      }
      return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "【v.】评估；评价；进行判断" };
    },
  });
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

  it("evaluateSessionOutcome: should not pin the very first unknown answer to the cet4 soft band", () => {
    const result = evaluateSessionOutcome({
      answers: [
        answer({
          questionId: "q-unknown-0",
          level: "cet4",
          responseType: "unknown",
          knew: false,
          isCorrect: false,
          selectedMeaning: null,
        }),
      ],
      currentLevel: "cet4",
      startedLevel: "cet4",
    });

    expect(result.recommendedLevel).toBe("cet4");
    expect(result.estimatedVocab).toBeLessThan(3200);
  });

  it("applyEstimatedVocabGuardrail: should damp early overestimation before the minimum question threshold", () => {
    const answers = Array.from({ length: 10 }).map((_, idx) =>
      answer({
        questionId: `q-early-${idx}`,
        level: idx < 6 ? "cet4" : "cet6",
        responseType: idx < 4 ? "option" : idx % 3 === 0 ? "unsure" : "unknown",
        isCorrect: idx < 4,
        knew: idx < 6,
        selectedMeaning: idx < 4 ? "【v.】评估；评价；进行判断" : null,
      })
    );

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 10,
      estimatedVocab: 6400,
      confidence: 0.64,
      currentLevel: "cet4",
      recommendedLevel: "ielts",
      answers,
      startedLevel: "cet4",
    });

    expect(guarded).toBeLessThan(6400);
    expect(guarded).toBeLessThanOrEqual(5200);
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

  it("adjustConfidenceForLateSession: should keep non-mastery late boosts bounded to avoid optimistic finishes", () => {
    expect(adjustConfidenceForLateSession(0.7, 80, "cet6")).toBeLessThanOrEqual(0.715);
    expect(adjustConfidenceForLateSession(0.7, 80, "ielts")).toBeLessThanOrEqual(0.726);
    expect(adjustConfidenceForLateSession(0.7, 80, "gre")).toBeLessThanOrEqual(0.737);
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

  it("applyEstimatedVocabGuardrail: should keep stable authentic cet4 finishes inside an upper cet4 band", () => {
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

    expect(guarded).toBeGreaterThanOrEqual(3600);
    expect(guarded).toBeLessThanOrEqual(3900);
    expect(guarded).toBeLessThan(4000);
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

  it("applyEstimatedVocabGuardrail: should preserve near-cet6 late sessions above the cet4 floor", () => {
    const answers = [
      ...stageWarmup("near-cet6-late-guardrail-warmup", "cet4", 18),
      ...stageBoundary("near-cet6-late-guardrail-boundary", "cet6", 30),
      ...stageLateDrift("near-cet6-late-guardrail-drift", "cet6", 62),
    ];

    const guarded = applyEstimatedVocabGuardrail({
      questionCount: 110,
      estimatedVocab: 5764,
      confidence: 0.9000,
      currentLevel: "cet6",
      recommendedLevel: "cet4",
      startedLevel: "cet4",
      answers,
    });

    expect(guarded).toBeGreaterThanOrEqual(4700);
    expect(guarded).toBeLessThanOrEqual(5200);
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

  it("applyFinalLevelPriorityAdjustment: should lift stable late cet4 sessions out of the floor band", () => {
    const answers = [
      ...stageWarmup("late-cet4-warmup", "cet4", 24),
      ...stageBoundary("late-cet4-boundary", "cet4", 34),
      ...stageChallenge("late-cet4-challenge", "cet6", 24),
      ...stageLateDrift("late-cet4-drift", "cet4", 28),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 110,
      confidence: 0.9005,
      estimatedVocab: 3240,
      recommendedLevel: "cet4",
      currentLevel: "cet4",
      startedLevel: "cet4",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet4");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(3800);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(4300);
  });

  it("applyFinalLevelPriorityAdjustment: should lift late cet4 finishes even when current level is still one band high", () => {
    const answers = [
      ...stageWarmup("late-cet4-mismatch-warmup", "cet4", 26),
      ...stageBoundary("late-cet4-mismatch-boundary", "cet4", 30),
      ...stageChallenge("late-cet4-mismatch-challenge", "cet6", 30),
      ...stageLateDrift("late-cet4-mismatch-drift", "cet4", 23),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 109,
      confidence: 0.9001,
      estimatedVocab: 3240,
      recommendedLevel: "cet4",
      currentLevel: "cet6",
      startedLevel: "cet4",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet4");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(3800);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(4300);
  });

  it("applyFinalLevelPriorityAdjustment: should cap moderately confident gre finals below 10.4k", () => {
    const answers = [
      ...stageWarmup("late-gre-warmup", "ielts", 10),
      ...buildStageAnswers({
        prefix: "late-gre-boundary",
        level: "gre",
        count: 52,
        responseAt: (index) => {
          if (index % 11 === 0) {
            return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
          }
          if (index % 9 === 0) {
            return { responseType: "unsure", isCorrect: false, knew: true, selectedMeaning: null };
          }
          if (index % 7 === 0) {
            return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
          }
          return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "正确释义" };
        },
      }),
      ...buildStageAnswers({
        prefix: "late-gre-tail",
        level: "gre",
        count: 14,
        responseAt: (index) => {
          if (index % 6 === 0) {
            return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
          }
          if (index % 5 === 0) {
            return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
          }
          return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "正确释义" };
        },
      }),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 76,
      confidence: 0.9009,
      estimatedVocab: 10777,
      recommendedLevel: "gre",
      currentLevel: "gre",
      startedLevel: "gre",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("gre");
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(10400);
  });

  it("applyFinalLevelPriorityAdjustment: should recover low-range cet4 mismatch when current level is still ielts", () => {
    const answers = [
      ...stageWarmup("low-range-ielts-mismatch-warmup", "cet4", 20),
      ...stageBoundary("low-range-ielts-mismatch-boundary", "cet4", 24),
      ...stageChallenge("low-range-ielts-mismatch-challenge", "ielts", 30),
      ...stageLateDrift("low-range-ielts-mismatch-drift", "cet4", 24),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 98,
      confidence: 0.9021,
      estimatedVocab: 3235,
      recommendedLevel: "cet4",
      currentLevel: "ielts",
      startedLevel: "cet4",
      answers,
    });

    expect(["cet4", "cet6"]).toContain(adjusted.recommendedLevel);
    expect(adjusted.estimatedVocab).toBeGreaterThan(4000);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(5000);
  });

  it("applyFinalLevelPriorityAdjustment: should recover low-range cet4 mismatch just before the 95-question threshold", () => {
    const answers = [
      ...stageWarmup("low-range-ielts-mismatch-94-warmup", "cet4", 20),
      ...stageBoundary("low-range-ielts-mismatch-94-boundary", "cet4", 24),
      ...stageChallenge("low-range-ielts-mismatch-94-challenge", "ielts", 26),
      ...stageLateDrift("low-range-ielts-mismatch-94-drift", "cet4", 24),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 94,
      confidence: 0.9010,
      estimatedVocab: 3238,
      recommendedLevel: "cet4",
      currentLevel: "ielts",
      startedLevel: "cet4",
      answers,
    });

    expect(["cet4", "cet6"]).toContain(adjusted.recommendedLevel);
    expect(adjusted.estimatedVocab).toBeGreaterThan(4000);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(5000);
  });

  it("applyFinalLevelPriorityAdjustment: should recover low-range cet4 mismatch before question 100 when current level is cet6", () => {
    const answers = [
      ...stageWarmup("low-range-cet6-mismatch-warmup", "cet4", 22),
      ...stageBoundary("low-range-cet6-mismatch-boundary", "cet4", 24),
      ...stageChallenge("low-range-cet6-mismatch-challenge", "cet6", 27),
      ...stageLateDrift("low-range-cet6-mismatch-drift", "cet4", 24),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 97,
      confidence: 0.9009,
      estimatedVocab: 3244,
      recommendedLevel: "cet4",
      currentLevel: "cet6",
      startedLevel: "cet4",
      answers,
    });

    expect(["cet4", "cet6"]).toContain(adjusted.recommendedLevel);
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(4400);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(5300);
  });

  it("applyFinalLevelPriorityAdjustment: should cap early ielts inflation for mid-range users", () => {
    const answers = [
      ...stageWarmup("mid-range-ielts-warmup", "cet4", 16),
      ...stageBoundary("mid-range-ielts-boundary", "cet6", 30),
      ...stageChallenge("mid-range-ielts-challenge", "ielts", 30),
      ...stageLateDrift("mid-range-ielts-drift", "ielts", 15),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 91,
      confidence: 0.9023,
      estimatedVocab: 6239,
      recommendedLevel: "ielts",
      currentLevel: "ielts",
      startedLevel: "cet4",
      answers,
    });

    expect(["cet6", "ielts"]).toContain(adjusted.recommendedLevel);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(6100);
  });

  it("applyFinalLevelPriorityAdjustment: should keep upper-cet6 users from drifting too far into ielts territory", () => {
    const answers = [
      ...stageWarmup("upper-cet6-drift-warmup", "cet4", 16),
      ...stageBoundary("upper-cet6-drift-boundary", "cet6", 30),
      ...stageChallenge("upper-cet6-drift-challenge", "ielts", 24),
      ...stageLateDrift("upper-cet6-drift-drift", "ielts", 21),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 91,
      confidence: 0.9041,
      estimatedVocab: 5950,
      recommendedLevel: "cet6",
      currentLevel: "ielts",
      startedLevel: "cet4",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet6");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(5500);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(5850);
  });

  it("applyFinalLevelPriorityAdjustment: should rein in overly high upper-ielts boundary results", () => {
    const answers = [
      ...stageWarmup("upper-ielts-high-warmup", "cet6", 14),
      ...stageBoundary("upper-ielts-high-boundary", "ielts", 34),
      ...stageLateDrift("upper-ielts-high-drift", "ielts", 36),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 84,
      confidence: 0.901,
      estimatedVocab: 7766,
      recommendedLevel: "ielts",
      currentLevel: "ielts",
      startedLevel: "cet6",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("ielts");
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(7400);
  });

  it("applyFinalLevelPriorityAdjustment: should lift overly low upper-ielts boundary results", () => {
    const answers = [
      ...stageWarmup("upper-ielts-low-warmup", "cet6", 14),
      ...stageBoundary("upper-ielts-low-boundary", "ielts", 34),
      ...stageLateDrift("upper-ielts-low-drift", "ielts", 37),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 85,
      confidence: 0.9001,
      estimatedVocab: 6803,
      recommendedLevel: "ielts",
      currentLevel: "ielts",
      startedLevel: "cet6",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("ielts");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(7000);
  });

  it("applyFinalLevelPriorityAdjustment: should recover collapsed mid-range users when current level is still gre", () => {
    const answers = [
      ...stageWarmup("mid-range-gre-collapse-warmup", "cet4", 16),
      ...stageBoundary("mid-range-gre-collapse-boundary", "cet6", 24),
      ...stageChallenge("mid-range-gre-collapse-challenge", "gre", 24),
      ...stageLateDrift("mid-range-gre-collapse-drift", "gre", 16),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 80,
      confidence: 0.9010,
      estimatedVocab: 3226,
      recommendedLevel: "cet4",
      currentLevel: "gre",
      startedLevel: "cet4",
      answers,
    });

    expect(["cet6", "ielts"]).toContain(adjusted.recommendedLevel);
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(5200);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(6200);
  });

  it("applyFinalLevelPriorityAdjustment: should lift flattened high-ielts results when current level is already gre", () => {
    const answers = [
      ...stageWarmup("high-ielts-gre-warmup", "cet6", 12),
      ...stageBoundary("high-ielts-gre-boundary", "ielts", 28),
      ...stageChallenge("high-ielts-gre-challenge", "gre", 26),
      ...stageLateDrift("high-ielts-gre-drift", "gre", 16),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 82,
      confidence: 0.9082,
      estimatedVocab: 6542,
      recommendedLevel: "ielts",
      currentLevel: "gre",
      startedLevel: "cet6",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("ielts");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(7000);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(7800);
  });

  it("applyFinalLevelPriorityAdjustment: should recover gre-to-ielts samples that fall just below the old confidence gap", () => {
    const answers = [
      ...stageWarmup("gre-ielts-gap-warmup", "cet6", 12),
      ...stageBoundary("gre-ielts-gap-boundary", "ielts", 28),
      ...stageChallenge("gre-ielts-gap-challenge", "gre", 26),
      ...stageLateDrift("gre-ielts-gap-drift", "gre", 14),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 80,
      confidence: 0.9039,
      estimatedVocab: 6496,
      recommendedLevel: "ielts",
      currentLevel: "gre",
      startedLevel: "cet6",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("ielts");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(7000);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(7800);
  });

  it("applyFinalLevelPriorityAdjustment: should keep 9k gre-boundary samples above the low-ielts floor", () => {
    const answers = [
      ...stageWarmup("gre-ielts-9k-gap-warmup", "ielts", 12),
      ...stageBoundary("gre-ielts-9k-gap-boundary", "gre", 36),
      ...stageChallenge("gre-ielts-9k-gap-challenge", "gre", 24),
      ...stageLateDrift("gre-ielts-9k-gap-drift", "gre", 12),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 80,
      confidence: 0.9035,
      estimatedVocab: 8594,
      recommendedLevel: "ielts",
      currentLevel: "gre",
      startedLevel: "ielts",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("gre");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(8800);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(9300);
  });

  it("applyFinalLevelPriorityAdjustment: should keep lower upper-ielts samples out of the pre-gre transition band", () => {
    const answers = [
      ...stageWarmup("pre-gre-low-threshold-warmup", "cet6", 16),
      ...stageBoundary("pre-gre-low-threshold-boundary", "gre", 34),
      ...stageLateDrift("pre-gre-low-threshold-drift", "ielts", 33),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 84,
      confidence: 0.9010,
      estimatedVocab: 8817,
      recommendedLevel: "gre",
      currentLevel: "ielts",
      startedLevel: "cet6",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("ielts");
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(7400);
  });

  it("applyFinalLevelPriorityAdjustment: should keep pre-gre transition users below gre until evidence is stronger", () => {
    const answers = [
      ...stageWarmup("pre-gre-transition-warmup", "ielts", 16),
      ...stageBoundary("pre-gre-transition-boundary", "gre", 34),
      ...stageLateDrift("pre-gre-transition-drift", "ielts", 33),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 83,
      confidence: 0.9018,
      estimatedVocab: 8817,
      recommendedLevel: "gre",
      currentLevel: "ielts",
      startedLevel: "cet6",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("ielts");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(7600);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(7999);
  });

  it("applyFinalLevelPriorityAdjustment: should keep 8k boundary users out of gre even when raw estimate slightly exceeds 9k", () => {
    const answers = [
      ...stageWarmup("pre-gre-8k-boundary-warmup", "ielts", 16),
      ...stageBoundary("pre-gre-8k-boundary-boundary", "gre", 34),
      ...stageLateDrift("pre-gre-8k-boundary-drift", "ielts", 33),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 83,
      confidence: 0.9013,
      estimatedVocab: 9103,
      recommendedLevel: "gre",
      currentLevel: "ielts",
      startedLevel: "cet4",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("ielts");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(7600);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(8200);
  });

  it("applyFinalLevelPriorityAdjustment: should smooth high-confidence gre-boundary users back above the ielts floor", () => {
    const answers = [
      ...stageWarmup("gre-boundary-recovery-warmup", "ielts", 12),
      ...stageBoundary("gre-boundary-recovery-boundary", "gre", 36),
      ...stageChallenge("gre-boundary-recovery-challenge", "gre", 24),
      ...stageLateDrift("gre-boundary-recovery-drift", "gre", 12),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 84,
      confidence: 0.9126,
      estimatedVocab: 7003,
      recommendedLevel: "ielts",
      currentLevel: "gre",
      startedLevel: "ielts",
      answers,
    });

    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(8200);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(9000);
  });

  it("applyFinalLevelPriorityAdjustment: should push later gre-boundary recoveries into the upper transition band", () => {
    const answers = [
      ...stageWarmup("gre-boundary-late-warmup", "ielts", 12),
      ...stageBoundary("gre-boundary-late-boundary", "gre", 36),
      ...stageChallenge("gre-boundary-late-challenge", "gre", 24),
      ...stageLateDrift("gre-boundary-late-drift", "gre", 12),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 84,
      confidence: 0.9126,
      estimatedVocab: 7003,
      recommendedLevel: "ielts",
      currentLevel: "gre",
      startedLevel: "ielts",
      answers,
    });

    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(8700);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(9200);
  });

  it("applyFinalLevelPriorityAdjustment: should lift late stable gre results above the 8.5k boundary floor", () => {
    const answers = [
      ...stageWarmup("late-stable-gre-warmup", "ielts", 12),
      ...stageBoundary("late-stable-gre-boundary", "gre", 36),
      ...stageChallenge("late-stable-gre-challenge", "gre", 24),
      ...stageLateDrift("late-stable-gre-drift", "gre", 12),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 84,
      confidence: 0.9126,
      estimatedVocab: 8650,
      recommendedLevel: "gre",
      currentLevel: "gre",
      startedLevel: "ielts",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("gre");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(8700);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(9200);
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

  it("resolveGuardedEstimatedVocab: should cap moderately confident gre finishes below the top gre tail", () => {
    const answers = Array.from({ length: 76 }).map((_, idx) =>
      answer({
        questionId: `q-gre-cap-${idx}`,
        level: idx % 3 === 0 ? "gre" : "ielts",
        responseType: idx % 11 === 0 ? "unknown" : idx % 9 === 0 ? "unsure" : "option",
        isCorrect: idx % 11 !== 0 && idx % 7 !== 0,
        knew: idx % 11 !== 0,
        selectedMeaning:
          idx % 11 === 0 ? null : idx % 7 === 0 ? "错误释义" : "正确释义",
      })
    );

    const resolved = resolveGuardedEstimatedVocab({
      questionCount: 76,
      estimatedVocab: 10880,
      confidence: 0.906,
      currentLevel: "gre",
      answers,
    });

    expect(resolved.recommendedLevel).toBe("gre");
    expect(resolved.estimatedVocab).toBeLessThanOrEqual(10400);
  });

  it("resolveGuardedEstimatedVocab: should pull upper-cet6 trajectories back below the ielts cutoff", () => {
    const answers = [
      ...stageWarmup("upper-cet6-guardrail-warmup", "cet4", 16),
      ...stageBoundary("upper-cet6-guardrail-boundary", "cet6", 30),
      ...stageChallenge("upper-cet6-guardrail-challenge", "ielts", 24),
      ...stageLateDrift("upper-cet6-guardrail-drift", "ielts", 18),
    ];

    const resolved = resolveGuardedEstimatedVocab({
      questionCount: 88,
      estimatedVocab: 6451,
      confidence: 0.9005,
      currentLevel: "ielts",
      startedLevel: "cet4",
      answers,
    });

    expect(resolved.recommendedLevel).toBe("cet6");
    expect(resolved.estimatedVocab).toBeLessThanOrEqual(6000);
  });

  it("resolveGuardedEstimatedVocab: should not collapse near-cet6 late sessions into the cet4 floor", () => {
    const answers = [
      ...stageWarmup("near-cet6-late-resolve-warmup", "cet4", 18),
      ...stageBoundary("near-cet6-late-resolve-boundary", "cet6", 30),
      ...stageLateDrift("near-cet6-late-resolve-drift", "cet6", 62),
    ];

    const resolved = resolveGuardedEstimatedVocab({
      questionCount: 110,
      estimatedVocab: 5764,
      confidence: 0.9,
      currentLevel: "cet6",
      startedLevel: "cet4",
      answers,
    });

    expect(resolved.recommendedLevel).toBe("cet6");
    expect(resolved.estimatedVocab).toBeGreaterThanOrEqual(4700);
    expect(resolved.estimatedVocab).toBeLessThanOrEqual(5200);
  });

  it("applyFinalLevelPriorityAdjustment: should keep 4900-level samples out of the late cet4 recovery band", () => {
    const answers = [
      ...stageWarmup("mid-low-4900-warmup", "cet4", 18),
      ...stageBoundary("mid-low-4900-boundary", "cet6", 30),
      ...stageLateDrift("mid-low-4900-drift", "cet6", 62),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 110,
      confidence: 0.9000,
      estimatedVocab: 4039,
      recommendedLevel: "cet4",
      currentLevel: "cet6",
      startedLevel: "cet4",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet6");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(4700);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(5200);
  });

  it("applyFinalLevelPriorityAdjustment: should keep 5400-level samples out of the low ielts plateau", () => {
    const answers = [
      ...stageWarmup("mid-high-5400-warmup", "cet4", 16),
      ...stageBoundary("mid-high-5400-boundary", "cet6", 34),
      ...stageChallenge("mid-high-5400-challenge", "ielts", 28),
      ...stageLateDrift("mid-high-5400-drift", "cet6", 21),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 99,
      confidence: 0.9008,
      estimatedVocab: 6146,
      recommendedLevel: "ielts",
      currentLevel: "cet6",
      startedLevel: "cet4",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet6");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(5400);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(6000);
  });

  it("applyFinalLevelPriorityAdjustment: should not pin late upper-cet6 sessions to the 5990 plateau", () => {
    const answers = [
      ...stageWarmup("upper-cet6-5990-platform-warmup", "cet4", 16),
      ...stageBoundary("upper-cet6-5990-platform-boundary", "cet6", 30),
      ...stageChallenge("upper-cet6-5990-platform-challenge", "ielts", 24),
      ...stageLateDrift("upper-cet6-5990-platform-drift", "ielts", 26),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 96,
      confidence: 0.9040,
      estimatedVocab: 6248,
      recommendedLevel: "ielts",
      currentLevel: "ielts",
      startedLevel: "cet4",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet6");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(5750);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(5900);
  });

  it("applyFinalLevelPriorityAdjustment: should not clamp upper-cet6 drift to a flat 5850 plateau", () => {
    const answers = [
      ...stageWarmup("upper-cet6-flat-plateau-warmup", "cet4", 16),
      ...stageBoundary("upper-cet6-flat-plateau-boundary", "cet6", 30),
      ...stageChallenge("upper-cet6-flat-plateau-challenge", "ielts", 24),
      ...stageLateDrift("upper-cet6-flat-plateau-drift", "ielts", 21),
    ];

    const adjusted = applyFinalLevelPriorityAdjustment({
      questionCount: 91,
      confidence: 0.9041,
      estimatedVocab: 5950,
      recommendedLevel: "cet6",
      currentLevel: "ielts",
      startedLevel: "cet4",
      answers,
    });

    expect(adjusted.recommendedLevel).toBe("cet6");
    expect(adjusted.estimatedVocab).toBeGreaterThanOrEqual(5650);
    expect(adjusted.estimatedVocab).toBeLessThanOrEqual(5800);
  });

  it("persona simulation: should keep a cet4 user inside the cet4 band", () => {
    const answers = [
      ...stageWarmup("persona-cet4-warmup", "cet4", 20),
      ...stageBoundary("persona-cet4-boundary", "cet4", 28),
      ...stageChallenge("persona-cet4-challenge", "cet6", 20),
      ...stageLateDrift("persona-cet4-late", "cet4", 18),
    ];

    const result = evaluateSessionOutcome({
      answers,
      currentLevel: "cet4",
      startedLevel: "cet4",
    });

    expect(result.recommendedLevel).toBe("cet4");
    expect(result.confidence).toBeLessThan(0.92);
    expect(result.estimatedVocab).toBeLessThan(4500);
  });

  it("persona simulation: should keep a cet6 user inside the cet6 band", () => {
    const answers = [
      ...stageWarmup("persona-cet6-warmup", "cet4", 12),
      ...buildStageAnswers({
        prefix: "persona-cet6-boundary",
        level: "cet6",
        count: 52,
        responseAt: (index) => {
          if (index % 10 === 0) {
            return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
          }
          if (index % 7 === 0) {
            return { responseType: "unsure", isCorrect: false, knew: true, selectedMeaning: null };
          }
          if (index % 4 === 0) {
            return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
          }
          return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "【v.】评估；评价；进行判断" };
        },
      }),
      ...buildStageAnswers({
        prefix: "persona-cet6-challenge",
        level: "ielts",
        count: 16,
        responseAt: (index) => {
          if (index % 3 === 0) {
            return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
          }
          if (index % 5 === 0) {
            return { responseType: "unsure", isCorrect: false, knew: true, selectedMeaning: null };
          }
          if (index % 15 === 0) {
            return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "【v.】评估；评价；进行判断" };
          }
          return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
        },
      }),
      ...buildStageAnswers({
        prefix: "persona-cet6-late",
        level: "cet6",
        count: 12,
        responseAt: (index) => {
          if (index % 6 === 0) {
            return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
          }
          if (index % 3 === 0) {
            return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
          }
          return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "【v.】评估；评价；进行判断" };
        },
      }),
    ];

    const result = evaluateSessionOutcome({
      answers,
      currentLevel: "cet6",
      startedLevel: "cet4",
    });

    expect(result.recommendedLevel).toBe("cet6");
    expect(result.confidence).toBeLessThan(0.94);
    expect(result.estimatedVocab).toBeGreaterThanOrEqual(4500);
    expect(result.estimatedVocab).toBeLessThan(6000);
  });

  it("persona simulation: should keep an ielts user inside the ielts band", () => {
    const answers = [
      ...stageWarmup("persona-ielts-warmup", "cet6", 14),
      ...stageBoundary("persona-ielts-boundary", "ielts", 34),
      ...stageChallenge("persona-ielts-challenge", "gre", 18),
      ...stageLateDrift("persona-ielts-late", "ielts", 16),
    ];

    const result = evaluateSessionOutcome({
      answers,
      currentLevel: "ielts",
      startedLevel: "cet6",
    });

    expect(result.recommendedLevel).toBe("ielts");
    expect(result.confidence).toBeLessThan(0.95);
    expect(result.estimatedVocab).toBeGreaterThanOrEqual(6000);
    expect(result.estimatedVocab).toBeLessThan(8000);
  });

  it("persona simulation: should keep a gre user inside the gre band", () => {
    const answers = [
      ...stageWarmup("persona-gre-warmup", "ielts", 8),
      ...buildStageAnswers({
        prefix: "persona-gre-boundary",
        level: "gre",
        count: 110,
        responseAt: (index) => {
          if (index % 14 === 0) {
            return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
          }
          if (index % 18 === 0) {
            return { responseType: "unsure", isCorrect: false, knew: true, selectedMeaning: null };
          }
          if (index % 16 === 0) {
            return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
          }
          return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "正确释义" };
        },
      }),
      ...buildStageAnswers({
        prefix: "persona-gre-late-gre",
        level: "gre",
        count: 12,
        responseAt: (index) => {
          if (index % 9 === 0) {
            return { responseType: "unknown", isCorrect: false, knew: false, selectedMeaning: null };
          }
          if (index % 8 === 0) {
            return { responseType: "option", isCorrect: false, knew: true, selectedMeaning: "错误释义" };
          }
          return { responseType: "option", isCorrect: true, knew: true, selectedMeaning: "正确释义" };
        },
      }),
    ];

    const result = evaluateSessionOutcome({
      answers,
      currentLevel: "gre",
      startedLevel: "gre",
    });

    expect(result.recommendedLevel).toBe("gre");
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.estimatedVocab).toBeGreaterThanOrEqual(8000);
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

  it("getNextLevelAfterCalibration: should wait for a third consecutive early correct answer before promoting", () => {
    const next = getNextLevelAfterCalibration(
      state({
        startedLevel: "gre",
        questionCount: 1,
        currentLevel: "cet6",
        answers: [answer({ questionId: "q-0", level: "cet6", isCorrect: true })],
      }),
      answer({ questionId: "q-1", level: "cet6", isCorrect: true })
    );

    expect(next).toBe("cet6");
  });

  it("getNextLevelAfterCalibration: should promote after three consecutive early correct answers", () => {
    const next = getNextLevelAfterCalibration(
      state({
        startedLevel: "gre",
        questionCount: 2,
        currentLevel: "cet6",
        answers: [
          answer({ questionId: "q-0", level: "cet6", isCorrect: true }),
          answer({ questionId: "q-1", level: "cet6", isCorrect: true }),
        ],
      }),
      answer({ questionId: "q-2", level: "cet6", isCorrect: true })
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
