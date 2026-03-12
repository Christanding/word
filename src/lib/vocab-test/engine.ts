import { QUESTION_BANK, LEVEL_ORDER, LEVEL_WORD_TOTAL, type QuestionBank, type QuestionSeed } from "./bank";
import { estimateVocabMargin } from "./margin";
import type { VocabAnswerRecord, VocabAssessmentState, VocabLevel, VocabQuestion } from "./types";

const MIN_QUESTIONS = 50;
const MAX_QUESTIONS = 150;
const CALIBRATION_QUESTIONS = 8;
const CONFIDENCE_TARGET = 0.9;
const LOW_LEVEL_EARLY_FINISH_MIN_QUESTIONS = 80;
const LOW_LEVEL_EARLY_FINISH_CONFIDENCE = 0.84;
const EARLY_CONFIDENCE_CAPS = [0.58, 0.58, 0.58, 0.58, 0.58, 0.64, 0.64, 0.64, 0.72, 0.8, 0.92, 0.99] as const;
const EARLY_CONFIDENCE_PENALTIES = [0.03, 0.028, 0.026, 0.024, 0.022, 0.02, 0.018, 0.016, 0.012, 0.01] as const;
const LATE_CONFIDENCE_MAX_BOOST: Record<VocabLevel, number> = {
  cet4: 0,
  cet6: 0.04,
  ielts: 0.07,
  gre: 0.1,
};
const LOW_CONFIDENCE_RESULT_CAP_LEVEL: VocabLevel = "cet6";
const LOW_CONFIDENCE_RESULT_MIN_FACTOR = 0.45;
const NO_DISTRACTOR_MODE = false;
const CORRECT_OPTION_SCORE = 0.96;
const UNKNOWN_SCORE = 0.14;
const UNSURE_WRONG_SCORE = 0.26;
const NON_OPTION_OBSERVATION_PULL = 0.55;
const NON_OPTION_WEIGHT_SCALE = 0.7;
const UNSTABLE_DELTA_THRESHOLD = 0.1;
export const TEST_POLICY = {
  minQuestions: MIN_QUESTIONS,
  maxQuestions: MAX_QUESTIONS,
  confidenceTarget: CONFIDENCE_TARGET,
  correctScore: CORRECT_OPTION_SCORE,
  unknownScore: UNKNOWN_SCORE,
  unsureScore: UNSURE_WRONG_SCORE,
} as const;

const IRT_DIFFICULTY: Record<VocabLevel, number> = {
  cet4: -1.2,
  cet6: -0.2,
  ielts: 0.65,
  gre: 1.45,
};

const IRT_DISCRIMINATION: Record<VocabLevel, number> = {
  cet4: 0.95,
  cet6: 1.15,
  ielts: 1.25,
  gre: 1.35,
};

const LEVEL_BUCKET_SIZE: Record<VocabLevel, number> = {
  cet4: 4500,
  cet6: 2000,
  ielts: 2500,
  gre: 4000,
};

type QuestionBankIndex = {
  allSorted: QuestionSeed[];
  byLevelSorted: Record<VocabLevel, QuestionSeed[]>;
  byLevelWordSorted: Record<VocabLevel, QuestionSeed[]>;
  byGlobalPos: Map<string, QuestionSeed[]>;
  byWord: Map<string, QuestionSeed[]>;
};

type LowConfidenceResultInput = {
  questionCount: number;
  confidence: number;
  estimatedVocab: number;
  recommendedLevel: VocabLevel;
  currentLevel?: VocabLevel;
  answers?: VocabAnswerRecord[];
};

type EstimatedVocabGuardrailInput = {
  questionCount: number;
  estimatedVocab: number;
  confidence: number;
  currentLevel: VocabLevel;
  recommendedLevel: VocabLevel;
  answers: VocabAnswerRecord[];
  startedLevel?: VocabLevel;
};

type ResolveGuardedEstimatedVocabInput = Omit<EstimatedVocabGuardrailInput, "recommendedLevel">;

type SoftTargetBand = {
  min: number;
  max: number;
};

const CET4_SOFT_TARGET_BAND: SoftTargetBand = { min: 3200, max: 3300 };
const CET4_STABLE_TARGET_BAND: SoftTargetBand = { min: 3600, max: 3900 };
const CET4_LATE_RECOVERY_BAND: SoftTargetBand = { min: 3800, max: 4300 };
const CET4_TO_CET6_LATE_RECOVERY_BAND: SoftTargetBand = { min: 4700, max: 5200 };
const CET4_TO_CET6_MISMATCH_RECOVERY_BAND: SoftTargetBand = { min: 4400, max: 5300 };
const CET4_TO_IELTS_MISMATCH_RECOVERY_BAND: SoftTargetBand = { min: 4000, max: 5000 };
const CET4_TO_GRE_COLLAPSE_RECOVERY_BAND: SoftTargetBand = { min: 5200, max: 6200 };
const CET6_SOFT_TARGET_BAND: SoftTargetBand = { min: 4700, max: 4800 };
const CET6_UPPER_DRIFT_BAND: SoftTargetBand = { min: 5650, max: 5800 };
const CET6_TO_IELTS_TRANSITION_BAND: SoftTargetBand = { min: 5400, max: 6000 };
const MID_RANGE_IELTS_EARLY_BAND: SoftTargetBand = { min: 5750, max: 5950 };
const IELTS_SOFT_TARGET_BAND: SoftTargetBand = { min: 7000, max: 7600 };
const IELTS_UPPER_BOUNDARY_BAND: SoftTargetBand = { min: 7000, max: 7400 };
const IELTS_HIGH_RECOVERY_BAND: SoftTargetBand = { min: 7000, max: 7800 };
const IELTS_GRE_HYSTERESIS_RECOVERY_BAND: SoftTargetBand = { min: 8400, max: 9100 };
const IELTS_PRE_GRE_TRANSITION_BAND: SoftTargetBand = { min: 7600, max: 7990 };
const GRE_LATE_RECOVERY_BAND: SoftTargetBand = { min: 9000, max: 9600 };
const GRE_LATE_STABLE_ENTRY_BAND: SoftTargetBand = { min: 8700, max: 9200 };
const GRE_MODERATE_CONFIDENCE_CAP = 10400;
const MID_RANGE_IELTS_EARLY_CAP = 5990;
const CET6_UPPER_DRIFT_CAP = 5850;
const GRE_EARLY_ENTRY_CAP = 8200;
const EARLY_GUARDRAIL_BASE_FACTOR: Record<VocabLevel, number> = {
  cet4: 0.52,
  cet6: 0.6,
  ielts: 0.68,
  gre: 0.76,
};

type LowConfidenceResultOutput = LowConfidenceResultInput & {
  lowConfidenceResult: boolean;
};

const questionBankIndexCache = new WeakMap<QuestionBank, QuestionBankIndex>();

function shuffle<T>(items: T[]): T[] {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function levelToIndex(level: VocabLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

function indexToLevel(index: number): VocabLevel {
  return LEVEL_ORDER[clamp(index, 0, LEVEL_ORDER.length - 1)];
}

function normalizeMeaningText(raw: string): string {
  return raw
    .replace(/^【[^】]+】\s*/u, "")
    .replace(/^\s*[a-z]{1,6}\.\s*/iu, "")
    .replace(/[；。\s]+/gu, "")
    .trim();
}

function textSimilarity(a: string, b: string): number {
  const left = normalizeMeaningText(a);
  const right = normalizeMeaningText(b);
  if (!left || !right) {
    return 0;
  }
  const setA = new Set(left.split(""));
  const setB = new Set(right.split(""));
  let hit = 0;
  for (const ch of setA) {
    if (setB.has(ch)) {
      hit += 1;
    }
  }
  return hit / Math.max(setA.size + setB.size - hit, 1);
}

function splitMeaningTokens(raw: string): string[] {
  return raw
    .replace(/^【[^】]+】\s*/u, "")
    .split(/[；;，,、]+/)
    .map((item) => item.replace(/^\s*[a-z]{1,6}\.\s*/iu, "").trim())
    .filter(Boolean);
}

function isOptionTooClose(a: string, b: string): boolean {
  const left = normalizeMeaningText(a);
  const right = normalizeMeaningText(b);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  if (left.includes(right) || right.includes(left)) {
    return true;
  }

  const leftTokens = splitMeaningTokens(a);
  const rightTokens = splitMeaningTokens(b);
  if (leftTokens.length > 0 && rightTokens.length > 0) {
    const setA = new Set(leftTokens.map((item) => item.replace(/[\s]+/gu, "")));
    const setB = new Set(rightTokens.map((item) => item.replace(/[\s]+/gu, "")));
    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) {
        intersection += 1;
      }
    }
    const isSubset = intersection === Math.min(setA.size, setB.size);
    if (isSubset) {
      return true;
    }
  }

  return textSimilarity(a, b) >= 0.72;
}

