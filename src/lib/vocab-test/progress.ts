import type { VocabAnswerRecord, VocabAssessmentState } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const MIN_QUESTIONS = 50;
const MAX_QUESTIONS = 150;
const CONFIDENCE_TARGET = 0.9;
const LOW_LEVEL_EARLY_FINISH_MIN_QUESTIONS = 80;
const LOW_LEVEL_EARLY_FINISH_CONFIDENCE = 0.84;
const MIXED_LOW_BAND_FINISH_MIN_QUESTIONS = 110;
const MIXED_LOW_BAND_FINISH_CONFIDENCE = 0.88;
const UNSTABLE_DELTA_THRESHOLD = 0.1;
const CORRECT_OPTION_SCORE = 0.96;
const UNKNOWN_SCORE = 0.14;
const UNSURE_WRONG_SCORE = 0.26;
const QUESTION_PROGRESS_WEIGHT = 0.4;
const CONFIDENCE_PROGRESS_WEIGHT = 0.4;
const STABILITY_PROGRESS_WEIGHT = 0.2;

export const TEST_PROGRESS_POLICY = {
  minQuestions: MIN_QUESTIONS,
  maxQuestions: MAX_QUESTIONS,
  confidenceTarget: CONFIDENCE_TARGET,
  questionProgressWeight: QUESTION_PROGRESS_WEIGHT,
  confidenceProgressWeight: CONFIDENCE_PROGRESS_WEIGHT,
  stabilityProgressWeight: STABILITY_PROGRESS_WEIGHT,
} as const;

function scoreAnswer(answer: VocabAnswerRecord): number {
  if (answer.responseType === "unknown") {
    return UNKNOWN_SCORE;
  }
  if (answer.responseType === "unsure") {
    return UNSURE_WRONG_SCORE;
  }
  return answer.isCorrect ? CORRECT_OPTION_SCORE : 0;
}

function findMostUnstableLevel(answers: VocabAnswerRecord[]): string | null {
  let selected: { level: string; delta: number } | null = null;
  for (const level of ["cet4", "cet6", "ielts", "gre"] as const) {
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

function isClearlyStableLowLevelState(state: VocabAssessmentState): boolean {
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

function isConvergedMixedLowBandState(state: VocabAssessmentState): boolean {
  if (state.questionCount < MIXED_LOW_BAND_FINISH_MIN_QUESTIONS || state.questionCount >= MAX_QUESTIONS) {
    return false;
  }
  if (state.currentLevel !== "cet4" || state.recommendedLevel !== "cet4") {
    return false;
  }
  if (state.confidence < MIXED_LOW_BAND_FINISH_CONFIDENCE) {
    return false;
  }

  const unstableLevel = findMostUnstableLevel(state.answers);
  if (unstableLevel !== "cet4") {
    return false;
  }

  const recentLowAnswers = state.answers.filter((item) => item.level === "cet4").slice(-12);
  if (recentLowAnswers.length < 12) {
    return false;
  }

  const averageScore = recentLowAnswers.reduce((sum, item) => sum + scoreAnswer(item), 0) / recentLowAnswers.length;
  return averageScore >= 0.35 && averageScore <= 0.45;
}

export function isFinishReadyState(state: VocabAssessmentState): boolean {
  return canManuallyFinishState(state) && isStableEnoughToFinish(state);
}

export function canManuallyFinishState(state: VocabAssessmentState): boolean {
  if (state.questionCount < MIN_QUESTIONS || state.questionCount >= MAX_QUESTIONS) {
    return false;
  }

  if (state.currentLevel === "gre" && state.recommendedLevel !== "gre" && state.questionCount < 80) {
    return false;
  }

  return (
    state.confidence >= CONFIDENCE_TARGET ||
    isClearlyStableLowLevelState(state) ||
    isConvergedMixedLowBandState(state) ||
    isClearlyStableHighGreState(state) ||
    isLateRecoveringGreState(state) ||
    isLateConfirmedGreState(state)
  );
}

export function isStableEnoughToFinish(state: VocabAssessmentState): boolean {
  return state.questionCount >= MIN_QUESTIONS && findMostUnstableLevel(state.answers) === null;
}

export function estimateCompositeProgress(state: VocabAssessmentState): number {
  const questionProgress = clamp(state.questionCount / MIN_QUESTIONS, 0, 1);
  const confidenceProgress = clamp(state.confidence / CONFIDENCE_TARGET, 0, 1);
  const stabilityProgress = isStableEnoughToFinish(state) ? 1 : 0;

  return clamp(
    questionProgress * QUESTION_PROGRESS_WEIGHT +
      confidenceProgress * CONFIDENCE_PROGRESS_WEIGHT +
      stabilityProgress * STABILITY_PROGRESS_WEIGHT,
    0,
    1
  );
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

function isClearlyStableHighGreState(state: VocabAssessmentState): boolean {
  if (state.questionCount < 90) {
    return false;
  }

  if (state.currentLevel !== "gre" || state.recommendedLevel !== "gre") {
    return false;
  }

  if (state.confidence < 0.86 || state.estimatedVocab < 9000) {
    return false;
  }

  const recentHighLevelAnswers = state.answers
    .filter((answer) => answer.level === "ielts" || answer.level === "gre")
    .slice(-16);
  if (recentHighLevelAnswers.length < 16) {
    return false;
  }

  const averageScore =
    recentHighLevelAnswers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentHighLevelAnswers.length;
  return averageScore >= 0.9;
}

function isLateRecoveringGreState(state: VocabAssessmentState): boolean {
  if (state.questionCount < 120) {
    return false;
  }

  if (state.currentLevel !== "gre" || state.recommendedLevel === "gre") {
    return false;
  }

  const recentHighLevelAnswers = state.answers
    .filter((answer) => answer.level === "ielts" || answer.level === "gre")
    .slice(-16);
  if (recentHighLevelAnswers.length < 16) {
    return false;
  }

  const averageScore =
    recentHighLevelAnswers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentHighLevelAnswers.length;
  return averageScore >= 0.84;
}

function isLateConfirmedGreState(state: VocabAssessmentState): boolean {
  if (state.questionCount < 120) {
    return false;
  }

  if (state.currentLevel !== "gre" || state.recommendedLevel !== "gre" || state.estimatedVocab < 9000) {
    return false;
  }

  const recentHighLevelAnswers = state.answers
    .filter((answer) => answer.level === "ielts" || answer.level === "gre")
    .slice(-16);
  if (recentHighLevelAnswers.length < 16) {
    return false;
  }

  const averageScore =
    recentHighLevelAnswers.reduce((sum, answer) => sum + scoreAnswer(answer), 0) / recentHighLevelAnswers.length;
  return averageScore >= 0.84;
}
