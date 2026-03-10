"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/language-provider";
import { DEFAULT_REVIEW_LIMIT, parseReviewLimit } from "@/lib/review-limit";
import { getCardDisplayMeaning } from "@/lib/review-display";
import {
  FIREWORK_FADE_MS,
  FIREWORK_ROUND_MS,
  FIREWORK_ROUNDS,
  getCelebrationTimings,
} from "@/lib/review-celebration";
import {
  applyReviewAnswer,
  createInitialReviewSession,
  getCurrentReviewStep,
} from "@/lib/review-flow";

interface Card {
  id: string;
  lemma: string;
  pos?: string;
  senses?: string[];
}

const OPTION_LABELS = ["A", "B", "C", "D"];
const CELEBRATION_BURSTS = [
  { x: "12%", y: "24%", delay: "0s" },
  { x: "30%", y: "13%", delay: "0.3s" },
  { x: "48%", y: "21%", delay: "0.6s" },
  { x: "66%", y: "14%", delay: "0.95s" },
  { x: "84%", y: "24%", delay: "1.2s" },
] as const;

function shuffle<T>(items: T[]): T[] {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function getFullMeaning(card: Card, fallback: string): string {
  return getCardDisplayMeaning(card.pos, card.senses, fallback);
}

export default function ReviewPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [session, setSession] = useState(() => createInitialReviewSession([]));
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [targetLimit, setTargetLimit] = useState(DEFAULT_REVIEW_LIMIT);
  const [completionPhase, setCompletionPhase] = useState<"idle" | "celebrating" | "fading">("idle");
  const router = useRouter();
  const { language, t } = useLanguage();

  useEffect(() => {
    const loadDueCards = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const parsedLimit = parseReviewLimit(params.get("limit"));
        setTargetLimit(parsedLimit);
        const query = `?limit=${parsedLimit}`;
        const res = await fetch(`/api/reviews${query}`);
        const data = await res.json();
        const loadedCards: Card[] = data.cards || [];
        setCards(loadedCards);
        setSession(createInitialReviewSession(loadedCards.map((card) => card.id)));
      } catch (err) {
        console.error("Failed to load cards:", err);
      } finally {
        setLoading(false);
      }
    };

    loadDueCards();
  }, []);

  const currentStep = getCurrentReviewStep(session);
  const cardMap = useMemo(() => {
    return new Map(cards.map((card) => [card.id, card]));
  }, [cards]);
  const currentCard = currentStep ? cardMap.get(currentStep.cardId) : undefined;
  const shouldCelebrateCompletion = !loading && !currentCard && session.steps.length > 0;

  useEffect(() => {
    if (!shouldCelebrateCompletion) {
      setCompletionPhase("idle");
      return;
    }

    setCompletionPhase("celebrating");
    const timings = getCelebrationTimings();
    const fadeTimer = window.setTimeout(() => {
      setCompletionPhase("fading");
    }, timings.celebrationMs);
    const redirectTimer = window.setTimeout(() => {
      router.push("/app/words");
    }, timings.redirectMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(redirectTimer);
    };
  }, [router, shouldCelebrateCompletion]);

  const question = useMemo(() => {
    if (!currentCard || !currentStep) {
      return null;
    }

    const fallbackMeaning = t("review.noDefinition");
    const correct =
      currentStep.direction === "en-zh"
        ? getFullMeaning(currentCard, fallbackMeaning)
        : currentCard.lemma;
    const pool = cards.filter((card) => card.id !== currentCard.id);

    const rawDistractors =
      currentStep.direction === "en-zh"
        ? pool.map((card) => getFullMeaning(card, fallbackMeaning))
        : pool.map((card) => card.lemma);

    const distractors = shuffle(
      rawDistractors.filter((item) => item && item !== correct)
    ).slice(0, 3);

    const options = shuffle([correct, ...distractors]).slice(0, 4);
    while (options.length < 4) {
      options.push(correct);
    }

    return {
      prompt:
        currentStep.direction === "en-zh"
          ? currentCard.lemma
          : getFullMeaning(currentCard, fallbackMeaning),
      correct,
      options,
      direction: currentStep.direction,
    };
  }, [cards, currentCard, currentStep, t]);

  const handleSelect = async (option: string) => {
    if (!currentCard || !question || submitting || selectedOption) {
      return;
    }

    setSubmitting(true);
    setSelectedOption(option);
    setAnswerCorrect(option === question.correct);

    const isCorrect = option === question.correct;
    const quality = isCorrect ? 4 : 1;

    try {
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: currentCard.id,
          quality,
        }),
      });
    } catch (err) {
      console.error("Failed to submit review:", err);
    }

    setTimeout(() => {
      setSelectedOption(null);
      setAnswerCorrect(null);
      setSubmitting(false);
      setSession((prev) => applyReviewAnswer(prev, isCorrect));
    }, 700);
  };

  if (loading) {
    return <div className="p-8">{t("review.loading")}</div>;
  }

  if (!currentCard || !question) {
    if (!shouldCelebrateCompletion) {
      return (
        <div className="p-8 space-y-4 text-center">
          <p>{t("review.empty")}</p>
          <button
            type="button"
            onClick={() => router.push("/app/words")}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
          >
            {t("review.backToWords")}
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(246,241,232,0.96))] px-4 py-8 sm:px-8">

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {CELEBRATION_BURSTS.map((burst) => (
            <div
              key={`${burst.x}-${burst.y}`}
              className="celebration-firework"
              style={{
                left: burst.x,
                top: burst.y,
                animationDelay: burst.delay,
              }}
            />
          ))}
        </div>

        <div
          className={`relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-[min(1180px,100vw)] items-center justify-center transition-opacity ease-out ${
            completionPhase === "fading" ? "opacity-0" : "opacity-100"
          }`}
          style={{ transitionDuration: `${FIREWORK_FADE_MS}ms` }}
        >
          <div className="relative w-full border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] p-8 text-center shadow-[0_18px_40px_-30px_rgba(40,30,24,0.24)]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border border-[rgba(76,63,54,0.16)] bg-[rgba(255,253,248,0.92)] text-3xl text-[var(--accent-ink)]">
              ◇
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("review.completedTitle")}</h2>
            <p className="text-slate-600 mb-6">{t("review.completedSubtitle")}</p>
            <p className="text-slate-500 mb-8">{t("review.empty")}</p>
            <button
              type="button"
              onClick={() => router.push("/app/words")}
              className="border border-[var(--accent-ink)] bg-[var(--accent-ink)] px-6 py-3 text-white font-semibold transition-colors hover:border-[var(--accent-oxblood)] hover:bg-[var(--accent-oxblood)]"
            >
              {t("review.backToWords")}
            </button>
          </div>
        </div>

        <style jsx>{`
          .celebration-firework {
            position: absolute;
            width: 112px;
            height: 112px;
            border-radius: 9999px;
            background:
              radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.95) 0 7px, rgba(255, 255, 255, 0) 8px),
              radial-gradient(circle at 50% 8%, rgba(250, 204, 21, 0.98) 0 5px, transparent 6px),
              radial-gradient(circle at 74% 16%, rgba(245, 158, 11, 0.95) 0 5px, transparent 6px),
              radial-gradient(circle at 90% 40%, rgba(234, 179, 8, 0.95) 0 5px, transparent 6px),
              radial-gradient(circle at 86% 66%, rgba(253, 224, 71, 0.95) 0 5px, transparent 6px),
              radial-gradient(circle at 64% 88%, rgba(249, 115, 22, 0.92) 0 5px, transparent 6px),
              radial-gradient(circle at 36% 88%, rgba(251, 191, 36, 0.95) 0 5px, transparent 6px),
              radial-gradient(circle at 14% 66%, rgba(245, 158, 11, 0.92) 0 5px, transparent 6px),
              radial-gradient(circle at 10% 40%, rgba(252, 211, 77, 0.95) 0 5px, transparent 6px),
              radial-gradient(circle at 26% 16%, rgba(217, 119, 6, 0.9) 0 5px, transparent 6px);
            filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.45));
            animation: fireworks-pop ${FIREWORK_ROUND_MS}ms ease-out ${FIREWORK_ROUNDS};
            opacity: 0;
          }

          @keyframes fireworks-pop {
            0% {
              transform: translate(-50%, -50%) scale(0.15);
              opacity: 0;
            }
            15% {
              opacity: 1;
            }
            55% {
              transform: translate(-50%, -50%) scale(1.05);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.28);
              opacity: 0;
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(246,241,232,0.96))] px-4 py-8 sm:px-8">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-[min(1280px,100vw)] flex-col justify-center gap-6">
        <div className="text-center">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-[rgba(63,49,43,0.5)]">
            {language === "zh" ? "复习现场" : "Review Session"}
          </div>
          <div className="inline-flex items-center gap-2 border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.92)] px-4 py-2 text-sm font-semibold text-[rgba(63,49,43,0.68)]">
            <span className="h-2 w-2 rounded-full bg-[var(--accent-oxblood)]" />
            {question.direction === "en-zh" ? t("review.enToZh") : t("review.zhToEn")} · {t("review.question")} {session.currentIndex + 1} / {session.steps.length} · {t("review.target")} {targetLimit} {t("review.words")}
          </div>
        </div>

        <div className="border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] p-6 sm:p-8 shadow-[0_18px_40px_-30px_rgba(40,30,24,0.24)]">
          <div className="mb-5 inline-flex items-center border border-[rgba(76,63,54,0.16)] bg-[rgba(255,253,248,0.92)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(63,49,43,0.66)]">
            {currentCard.pos || t("review.posFallback")}
          </div>
          <div className="mb-6 border border-[rgba(76,63,54,0.14)] bg-[rgba(255,253,248,0.92)] px-5 py-5">
            <div
              className={`font-bold leading-tight text-slate-900 ${
                question.direction === "zh-en" ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"
              }`}
            >
              {question.prompt}
            </div>
          </div>

          <div className="grid gap-3">
            {question.options.map((option, optionIndex) => {
              const isSelected = selectedOption === option;
              const isSelectedCorrect = answerCorrect === true && isSelected;

              return (
                <button
                  key={`${currentCard.id}-${option}-${optionIndex}`}
                  type="button"
                  onClick={() => handleSelect(option)}
                  disabled={submitting || !!selectedOption}
                  className={`group flex items-start gap-3 text-left px-4 py-3 rounded-xl border transition-all duration-200 text-lg ${
                    isSelectedCorrect
                      ? "bg-emerald-100 border-emerald-400 text-emerald-900 shadow-sm"
                      : isSelected
                      ? "bg-rose-100 border-rose-400 text-rose-900 shadow-sm"
                      : "bg-[rgba(255,253,248,0.96)] hover:bg-[rgba(249,243,235,0.92)] border-[rgba(76,63,54,0.16)] hover:border-[rgba(110,59,51,0.26)]"
                  }`}
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center border border-[rgba(76,63,54,0.14)] bg-[rgba(255,250,244,0.95)] text-xs font-semibold text-[rgba(63,49,43,0.72)] group-hover:bg-[rgba(249,243,235,0.88)]">
                    {OPTION_LABELS[optionIndex] ?? optionIndex + 1}
                  </span>
                  <span className="leading-7">{option}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
