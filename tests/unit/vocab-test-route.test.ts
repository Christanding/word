import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/vocab-test/route";
import { getDBAdapter } from "@/lib/db";
import { resetMockDBAdapter } from "@/lib/db/mock";
import type { Definition, VocabAssessment, Word } from "@/lib/models";

const currentUserEmail = "vocab-route@example.com";

vi.mock("@/lib/session", () => ({
  getSessionData: vi.fn(async () => ({ isLoggedIn: true, email: currentUserEmail })),
}));

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/vocab-test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function getRequest(mode: "history" | "current"): NextRequest {
  return new NextRequest(`http://localhost/api/vocab-test?mode=${mode}`);
}

describe.sequential("vocab-test route", () => {
  const userId = currentUserEmail;

  beforeEach(() => {
    resetMockDBAdapter();
    delete process.env.VOCAB_IMPORT_TOKEN;
  });

  it("start: should create in-progress session with current question", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    expect(startRes.status).toBe(200);
    const startData = await startRes.json();
    expect(startData.success).toBe(true);
    expect(startData.state.status).toBe("in_progress");
    expect(startData.state.currentQuestion).toBeDefined();
    expect(startData.state).not.toHaveProperty("reviewQueue");

    const db = getDBAdapter();
    const saved = await db.findById<VocabAssessment>("vocab_assessments", startData.state.sessionId);
    expect(saved?.confidencePolicyVersion).toBe(3);
  });

  it("start: should avoid extra update when creating a fresh session", async () => {
    const db = getDBAdapter();
    const existing = await db.findMany<VocabAssessment>("vocab_assessments", { userId });
    await Promise.all(existing.map((item) => db.delete("vocab_assessments", item.id)));
    const updateSpy = vi.spyOn(db, "update");

    const startRes = await POST(postRequest({ action: "start" }));
    expect(startRes.status).toBe(200);

    const startData = await startRes.json();
    expect(startData.success).toBe(true);
    expect(startData.resumed).toBe(false);
    expect(startData.state.currentQuestion).toBeDefined();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("start(resume): should normalize stale question options with missing POS prefix", async () => {
    const db = getDBAdapter();
    const created = await db.create<VocabAssessment>("vocab_assessments", {
      type: "vocab_assessment",
      userId,
      status: "in_progress",
      startedAt: "2026-01-01T00:00:00.000Z",
      confidencePolicyVersion: 1,
      startedLevel: "cet6",
      currentLevel: "cet6",
      questionCount: 12,
      aiQuestionCount: 0,
      confidence: 0.41,
      estimatedVocab: 5200,
      recommendedLevel: "cet6",
      lowConfidenceResult: false,
      askedWords: ["disparage"],
      answers: [],
      seenOptionMeanings: [],
      correctStreak: 0,
      currentQuestion: {
        id: "q-stale-1",
        level: "cet6",
        word: "disparage",
        pos: "v.",
        correctMeaning: "轻视；贬低；诽谤",
        options: [
          "【v.】相似；类似",
          "【v.】调整；使适应于；校准",
          "【v.】认出；认可；承认；公认",
          "轻视；贬低；诽谤",
        ],
        explanation: "mock stale question",
        source: "bank",
      },
    });

    expect(created.currentQuestion?.options[3].includes("轻视")).toBe(true);

    const resumeRes = await POST(postRequest({ action: "start" }));
    expect(resumeRes.status).toBe(200);
    const resumeData = await resumeRes.json();
    expect(resumeData.success).toBe(true);
    expect(resumeData.resumed).toBe(true);

    const resumedOptions = resumeData.state.currentQuestion.options as string[];
    expect(resumedOptions).toHaveLength(4);
    expect(resumedOptions).toContain(resumeData.state.currentQuestion.correctMeaning);
  });

  it("start(resume): should replace stale question when option POS conflicts", async () => {
    const db = getDBAdapter();
    await db.create<VocabAssessment>("vocab_assessments", {
      type: "vocab_assessment",
      userId,
      status: "in_progress",
      startedAt: "2026-01-01T00:00:00.000Z",
      confidencePolicyVersion: 1,
      startedLevel: "cet4",
      currentLevel: "cet4",
      questionCount: 6,
      aiQuestionCount: 0,
      confidence: 0.2,
      estimatedVocab: 3600,
      recommendedLevel: "cet4",
      lowConfidenceResult: false,
      askedWords: [],
      answers: [],
      seenOptionMeanings: [],
      correctStreak: 0,
      currentQuestion: {
        id: "q-stale-2",
        level: "cet4",
        word: "coupon",
        pos: "n.",
        correctMeaning: "【n.】息票；票券",
        options: [
          "【n.】息票；利息单；联票",
          "【adj.】突然的；唐突的；陡峭的",
          "【n.】凭证；代金券",
          "【v.】废止；革除；消灭",
        ],
        explanation: "mock inconsistent stale question",
        source: "bank",
      },
    });

    const resumeRes = await POST(postRequest({ action: "start" }));
    expect(resumeRes.status).toBe(200);
    const resumeData = await resumeRes.json();
    expect(resumeData.success).toBe(true);
    expect(resumeData.resumed).toBe(true);

    const question = resumeData.state.currentQuestion as {
      pos: string;
      options: string[];
      correctMeaning: string;
    };
    expect(question.options).toHaveLength(4);
    expect(question.options).toContain(question.correctMeaning);
  });

  it("answer: should return feedback and keep session running before finish", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const state = startData.state as {
      sessionId: string;
      currentQuestion: { options: string[] };
    };

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId: state.sessionId,
        choiceType: "option",
        selectedMeaning: state.currentQuestion.options[0],
      })
    );

    expect(answerRes.status).toBe(200);
    const answerData = await answerRes.json();
    expect(answerData.success).toBe(true);
    expect(answerData.feedback).toBeDefined();
    expect(answerData.feedback).not.toHaveProperty("explanation");
    expect(answerData.finished).toBe(false);
    expect(answerData.state.status).toBe("in_progress");
    expect(answerData.state.currentQuestion).toBeUndefined();
  });

  it("answer: should keep early confidence at or below the new-session cap", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const state = startData.state as { sessionId: string; currentQuestion: { correctMeaning: string } };

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId: state.sessionId,
        choiceType: "option",
        selectedMeaning: state.currentQuestion.correctMeaning,
      })
    );

    expect(answerRes.status).toBe(200);
    const answerData = await answerRes.json();
    expect(answerData.state.confidence).toBeLessThanOrEqual(0.68);
  });

  it("answer: unsure should stay wrong, keep knew=true, and not enqueue immediate reviews", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const state = startData.state as {
      sessionId: string;
    };

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId: state.sessionId,
        choiceType: "unsure",
        selectedMeaning: null,
      })
    );

    expect(answerRes.status).toBe(200);
    const answerData = await answerRes.json();
    expect(answerData.success).toBe(true);
    expect(answerData.feedback.isCorrect).toBe(false);
    expect(answerData.state).not.toHaveProperty("reviewQueue");

    const db = getDBAdapter();
    const saved = await db.findById<VocabAssessment>("vocab_assessments", state.sessionId);
    const lastAnswer = saved?.answers[saved.answers.length - 1];
    expect(lastAnswer.responseType).toBe("unsure");
    expect(lastAnswer.knew).toBe(true);
    expect(lastAnswer.isCorrect).toBe(false);
    expect(lastAnswer.selectedMeaning).toBeNull();
  });

  it("prepare_next: should load next question after answer response", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const state = startData.state as {
      sessionId: string;
      currentQuestion: { options: string[] };
    };

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId: state.sessionId,
        choiceType: "option",
        selectedMeaning: state.currentQuestion.options[0],
      })
    );
    expect(answerRes.status).toBe(200);

    const nextRes = await POST(postRequest({ action: "prepare_next", sessionId: state.sessionId }));
    expect(nextRes.status).toBe(200);
    const nextData = await nextRes.json();
    expect(nextData.success).toBe(true);
    expect(nextData.state.currentQuestion).toBeDefined();
    expect(nextData.state.status).toBe("in_progress");
  });

  it("get(current): should restore missing current question for in-progress session", async () => {
    const db = getDBAdapter();
    const created = await db.create<VocabAssessment>("vocab_assessments", {
      type: "vocab_assessment",
      userId,
      status: "in_progress",
      startedAt: "2026-01-01T00:00:00.000Z",
      confidencePolicyVersion: 1,
      startedLevel: "cet6",
      currentLevel: "cet6",
      questionCount: 12,
      aiQuestionCount: 0,
      confidence: 0.41,
      estimatedVocab: 5200,
      recommendedLevel: "cet6",
      lowConfidenceResult: false,
      askedWords: ["disparage"],
      answers: [],
      seenOptionMeanings: [],
      correctStreak: 0,
      currentQuestion: undefined,
    });

    const currentRes = await GET(getRequest("current"));
    expect(currentRes.status).toBe(200);

    const currentData = await currentRes.json();
    expect(currentData.success).toBe(true);
    expect(currentData.current.currentQuestion).toBeDefined();

    const refreshed = await db.findById<VocabAssessment>("vocab_assessments", created.id);
    expect(refreshed?.currentQuestion).toBeDefined();
  });

  it("exit: should keep in-progress session without abandoning", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();

    const exitRes = await POST(
      postRequest({ action: "exit", sessionId: startData.state.sessionId })
    );
    expect(exitRes.status).toBe(200);

    const exitData = await exitRes.json();
    expect(exitData.success).toBe(true);
    expect(exitData.kept).toBe(true);
    expect(exitData.state.status).toBe("in_progress");
  });

  it("abandon: should close session as abandoned", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();

    const abandonRes = await POST(
      postRequest({ action: "abandon", sessionId: startData.state.sessionId })
    );
    expect(abandonRes.status).toBe(200);

    const abandonData = await abandonRes.json();
    expect(abandonData.success).toBe(true);
    expect(abandonData.state.status).toBe("abandoned");
    expect(abandonData.state.endedAt).toBeTruthy();
  });

  it("clear_history + history: should clear completed records and return empty trend", async () => {
    const db = getDBAdapter();
    await db.create<VocabAssessment>("vocab_assessments", {
      type: "vocab_assessment",
      userId,
      status: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      confidencePolicyVersion: 1,
      endedAt: "2026-01-01T00:10:00.000Z",
      startedLevel: "cet4",
      currentLevel: "cet6",
      questionCount: 60,
      aiQuestionCount: 3,
      confidence: 0.92,
      estimatedVocab: 5200,
      recommendedLevel: "cet6",
      lowConfidenceResult: false,
      askedWords: ["assess"],
      answers: [],
      seenOptionMeanings: [],
      correctStreak: 0,
    });

    const clearRes = await POST(postRequest({ action: "clear_history" }));
    expect(clearRes.status).toBe(200);
    const clearData = await clearRes.json();
    expect(clearData.success).toBe(true);

    const historyRes = await GET(getRequest("history"));
    expect(historyRes.status).toBe(200);
    const historyData = await historyRes.json();
    expect(historyData.success).toBe(true);
    expect(historyData.history).toEqual([]);
  });

  it("finish + weak words: should insert unknown/wrong word into words and definitions", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const sessionId = startData.state.sessionId as string;

    const db = getDBAdapter();
    const existing = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
    expect(existing).toBeTruthy();

    await db.update<VocabAssessment>("vocab_assessments", sessionId, {
      questionCount: 149,
      currentQuestion: existing!.currentQuestion,
    });

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId,
        choiceType: "unknown",
        selectedMeaning: null,
      })
    );
    expect(answerRes.status).toBe(200);
    const answerData = await answerRes.json();
    expect(answerData.success).toBe(true);
    expect(answerData.finished).toBe(true);
    expect(answerData.state.status).toBe("completed");

    const words = await db.findMany<Word>("words", {
      userId,
      lemma: existing!.currentQuestion.word.toLowerCase(),
    });
    expect(words.length).toBeGreaterThan(0);

    const definitions = await db.findMany<Definition>("definitions", {
      userId,
      wordId: words[0].id,
    });
    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions[0].pos).toBe(existing!.currentQuestion.pos);
    expect(definitions[0].senses[0]).toBe(existing!.currentQuestion.correctMeaning);
  });

  it("answer: should finish at 150 with a conservative low-confidence result flag", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const sessionId = startData.state.sessionId as string;

    const db = getDBAdapter();
    const existing = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
    expect(existing).toBeTruthy();

    await db.update<VocabAssessment>("vocab_assessments", sessionId, {
      priorVocab: 13000,
      questionCount: 149,
      currentQuestion: existing!.currentQuestion,
      answers: Array.from({ length: 149 }).map((_, idx) => ({
        questionId: `q-mixed-${idx}`,
        word: `mixed-${idx}`,
        pos: "n.",
        level: idx % 4 === 0 ? "gre" : idx % 4 === 1 ? "ielts" : idx % 4 === 2 ? "cet6" : "cet4",
        responseType: idx % 3 === 0 ? "unknown" : "option",
        correctMeaning: "【n.】模拟",
        selectedMeaning: idx % 3 === 0 ? null : idx % 2 === 0 ? "【n.】模拟" : "【n.】错误",
        knew: idx % 3 !== 0,
        isCorrect: idx % 3 !== 0 && idx % 2 === 0,
        explanation: "",
        answeredAt: new Date().toISOString(),
      })),
    });

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId,
        choiceType: "unknown",
        selectedMeaning: null,
      })
    );

    expect(answerRes.status).toBe(200);
    const answerData = await answerRes.json();
    expect(answerData.success).toBe(true);
    expect(answerData.finished).toBe(true);
    expect(answerData.state.status).toBe("completed");
    expect(answerData.state.lowConfidenceResult).toBe(true);
    expect(answerData.state.confidence).toBeLessThan(0.9);
    expect(answerData.state.recommendedLevel).toBe("cet6");
    expect(answerData.state.estimatedVocab).toBeLessThanOrEqual(5999);
  });

  it("answer: should keep strong gre mastery sessions out of low-confidence fallback at 150", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const sessionId = startData.state.sessionId as string;

    const db = getDBAdapter();
    const existing = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
    expect(existing).toBeTruthy();

    await db.update<VocabAssessment>("vocab_assessments", sessionId, {
      priorVocab: 13000,
      currentLevel: "gre",
      questionCount: 149,
      currentQuestion: {
        ...existing!.currentQuestion,
        level: "gre",
      },
      answers: Array.from({ length: 149 }).map((_, idx) => ({
        questionId: `q-gre-${idx}`,
        word: `gre-${idx}`,
        pos: "n.",
        level: idx < 145 ? "gre" : idx === 145 ? "ielts" : idx === 146 ? "cet6" : "cet4",
        responseType: "option",
        correctMeaning: "【n.】模拟",
        selectedMeaning: "【n.】模拟",
        knew: true,
        isCorrect: true,
        explanation: "",
        answeredAt: new Date().toISOString(),
      })),
    });

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId,
        choiceType: "option",
        selectedMeaning: existing!.currentQuestion.correctMeaning,
      })
    );

    expect(answerRes.status).toBe(200);
    const answerData = await answerRes.json();
    expect(answerData.success).toBe(true);
    expect(answerData.finished).toBe(true);
    expect(answerData.state.lowConfidenceResult).toBe(false);
    expect(answerData.state.estimatedVocab).toBeGreaterThan(5999);
  });

  it("answer: when confidence reaches target before 150, should return readyToFinish instead of auto-finish", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const sessionId = startData.state.sessionId as string;

    const db = getDBAdapter();
    const existing = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
    expect(existing).toBeTruthy();

    await db.update<VocabAssessment>("vocab_assessments", sessionId, {
      questionCount: 79,
      confidence: 0.901,
      currentLevel: "cet6",
      estimatedVocab: 6100,
      recommendedLevel: "cet6",
      answers: Array.from({ length: 80 }).map((_, idx) => ({
        questionId: `q-${idx}`,
        word: "mock",
        pos: "n.",
        level: "cet6",
        responseType: "option",
        correctMeaning: "【n.】模拟",
        selectedMeaning: "【n.】模拟",
        knew: true,
        isCorrect: true,
        explanation: "",
        answeredAt: new Date().toISOString(),
      })),
      currentQuestion: existing!.currentQuestion,
    });

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId,
        choiceType: "option",
        selectedMeaning: existing!.currentQuestion.correctMeaning,
      })
    );

    expect(answerRes.status).toBe(200);
    const answerData = await answerRes.json();
    expect(answerData.success).toBe(true);
    expect(answerData.finished).toBe(false);
    expect(answerData.readyToFinish).toBe(true);
    expect(answerData.feedback).not.toHaveProperty("explanation");
    expect(answerData.state.status).toBe("in_progress");
  });

  it("answer: should allow readyToFinish for clearly stable low-level sessions before 150", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const sessionId = startData.state.sessionId as string;

    const db = getDBAdapter();
    const existing = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
    expect(existing).toBeTruthy();

    await db.update<VocabAssessment>("vocab_assessments", sessionId, {
      questionCount: 83,
      confidence: 0.84,
      currentLevel: "cet4",
      recommendedLevel: "cet4",
      estimatedVocab: 2200,
      answers: Array.from({ length: 83 }).map((_, idx) => ({
        questionId: `q-low-${idx}`,
        word: `low-${idx}`,
        pos: "n.",
        level: "cet4",
        responseType: idx % 3 === 0 ? "unknown" : "option",
        correctMeaning: "【n.】模拟",
        selectedMeaning: idx % 3 === 0 ? null : "【n.】错误",
        knew: false,
        isCorrect: false,
        explanation: "",
        answeredAt: new Date().toISOString(),
      })),
      currentQuestion: {
        ...existing!.currentQuestion,
        level: "cet4",
      },
    });

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId,
        choiceType: "unknown",
        selectedMeaning: null,
      })
    );

    expect(answerRes.status).toBe(200);
    const answerData = await answerRes.json();
    expect(answerData.success).toBe(true);
    expect(answerData.finished).toBe(false);
    expect(answerData.readyToFinish).toBe(true);
    expect(answerData.state.recommendedLevel).toBe("cet4");
    expect(answerData.state.lowConfidenceResult).toBe(false);
  });

  it("answer: should allow readyToFinish for converged mixed cet4 sessions before 150", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const sessionId = startData.state.sessionId as string;

    const db = getDBAdapter();
    const existing = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
    expect(existing).toBeTruthy();

    await db.update<VocabAssessment>("vocab_assessments", sessionId, {
      questionCount: 119,
      confidence: 0.895,
      currentLevel: "cet4",
      recommendedLevel: "cet4",
      estimatedVocab: 2600,
      answers: Array.from({ length: 119 }).map((_, idx) => ({
        questionId: `q-mixed-${idx}`,
        word: `mixed-${idx}`,
        pos: "n.",
        level: "cet4",
        responseType: idx % 8 === 1 || idx % 8 === 4 || idx % 8 === 7 ? "unknown" : "option",
        correctMeaning: "【n.】模拟",
        selectedMeaning: idx % 8 === 1 || idx % 8 === 4 || idx % 8 === 7 ? null : idx % 8 === 0 || idx % 8 === 3 || idx % 8 === 6 ? "【n.】模拟" : "【n.】错误",
        knew: !(idx % 8 === 1 || idx % 8 === 4 || idx % 8 === 7),
        isCorrect: idx % 8 === 0 || idx % 8 === 3 || idx % 8 === 6,
        explanation: "",
        answeredAt: new Date().toISOString(),
      })),
      currentQuestion: {
        ...existing!.currentQuestion,
        level: "cet4",
      },
    });

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId,
        choiceType: "unknown",
        selectedMeaning: null,
      })
    );

    expect(answerRes.status).toBe(200);
    const answerData = await answerRes.json();
    expect(answerData.success).toBe(true);
    expect(answerData.finished).toBe(false);
    expect(answerData.readyToFinish).toBe(true);
    expect(answerData.state.recommendedLevel).toBe("cet4");
    expect(answerData.state.lowConfidenceResult).toBe(false);
  });

  it("finish + weak words: should aggregate duplicate weak answers into one word entry", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const sessionId = startData.state.sessionId as string;

    const db = getDBAdapter();
    await db.update<VocabAssessment>("vocab_assessments", sessionId, {
      questionCount: 80,
      confidence: 0.91,
      answers: [
        {
          questionId: "q-1",
          word: "assess",
          pos: "v.",
          level: "cet6",
          responseType: "unknown",
          correctMeaning: "【v.】评估",
          selectedMeaning: null,
          knew: false,
          isCorrect: false,
          explanation: "",
          answeredAt: new Date().toISOString(),
        },
        {
          questionId: "q-2",
          word: "assess",
          pos: "v.",
          level: "cet6",
          responseType: "unknown",
          correctMeaning: "【v.】评估",
          selectedMeaning: null,
          knew: false,
          isCorrect: false,
          explanation: "",
          answeredAt: new Date().toISOString(),
        },
      ],
    });

    const finishRes = await POST(postRequest({ action: "finish", sessionId, forceFinish: true }));
    expect(finishRes.status).toBe(200);

    const words = await db.findMany<Word>("words", { userId, lemma: "assess" });
    expect(words).toHaveLength(1);
    expect(words[0].frequency).toBe(2);

    const definitions = await db.findMany<Definition>("definitions", {
      userId,
      wordId: words[0].id,
    });
    expect(definitions).toHaveLength(1);
  });

  it("finish: should require confirmation when thresholds are met but stability is not ready", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const sessionId = startData.state.sessionId as string;

    const db = getDBAdapter();
    await db.update<VocabAssessment>("vocab_assessments", sessionId, {
      questionCount: 80,
      confidence: 0.91,
      answers: Array.from({ length: 80 }).map((_, idx) => ({
        questionId: `q-${idx}`,
        word: `mock-${idx}`,
        pos: "n.",
        level: "cet6",
        responseType: "option",
        correctMeaning: "【n.】模拟",
        selectedMeaning: idx % 2 === 0 ? "【n.】模拟" : "【n.】错误",
        knew: true,
        isCorrect: idx % 2 === 0,
        explanation: "",
        answeredAt: new Date().toISOString(),
      })),
    });

    const finishRes = await POST(postRequest({ action: "finish", sessionId }));
    expect(finishRes.status).toBe(409);

    const finishData = await finishRes.json();
    expect(finishData.confirmationRequired).toBe(true);
    expect(finishData.unstable).toBe(true);

    const forcedRes = await POST(postRequest({ action: "finish", sessionId, forceFinish: true }));
    expect(forcedRes.status).toBe(200);
    const forcedData = await forcedRes.json();
    expect(forcedData.success).toBe(true);
    expect(forcedData.finished).toBe(true);
    expect(forcedData.state.status).toBe("completed");
  });

  it("history: should include low-confidence result metadata", async () => {
    const db = getDBAdapter();
    await db.create<VocabAssessment>("vocab_assessments", {
      type: "vocab_assessment",
      userId,
      status: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:10:00.000Z",
      confidencePolicyVersion: 3,
      startedLevel: "cet4",
      currentLevel: "cet6",
      questionCount: 150,
      aiQuestionCount: 3,
      confidence: 0.48,
      estimatedVocab: 5999,
      recommendedLevel: "cet6",
      lowConfidenceResult: true,
      askedWords: ["assess"],
      answers: [],
      seenOptionMeanings: [],
      correctStreak: 0,
    });

    const historyRes = await GET(getRequest("history"));
    expect(historyRes.status).toBe(200);
    const historyData = await historyRes.json();
    expect(historyData.success).toBe(true);
    expect(historyData.history[0].lowConfidenceResult).toBe(true);
    expect(historyData.history[0].recommendedLevel).toBe("cet6");
  });

  it("add_word: should add answered word once and return alreadyExists on duplicate", async () => {
    const startRes = await POST(postRequest({ action: "start" }));
    const startData = await startRes.json();
    const sessionId = startData.state.sessionId as string;
    const question = startData.state.currentQuestion as {
      id: string;
      word: string;
      pos?: string;
      correctMeaning: string;
      options: string[];
    };

    const answerRes = await POST(
      postRequest({
        action: "answer",
        sessionId,
        choiceType: "option",
        selectedMeaning: question.options[0],
      })
    );
    expect(answerRes.status).toBe(200);

    const db = getDBAdapter();
    const answeredSession = await db.findById<VocabAssessment>("vocab_assessments", sessionId);
    const answeredQuestionId = answeredSession?.answers?.[0]?.questionId;
    expect(answeredQuestionId).toBeTruthy();

    const addRes = await POST(
      postRequest({
        action: "add_word",
        sessionId,
        questionId: answeredQuestionId,
        word: question.word,
        pos: question.pos,
        correctMeaning: question.correctMeaning,
      })
    );
    expect(addRes.status).toBe(200);
    const addData = await addRes.json();
    expect(addData.success).toBe(true);
    expect(addData.added).toBe(true);

    const addAgainRes = await POST(
      postRequest({
        action: "add_word",
        sessionId,
        questionId: answeredQuestionId,
        word: question.word,
        pos: question.pos,
        correctMeaning: question.correctMeaning,
      })
    );
    expect(addAgainRes.status).toBe(200);
    const addAgainData = await addAgainRes.json();
    expect(addAgainData.success).toBe(true);
    expect(addAgainData.alreadyExists).toBe(true);

    const words = await db.findMany<Word>("words", { userId, lemma: question.word.toLowerCase() });
    expect(words).toHaveLength(1);
    expect(words[0].frequency).toBe(1);

    const definitions = await db.findMany<Definition>("definitions", {
      userId,
      wordId: words[0].id,
    });
    expect(definitions.length).toBeGreaterThanOrEqual(1);
    expect(definitions[0].senses[0]).toBe(question.correctMeaning);
  });

  it("add_word: should strip pos prefix from stored meaning", async () => {
    const db = getDBAdapter();
    const session = await db.create<VocabAssessment>("vocab_assessments", {
      type: "vocab_assessment",
      userId,
      status: "in_progress",
      startedAt: "2026-01-01T00:00:00.000Z",
      confidencePolicyVersion: 1,
      startedLevel: "cet6",
      currentLevel: "cet6",
      questionCount: 1,
      aiQuestionCount: 0,
      confidence: 0.2,
      estimatedVocab: 4200,
      recommendedLevel: "cet6",
      lowConfidenceResult: false,
      askedWords: ["forbid"],
      answers: [
        {
          questionId: "q-prefixed",
          word: "forbid",
          pos: "v.",
          level: "cet6",
          responseType: "option",
          correctMeaning: "【v.】禁止；不许",
          selectedMeaning: "【v.】禁止；不许",
          knew: true,
          isCorrect: true,
          explanation: "mock",
          answeredAt: "2026-01-01T00:01:00.000Z",
        },
      ],
      seenOptionMeanings: [],
      correctStreak: 1,
    });

    const addRes = await POST(
      postRequest({
        action: "add_word",
        sessionId: session.id,
        questionId: "q-prefixed",
      })
    );

    expect(addRes.status).toBe(200);
    const addData = await addRes.json();
    expect(addData.success).toBe(true);
    expect(addData.added).toBe(true);

    const words = await db.findMany<Word>("words", { userId, lemma: "forbid" });
    expect(words).toHaveLength(1);

    const definitions = await db.findMany<Definition>("definitions", {
      userId,
      wordId: words[0].id,
    });
    expect(definitions).toHaveLength(1);
    expect(definitions[0].pos).toBe("v.");
    expect(definitions[0].senses[0]).toBe("禁止；不许");
  });
});
