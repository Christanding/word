"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/language-provider";
import { estimateVocabMargin } from "@/lib/vocab-test/margin";
import {
  canManuallyFinishState,
  estimateCompositeProgress,
  estimateRemainingQuestionRange,
  isFinishReadyState,
  isStableEnoughToFinish,
  TEST_PROGRESS_POLICY,
} from "@/lib/vocab-test/progress";
import type { VocabAssessmentState } from "@/lib/vocab-test/types";

interface HistoryPoint {
  id: string;
  endedAt?: string;
  estimatedVocab: number;
  margin?: number;
  confidence: number;
  recommendedLevel: string;
  lowConfidenceResult?: boolean;
}

interface Feedback {
  isCorrect: boolean;
  correctMeaning: string;
}

interface ResultSnapshot {
  estimatedVocab: number;
  margin?: number;
  confidence: number;
  recommendedLevel: string;
  lowConfidenceResult?: boolean;
}

const ACTIVE_TEST_SESSION_KEY = "word:vocab-test:active-session";
const FINISH_READY_SESSION_KEY = "word:vocab-test:finish-ready-session";

function formatLevel(level: string, language: "en" | "zh") {
  if (level === "cet4") return language === "zh" ? "四级" : "CET-4";
  if (level === "cet6") return language === "zh" ? "六级" : "CET-6";
  if (level === "ielts") return language === "zh" ? "雅思" : "IELTS";
  return "GRE";
}

