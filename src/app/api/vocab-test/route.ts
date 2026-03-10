import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/lib/session";
import { getDBAdapter } from "@/lib/db";
import { stripPosPrefix } from "@/lib/meaning-clean";
import type { VocabAssessment, Word, Definition, VocabWordlist } from "@/lib/models";
import {
  applyFinalLevelPriorityAdjustment,
  applyLowConfidenceResultPolicy,
  adjustConfidenceForEarlySession,
  adjustConfidenceForLateSession,
  buildBankQuestion,
  TEST_POLICY,
  estimateConfidence,
  estimateVocabMargin,
  estimateVocabSize,
  getNextLevelAfterCalibration,
  getRecommendedLevel,
  getSessionStartLevel,
  resolveGuardedEstimatedVocab,
  shouldFinishTest,
  warmQuestionBankIndex,
} from "@/lib/vocab-test/engine";
import { canManuallyFinishState, isFinishReadyState, isStableEnoughToFinish } from "@/lib/vocab-test/progress";
import { generateRealtimeQuestion } from "@/lib/vocab-test/realtime";
import { LEVEL_ORDER, getBuiltInQuestionBank } from "@/lib/vocab-test/bank";
import { getCachedUserQuestionBank, loadUserQuestionBank, primeUserQuestionBank } from "@/lib/vocab-test/user-bank-cache";
import type { VocabAnswerRecord, VocabAssessmentState, VocabQuestion } from "@/lib/vocab-test/types";

type Action = "start" | "answer" | "prepare_next" | "exit" | "clear_history" | "abandon" | "finish" | "add_word";

const MAX_AI_RATIO = 0.2;
const latestCompletedEstimateCache = new Map<string, number | undefined>();
const builtInBankWarmup = getBuiltInQuestionBank()
  .then((bank) => warmQuestionBankIndex(bank))
  .catch(() => null);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function extractPosFromMeaning(raw: string): string | undefined {
  const trimmed = raw.trim();
  const bracket = trimmed.match(/^[【\[]([^】\]]+)[】\]]/u)?.[1]?.trim();
  if (bracket) {
    return bracket;
  }
  const prefix = trimmed.match(/^([a-z]{1,6}\.)\s*/iu)?.[1];
  return prefix?.toLowerCase();
}

function normalizeMeaningForCompare(raw: string): string {
  return raw.replace(/\s+/gu, " ").trim().toLowerCase();
}

function isQuestionPosConsistent(question: VocabQuestion): boolean {
  if (!Array.isArray(question.options) || question.options.length < 4) {
    return false;
  }
  const normalizedCorrect = normalizeMeaningForCompare(question.correctMeaning);
  return question.options.some((item) => normalizeMeaningForCompare(item) === normalizedCorrect);
}

function normalizeQuestionPosPrefixes(question?: VocabQuestion): VocabQuestion | undefined {
  if (!question) {
    return undefined;
  }

  const canonicalPos = question.pos?.trim() || extractPosFromMeaning(question.correctMeaning);
  const normalizedCorrect = question.correctMeaning.trim();
  const normalizedOptions = (question.options || [])
    .map((item) => item.trim())
    .filter((item, index, all) => all.indexOf(item) === index);

  const options = normalizedOptions.includes(normalizedCorrect)
    ? normalizedOptions
    : [normalizedCorrect, ...normalizedOptions];
  const boundedOptions = options.slice(0, 4);
  if (!boundedOptions.includes(normalizedCorrect)) {
    boundedOptions[0] = normalizedCorrect;
  }

  return {
    ...question,
    pos: canonicalPos,
    correctMeaning: normalizedCorrect,
    options: boundedOptions,
  };
}