function toOptionMeaning(seed: QuestionSeed, forcedPos?: string): string {
  const normalizedMeaning = seed.meaning.trim();
  const _keepSignature = forcedPos;
  void _keepSignature;
  return normalizedMeaning;
}

function posPriority(pos?: string): number {
  const normalized = (pos || "").trim().toLowerCase();
  if (!normalized) {
    return 6;
  }
  if (normalized.startsWith("v")) {
    return 0;
  }
  if (normalized.startsWith("n")) {
    return 1;
  }
  if (normalized.startsWith("adj")) {
    return 2;
  }
  if (normalized.startsWith("adv")) {
    return 3;
  }
  if (
    normalized.startsWith("prep") ||
    normalized.startsWith("conj") ||
    normalized.startsWith("pron") ||
    normalized.startsWith("det") ||
    normalized.startsWith("int") ||
    normalized.startsWith("aux") ||
    normalized.startsWith("modal")
  ) {
    return 9;
  }
  return 6;
}

function extractPosTag(raw: string): string | undefined {
  const matched = raw.trim().match(/^([a-z]{1,6}\.)/iu);
  return matched?.[1]?.toLowerCase();
}

function compareQuestionSeeds(left: QuestionSeed, right: QuestionSeed): number {
  const posDelta = posPriority(left.pos) - posPriority(right.pos);
  if (posDelta !== 0) {
    return posDelta;
  }
  return left.word.localeCompare(right.word);
}

function compareSeedsByWord(left: QuestionSeed, right: QuestionSeed): number {
  return left.word.localeCompare(right.word);
}

function normalizePosKey(pos?: string): string {
  return (pos || "").trim().toLowerCase();
}

function appendSeedToPosMap(map: Map<string, QuestionSeed[]>, seed: QuestionSeed) {
  const pos = seed.pos?.trim().toLowerCase();
  if (!pos) {
    return;
  }

  const existing = map.get(pos);
  if (existing) {
    existing.push(seed);
    return;
  }

  map.set(pos, [seed]);
}

function getQuestionBankIndex(bank: QuestionBank): QuestionBankIndex {
  const cached = questionBankIndexCache.get(bank);
  if (cached) {
    return cached;
  }

  const byLevelSorted = {
    cet4: [...bank.cet4].sort(compareQuestionSeeds),
    cet6: [...bank.cet6].sort(compareQuestionSeeds),
    ielts: [...bank.ielts].sort(compareQuestionSeeds),
    gre: [...bank.gre].sort(compareQuestionSeeds),
  } satisfies Record<VocabLevel, QuestionSeed[]>;

  const byLevelWordSorted = {
    cet4: [...bank.cet4].sort(compareSeedsByWord),
    cet6: [...bank.cet6].sort(compareSeedsByWord),
    ielts: [...bank.ielts].sort(compareSeedsByWord),
    gre: [...bank.gre].sort(compareSeedsByWord),
  } satisfies Record<VocabLevel, QuestionSeed[]>;

  const allSorted = LEVEL_ORDER.flatMap((level) => byLevelSorted[level]);
  const byGlobalPos = new Map<string, QuestionSeed[]>();
  const byWord = new Map<string, QuestionSeed[]>();
  for (const seed of allSorted) {
    appendSeedToPosMap(byGlobalPos, seed);
    const wordKey = seed.word.trim().toLowerCase();
    const existing = byWord.get(wordKey);
    if (existing) {
      existing.push(seed);
    } else {
      byWord.set(wordKey, [seed]);
    }
  }

  const created: QuestionBankIndex = {
    allSorted,
    byLevelSorted,
    byLevelWordSorted,
    byGlobalPos,
    byWord,
  };
  questionBankIndexCache.set(bank, created);
  return created;
}

export function warmQuestionBankIndex(bank: QuestionBank): QuestionBank {
  getQuestionBankIndex(bank);
  return bank;
}

function pickPreferredSeed(candidates: QuestionSeed[]): QuestionSeed | null {
  if (candidates.length === 0) {
    return null;
  }
  const bestRank = Math.min(...candidates.map((item) => posPriority(item.pos)));
  const preferred = candidates.filter((item) => posPriority(item.pos) === bestRank);
  return shuffle(preferred)[0] || null;
}

function scoreAnswer(answer: VocabAnswerRecord): number {
  if (answer.responseType === "unknown") {
    return UNKNOWN_SCORE;
  }
  if (answer.responseType === "unsure") {
    return UNSURE_WRONG_SCORE;
  }
  return answer.isCorrect ? CORRECT_OPTION_SCORE : 0;
}