export default function VocabTestPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"history" | "test">("history");
  const [state, setState] = useState<VocabAssessmentState | null>(null);
  const [inProgressState, setInProgressState] = useState<VocabAssessmentState | null>(null);
  const [pendingState, setPendingState] = useState<VocabAssessmentState | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedOptions, setExpandedOptions] = useState<Record<string, boolean>>({});
  const [lastAnsweredQuestion, setLastAnsweredQuestion] = useState<VocabAssessmentState["currentQuestion"] | null>(null);
  const [addingWord, setAddingWord] = useState(false);
  const [addWordStatus, setAddWordStatus] = useState<"idle" | "added" | "exists" | "error">("idle");
  const optionLabels = ["A", "B", "C", "D"];
  const questionAnchorRef = useRef<HTMLDivElement | null>(null);

  const rememberActiveTestSession = useCallback((sessionId: string) => {
    window.sessionStorage.setItem(ACTIVE_TEST_SESSION_KEY, sessionId);
  }, []);

  const clearActiveTestSession = useCallback(() => {
    window.sessionStorage.removeItem(ACTIVE_TEST_SESSION_KEY);
  }, []);

  const rememberFinishReadySession = useCallback((sessionId: string) => {
    window.sessionStorage.setItem(FINISH_READY_SESSION_KEY, sessionId);
  }, []);

  const clearFinishReadySession = useCallback(() => {
    window.sessionStorage.removeItem(FINISH_READY_SESSION_KEY);
  }, []);

  const splitOptionLines = (option: string) => {
    const parts = option
      .split(/\s*[；;]\s*/u)
      .map((part) => part.trim())
      .filter(Boolean);

    const lines: string[] = [];
    let currentPos = "";

    for (const part of parts) {
      const posMatched = /^\s*([a-z]{1,6}\.)\s*(.*)$/iu.exec(part);
      if (posMatched) {
        currentPos = posMatched[1].toLowerCase();
        const body = posMatched[2].trim();
        lines.push(body ? `${currentPos} ${body}` : currentPos);
        continue;
      }
      lines.push(currentPos ? `${currentPos} ${part}` : part);
    }

    return Array.from(new Set(lines));
  };

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/vocab-test?mode=history", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) {
      setHistory(data.history || []);
      return data.history || [];
    }
    return [] as HistoryPoint[];
  }, []);

  const startTest = async () => {
    const res = await fetch("/api/vocab-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    if (res.ok) {
      setState(data.state);
      setInProgressState(data.state);
      setView("test");
      rememberActiveTestSession(data.state.sessionId);
      clearFinishReadySession();
      setPendingState(null);
      setFeedback(null);
      setLastAnsweredQuestion(null);
      setAddWordStatus("idle");
    }
  };

  const startFreshTest = async () => {
    setLoading(true);
    try {
      if (inProgressState) {
        await fetch("/api/vocab-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "abandon", sessionId: inProgressState.sessionId }),
        });
        setInProgressState(null);
      }
      await startTest();
    } finally {
      setLoading(false);
    }
  };

  const continueInProgress = () => {
    if (!inProgressState) {
      return;
    }
    setState(inProgressState);
    setView("test");
    rememberActiveTestSession(inProgressState.sessionId);
    setFeedback(null);
    setLastAnsweredQuestion(null);
    setAddWordStatus("idle");
  };

  const currentQuestion = state?.currentQuestion;
  const isPreparingNextQuestion = !!feedback && !pendingState;

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const currentRes = await fetch("/api/vocab-test?mode=current", { cache: "no-store" });
        const currentData = await currentRes.json();
        await loadHistory();
        if (currentRes.ok && currentData.current) {
          setInProgressState(currentData.current);
          const finishReadySessionId = window.sessionStorage.getItem(FINISH_READY_SESSION_KEY);
          const rememberedSessionId = window.sessionStorage.getItem(ACTIVE_TEST_SESSION_KEY);
          if (rememberedSessionId === currentData.current.sessionId) {
            setState(currentData.current);
            setView("test");
          }
          if (finishReadySessionId !== currentData.current.sessionId) {
            clearFinishReadySession();
          }
        }
      } finally {
        setLoading(false);
      }
    };
    void bootstrap();
  }, [clearFinishReadySession, loadHistory]);

  useEffect(() => {
    if (view !== "test" || !currentQuestion?.id) {
      return;
    }

    questionAnchorRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [view, currentQuestion?.id]);

  const handleAnswer = async (choiceType: "option" | "unsure" | "unknown", selectedMeaning: string | null) => {
    if (!state || !currentQuestion || submitting || feedback || pendingState) {
      return;
    }
    const optimisticFeedback: Feedback = {
      isCorrect: choiceType === "option" && selectedMeaning === currentQuestion.correctMeaning,
      correctMeaning: currentQuestion.correctMeaning,
    };
    setLastAnsweredQuestion(currentQuestion);
    setFeedback(optimisticFeedback);
    setAddWordStatus("idle");
    setSubmitting(true);
    try {
      const res = await fetch("/api/vocab-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          sessionId: state.sessionId,
          choiceType,
          selectedMeaning,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t("vocabTest.error.submitFailed"));
      }
      setFeedback(data.feedback || optimisticFeedback);
      setInProgressState(data.state);
      if (data.finished) {
        setState(data.state);
        setPendingState(null);
        setInProgressState(null);
        setView("history");
        clearActiveTestSession();
        clearFinishReadySession();
      } else if (data.readyToFinish) {
        const finishReadySessionId = window.sessionStorage.getItem(FINISH_READY_SESSION_KEY);
        if (finishReadySessionId !== data.state.sessionId) {
          rememberFinishReadySession(data.state.sessionId);
          setShowFinishModal(true);
        }
      } else {
        clearFinishReadySession();
      }
      if (!data.finished) {
        void prepareNextQuestion(data.state.sessionId).catch((error) => {
          setPendingState(null);
          alert(error instanceof Error ? error.message : t("vocabTest.error.submitFailed"));
        });
      }
      if (data.finished) {
        await loadHistory();
      }
    } catch (error) {
      setFeedback(null);
      setLastAnsweredQuestion(null);
      setPendingState(null);
      alert(error instanceof Error ? error.message : t("vocabTest.error.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    if (!pendingState || submitting) {
      return;
    }
    setState(pendingState);
    setInProgressState(pendingState);
    rememberActiveTestSession(pendingState.sessionId);
    setPendingState(null);
    setFeedback(null);
    setLastAnsweredQuestion(null);
    setAddWordStatus("idle");
  };

  const prepareNextQuestion = useCallback(
    async (sessionId: string) => {
      const res = await fetch("/api/vocab-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare_next", sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t("vocabTest.error.submitFailed"));
      }
      setPendingState(data.state);
    },
    [t]
  );

  const handleFinishNow = async (forceFinish = false) => {
    const target = pendingState || state;
    if (!target) return;
    const res = await fetch("/api/vocab-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish", sessionId: target.sessionId, forceFinish }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409 && data.confirmationRequired && !forceFinish) {
        void handleFinishNow(true);
        return;
      }
      alert(data.message || t("vocabTest.error.submitFailed"));
      return;
    }
    setShowFinishModal(false);
    setFeedback(null);
    setPendingState(null);
    setState(data.state);
    setInProgressState(null);
    setView("history");
    clearActiveTestSession();
    clearFinishReadySession();
    setLastAnsweredQuestion(null);
    setAddWordStatus("idle");
    await loadHistory();
  };

  const handleAddCurrentWord = async () => {
    if (!state || !currentQuestion || !feedback || addingWord) {
      return;
    }
    if (!lastAnsweredQuestion || lastAnsweredQuestion.id !== currentQuestion.id) {
      return;
    }

    setAddingWord(true);
    try {
      const res = await fetch("/api/vocab-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_word",
          sessionId: state.sessionId,
          questionId: currentQuestion.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t("vocabTest.addWord.error"));
      }
      setAddWordStatus(data.alreadyExists ? "exists" : "added");
    } catch {
      setAddWordStatus("error");
    } finally {
      setAddingWord(false);
    }
  };

  const handleFinishContinue = () => {
    setShowFinishModal(false);
    handleContinue();
  };

  const handleExitKeep = async () => {
    if (!state) return;
    await fetch("/api/vocab-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "exit", sessionId: state.sessionId }),
    });
    clearActiveTestSession();
    clearFinishReadySession();
    router.push("/app");
  };

  const handleExitAbandon = async () => {
    if (!state) return;
    await fetch("/api/vocab-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "abandon", sessionId: state.sessionId }),
    });
    clearActiveTestSession();
    clearFinishReadySession();
    router.push("/app");
  };

  const progressTargetState = pendingState || inProgressState || state;
  const remainingRange = useMemo(() => {
    if (!progressTargetState) {
      return null;
    }
    return estimateRemainingQuestionRange(progressTargetState);
  }, [progressTargetState]);

  const finishStatusState = progressTargetState;

  const canAttemptFinishNow = useMemo(() => {
    if (!finishStatusState) {
      return false;
    }
    return (
      window.sessionStorage.getItem(FINISH_READY_SESSION_KEY) === finishStatusState.sessionId &&
      canManuallyFinishState(finishStatusState)
    );
  }, [finishStatusState]);

  const canFinishNow = useMemo(() => {
    return !!finishStatusState && canAttemptFinishNow && isFinishReadyState(finishStatusState);
  }, [canAttemptFinishNow, finishStatusState]);

  const needsFinishConfirmation = useMemo(() => {
    return !!finishStatusState && canAttemptFinishNow && !isStableEnoughToFinish(finishStatusState);
  }, [canAttemptFinishNow, finishStatusState]);

  const compositeProgress = useMemo(() => {
    if (!progressTargetState) {
      return 0;
    }
    return estimateCompositeProgress(progressTargetState);
  }, [progressTargetState]);

  const handleClearHistory = async () => {
    await fetch("/api/vocab-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_history" }),
    });
    setHistory([]);
  };

  const latestResult = useMemo<ResultSnapshot | null>(() => {
    if (state?.status === "completed") {
      return state;
    }
    if (history.length > 0) {
      const latest = history[history.length - 1];
      return {
        estimatedVocab: latest.estimatedVocab,
        margin: latest.margin,
        confidence: latest.confidence,
        recommendedLevel: latest.recommendedLevel,
        lowConfidenceResult: latest.lowConfidenceResult,
      };
    }
    return null;
  }, [history, state]);

  const latestMargin = useMemo(() => {
    if (!latestResult) {
      return 0;
    }
    const maybeMargin = latestResult.margin;
    if (typeof maybeMargin === "number" && Number.isFinite(maybeMargin)) {
      return maybeMargin;
    }
    return estimateVocabMargin(latestResult.estimatedVocab, latestResult.confidence);
  }, [latestResult]);

  const trendChart = useMemo(() => {
    if (history.length === 0) {
      return null;
    }

    const width = 820;
    const height = 260;
    const padding = { top: 22, right: 26, bottom: 34, left: 42 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const values = history.map((item) => item.estimatedVocab);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const spread = Math.max(300, maxValue - minValue);
    const yMin = Math.max(0, minValue - spread * 0.2);
    const yMax = maxValue + spread * 0.2;

    const points = history.map((item, index) => {
      const x =
        padding.left +
        (history.length === 1 ? innerWidth / 2 : (index / (history.length - 1)) * innerWidth);
      const y =
        padding.top +
        (1 - (item.estimatedVocab - yMin) / Math.max(yMax - yMin, 1)) * innerHeight;
      return { ...item, x, y, index };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(padding.top + innerHeight).toFixed(
      2
    )} L ${points[0].x.toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} Z`;

    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }).map((_, idx) => {
      const ratio = idx / ticks;
      const y = padding.top + ratio * innerHeight;
      const value = Math.round(yMax - ratio * (yMax - yMin));
      return { y, value };
    });

    return {
      width,
      height,
      padding,
      points,
      linePath,
      areaPath,
      yTicks,
    };
  }, [history]);

  if (loading) {
    return <div className="p-8">{t("vocabTest.loading")}</div>;
  }

  if (view === "history") {
    return (
      <div className="min-h-[calc(100vh-4rem)] p-6 bg-[radial-gradient(circle_at_top_left,#fef3c7,transparent_40%),radial-gradient(circle_at_bottom_right,#bae6fd,transparent_45%),linear-gradient(135deg,#f8fafc,#eef2ff)]">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[rgba(63,49,43,0.5)]">
            {language === "zh" ? "词汇量测试" : "Vocabulary Assessment"}
          </div>
          {inProgressState ? (
            <div className="border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] p-6 shadow-[0_18px_40px_-30px_rgba(40,30,24,0.24)]">
              <h2 className="mb-2 text-xl font-semibold leading-tight text-slate-900">{t("vocabTest.resumeTitle")}</h2>
              <p className="mb-4 leading-6 text-slate-600">{t("vocabTest.resumeDesc")}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={continueInProgress}
                  className="border border-[var(--accent-ink)] bg-[var(--accent-ink)] px-5 py-3 text-white font-semibold leading-5 hover:border-[var(--accent-oxblood)] hover:bg-[var(--accent-oxblood)] transition-colors"
                >
                  {t("vocabTest.resumeContinue")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void startFreshTest();
                  }}
                  className="border border-[rgba(76,63,54,0.24)] px-5 py-3 text-[var(--accent-ink)] font-semibold leading-5 hover:bg-[rgba(249,243,235,0.8)] transition-colors"
                >
                  {t("vocabTest.retest")}
                </button>
              </div>
            </div>
          ) : null}

          <div className="border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] p-8 shadow-[0_22px_60px_-36px_rgba(31,24,20,0.28)]">
            <h1 className="mb-2 text-3xl font-semibold leading-tight text-slate-900">{t("vocabTest.resultTitle")}</h1>
            <p className="mb-6 leading-6 text-slate-600">{t("vocabTest.resultDesc")}</p>
            {latestResult?.lowConfidenceResult ? (
              <div className="mb-6 border border-[rgba(110,59,51,0.24)] bg-[rgba(110,59,51,0.07)] px-5 py-4 text-[var(--accent-oxblood)]">
                <div className="text-sm font-semibold uppercase tracking-[0.14em] leading-5 text-rose-700">{t("vocabTest.lowConfidence.title")}</div>
                <p className="mt-2 text-sm font-medium text-rose-900">{t("vocabTest.lowConfidence.desc")}</p>
                <p className="mt-2 text-sm text-rose-700">{t("vocabTest.lowConfidence.retest")}</p>
              </div>
            ) : null}
            {latestResult ? (
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="border border-[rgba(76,63,54,0.14)] bg-[rgba(255,253,248,0.92)] p-4">
                  <div className="text-sm uppercase tracking-[0.08em] text-[rgba(63,49,43,0.58)]">{t("vocabTest.result.estimated")}</div>
                  <div className="text-2xl font-semibold text-[var(--accent-ink)]">{latestResult.estimatedVocab} ± {latestMargin}</div>
                </div>
                <div className="border border-[rgba(76,63,54,0.14)] bg-[rgba(255,253,248,0.92)] p-4">
                  <div className="text-sm uppercase tracking-[0.08em] text-[rgba(63,49,43,0.58)]">{t("vocabTest.result.confidence")}</div>
                  <div className="text-2xl font-semibold text-[var(--accent-olive)]">{Math.round(latestResult.confidence * 100)}%</div>
                </div>
                <div className="border border-[rgba(76,63,54,0.14)] bg-[rgba(255,253,248,0.92)] p-4">
                  <div className="text-sm uppercase tracking-[0.08em] text-[rgba(63,49,43,0.58)]">{t("vocabTest.result.recommended")}</div>
                  <div className="text-2xl font-semibold text-[var(--accent-oxblood)]">{formatLevel(latestResult.recommendedLevel, language)}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] p-6 shadow-[0_18px_40px_-30px_rgba(40,30,24,0.24)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold leading-tight text-slate-800">{t("vocabTest.historyTitle")}</h2>
              <button
                type="button"
                onClick={handleClearHistory}
                className="border border-[rgba(110,59,51,0.24)] px-3 py-1.5 text-sm font-semibold leading-5 text-[var(--accent-oxblood)]"
              >
                {t("vocabTest.clearHistory")}
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-slate-500">{t("vocabTest.emptyHistory")}</p>
            ) : (
              <div className="border border-[rgba(76,63,54,0.14)] bg-[rgba(255,253,248,0.92)] p-3">
                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${trendChart?.width || 820} ${trendChart?.height || 260}`}
                    className="h-[260px] min-w-[760px] w-full"
                    role="img"
                    aria-label="Vocabulary trend chart"
                  >
                    <defs>
                      <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.34" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
                      </linearGradient>
                      <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="50%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#fb7185" />
                      </linearGradient>
                    </defs>

                    {trendChart?.yTicks.map((tick) => (
                      <g key={tick.value}>
                        <line
                          x1={trendChart.padding.left}
                          y1={tick.y}
                          x2={trendChart.width - trendChart.padding.right}
                          y2={tick.y}
                          stroke="#e2e8f0"
                          strokeDasharray="4 6"
                        />
                        <text x={8} y={tick.y + 4} fill="#94a3b8" fontSize="12">
                          {tick.value}
                        </text>
                      </g>
                    ))}

                    {trendChart ? <path d={trendChart.areaPath} fill="url(#trendArea)" /> : null}
                    {trendChart ? (
                      <path
                        d={trendChart.linePath}
                        fill="none"
                        stroke="url(#trendLine)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}

                    {trendChart?.points.map((point, index) => {
                      const isLatest = index === trendChart.points.length - 1;
                      return (
                        <g key={point.id}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r={isLatest ? 6 : 4}
                            fill={isLatest ? "#f97316" : "#f59e0b"}
                            stroke="#fff"
                            strokeWidth="2"
                          />
                          <text x={point.x} y={trendChart.height - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
                            #{point.index + 1}
                          </text>
                          {isLatest ? (
                            <text
                              x={point.x}
                              y={point.y - 12}
                              textAnchor="middle"
                              fill="#0f172a"
                              fontSize="12"
                              fontWeight="700"
                            >
                              {point.estimatedVocab}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 items-center">
            <button
              type="button"
              onClick={() => {
                void startFreshTest();
              }}
              className="border border-[var(--accent-ink)] bg-[var(--accent-ink)] px-5 py-3 text-white font-semibold leading-5 hover:border-[var(--accent-oxblood)] hover:bg-[var(--accent-oxblood)] transition-colors"
            >
              {t("vocabTest.retest")}
            </button>
            <button
              type="button"
              onClick={() => router.push("/app")}
              className="ml-auto border border-[rgba(76,63,54,0.24)] px-5 py-3 text-[var(--accent-ink)] font-semibold leading-5 hover:bg-[rgba(249,243,235,0.8)] transition-colors"
            >
              {t("vocabTest.backHome")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!state || !currentQuestion) {
    return <div className="p-8">{t("vocabTest.loading")}</div>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(246,241,232,0.96))] p-6">
      <div ref={questionAnchorRef} className="mx-auto max-w-4xl space-y-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[rgba(63,49,43,0.5)]">
          {language === "zh" ? "词汇量测试" : "Vocabulary Assessment"}
        </div>
        <div className="border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] p-4 shadow-[0_18px_40px_-30px_rgba(40,30,24,0.24)]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-600">
              {t("vocabTest.progressPrefix")} · {t("vocabTest.progressQuestion")} {state.questionCount + 1}
              {t("vocabTest.progressQuestionSuffix")}
            </div>
            <div className="flex items-center gap-2">
              {canFinishNow ? (
                <div className="inline-flex items-center border border-[rgba(90,99,80,0.18)] bg-[rgba(90,99,80,0.1)] px-3 py-1 text-xs font-semibold leading-5 text-[var(--accent-olive)]">
                  {t("vocabTest.finishReady.badge")}
                </div>
              ) : null}
              <div className="inline-flex items-center border border-[rgba(76,63,54,0.14)] bg-[rgba(255,253,248,0.9)] px-3 py-1 text-xs font-semibold leading-5 text-[rgba(63,49,43,0.72)]">
                {t("vocabTest.progressConfidence")} {Math.round(state.confidence * 100)}%
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden bg-[rgba(76,63,54,0.12)]">
            <div
              data-testid="vocab-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(compositeProgress * 100)}
              className="h-full bg-[linear-gradient(90deg,#6e3b33,#8f5a49)] transition-all duration-300"
              style={{ width: `${Math.round(compositeProgress * 100)}%` }}
            />
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">{t("vocabTest.progressCompletionLabel")}</span>
              {" "}
              {t("vocabTest.progressCompletionAtLeast")} {TEST_PROGRESS_POLICY.minQuestions} {t("vocabTest.progressCompletionQuestionUnit")}
              {" "}{t("vocabTest.progressCompletionAnd")}{" "}
              {t("vocabTest.progressCompletionConfidence")} {Math.round(TEST_PROGRESS_POLICY.confidenceTarget * 100)}%
              {" "}{t("vocabTest.progressCompletionStable")}
            </div>
            <div>
              <span className="font-semibold text-slate-800">{t("vocabTest.progressRemainingLabel")}</span>
              {" "}
              {remainingRange ? `${remainingRange.min}-${remainingRange.max}` : "--"}
              {" "}{t("vocabTest.progressRemainingUnit")}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-3">
            {canAttemptFinishNow ? (
              <button
                type="button"
                onClick={() => {
                  void handleFinishNow(true);
                }}
                className={`border px-3 py-1.5 text-sm font-semibold leading-5 text-white ${
                  needsFinishConfirmation ? "border-[var(--accent-oxblood)] bg-[var(--accent-oxblood)]" : "border-[var(--accent-olive)] bg-[var(--accent-olive)]"
                }`}
              >
                {t("vocabTest.finishReady.finish")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setShowExitModal(true)}
              className="border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.96)] px-3 py-1.5 text-sm font-semibold leading-5 text-[var(--accent-ink)] hover:bg-[rgba(249,243,235,0.8)] transition-colors"
            >
              {t("vocabTest.exitTest")}
            </button>
          </div>
        </div>

        <div className="border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] p-8 shadow-[0_22px_60px_-36px_rgba(31,24,20,0.28)]">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h1 className="text-5xl font-semibold leading-none tracking-tight text-slate-900">{currentQuestion.word}</h1>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => {
                  void handleAddCurrentWord();
                }}
                disabled={
                  !feedback ||
                  !lastAnsweredQuestion ||
                  lastAnsweredQuestion.id !== currentQuestion.id ||
                  submitting ||
                  addingWord
                }
                className="border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.96)] px-3 py-1.5 text-sm font-semibold leading-5 text-[var(--accent-ink)] hover:bg-[rgba(249,243,235,0.8)] disabled:opacity-50 transition-colors"
              >
                {addingWord ? t("vocabTest.addWord.loading") : t("vocabTest.addWord.cta")}
              </button>
              {addWordStatus !== "idle" ? (
                <span
                  className={`text-xs font-semibold ${
                    addWordStatus === "error"
                      ? "text-rose-600"
                      : addWordStatus === "added"
                        ? "text-emerald-700"
                        : "text-slate-600"
                  }`}
                >
                  {addWordStatus === "added"
                    ? t("vocabTest.addWord.added")
                    : addWordStatus === "exists"
                      ? t("vocabTest.addWord.exists")
                      : t("vocabTest.addWord.error")}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3">
            {currentQuestion.options.map((option, index) => {
              const optionKey = `${currentQuestion.id}:${option}`;
              const lines = splitOptionLines(option);
              const isExpanded = !!expandedOptions[optionKey];
              const visibleLines = isExpanded ? lines : lines.slice(0, 2);
              return (
                <div key={`${currentQuestion.id}:${optionLabels[index] || option}`}>
                  <button
                    type="button"
                    disabled={!!feedback || submitting}
                    onClick={() => {
                      void handleAnswer("option", option);
                    }}
                  className="group w-full border border-[rgba(76,63,54,0.16)] bg-[rgba(255,253,248,0.96)] px-4 py-3 text-left text-[var(--accent-ink)] leading-6 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-70 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center border border-[rgba(76,63,54,0.14)] bg-[rgba(255,250,244,0.95)] text-xs font-semibold text-[rgba(63,49,43,0.7)] group-hover:border-emerald-200 group-hover:bg-emerald-100 group-hover:text-emerald-700">
                        {optionLabels[index] || index + 1}
                      </span>
                      <span className="block min-w-0 flex-1 whitespace-pre-line">
                        {visibleLines.join("\n")}
                      </span>
                    </div>
                  </button>
                  {lines.length > 2 ? (
                    <div className="px-4">
                      <button
                        type="button"
                        disabled={!!feedback || submitting}
                        onClick={() => {
                          setExpandedOptions((prev) => ({ ...prev, [optionKey]: !prev[optionKey] }));
                        }}
                  className="mt-1 inline-flex text-xs font-semibold leading-5 text-[var(--accent-oxblood)] hover:text-[var(--accent-ink)] disabled:opacity-60"
                      >
                        {isExpanded ? t("vocabTest.optionCollapse") : t("vocabTest.optionExpand")}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}

            <button
              type="button"
              disabled={!!feedback || submitting}
              onClick={() => {
                void handleAnswer("unsure", null);
              }}
                className="border border-amber-300 bg-amber-50 px-4 py-3 text-left font-semibold leading-6 text-amber-800 hover:bg-amber-100 disabled:opacity-70 transition-colors"
            >
              {t("vocabTest.unsureWord")}
            </button>

            <button
              type="button"
              disabled={!!feedback || submitting}
              onClick={() => {
                void handleAnswer("unknown", null);
              }}
                className="border border-orange-300 bg-orange-50 px-4 py-3 text-left font-semibold leading-6 text-orange-800 hover:bg-orange-100 disabled:opacity-70 transition-colors"
            >
              {t("vocabTest.unknownWord")}
            </button>
          </div>

          {feedback ? (
            <div className={`mt-6 border p-5 ${feedback.isCorrect ? "border-[rgba(90,99,80,0.24)] bg-[rgba(90,99,80,0.08)]" : "border-[rgba(110,59,51,0.24)] bg-[rgba(110,59,51,0.08)]"}`}>
              <div className="font-semibold mb-1">{feedback.isCorrect ? t("vocabTest.feedback.correct") : t("vocabTest.feedback.incorrect")}</div>
              <div className="text-sm text-slate-700">{t("vocabTest.feedback.answer")}{feedback.correctMeaning}</div>
              <button
                type="button"
                onClick={handleContinue}
                disabled={submitting || !pendingState}
                aria-busy={isPreparingNextQuestion}
                className="mt-3 border border-[var(--accent-ink)] bg-[var(--accent-ink)] px-4 py-2.5 text-sm font-semibold leading-5 text-white transition-colors hover:border-[var(--accent-oxblood)] hover:bg-[var(--accent-oxblood)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPreparingNextQuestion ? t("vocabTest.nextQuestionPreparing") : t("vocabTest.nextQuestion")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showExitModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="close"
            className="absolute inset-0 bg-slate-900/35"
            onClick={() => setShowExitModal(false)}
          />
          <div className="relative w-full max-w-md border border-[rgba(76,63,54,0.18)] bg-[rgba(255,252,247,0.98)] p-6 shadow-[0_22px_60px_-36px_rgba(31,24,20,0.28)]">
              <h3 className="mb-2 text-lg font-semibold leading-tight text-slate-900">{t("vocabTest.exitModal.title")}</h3>
              <p className="mb-5 leading-6 text-slate-600">{t("vocabTest.exitModal.desc")}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleExitKeep}
                className="flex-1 border border-[var(--accent-ink)] bg-[var(--accent-ink)] py-2.5 font-semibold leading-5 text-white"
              >
                {t("vocabTest.exitModal.keep")}
              </button>
              <button
                type="button"
                onClick={handleExitAbandon}
                className="flex-1 border border-[rgba(110,59,51,0.24)] py-2.5 font-semibold leading-5 text-[var(--accent-oxblood)]"
              >
                {t("vocabTest.exitModal.abandon")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showFinishModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="close"
            className="absolute inset-0 bg-slate-900/35"
            onClick={handleFinishContinue}
          />
          <div className="relative w-full max-w-md border border-[rgba(76,63,54,0.18)] bg-[rgba(255,252,247,0.98)] p-6 shadow-[0_22px_60px_-36px_rgba(31,24,20,0.28)]">
              <h3 className="mb-2 text-lg font-semibold leading-tight text-slate-900">{t("vocabTest.finishModal.title")}</h3>
              <p className="mb-5 leading-6 text-slate-600">{t("vocabTest.finishModal.desc")} {Math.round(TEST_PROGRESS_POLICY.confidenceTarget * 100)}%</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleFinishNow(true);
                }}
                className="flex-1 border border-[var(--accent-olive)] bg-[var(--accent-olive)] py-2.5 font-semibold leading-5 text-white"
              >
                {t("vocabTest.finishModal.finish")}
              </button>
              <button
                type="button"
                onClick={handleFinishContinue}
                className="flex-1 border border-[rgba(76,63,54,0.24)] py-2.5 font-semibold leading-5 text-[var(--accent-ink)]"
              >
                {t("vocabTest.finishModal.continue")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