function toState(assessment: VocabAssessment): VocabAssessmentState {
  return {
    sessionId: assessment.id,
    status: assessment.status,
    startedAt: assessment.startedAt,
    endedAt: assessment.endedAt,
    priorVocab: assessment.priorVocab,
    currentLevel: assessment.currentLevel,
    startedLevel: assessment.startedLevel,
    questionCount: assessment.questionCount,
    aiQuestionCount: assessment.aiQuestionCount,
    confidence: assessment.confidence,
    estimatedVocab: assessment.estimatedVocab,
    recommendedLevel: assessment.recommendedLevel,
    lowConfidenceResult: assessment.lowConfidenceResult || false,
    askedWords: assessment.askedWords,
    answers: assessment.answers as VocabAnswerRecord[],
    seenOptionMeanings: assessment.seenOptionMeanings || [],
    currentQuestion: normalizeQuestionPosPrefixes(assessment.currentQuestion as VocabQuestion | undefined),
    correctStreak: assessment.correctStreak,
  };
}

async function buildUserQuestionBank(userId: string) {
  const db = getDBAdapter();
  const imported = await db.findMany<VocabWordlist>(
    "vocab_wordlists",
    { userId },
    { orderBy: "updatedAt", order: "desc", limit: 4 }
  );

  if (imported.length === 0) {
    const builtIn = (await builtInBankWarmup) || (await getBuiltInQuestionBank());
    warmQuestionBankIndex(builtIn);
    return builtIn;
  }

  const latestByLevel = new Map<string, VocabWordlist>();
  for (const item of imported) {
    if (!latestByLevel.has(item.level)) {
      latestByLevel.set(item.level, item);
    }
  }

  const baseBank = (await builtInBankWarmup) || (await getBuiltInQuestionBank());
  const merged = { ...baseBank };
  for (const level of LEVEL_ORDER) {
    const custom = latestByLevel.get(level);
    if (custom && Array.isArray(custom.entries) && custom.entries.length > 0) {
      merged[level] = custom.entries;
    }
  }
  return warmQuestionBankIndex(merged);
}

async function getUserQuestionBank(userId: string) {
  const cached = getCachedUserQuestionBank(userId);
  if (cached) {
    return cached;
  }

  return loadUserQuestionBank(userId, () => buildUserQuestionBank(userId));
}

function warmUserQuestionBank(userId: string) {
  return primeUserQuestionBank(userId, () => buildUserQuestionBank(userId));
}

async function pickNextQuestion(state: VocabAssessmentState, userId: string) {
  const bank = await getUserQuestionBank(userId);
  const rejectedWords = new Set<string>();
  for (let i = 0; i < 24; i += 1) {
    const fromBank = buildBankQuestion(
      state.currentLevel,
      [...state.askedWords, ...Array.from(rejectedWords)],
      bank,
      state.seenOptionMeanings || [],
      state
    );
    if (!fromBank) {
      break;
    }
    const normalized = normalizeQuestionPosPrefixes(fromBank);
    if (normalized && isQuestionPosConsistent(normalized)) {
      return normalized;
    }
    rejectedWords.add(fromBank.word);
  }

  const maxAiQuestions = Math.floor(TEST_POLICY.maxQuestions * MAX_AI_RATIO);
  if (state.aiQuestionCount >= maxAiQuestions) {
    return null;
  }

  for (let i = 0; i < 3; i += 1) {
    const aiQuestion = await generateRealtimeQuestion(
      state.currentLevel,
      [...state.askedWords, ...Array.from(rejectedWords)],
      state.seenOptionMeanings || []
    );
    const normalized = normalizeQuestionPosPrefixes(aiQuestion || undefined);
    if (normalized && isQuestionPosConsistent(normalized)) {
      return normalized;
    }
  }

  return null;
}