function posteriorObservation(answer: VocabAnswerRecord): { observed: number; weightScale: number } {
  const raw = scoreAnswer(answer);
  if (answer.responseType === "option") {
    return { observed: raw, weightScale: 1 };
  }
  const randomBaseline = 0.25;
  const shrunk = randomBaseline + (raw - randomBaseline) * NON_OPTION_OBSERVATION_PULL;
  return {
    observed: clamp(shrunk, 0.05, 0.95),
    weightScale: NON_OPTION_WEIGHT_SCALE,
  };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function vocabToTheta(vocab?: number): number {
  if (!vocab || !Number.isFinite(vocab)) {
    return -0.35;
  }
  const normalized = clamp(vocab / LEVEL_WORD_TOTAL.gre, 0.02, 0.98);
  return Math.log(normalized / (1 - normalized));
}

function thetaToMastery(theta: number, level: VocabLevel): number {
  const a = IRT_DISCRIMINATION[level];
  const b = IRT_DIFFICULTY[level];
  return clamp(sigmoid(a * (theta - b)), 0.01, 0.99);
}

function estimateThetaPosterior(answers: VocabAnswerRecord[], priorVocab?: number): { theta: number; sd: number } {
  const priorMean = vocabToTheta(priorVocab);
  const priorSigma = priorVocab ? 0.95 : 1.25;
  const priorPrecision = 1 / (priorSigma * priorSigma);

  if (answers.length === 0) {
    return { theta: priorMean, sd: priorSigma };
  }

  let theta = priorMean;

  for (let i = 0; i < 12; i += 1) {
    let gradient = 0;
    let info = 0;

    for (const answer of answers) {
      const a = IRT_DISCRIMINATION[answer.level];
      const b = IRT_DIFFICULTY[answer.level];
      const { observed, weightScale } = posteriorObservation(answer);
      const p = clamp(sigmoid(a * (theta - b)), 0.001, 0.999);
      gradient += a * weightScale * (observed - p);
      info += a * a * weightScale * p * (1 - p);
    }

    gradient -= (theta - priorMean) * priorPrecision;
    const hessian = -(info + priorPrecision);
    const step = gradient / Math.min(hessian, -0.00001);
    theta -= step;

    if (Math.abs(step) < 0.0005) {
      break;
    }
  }

  let finalInfo = priorPrecision;
  for (const answer of answers) {
    const a = IRT_DISCRIMINATION[answer.level];
    const b = IRT_DIFFICULTY[answer.level];
    const { weightScale } = posteriorObservation(answer);
    const p = clamp(sigmoid(a * (theta - b)), 0.001, 0.999);
    finalInfo += a * a * weightScale * p * (1 - p);
  }

  const sd = Math.sqrt(1 / Math.max(finalInfo, 0.00001));
  return { theta, sd };
}

function findMostUnstableLevel(answers: VocabAnswerRecord[]): VocabLevel | null {
  let selected: { level: VocabLevel; delta: number } | null = null;
  for (const level of LEVEL_ORDER) {
    const target = answers.filter((item) => item.level === level);
    if (target.length < 4) {
      continue;
    }
    const score = target.reduce((sum, item) => sum + scoreAnswer(item), 0) / target.length;
    const delta = Math.abs(score - 0.5);
    if (!selected || delta < selected.delta) {
      selected = { level, delta };
    }
  }
  if (!selected) {
    return null;
  }
  return selected.delta <= UNSTABLE_DELTA_THRESHOLD ? selected.level : null;
}

function getDifficultyAfterAnswer(state: VocabAssessmentState, answer: VocabAnswerRecord): VocabLevel {
  const currentIndex = levelToIndex(state.currentLevel);
  if (answer.isCorrect) {
    if (state.correctStreak + 1 >= 2) {
      return indexToLevel(currentIndex + 1);
    }
    return state.currentLevel;
  }
  return indexToLevel(currentIndex - 1);
}

export function estimateVocabSize(answers: VocabAnswerRecord[], priorVocab?: number): number {
  const posterior = estimateThetaPosterior(answers, priorVocab);
  const masteryByLevel = {
    cet4: thetaToMastery(posterior.theta, "cet4"),
    cet6: thetaToMastery(posterior.theta, "cet6"),
    ielts: thetaToMastery(posterior.theta, "ielts"),
    gre: thetaToMastery(posterior.theta, "gre"),
  };

  const estimate =
    LEVEL_BUCKET_SIZE.cet4 * masteryByLevel.cet4 +
    LEVEL_BUCKET_SIZE.cet6 * masteryByLevel.cet6 +
    LEVEL_BUCKET_SIZE.ielts * masteryByLevel.ielts +
    LEVEL_BUCKET_SIZE.gre * masteryByLevel.gre;

  return Math.round(estimate);
}

export function estimateConfidence(answers: VocabAnswerRecord[], priorVocab?: number): number {
  const posterior = estimateThetaPosterior(answers, priorVocab);
  const confidence = 1 - posterior.sd / 1.7;
  return clamp(confidence, 0, 0.99);
}

export function adjustConfidenceForEarlySession(confidence: number, questionCount: number): number {
  const normalized = clamp(confidence, 0, 0.99);
  if (questionCount <= 0) {
    return normalized;
  }
  const cap = EARLY_CONFIDENCE_CAPS[questionCount - 1];
  if (cap === undefined) {
    return normalized;
  }
  const penalty = EARLY_CONFIDENCE_PENALTIES[questionCount - 1] ?? 0;
  return Math.min(clamp(normalized - penalty, 0, 0.99), cap);
}

export function adjustConfidenceForLateSession(
  confidence: number,
  questionCount: number,
  level: VocabLevel,
  answers: VocabAnswerRecord[] = []
): number {
  const normalized = clamp(confidence, 0, 0.99);
  if (questionCount <= 40) {
    return normalized;
  }
  const maxBoost = LATE_CONFIDENCE_MAX_BOOST[level];
  if (!maxBoost) {
    return normalized;
  }
  const progress = clamp((questionCount - 40) / (MAX_QUESTIONS - 40), 0, 1);
  const advancedMasteryBonus = getAdvancedMasteryConfidenceBonus(answers, level, progress);
  return clamp(normalized + maxBoost * progress + advancedMasteryBonus, 0, 0.99);
}

export function getRecommendedLevel(vocabSize: number): VocabLevel {
  if (vocabSize < 4500) {
    return "cet4";
  }
  if (vocabSize < 6000) {
    return "cet6";
  }
  if (vocabSize < 8000) {
    return "ielts";
  }
  return "gre";
}

export function applyEstimatedVocabGuardrail(input: EstimatedVocabGuardrailInput): number {
  if (input.questionCount < MIN_QUESTIONS) {
    const earlyProgress = clamp((Math.max(input.questionCount, 1) - 1) / (MIN_QUESTIONS - 1), 0, 1);
    const baseFactor = EARLY_GUARDRAIL_BASE_FACTOR[input.recommendedLevel];
    const factor = clamp(baseFactor + (1 - baseFactor) * earlyProgress, baseFactor, 1);
    return Math.max(0, Math.round(input.estimatedVocab * factor));
  }

  if (
    input.questionCount >= 100 &&
    input.startedLevel === "cet4" &&
    input.currentLevel === "cet6" &&
    input.recommendedLevel === "cet6" &&
    input.confidence >= 0.89 &&
    input.estimatedVocab >= 5200 &&
    input.estimatedVocab < 6000
  ) {
    const recentCet6Answers = input.answers.filter((answer) => answer.level === "cet6").slice(-12);
    const recentCet6Average =
      recentCet6Answers.length > 0
        ? recentCet6Answers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentCet6Answers.length
        : 0.5;

    return getSoftTargetInBand(input, CET4_TO_CET6_LATE_RECOVERY_BAND, recentCet6Average);
  }

  if (
    hasStrongAdvancedMasteryEvidence(input.answers, input.currentLevel, {
      confidence: input.confidence,
      estimatedVocab: input.estimatedVocab,
      recommendedLevel: input.recommendedLevel,
    })
  ) {
    return input.estimatedVocab;
  }

  const progress = clamp((Math.min(input.questionCount, 120) - MIN_QUESTIONS) / (120 - MIN_QUESTIONS), 0, 1);
  const recentCurrentLevelAnswers = input.answers.filter((answer) => answer.level === input.currentLevel).slice(-12);
  const recentAverageScore =
    recentCurrentLevelAnswers.length > 0
      ? recentCurrentLevelAnswers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentCurrentLevelAnswers.length
      : 0.5;

  let penalty = 0;
  if (input.recommendedLevel === "gre") {
    penalty += 0.08 * progress;
  } else if (input.recommendedLevel === "ielts") {
    penalty += 0.14 * progress;
  } else if (input.recommendedLevel === "cet6") {
    penalty += 0.18 * progress;
  } else {
    penalty += 0.22 * progress;
  }

  penalty += getEarlyFinishConservativePenalty(input.recommendedLevel) * (1 - progress);

  if (recentAverageScore >= 0.35 && recentAverageScore <= 0.65) {
    penalty += 0.03;
  }
  if (input.questionCount >= 110 && input.confidence < 0.95) {
    penalty += 0.02;
  }
  if (input.recommendedLevel === "gre" && recentAverageScore < 0.5) {
    penalty += 0.25;
  } else if (input.recommendedLevel === "ielts" && recentAverageScore < 0.55) {
    penalty += 0.1;
  } else if (input.recommendedLevel === "cet6" && recentAverageScore < 0.6) {
    penalty += 0.06;
  }
  const levelGap = Math.max(0, levelToIndex(input.currentLevel) - levelToIndex(input.recommendedLevel));
  if (levelGap > 0) {
    if (input.recommendedLevel === "cet4") {
      penalty += levelGap === 1 ? 0.46 : levelGap === 2 ? 0.72 : 0.8;
    } else {
      penalty += 0.04 * levelGap;
    }
  }

  const factor = clamp(1 - penalty, 0.72, 1);
  const guardedEstimate = Math.max(0, Math.round(input.estimatedVocab * factor));
  return applyEstimatedVocabOutcome(guardedEstimate, input, recentAverageScore);
}

export function resolveGuardedEstimatedVocab(
  input: ResolveGuardedEstimatedVocabInput,
): { estimatedVocab: number; recommendedLevel: VocabLevel } {
  const rawRecommendedLevel = getRecommendedLevel(input.estimatedVocab);
  const firstEstimate = applyEstimatedVocabGuardrail({
    ...input,
    recommendedLevel: rawRecommendedLevel,
  });
  const firstRecommendedLevel = getRecommendedLevel(firstEstimate);

  const secondEstimate = applyEstimatedVocabCeiling({
    ...input,
    estimatedVocab: firstEstimate,
    recommendedLevel: firstRecommendedLevel,
  });
  const estimatedVocab = Math.min(firstEstimate, secondEstimate);
  return { estimatedVocab, recommendedLevel: getRecommendedLevel(estimatedVocab) };
}

export function applyFinalLevelPriorityAdjustment(
  input: EstimatedVocabGuardrailInput,
): { estimatedVocab: number; recommendedLevel: VocabLevel } {
  if (shouldPromoteLateGreRecovery(input)) {
    const estimatedVocab = getSoftTargetInBand(input, GRE_LATE_RECOVERY_BAND, getRecentHighLevelAverage(input.answers));
    return {
      estimatedVocab,
      recommendedLevel: "gre",
    };
  }

  if (input.questionCount >= 100 && input.currentLevel === "gre" && input.recommendedLevel !== "gre") {
    return {
      estimatedVocab: input.estimatedVocab,
      recommendedLevel: input.recommendedLevel,
    };
  }

  const recentLevelAnswers = input.answers
    .filter((answer) => answer.level === input.currentLevel)
    .slice(-12);
  const recentAverageScore =
    recentLevelAnswers.length > 0
      ? recentLevelAnswers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentLevelAnswers.length
      : 0.5;

  if (
    input.questionCount >= 95 &&
    input.startedLevel === "cet4" &&
    input.currentLevel === "cet6" &&
    input.recommendedLevel === "ielts" &&
    input.confidence < 0.905 &&
    input.estimatedVocab < 6500
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      CET6_TO_IELTS_TRANSITION_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: getRecommendedLevel(estimatedVocab),
    };
  }

  if (
    input.questionCount >= 85 &&
    input.startedLevel === "cet4" &&
    input.currentLevel === "ielts" &&
    input.recommendedLevel === "cet4" &&
    input.confidence >= 0.9 &&
    input.estimatedVocab < 3600
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      CET4_TO_IELTS_MISMATCH_RECOVERY_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: getRecommendedLevel(estimatedVocab),
    };
  }

  if (
    input.questionCount >= 85 &&
    input.questionCount < 100 &&
    input.startedLevel === "cet4" &&
    input.currentLevel === "cet6" &&
    input.recommendedLevel === "cet4" &&
    input.confidence >= 0.9 &&
    input.estimatedVocab < 3600
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      CET4_TO_CET6_MISMATCH_RECOVERY_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: getRecommendedLevel(estimatedVocab),
    };
  }

  if (
    input.questionCount >= 75 &&
    input.questionCount < 90 &&
    input.startedLevel === "cet4" &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "cet4" &&
    input.confidence >= 0.9 &&
    input.estimatedVocab < 3600
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      CET4_TO_GRE_COLLAPSE_RECOVERY_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: getRecommendedLevel(estimatedVocab),
    };
  }

  if (
    input.questionCount >= 85 &&
    input.questionCount < 105 &&
    input.startedLevel === "cet4" &&
    input.currentLevel === "ielts" &&
    input.recommendedLevel === "ielts" &&
    input.confidence < 0.905 &&
    input.estimatedVocab > MID_RANGE_IELTS_EARLY_CAP &&
    input.estimatedVocab < 6500
  ) {
    const estimatedVocab = getSoftTargetInBand(input, MID_RANGE_IELTS_EARLY_BAND, recentAverageScore);
    return {
      estimatedVocab,
      recommendedLevel: getRecommendedLevel(estimatedVocab),
    };
  }

  if (
    input.questionCount >= 88 &&
    input.questionCount < 95 &&
    input.startedLevel === "cet4" &&
    input.currentLevel === "ielts" &&
    input.recommendedLevel === "cet6" &&
    input.confidence < 0.905 &&
    input.estimatedVocab > CET6_UPPER_DRIFT_CAP
  ) {
    const estimatedVocab = getSoftTargetInBand(input, CET6_UPPER_DRIFT_BAND, recentAverageScore);
    return {
      estimatedVocab,
      recommendedLevel: "cet6",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "ielts" &&
    input.confidence >= 0.903 &&
    input.estimatedVocab >= 8400 &&
    input.estimatedVocab < 9000
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      GRE_LATE_STABLE_ENTRY_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: "gre",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "ielts" &&
    input.confidence >= 0.91 &&
    input.estimatedVocab >= 6800 &&
    input.estimatedVocab < 7600
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      IELTS_GRE_HYSTERESIS_RECOVERY_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: getRecommendedLevel(estimatedVocab),
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "ielts" &&
    input.recommendedLevel === "ielts" &&
    input.confidence < 0.905 &&
    (input.estimatedVocab < 7000 || input.estimatedVocab > 7600)
  ) {
    const estimatedVocab = getSoftTargetInBand(input, IELTS_UPPER_BOUNDARY_BAND, recentAverageScore);
    return {
      estimatedVocab,
      recommendedLevel: "ielts",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "ielts" &&
    input.recommendedLevel === "gre" &&
    input.confidence < 0.9012
  ) {
    const estimatedVocab = getSoftTargetInBand(input, IELTS_UPPER_BOUNDARY_BAND, recentAverageScore);
    return {
      estimatedVocab,
      recommendedLevel: "ielts",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "ielts" &&
    input.confidence >= 0.9 &&
    input.confidence < 0.905 &&
    input.estimatedVocab >= 7600 &&
    input.estimatedVocab < 8400
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      IELTS_GRE_HYSTERESIS_RECOVERY_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: "ielts",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "ielts" &&
    input.confidence >= 0.903 &&
    input.confidence < 0.905 &&
    input.estimatedVocab >= 7000 &&
    input.estimatedVocab < 7600
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      IELTS_GRE_HYSTERESIS_RECOVERY_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: "ielts",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "ielts" &&
    input.confidence >= 0.9 &&
    input.confidence < 0.905 &&
    input.estimatedVocab >= 7000 &&
    input.estimatedVocab < 7600
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      IELTS_PRE_GRE_TRANSITION_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: "ielts",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "ielts" &&
    input.confidence >= 0.9 &&
    input.confidence < 0.91 &&
    input.estimatedVocab < 7600
  ) {
    const estimatedVocab = getSoftTargetInBand(input, IELTS_HIGH_RECOVERY_BAND, recentAverageScore);
    return {
      estimatedVocab,
      recommendedLevel: "ielts",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 84 &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "gre" &&
    input.confidence < 0.915 &&
    input.estimatedVocab < 8800
  ) {
    return {
      estimatedVocab: GRE_EARLY_ENTRY_CAP,
      recommendedLevel: getRecommendedLevel(GRE_EARLY_ENTRY_CAP),
    };
  }

  if (
    input.questionCount >= 84 &&
    input.questionCount < 90 &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "gre" &&
    input.confidence >= 0.91 &&
    input.estimatedVocab >= 8400 &&
    input.estimatedVocab < 8700
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      GRE_LATE_STABLE_ENTRY_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: "gre",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "ielts" &&
    input.recommendedLevel === "gre" &&
    input.confidence < 0.9015 &&
    input.estimatedVocab < 8000
  ) {
    const estimatedVocab = getSoftTargetInBand(input, IELTS_UPPER_BOUNDARY_BAND, recentAverageScore);
    return {
      estimatedVocab,
      recommendedLevel: "ielts",
    };
  }

  if (
    input.questionCount >= 80 &&
    input.questionCount < 90 &&
    input.currentLevel === "ielts" &&
    input.recommendedLevel === "gre" &&
    input.confidence >= 0.9012 &&
    input.confidence < 0.92 &&
    input.estimatedVocab >= 8000 &&
    input.estimatedVocab < 9500
  ) {
    const estimatedVocab = getSoftTargetInBand(input, IELTS_PRE_GRE_TRANSITION_BAND, recentAverageScore);
    return {
      estimatedVocab,
      recommendedLevel: "ielts",
    };
  }

  if (
    input.questionCount >= 100 &&
    input.startedLevel === "cet4" &&
    input.currentLevel === "cet6" &&
    input.recommendedLevel === "cet4" &&
    input.confidence >= 0.89 &&
    input.estimatedVocab >= 3900 &&
    input.estimatedVocab < 4500
  ) {
    const estimatedVocab = getSoftTargetInBand(
      input,
      CET4_TO_CET6_LATE_RECOVERY_BAND,
      recentAverageScore,
    );
    return {
      estimatedVocab,
      recommendedLevel: getRecommendedLevel(estimatedVocab),
    };
  }

  if (
    input.questionCount >= 100 &&
    input.startedLevel === "cet4" &&
    (input.currentLevel === "cet4" || input.currentLevel === "cet6") &&
    input.recommendedLevel === "cet4" &&
    input.confidence >= 0.89 &&
    input.estimatedVocab < 3600
  ) {
    const estimatedVocab = getSoftTargetInBand(input, CET4_LATE_RECOVERY_BAND, recentAverageScore);
    return {
      estimatedVocab,
      recommendedLevel: "cet4",
    };
  }

  if (
    input.questionCount >= 70 &&
    input.questionCount < 90 &&
    input.currentLevel === "gre" &&
    input.recommendedLevel === "gre" &&
    input.confidence < 0.92 &&
    input.estimatedVocab > GRE_MODERATE_CONFIDENCE_CAP &&
    recentAverageScore < 0.82
  ) {
    return {
      estimatedVocab: GRE_MODERATE_CONFIDENCE_CAP,
      recommendedLevel: "gre",
    };
  }

  const softBand = getEstimatedVocabSoftTargetBand(input, recentAverageScore);
  if (softBand === null) {
    return {
      estimatedVocab: input.estimatedVocab,
      recommendedLevel: input.recommendedLevel,
    };
  }

  const estimatedVocab = getSoftTargetInBand(input, softBand, recentAverageScore);
  return {
    estimatedVocab,
    recommendedLevel: getRecommendedLevel(estimatedVocab),
  };
}

function shouldPromoteLateGreRecovery(input: EstimatedVocabGuardrailInput): boolean {
  if (input.questionCount < 120 || input.currentLevel !== "gre" || input.recommendedLevel === "gre") {
    return false;
  }

  return getRecentHighLevelAverage(input.answers) >= 0.84;
}

function getRecentHighLevelAverage(answers: VocabAnswerRecord[]): number {
  const recentHighLevelAnswers = answers
    .filter((answer) => answer.level === "ielts" || answer.level === "gre")
    .slice(-16);
  if (recentHighLevelAnswers.length === 0) {
    return 0;
  }
  return recentHighLevelAnswers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentHighLevelAnswers.length;
}

function applyEstimatedVocabCeiling(input: EstimatedVocabGuardrailInput): number {
  const recentLevelAnswers = input.answers
    .filter((answer) => answer.level === input.currentLevel)
    .slice(-12);
  const recentAverageScore =
    recentLevelAnswers.length > 0
      ? recentLevelAnswers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentLevelAnswers.length
      : 0.5;
  return applyEstimatedVocabOutcome(input.estimatedVocab, input, recentAverageScore);
}

function applyEstimatedVocabOutcome(
  estimate: number,
  input: EstimatedVocabGuardrailInput,
  recentAverageScore: number,
): number {
  if (input.questionCount >= 100 && input.currentLevel === "gre" && input.recommendedLevel !== "gre") {
    return estimate;
  }

  const softBand = getEstimatedVocabSoftTargetBand(input, recentAverageScore);
  if (softBand !== null) {
    return getSoftTargetInBand(input, softBand, recentAverageScore);
  }

  const ceiling = getEstimatedVocabCeiling(input);
  return ceiling === null ? estimate : Math.min(estimate, ceiling);
}

function getSoftTargetInBand(
  input: EstimatedVocabGuardrailInput,
  band: SoftTargetBand,
  recentAverageScore: number,
): number {
  const progress = clamp((Math.min(input.questionCount, 120) - MIN_QUESTIONS) / (120 - MIN_QUESTIONS), 0, 1);
  const confidenceStrength = clamp((input.confidence - 0.88) / 0.04, 0, 1);
  const scoreStrength = clamp((recentAverageScore - 0.2) / 0.45, 0, 1);
  const strength = clamp(progress * 0.35 + confidenceStrength * 0.2 + scoreStrength * 0.15, 0, 0.7);
  return Math.round(band.min + (band.max - band.min) * strength);
}

function getEstimatedVocabSoftTargetBand(
  input: EstimatedVocabGuardrailInput,
  recentAverageScore: number,
): SoftTargetBand | null {
  if (input.recommendedLevel === "cet4") {
    if (
      input.currentLevel === "cet6" &&
      input.questionCount >= 100 &&
      input.confidence >= 0.89 &&
      input.estimatedVocab >= 3900
    ) {
      return CET4_TO_CET6_LATE_RECOVERY_BAND;
    }

    if (levelToIndex(input.currentLevel) > levelToIndex("cet4")) {
      return CET4_SOFT_TARGET_BAND;
    }

    if (
      input.currentLevel === "cet4" &&
      input.questionCount >= MIN_QUESTIONS &&
      input.questionCount < 90 &&
      input.confidence < 0.92 &&
      recentAverageScore <= 0.36
    ) {
      return CET4_STABLE_TARGET_BAND;
    }
  }

  if (
    input.recommendedLevel === "cet6" &&
    levelToIndex(input.currentLevel) >= levelToIndex("cet6") &&
    input.questionCount >= 74 &&
    input.estimatedVocab < 4900 &&
    input.confidence < 0.91
  ) {
    if (input.questionCount >= 100 && input.currentLevel === "cet6" && input.estimatedVocab >= 4000) {
      return CET4_TO_CET6_LATE_RECOVERY_BAND;
    }
    return CET4_SOFT_TARGET_BAND;
  }

  if (
    input.recommendedLevel === "cet6" &&
    levelToIndex(input.currentLevel) > levelToIndex("cet6") &&
    input.questionCount >= 75 &&
    input.estimatedVocab < 4900
  ) {
    return CET4_SOFT_TARGET_BAND;
  }

  if (
    input.recommendedLevel === "cet6" &&
    levelToIndex(input.currentLevel) >= levelToIndex("cet6") &&
    input.estimatedVocab < 5600 &&
    input.questionCount < 85 &&
    input.confidence < 0.92 &&
    recentAverageScore < 0.75
  ) {
    return CET6_SOFT_TARGET_BAND;
  }

  if (
    input.recommendedLevel === "ielts" &&
    input.currentLevel === "ielts" &&
    input.estimatedVocab < 6600 &&
    input.questionCount >= 68 &&
    input.questionCount < 80 &&
    input.confidence < 0.91 &&
    recentAverageScore < 0.58
  ) {
    return CET6_SOFT_TARGET_BAND;
  }

  if (
    input.recommendedLevel === "gre" &&
    input.currentLevel === "ielts" &&
    input.questionCount >= 65 &&
    input.questionCount < 80 &&
    input.confidence < 0.92 &&
    input.estimatedVocab < 9500
  ) {
    return IELTS_SOFT_TARGET_BAND;
  }

  return null;
}

function getLevelCeiling(level: VocabLevel): number {
  if (level === "cet4") {
    return 4499;
  }
  if (level === "cet6") {
    return 5999;
  }
  if (level === "ielts") {
    return 7999;
  }
  return LEVEL_WORD_TOTAL.gre;
}

function getEstimatedVocabCeiling(
  input: EstimatedVocabGuardrailInput,
): number | null {
  if (
    input.recommendedLevel === "ielts" &&
    levelToIndex(input.currentLevel) >= levelToIndex("ielts") &&
    input.estimatedVocab < 7200 &&
    input.questionCount >= 65 &&
    input.questionCount < 75 &&
    input.confidence < 0.92
  ) {
    return 6400;
  }

  if (
    input.recommendedLevel === "gre" &&
    levelToIndex(input.currentLevel) >= levelToIndex("ielts") &&
    input.estimatedVocab < 8600 &&
    input.questionCount >= 65 &&
    input.questionCount < 75 &&
    input.confidence < 0.92
  ) {
    return 6400;
  }

  return null;
}

function getEarlyFinishConservativePenalty(recommendedLevel: VocabLevel): number {
  if (recommendedLevel === "cet4") {
    return 0.22;
  }

  if (recommendedLevel === "cet6") {
    return 0.14;
  }

  return 0;
}

export function applyLowConfidenceResultPolicy(result: LowConfidenceResultInput): LowConfidenceResultOutput {
  const lowConfidenceResult = result.questionCount >= MAX_QUESTIONS && result.confidence < CONFIDENCE_TARGET;
  if (!lowConfidenceResult) {
    return {
      ...result,
      lowConfidenceResult: false,
    };
  }

  if (hasStrongAdvancedMasteryEvidence(result.answers || [], result.currentLevel || result.recommendedLevel, result)) {
    return {
      ...result,
      lowConfidenceResult: false,
    };
  }

  const confidenceGap = clamp(CONFIDENCE_TARGET - result.confidence, 0, CONFIDENCE_TARGET);
  const conservativeFactor = clamp(1 - confidenceGap * 1.1, LOW_CONFIDENCE_RESULT_MIN_FACTOR, 0.98);
  const cappedLevel = levelToIndex(result.recommendedLevel) > levelToIndex(LOW_CONFIDENCE_RESULT_CAP_LEVEL)
    ? LOW_CONFIDENCE_RESULT_CAP_LEVEL
    : result.recommendedLevel;
  const estimatedVocab = Math.min(
    Math.round(result.estimatedVocab * conservativeFactor),
    getLevelCeiling(cappedLevel)
  );

  return {
    ...result,
    estimatedVocab,
    recommendedLevel: getRecommendedLevel(estimatedVocab),
    lowConfidenceResult: true,
  };
}

function getRecentHighLevelAnswers(answers: VocabAnswerRecord[], level: VocabLevel): VocabAnswerRecord[] {
  const minimumLevelIndex = Math.max(levelToIndex(level), levelToIndex("ielts"));
  return answers.filter((answer) => levelToIndex(answer.level) >= minimumLevelIndex).slice(-24);
}

function getAdvancedMasteryConfidenceBonus(answers: VocabAnswerRecord[], level: VocabLevel, progress: number): number {
  if (levelToIndex(level) < levelToIndex("ielts")) {
    return 0;
  }

  const recentHighLevelAnswers = getRecentHighLevelAnswers(answers, level);
  if (recentHighLevelAnswers.length < 12) {
    return 0;
  }

  const accuracy = recentHighLevelAnswers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentHighLevelAnswers.length;
  const baseline = level === "gre" ? 0.9 : 0.88;
  if (accuracy < baseline) {
    return 0;
  }

  const masteryStrength = clamp((accuracy - baseline) / (1 - baseline), 0, 1);
  const maxBonus = level === "gre" ? 0.14 : 0.04;
  return maxBonus * progress * masteryStrength;
}

function hasStrongAdvancedMasteryEvidence(
  answers: VocabAnswerRecord[],
  level: VocabLevel,
  result: Pick<LowConfidenceResultInput, "confidence" | "estimatedVocab" | "recommendedLevel">
): boolean {
  if (levelToIndex(level) < levelToIndex("gre")) {
    return false;
  }
  if (result.confidence < 0.86) {
    return false;
  }
  if (result.estimatedVocab < 9000) {
    return false;
  }
  if (result.recommendedLevel !== "gre") {
    return false;
  }

  const recentHighLevelAnswers = getRecentHighLevelAnswers(answers, level);
  if (recentHighLevelAnswers.length < 16) {
    return false;
  }

  const accuracy = recentHighLevelAnswers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentHighLevelAnswers.length;
  return accuracy >= 0.94;
}

export function getSameLevelEdgeBias(state: Pick<VocabAssessmentState, "questionCount" | "currentLevel" | "answers">): "harder" | "easier" | null {
  if (state.questionCount < 40) {
    return null;
  }

  const unstableLevel = findMostUnstableLevel(state.answers);
  if (!unstableLevel || unstableLevel !== state.currentLevel) {
    return null;
  }

  const recentAtCurrentLevel = state.answers.filter((item) => item.level === state.currentLevel).slice(-2);
  if (recentAtCurrentLevel.length < 2) {
    return null;
  }

  const recentScore = recentAtCurrentLevel.reduce((sum, item) => sum + scoreAnswer(item), 0) / recentAtCurrentLevel.length;
  return recentScore >= 0.5 ? "harder" : "easier";
}

export function getUpperEdgeChallengeLevel(
  state: Pick<VocabAssessmentState, "questionCount" | "currentLevel" | "recommendedLevel" | "confidence">
): VocabLevel | null {
  const upperEdgeLevel = LEVEL_ORDER[levelToIndex(state.currentLevel) + 1] || null;
  if (!upperEdgeLevel) {
    return null;
  }
  if (state.questionCount < 90) {
    return null;
  }
  if (state.recommendedLevel !== state.currentLevel) {
    return null;
  }
  if (state.confidence < 0.84) {
    return null;
  }

  return upperEdgeLevel;
}

function getMixedConvergenceFocus(
  state: Pick<VocabAssessmentState, "questionCount" | "currentLevel" | "answers">
): { levels: VocabLevel[]; center: VocabLevel } | null {
  if (state.questionCount < 60) {
    return null;
  }

  const unstableLevel = findMostUnstableLevel(state.answers);
  if (!unstableLevel) {
    return null;
  }

  const center = unstableLevel as VocabLevel;
  const centerIndex = levelToIndex(center);
  const lower = LEVEL_ORDER[centerIndex - 1] || null;
  const higher = LEVEL_ORDER[centerIndex + 1] || null;
  const recentAtCenter = state.answers.filter((item) => item.level === center).slice(-6);
  if (recentAtCenter.length < 4) {
    return null;
  }

  const recentScore = recentAtCenter.reduce((sum, item) => sum + scoreAnswer(item), 0) / recentAtCenter.length;
  const prioritizedAdjacent = recentScore <= 0.5 ? [lower, higher] : [higher, lower];
  const levels = [center, ...prioritizedAdjacent, state.currentLevel]
    .filter((level): level is VocabLevel => Boolean(level))
    .filter((level, index, array) => array.indexOf(level) === index);

  return levels.length >= 2 ? { levels, center } : null;
}

function isClearlyStableLowLevelState(state: Pick<VocabAssessmentState, "questionCount" | "currentLevel" | "recommendedLevel" | "confidence" | "answers">): boolean {
  if (state.questionCount < LOW_LEVEL_EARLY_FINISH_MIN_QUESTIONS || state.questionCount >= MAX_QUESTIONS) {
    return false;
  }
  if (state.currentLevel !== "cet4" || state.recommendedLevel !== "cet4") {
    return false;
  }
  if (state.confidence < LOW_LEVEL_EARLY_FINISH_CONFIDENCE) {
    return false;
  }
  if (findMostUnstableLevel(state.answers) !== null) {
    return false;
  }

  const recentLowAnswers = state.answers.filter((item) => item.level === "cet4").slice(-12);
  if (recentLowAnswers.length < 8) {
    return false;
  }

  const averageScore = recentLowAnswers.reduce((sum, item) => sum + scoreAnswer(item), 0) / recentLowAnswers.length;
  return averageScore <= 0.3;
}

function buildOptions(
  seed: QuestionSeed,
  level: VocabLevel,
  bank: QuestionBank,
  options: { focusMeaning?: string; excludeMeanings?: string[]; correctAnswerIndex?: number } = {}
): string[] {
  const index = getQuestionBankIndex(bank);
  const target = toOptionMeaning(seed, seed.pos);
  if (NO_DISTRACTOR_MODE) {
    return [target];
  }
  const focus = options.focusMeaning || target;
  const excluded = new Set((options.excludeMeanings || []).slice(-20).map((item) => normalizeMeaningText(item)));
  const collectedNormalized = new Set<string>();
  const seenWords = new Set<string>();
  const targetNormalized = normalizeMeaningText(target);
  const targetIndex = clamp(options.correctAnswerIndex ?? 0, 0, 3);
  const windows = [
    { min: 0.08, max: 0.5 },
    { min: 0.04, max: 0.62 },
    { min: 0, max: 0.8 },
  ];
  const globalPool = index.allSorted.length > 64 ? shuffle(index.allSorted) : index.allSorted;
  const distractors: string[] = [];

  const tryCollect = (
    minSimilarity: number,
    maxSimilarity: number,
    controls: {
      allowSeenMeaning: boolean;
      enforceTargetDistance: boolean;
      enforceCrossDistance: boolean;
    }
  ) => {
    for (const entry of globalPool) {
      if (distractors.length >= 3) {
        return;
      }
      const wordKey = entry.word.toLowerCase();
      if (wordKey === seed.word.toLowerCase() || seenWords.has(wordKey)) {
        continue;
      }
      const value = toOptionMeaning(entry, entry.pos);
      const normalized = normalizeMeaningText(value);
      if (!normalized || normalized === targetNormalized) {
        continue;
      }
      if (collectedNormalized.has(normalized)) {
        continue;
      }
      if (!controls.allowSeenMeaning && excluded.has(normalized)) {
        continue;
      }
      if (controls.enforceTargetDistance && isOptionTooClose(value, focus)) {
        continue;
      }
      if (controls.enforceCrossDistance && distractors.some((item) => isOptionTooClose(item, value))) {
        continue;
      }
      const similarity = textSimilarity(value, focus);
      if (similarity < minSimilarity || similarity > maxSimilarity) {
        continue;
      }
      seenWords.add(wordKey);
      collectedNormalized.add(normalized);
      distractors.push(value);
    }
  };

  for (const window of windows) {
    tryCollect(window.min, window.max, {
      allowSeenMeaning: false,
      enforceTargetDistance: true,
      enforceCrossDistance: true,
    });
    if (distractors.length >= 3) {
      break;
    }
  }

  if (distractors.length < 3) {
    for (const entry of globalPool) {
      if (distractors.length >= 3) {
        break;
      }
      const wordKey = entry.word.toLowerCase();
      if (wordKey === seed.word.toLowerCase() || seenWords.has(wordKey)) {
        continue;
      }
      const value = toOptionMeaning(entry, entry.pos);
      const normalized = normalizeMeaningText(value);
      if (!normalized || normalized === targetNormalized) {
        continue;
      }
      if (excluded.has(normalized) || collectedNormalized.has(normalized)) {
        continue;
      }
      if (isOptionTooClose(value, focus) || distractors.some((item) => isOptionTooClose(item, value))) {
        continue;
      }
      seenWords.add(wordKey);
      collectedNormalized.add(normalized);
      distractors.push(value);
    }
  }

  if (distractors.length < 3) {
    tryCollect(0, 1, {
      allowSeenMeaning: true,
      enforceTargetDistance: true,
      enforceCrossDistance: true,
    });
  }

  if (distractors.length < 3) {
    tryCollect(0, 1, {
      allowSeenMeaning: true,
      enforceTargetDistance: true,
      enforceCrossDistance: false,
    });
  }

  if (distractors.length < 3) {
    tryCollect(0, 1, {
      allowSeenMeaning: true,
      enforceTargetDistance: false,
      enforceCrossDistance: false,
    });
  }

  if (distractors.length < 3) {
    return shuffle([target, ...distractors]).slice(0, Math.max(1, distractors.length + 1));
  }

  const shuffledDistractors = shuffle(distractors);
  const finalOptions = [...shuffledDistractors];
  finalOptions.splice(targetIndex, 0, target);
  return finalOptions;
}

function collectCandidatePool(
  level: VocabLevel,
  askedWords: string[],
  bank: QuestionBank,
  selectionState?: Pick<VocabAssessmentState, "questionCount" | "currentLevel" | "answers">,
  limit = Number.POSITIVE_INFINITY
): Array<{ seed: QuestionSeed; level: VocabLevel }> {
  const askedSet = new Set(askedWords.map((word) => word.toLowerCase()));
  const index = getQuestionBankIndex(bank);
  const levelIndex = levelToIndex(level);
  const mixedConvergenceFocus = selectionState ? getMixedConvergenceFocus(selectionState) : null;
  const orderedLevels: VocabLevel[] = mixedConvergenceFocus ? [...mixedConvergenceFocus.levels] : [level];
  const sameLevelEdgeBias = selectionState ? getSameLevelEdgeBias(selectionState) : null;
  for (let offset = 1; offset < LEVEL_ORDER.length; offset += 1) {
    const higher = LEVEL_ORDER[levelIndex + offset];
    const lower = LEVEL_ORDER[levelIndex - offset];
    if (sameLevelEdgeBias === "easier") {
      if (lower && !orderedLevels.includes(lower)) orderedLevels.push(lower);
      if (higher && !orderedLevels.includes(higher)) orderedLevels.push(higher);
    } else {
      if (higher && !orderedLevels.includes(higher)) orderedLevels.push(higher);
      if (lower && !orderedLevels.includes(lower)) orderedLevels.push(lower);
    }
  }

  const pool: Array<{ seed: QuestionSeed; level: VocabLevel }> = [];
  for (const candidateLevel of orderedLevels) {
    const uniqueByWord: QuestionSeed[] = [];
    if (
      sameLevelEdgeBias &&
      selectionState &&
      candidateLevel === level &&
      candidateLevel === selectionState.currentLevel
    ) {
      const seenWords = new Set<string>();
      for (const seed of bank[candidateLevel]) {
        const wordKey = seed.word.toLowerCase();
        if (askedSet.has(wordKey) || seenWords.has(wordKey)) {
          continue;
        }
        seenWords.add(wordKey);
        uniqueByWord.push(seed);
      }

      if (sameLevelEdgeBias === "harder") {
        const edgeCount = Math.max(1, Math.ceil(uniqueByWord.length / 3));
        uniqueByWord.unshift(...uniqueByWord.splice(Math.max(0, uniqueByWord.length - edgeCount)));
      }
    } else {
      let currentWord = "";
      let grouped: QuestionSeed[] = [];
      const flushGroup = () => {
        if (grouped.length === 0) {
          return;
        }
        const preferred = pickPreferredSeed(grouped);
        if (preferred) {
          uniqueByWord.push(preferred);
        }
        grouped = [];
      };

      for (const seed of index.byLevelWordSorted[candidateLevel]) {
        const wordKey = seed.word.toLowerCase();
        if (askedSet.has(wordKey)) {
          continue;
        }
        if (wordKey !== currentWord) {
          flushGroup();
          currentWord = wordKey;
        }
        grouped.push(seed);
      }
      flushGroup();
    }

    const candidateSeeds = uniqueByWord.length > limit ? shuffle(uniqueByWord).slice(0, limit) : uniqueByWord;
    for (const seed of candidateSeeds) {
      if (askedSet.has(seed.word.toLowerCase())) {
        continue;
      }
      pool.push({ seed, level: candidateLevel });
      if (pool.length >= limit) {
        return pool;
      }
    }
  }

  return pool;
}

function getRecentQuestionPoses(askedWords: string[], bank: QuestionBank): string[] {
  if (askedWords.length === 0) {
    return [];
  }
  const index = getQuestionBankIndex(bank);
  return askedWords
    .slice(-4)
    .map((word) => index.byWord.get(word.trim().toLowerCase())?.[0]?.pos)
    .map((pos) => normalizePosKey(pos))
    .filter(Boolean);
}

function violatesRecentPosLimit(candidatePos: string | undefined, recentPoses: string[]): boolean {
  const normalized = normalizePosKey(candidatePos);
  if (!normalized) {
    return false;
  }
  return recentPoses.filter((pos) => pos === normalized).length >= 3;
}

function scoreQuestionInformation(
  question: VocabQuestion,
  targetLevel: VocabLevel,
  seenOptionMeanings: string[] = []
): number {
  const normalizedSeen = new Set(seenOptionMeanings.map((item) => normalizeMeaningText(item)));
  const distractors = question.options.filter((item) => item !== question.correctMeaning);
  const levelDistancePenalty = Math.abs(levelToIndex(question.level) - levelToIndex(targetLevel)) * 0.2;
  const targetPos = (question.pos || "").trim().toLowerCase();

  const distractorScore = distractors.reduce((sum, distractor) => {
    const similarity = textSimilarity(distractor, question.correctMeaning);
    const similarityScore = 1 - Math.abs(similarity - 0.32);
    const unseenBonus = normalizedSeen.has(normalizeMeaningText(distractor)) ? 0 : 0.18;
    const samePosBonus = targetPos && extractPosTag(distractor) === targetPos ? 0.12 : 0;
    return sum + similarityScore + unseenBonus + samePosBonus;
  }, 0);

  const uniqueBonus = new Set(question.options.map((item) => normalizeMeaningText(item))).size === question.options.length ? 0.2 : 0;
  const reviewPenalty = question.source === "ai" ? 0.1 : 0;
  return distractorScore + uniqueBonus - levelDistancePenalty - reviewPenalty;
}

function hasAcceptableDistractorQuality(correctMeaning: string, options: string[]): boolean {
  const distractors = options.filter((item) => item !== correctMeaning);
  return distractors.length >= 3;
}

export function buildBankQuestion(
  level: VocabLevel,
  askedWords: string[],
  bank: QuestionBank = QUESTION_BANK,
  seenOptionMeanings: string[] = [],
  selectionState?: Pick<VocabAssessmentState, "questionCount" | "currentLevel" | "answers" | "recommendedLevel" | "confidence">
): VocabQuestion | null {
  const expectedOptionCount = NO_DISTRACTOR_MODE ? 1 : 4;
  const rankedCandidates = collectCandidatePool(level, askedWords, bank, selectionState, 24);
  const sameLevelEdgeBias = selectionState ? getSameLevelEdgeBias(selectionState) : null;
  const mixedConvergenceFocus = selectionState ? getMixedConvergenceFocus(selectionState) : null;
  const upperEdgeLevel = selectionState ? getUpperEdgeChallengeLevel(selectionState) : null;
  const shouldEncourageUpperEdge = !!upperEdgeLevel;
  const recentPoses = getRecentQuestionPoses(askedWords, bank);
  const eligibleCandidates = rankedCandidates.filter(({ seed }) => !violatesRecentPosLimit(seed.pos, recentPoses));
  const candidatesToUse = eligibleCandidates.length > 0 ? eligibleCandidates : rankedCandidates;
  let bestAccepted: { question: VocabQuestion; score: number } | null = null;
  let bestFallback: { question: VocabQuestion; score: number } | null = null;

  for (const [candidateIndex, { seed: candidate, level: candidateLevel }] of candidatesToUse.entries()) {
    const correctMeaning = toOptionMeaning(candidate, candidate.pos);
    const options = buildOptions(candidate, candidateLevel, bank, {
      excludeMeanings: seenOptionMeanings,
      correctAnswerIndex: askedWords.length % expectedOptionCount,
    });
    if (options.length !== expectedOptionCount) {
      continue;
    }

    const draftQuestion: VocabQuestion = {
      id: crypto.randomUUID(),
      level: candidateLevel,
      word: candidate.word,
      pos: candidate.pos,
      correctMeaning,
      options,
      explanation: candidate.explanation,
      source: "bank",
    };
    const edgeBiasBonus =
      sameLevelEdgeBias &&
      selectionState &&
      candidateLevel === level &&
      candidateLevel === selectionState.currentLevel
        ? Math.max(0, candidatesToUse.length - candidateIndex) * 0.3
        : 0;
    const mixedFocusBonus = mixedConvergenceFocus
      ? (() => {
          const focusIndex = mixedConvergenceFocus.levels.indexOf(candidateLevel);
          if (focusIndex === -1) {
            return -0.5;
          }
          if (candidateLevel === mixedConvergenceFocus.center) {
            return 1.2;
          }
          return Math.max(0.2, 0.8 - focusIndex * 0.2);
        })()
      : 0;
    const upperEdgeBonus = shouldEncourageUpperEdge && candidateLevel === upperEdgeLevel ? 1.6 : 0;
    const currentLevelPenalty = shouldEncourageUpperEdge && selectionState && candidateLevel === selectionState.currentLevel ? -0.45 : 0;
    const candidateScore = scoreQuestionInformation(draftQuestion, level, seenOptionMeanings) + edgeBiasBonus + mixedFocusBonus + upperEdgeBonus + currentLevelPenalty;

    if (!hasAcceptableDistractorQuality(correctMeaning, options)) {
      if (!bestFallback || candidateScore > bestFallback.score) {
        bestFallback = { question: draftQuestion, score: candidateScore };
      }
      continue;
    }

    if (!bestAccepted || candidateScore > bestAccepted.score) {
      bestAccepted = { question: draftQuestion, score: candidateScore };
    }
  }

  return bestAccepted?.question || bestFallback?.question || null;
}

export function shouldFinishTest(state: VocabAssessmentState): boolean {
  if (state.questionCount < MIN_QUESTIONS) {
    return false;
  }
  if (state.questionCount >= MAX_QUESTIONS) {
    return true;
  }
  if (isClearlyStableLowLevelState(state)) {
    return true;
  }
  if (state.confidence < CONFIDENCE_TARGET) {
    return false;
  }
  const unstable = findMostUnstableLevel(state.answers);
  return unstable === null;
}

export function isFinishReadyState(state: VocabAssessmentState): boolean {
  return state.questionCount >= MIN_QUESTIONS && state.questionCount < MAX_QUESTIONS && shouldFinishTest(state);
}

export function estimateRemainingQuestionRange(state: VocabAssessmentState): { min: number; max: number } {
  if (isFinishReadyState(state)) {
    return { min: 0, max: 3 };
  }

  const minimumRemaining = Math.max(0, MIN_QUESTIONS - state.questionCount);
  const maxBudgetRemaining = Math.max(0, MAX_QUESTIONS - state.questionCount);
  const gap = Math.max(0, CONFIDENCE_TARGET - state.confidence);
  const unstable = findMostUnstableLevel(state.answers);
  const instabilityBuffer = unstable ? 4 : 0;

  let range: { min: number; max: number };
  if (state.questionCount < MIN_QUESTIONS) {
    range = {
      min: minimumRemaining,
      max: minimumRemaining + 12 + instabilityBuffer,
    };
  } else if (gap > 0.12) {
    range = { min: 15, max: 28 + instabilityBuffer };
  } else if (gap > 0.08) {
    range = { min: 10, max: 20 + instabilityBuffer };
  } else if (gap > 0.05) {
    range = { min: 7, max: 15 + instabilityBuffer };
  } else if (gap > 0.03) {
    range = { min: 5, max: 11 + instabilityBuffer };
  } else if (gap > 0.015) {
    range = { min: 3, max: 8 + instabilityBuffer };
  } else {
    range = { min: 2, max: 6 + instabilityBuffer };
  }

  return {
    min: clamp(range.min, minimumRemaining, maxBudgetRemaining),
    max: clamp(Math.max(range.max, range.min), minimumRemaining, maxBudgetRemaining),
  };
}

export function getSessionStartLevel(previousVocabSize?: number, priorWeight = 0.2): VocabLevel {
  if (!previousVocabSize) {
    return "cet4";
  }
  const w = clamp(priorWeight, 0.1, 0.2);
  const blended = 3500 * (1 - w) + previousVocabSize * w;
  return getRecommendedLevel(blended);
}

export function getNextLevelAfterCalibration(
  state: VocabAssessmentState,
  answer: VocabAnswerRecord
): VocabLevel {
  if (state.questionCount < CALIBRATION_QUESTIONS) {
    const calibrationWindow = state.answers.slice(-2);
    if (
      calibrationWindow.length < 2 ||
      calibrationWindow.some((item) => item.isCorrect !== answer.isCorrect)
    ) {
      return state.currentLevel;
    }
    const currentIndex = levelToIndex(state.currentLevel);
    if (answer.isCorrect) {
      return indexToLevel(currentIndex + 1);
    }
    return indexToLevel(currentIndex - 1);
  }
  const adaptive = getDifficultyAfterAnswer(state, answer);
  if (state.questionCount >= MIN_QUESTIONS) {
    const unstable = findMostUnstableLevel([...state.answers, answer]);
    if (unstable) {
      return unstable;
    }
  }
  return adaptive;
}

export { estimateVocabMargin };

export function buildLevelBreakdown(vocabSize: number): Array<{ level: VocabLevel; total: number }> {
  return LEVEL_ORDER.map((level) => ({
    level,
    total: Math.round((LEVEL_WORD_TOTAL[level] / LEVEL_WORD_TOTAL.gre) * vocabSize),
  }));
}