async function saveWeakWords(userId: string, answers: VocabAnswerRecord[]) {
  const db = getDBAdapter();
  const weak = answers.filter((item) => item.responseType === "unsure" || item.responseType === "unknown" || !item.isCorrect);
  if (weak.length === 0) {
    return;
  }

  const grouped = new Map<
    string,
    { frequency: number; meanings: Array<{ normalizedMeaning: string; pos?: string }> }
  >();
  for (const item of weak) {
    const lemma = item.word.toLowerCase();
    const normalizedMeaning = stripPosPrefix(item.correctMeaning, item.pos);
    const existing = grouped.get(lemma);
    if (existing) {
      existing.frequency += 1;
      if (!existing.meanings.some((entry) => entry.normalizedMeaning === normalizedMeaning)) {
        existing.meanings.push({ normalizedMeaning, pos: item.pos });
      }
    } else {
      grouped.set(lemma, {
        frequency: 1,
        meanings: [{ normalizedMeaning, pos: item.pos }],
      });
    }
  }

  const existingWordMap = new Map<string, Word>();
  for (const lemma of grouped.keys()) {
    const existingWords = await db.findMany<Word>("words", { userId, lemma });
    if (existingWords[0]) {
      existingWordMap.set(lemma, existingWords[0]);
    }
  }

  const newWordPayloads: Array<Omit<Word, "id" | "createdAt" | "updatedAt">> = [];
  for (const [lemma, entry] of grouped.entries()) {
    if (!existingWordMap.has(lemma)) {
      newWordPayloads.push({
        type: "word",
        userId,
        documentId: "vocab-test",
        lemma,
        frequency: entry.frequency,
      });
    }
  }

  const createdWords = newWordPayloads.length > 0 ? await db.batchCreate<Word>("words", newWordPayloads) : [];
  for (const word of createdWords) {
    existingWordMap.set(word.lemma, word);
  }

  const wordUpdates = Array.from(grouped.entries())
    .filter(([lemma]) => existingWordMap.has(lemma) && !createdWords.some((item) => item.lemma === lemma))
    .map(([lemma, entry]) => {
      const word = existingWordMap.get(lemma)!;
      return {
        id: word.id,
        data: {
          frequency: (word.frequency || 0) + entry.frequency,
        },
      };
    });
  if (wordUpdates.length > 0) {
    await db.batchUpdate<Word>("words", wordUpdates);
  }

  const definitionCreates: Array<Omit<Definition, "id" | "createdAt" | "updatedAt">> = [];
  for (const [lemma, entry] of grouped.entries()) {
    const word = existingWordMap.get(lemma);
    if (!word) {
      continue;
    }
    const existingDefinitions = await db.findMany<Definition>("definitions", {
      userId,
      wordId: word.id,
    });
    const existingSenseSet = new Set(existingDefinitions.map((definition) => definition.senses[0]));
    for (const meaning of entry.meanings) {
      if (!existingSenseSet.has(meaning.normalizedMeaning)) {
        definitionCreates.push({
          type: "definition",
          userId,
          wordId: word.id,
          lemma,
          pos: meaning.pos,
          senses: [meaning.normalizedMeaning],
          source: "generated",
          model: "vocab-test",
          definitionVersion: "v1",
        });
        existingSenseSet.add(meaning.normalizedMeaning);
      }
    }
  }
  if (definitionCreates.length > 0) {
    await db.batchCreate<Definition>("definitions", definitionCreates);
  }
}

async function completeAssessment(
  db: ReturnType<typeof getDBAdapter>,
  sessionId: string,
  userId: string,
  answers: VocabAnswerRecord[],
  feedback: { isCorrect: boolean; correctMeaning: string }
) {
  await saveWeakWords(userId, answers);
  const completed = await db.update<VocabAssessment>("vocab_assessments", sessionId, {
    status: "completed",
    endedAt: new Date().toISOString(),
    currentQuestion: undefined,
  });
  return NextResponse.json({
    success: true,
    finished: true,
    feedback,
    state: toState(completed),
  });
}

async function getLatestCompletedEstimate(userId: string): Promise<number | undefined> {
  if (latestCompletedEstimateCache.has(userId)) {
    return latestCompletedEstimateCache.get(userId);
  }

  const db = getDBAdapter();
  const assessments = await db.findMany<VocabAssessment>(
    "vocab_assessments",
    { userId, type: "vocab_assessment", status: "completed" },
    { orderBy: "endedAt", order: "desc", limit: 1 }
  );
  const latest = assessments[0]?.estimatedVocab;
  latestCompletedEstimateCache.set(userId, latest);
  return latest;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.email!;
    const db = getDBAdapter();
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") || "history";
    void builtInBankWarmup;
    void warmUserQuestionBank(userId);

    if (mode === "current") {
      const current = await db.findMany<VocabAssessment>(
        "vocab_assessments",
        { userId, type: "vocab_assessment", status: "in_progress" },
        { orderBy: "updatedAt", order: "desc", limit: 1 }
      );
      if (!current[0]) {
        return NextResponse.json({ success: true, current: null });
      }

      let resumed = toState(current[0]);
      if (!resumed.currentQuestion || !isQuestionPosConsistent(resumed.currentQuestion)) {
        const nextQuestion = await pickNextQuestion(resumed, userId);
        if (nextQuestion) {
          const refreshed = await db.update<VocabAssessment>("vocab_assessments", current[0].id, {
            currentQuestion: nextQuestion,
          });
          resumed = toState(refreshed);
        }
      }

      return NextResponse.json({ success: true, current: resumed });
    }

    const history = await db.findMany<VocabAssessment>(
      "vocab_assessments",
      { userId, type: "vocab_assessment", status: "completed" },
      { orderBy: "endedAt", order: "asc", limit: 200 }
    );
    latestCompletedEstimateCache.set(userId, history.at(-1)?.estimatedVocab);

    return NextResponse.json({
      success: true,
      history: history.map((item) => ({
        id: item.id,
        endedAt: item.endedAt,
        estimatedVocab: item.estimatedVocab,
        margin: estimateVocabMargin(item.estimatedVocab, item.confidence),
        confidence: item.confidence,
        recommendedLevel: item.recommendedLevel,
        lowConfidenceResult: item.lowConfidenceResult || false,
      })),
    });
  } catch (error) {
    return NextResponse.json({ message: "Failed to get test data", error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.email!;
    const db = getDBAdapter();
    const body = await request.json().catch(() => ({}));
    const action = body?.action as Action | undefined;

    if (!action) {
      return NextResponse.json({ message: "Action is required" }, { status: 400 });
    }

    if (action === "clear_history") {
      const history = await db.findMany<VocabAssessment>("vocab_assessments", {
        userId,
        type: "vocab_assessment",
        status: "completed",
      });
      await db.batchDelete(
        "vocab_assessments",
        history.map((item) => item.id)
      );
      latestCompletedEstimateCache.delete(userId);
      return NextResponse.json({ success: true });
    }

    if (action === "start") {
      const existing = await db.findMany<VocabAssessment>(
        "vocab_assessments",
        { userId, type: "vocab_assessment", status: "in_progress" },
        { orderBy: "updatedAt", order: "desc", limit: 1 }
      );
      if (existing[0]) {
        let resumed = toState(existing[0]);
        if (!resumed.currentQuestion || !isQuestionPosConsistent(resumed.currentQuestion)) {
          const nextQuestion = await pickNextQuestion(resumed, userId);
          if (!nextQuestion) {
            return NextResponse.json({ message: "No question available" }, { status: 500 });
          }
          const refreshed = await db.update<VocabAssessment>("vocab_assessments", existing[0].id, {
            currentQuestion: nextQuestion,
          });
          resumed = toState(refreshed);
        }
        return NextResponse.json({ success: true, state: resumed, resumed: true });
      }

      const previousEstimate = await getLatestCompletedEstimate(userId);
      const startLevel = getSessionStartLevel(previousEstimate, 0.2);
      const initialState: Omit<VocabAssessment, "id" | "createdAt" | "updatedAt"> = {
        type: "vocab_assessment",
        userId,
        status: "in_progress",
        startedAt: new Date().toISOString(),
        priorVocab: previousEstimate,
        confidencePolicyVersion: 3,
        startedLevel: startLevel,
        currentLevel: startLevel,
        questionCount: 0,
        aiQuestionCount: 0,
        confidence: 0,
        estimatedVocab: 0,
        recommendedLevel: startLevel,
        lowConfidenceResult: false,
        askedWords: [],
        answers: [],
        seenOptionMeanings: [],
        correctStreak: 0,
      };

      const question = await pickNextQuestion(
        {
          sessionId: "pending-session",
          status: initialState.status,
          startedAt: initialState.startedAt,
          priorVocab: initialState.priorVocab,
          currentLevel: initialState.currentLevel,
          startedLevel: initialState.startedLevel,
          questionCount: initialState.questionCount,
          aiQuestionCount: initialState.aiQuestionCount,
          confidence: initialState.confidence,
          estimatedVocab: initialState.estimatedVocab,
          recommendedLevel: initialState.recommendedLevel,
          askedWords: initialState.askedWords,
          answers: initialState.answers as VocabAnswerRecord[],
          seenOptionMeanings: initialState.seenOptionMeanings,
          currentQuestion: undefined,
          correctStreak: initialState.correctStreak,
        },
        userId
      );
      if (!question) {
        return NextResponse.json({ message: "No question available" }, { status: 500 });
      }

      const created = await db.create<VocabAssessment>("vocab_assessments", {
        ...initialState,
        currentQuestion: question,
      });

      return NextResponse.json({ success: true, state: toState(created), resumed: false });
    }

    if (action === "abandon") {
      const sessionId = body?.sessionId as string | undefined;
      if (!sessionId) {
        return NextResponse.json({ message: "sessionId is required" }, { status: 400 });
      }

      const target = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
      if (!target || target.userId !== userId) {
        return NextResponse.json({ message: "Session not found" }, { status: 404 });
      }

      const updated = await db.update<VocabAssessment>("vocab_assessments", sessionId, {
        status: "abandoned",
        endedAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, state: toState(updated) });
    }

    if (action === "finish") {
      const sessionId = body?.sessionId as string | undefined;
      const forceFinish = body?.forceFinish === true;
      if (!sessionId) {
        return NextResponse.json({ message: "sessionId is required" }, { status: 400 });
      }

      const assessment = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
      if (!assessment || assessment.userId !== userId) {
        return NextResponse.json({ message: "Session not found" }, { status: 404 });
      }
      if (assessment.status !== "in_progress") {
        return NextResponse.json({ message: "Session already closed" }, { status: 400 });
      }

      const state = toState(assessment);
      if (!canManuallyFinishState(state)) {
        return NextResponse.json({ message: "Confidence target not reached" }, { status: 400 });
      }
      if (!isStableEnoughToFinish(state) && !forceFinish) {
        return NextResponse.json(
          {
            message: "Result is not stable enough yet",
            confirmationRequired: true,
            unstable: true,
          },
          { status: 409 }
        );
      }

      const last = state.answers[state.answers.length - 1];
      const feedback = {
        isCorrect: last?.isCorrect ?? false,
        correctMeaning: last?.correctMeaning ?? "",
      };
      latestCompletedEstimateCache.set(userId, state.estimatedVocab);
      return completeAssessment(db, sessionId, userId, state.answers, feedback);
    }

    if (action === "exit") {
      const sessionId = body?.sessionId as string | undefined;
      if (!sessionId) {
        return NextResponse.json({ message: "sessionId is required" }, { status: 400 });
      }
      const target = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
      if (!target || target.userId !== userId) {
        return NextResponse.json({ message: "Session not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true, state: toState(target), kept: true });
    }

    if (action === "add_word") {
      const sessionId = body?.sessionId as string | undefined;
      const questionId = body?.questionId as string | undefined;
      if (!sessionId || !questionId) {
        return NextResponse.json({ message: "sessionId and questionId are required" }, { status: 400 });
      }

      const assessment = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
      if (!assessment || assessment.userId !== userId) {
        return NextResponse.json({ message: "Session not found" }, { status: 404 });
      }

      const answers = (assessment.answers || []) as VocabAnswerRecord[];
      const answered = answers.find((item) => item.questionId === questionId);
      if (!answered) {
        return NextResponse.json({ message: "Question not answered yet" }, { status: 400 });
      }

      const lemma = answered.word.toLowerCase();
      const existingWords = await db.findMany<Word>("words", { userId, lemma });
      if (existingWords.length > 0) {
        return NextResponse.json({
          success: true,
          alreadyExists: true,
          wordId: existingWords[0].id,
        });
      }

      const createdWord = await db.create<Word>("words", {
        type: "word",
        userId,
        documentId: "vocab-test",
        lemma,
        frequency: 1,
      });

      const normalizedMeaning = stripPosPrefix(answered.correctMeaning, answered.pos);

      await db.create<Definition>("definitions", {
        type: "definition",
        userId,
        wordId: createdWord.id,
        lemma,
        pos: answered.pos,
        senses: [normalizedMeaning],
        source: "generated",
        model: "vocab-test",
        definitionVersion: "v1",
      });

      return NextResponse.json({
        success: true,
        added: true,
        wordId: createdWord.id,
      });
    }

    if (action === "answer") {
      const sessionId = body?.sessionId as string | undefined;
      const selectedMeaning = body?.selectedMeaning === null ? null : (body?.selectedMeaning as string | undefined);
      const choiceType = body?.choiceType as "option" | "unsure" | "unknown" | undefined;
      if (!sessionId || !choiceType) {
        return NextResponse.json({ message: "sessionId and choiceType are required" }, { status: 400 });
      }

      const assessment = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
      if (!assessment || assessment.userId !== userId) {
        return NextResponse.json({ message: "Session not found" }, { status: 404 });
      }
      if (assessment.status !== "in_progress") {
        return NextResponse.json({ message: "Session already closed" }, { status: 400 });
      }

      const state = toState(assessment);
      const question = state.currentQuestion;
      if (!question) {
        return NextResponse.json({ message: "No active question" }, { status: 400 });
      }

      const isCorrect = choiceType === "option" && selectedMeaning === question.correctMeaning;
      const knew = choiceType !== "unknown";
      const answer: VocabAnswerRecord = {
        questionId: question.id,
        word: question.word,
        pos: question.pos,
        level: question.level,
        responseType: choiceType,
        correctMeaning: question.correctMeaning,
        selectedMeaning: choiceType === "unknown" ? null : selectedMeaning || null,
        knew,
        isCorrect,
        explanation: question.explanation,
        answeredAt: new Date().toISOString(),
      };

      const answers = [...state.answers, answer];
      const askedWords = Array.from(new Set([...state.askedWords, question.word]));
      const seenOptionMeanings = Array.from(
        new Set([...(state.seenOptionMeanings || []), ...question.options])
      );
      const nextLevel = getNextLevelAfterCalibration(state, answer);
      const rawEstimatedVocab = estimateVocabSize(answers, state.priorVocab);
      const rawConfidence = estimateConfidence(answers, state.priorVocab);
      const confidence = assessment.confidencePolicyVersion === 3
        ? adjustConfidenceForLateSession(
            adjustConfidenceForEarlySession(rawConfidence, state.questionCount + 1),
            state.questionCount + 1,
            nextLevel,
            answers
          )
        : rawConfidence;
      const guardedEstimate = resolveGuardedEstimatedVocab({
        questionCount: state.questionCount + 1,
        estimatedVocab: rawEstimatedVocab,
        confidence,
        currentLevel: nextLevel,
        startedLevel: state.startedLevel,
        answers,
      });
      const estimatedVocab = guardedEstimate.estimatedVocab;
      const recommendedLevel = getRecommendedLevel(estimatedVocab);
      const resultPolicy = applyLowConfidenceResultPolicy({
        questionCount: state.questionCount + 1,
        confidence,
        estimatedVocab,
        recommendedLevel,
        currentLevel: nextLevel,
        answers,
      });
      const finalLevelPriority = applyFinalLevelPriorityAdjustment({
        questionCount: state.questionCount + 1,
        confidence: resultPolicy.confidence,
        estimatedVocab: resultPolicy.estimatedVocab,
        recommendedLevel: resultPolicy.recommendedLevel,
        currentLevel: nextLevel,
        startedLevel: state.startedLevel,
        answers,
      });
      const nextState: Partial<VocabAssessment> = {
        answers,
        askedWords,
        seenOptionMeanings,
        questionCount: state.questionCount + 1,
        aiQuestionCount: state.aiQuestionCount + (question.source === "ai" ? 1 : 0),
        currentLevel: nextLevel,
        confidence: resultPolicy.confidence,
        estimatedVocab: finalLevelPriority.estimatedVocab,
        recommendedLevel: finalLevelPriority.recommendedLevel,
        lowConfidenceResult: resultPolicy.lowConfidenceResult,
        correctStreak: isCorrect ? state.correctStreak + 1 : 0,
        currentQuestion: undefined,
      };

      const baseUpdated = await db.update<VocabAssessment>("vocab_assessments", sessionId, nextState);
      let updatedState = toState(baseUpdated);

      const effectiveConfidence = Math.max(updatedState.confidence, state.confidence);
      const finishState = { ...updatedState, confidence: effectiveConfidence };
      const shouldFinish = isFinishReadyState(finishState) || shouldFinishTest(updatedState);
      const reachedMaxQuestions = updatedState.questionCount >= TEST_POLICY.maxQuestions;
      const reachedConfidenceTarget = canManuallyFinishState(finishState) && !reachedMaxQuestions;

      if (reachedMaxQuestions) {
        return completeAssessment(
          db,
          sessionId,
          userId,
          answers,
          {
            isCorrect,
            correctMeaning: question.correctMeaning,
          }
        );
      }

      return NextResponse.json({
        success: true,
        finished: false,
        readyToFinish: reachedConfidenceTarget,
        requiresStabilityConfirmation: reachedConfidenceTarget && !isFinishReadyState(finishState),
        feedback: {
          isCorrect,
          correctMeaning: question.correctMeaning,
        },
        state: updatedState,
      });
    }

    if (action === "prepare_next") {
      const sessionId = body?.sessionId as string | undefined;
      if (!sessionId) {
        return NextResponse.json({ message: "sessionId is required" }, { status: 400 });
      }

      const assessment = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
      if (!assessment || assessment.userId !== userId) {
        return NextResponse.json({ message: "Session not found" }, { status: 404 });
      }
      if (assessment.status !== "in_progress") {
        return NextResponse.json({ message: "Session already closed" }, { status: 400 });
      }

      const state = toState(assessment);
      if (state.currentQuestion && isQuestionPosConsistent(state.currentQuestion)) {
        return NextResponse.json({ success: true, state });
      }

      const nextQuestion = await pickNextQuestion(state, userId);
      if (!nextQuestion) {
        if (state.questionCount < TEST_POLICY.maxQuestions && state.confidence < TEST_POLICY.confidenceTarget) {
          return NextResponse.json(
            { message: "Question bank exhausted before reaching confidence target" },
            { status: 500 }
          );
        }
        return NextResponse.json({ success: true, state });
      }

      const withQuestion = await db.update<VocabAssessment>("vocab_assessments", sessionId, {
        currentQuestion: nextQuestion,
      });

      return NextResponse.json({ success: true, state: toState(withQuestion) });
    }

    return NextResponse.json({ message: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Vocab test action failed",
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
