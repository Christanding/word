"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/app/language-provider";
import {
  MAX_REVIEW_LIMIT,
  MIN_REVIEW_LIMIT,
  normalizeReviewLimitInput,
  persistReviewLimitInput,
} from "@/lib/review-limit";

interface AppPageClientProps {
  initialReviewLimit: string;
}

export default function AppPageClient({ initialReviewLimit }: AppPageClientProps) {
  const [reviewLimitInput, setReviewLimitInput] = useState(initialReviewLimit);
  const [stats, setStats] = useState({
    documents: 0,
    wordsLearned: 0,
    dueToday: 0,
    dayStreak: 0,
  });
  const { language, setLanguage, t } = useLanguage();
  const normalizedReviewLimit = normalizeReviewLimitInput(reviewLimitInput);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (data?.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }, []);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => {
      void loadStats();
    }, 0);

    const intervalId = window.setInterval(() => {
      void loadStats();
    }, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadStats();
      }
    };

    window.addEventListener("focus", loadStats);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearTimeout(initialLoadTimer);
      window.clearInterval(intervalId);
      window.removeEventListener("focus", loadStats);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadStats]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(246,241,232,0.96))]">
      <header className="border-b border-[rgba(76,63,54,0.14)]">
        <div className="mx-auto flex w-full max-w-[min(1440px,100vw)] items-center justify-between px-6 py-4 sm:px-10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[rgba(63,49,43,0.72)]">
            {language === "zh" ? "词汇编辑部" : "Vocab Editorial Desk"}
          </div>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-[rgba(63,49,43,0.62)]">
            <span>{t("lang.label")}</span>
            <div className="flex items-center gap-2 border-l border-[rgba(76,63,54,0.14)] pl-3">
              <button
                type="button"
                onClick={() => setLanguage("en")}
                aria-label="Switch to English"
                aria-current={language === "en"}
                className={`pb-0.5 transition-colors ${
                  language === "en"
                    ? "text-[var(--accent-ink)] border-b border-[var(--accent-ink)]"
                    : "text-[rgba(63,49,43,0.56)] hover:text-[var(--accent-ink)]"
                }`}
              >
                {t("lang.en")}
              </button>
              <span className="text-[rgba(76,63,54,0.24)]">/</span>
              <button
                type="button"
                onClick={() => setLanguage("zh")}
                aria-label="切换到中文"
                aria-current={language === "zh"}
                className={`pb-0.5 transition-colors ${
                  language === "zh"
                    ? "text-[var(--accent-ink)] border-b border-[var(--accent-ink)]"
                    : "text-[rgba(63,49,43,0.56)] hover:text-[var(--accent-ink)]"
                }`}
              >
                {t("lang.zh")}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-6 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto w-full max-w-[min(1440px,100vw)]">
          <div className="mb-20 border-b border-[rgba(76,63,54,0.14)] pb-14 text-center sm:mb-24 sm:pb-16">
            <div className="mb-6 text-[11px] uppercase tracking-[0.22em] text-[rgba(63,49,43,0.48)]">
              {language === "zh" ? "刊首导语" : "Editor's Note"}
            </div>
            <h1 className="mb-5 text-5xl font-semibold leading-[1.02] text-[var(--accent-ink)] sm:text-6xl">
              Vellichor
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-8 text-[rgba(63,49,43,0.78)] sm:text-xl">
              "In the dust of time, find your words to build your own Vellichor."
            </p>
          </div>

          <div className="mb-16 grid gap-px overflow-hidden border border-[rgba(76,63,54,0.14)] bg-[rgba(76,63,54,0.14)] md:grid-cols-4">
            {[
              {
                href: "/app/upload",
                icon: "§",
                gradient: "from-indigo-100 to-purple-100",
                title: t("home.card.uploadTitle"),
                desc: t("home.card.uploadDesc"),
                color: language === "zh" ? "卷一" : "folio i",
              },
              {
                href: "/app/words",
                icon: "¶",
                gradient: "from-purple-100 to-pink-100",
                title: t("home.card.vocabTitle"),
                desc: t("home.card.vocabDesc"),
                color: language === "zh" ? "卷二" : "folio ii",
              },
              {
                href: "/app/review",
                icon: "※",
                gradient: "from-pink-100 to-indigo-100",
                title: t("home.card.reviewTitle"),
                desc: t("home.card.reviewDesc"),
                color: language === "zh" ? "卷三" : "folio iii",
              },
              {
                href: "/app/vocab-test",
                icon: "◇",
                gradient: "from-amber-100 to-yellow-100",
                title: t("home.card.vocabTestTitle"),
                desc: t("home.card.vocabTestDesc"),
                color: language === "zh" ? "卷四" : "folio iv",
              },
            ].map((card) => (
              <a
                key={card.href}
                href={card.href}
                className="group bg-[rgba(255,252,247,0.96)] p-7 transition-colors duration-200 hover:bg-[rgba(249,243,235,0.98)] sm:p-8"
              >
                <div className="mb-6 flex items-center justify-between border-b border-[rgba(76,63,54,0.14)] pb-4 text-[rgba(63,49,43,0.82)]">
                  <span className="text-[2rem] leading-none text-[var(--accent-ink)]">{card.icon}</span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-[rgba(63,49,43,0.55)]">{card.color}</span>
                </div>
                <h2 className="mb-3 text-2xl font-semibold leading-tight text-[var(--accent-ink)]">{card.title}</h2>
                <p className="mb-6 leading-7 text-[rgba(63,49,43,0.75)]">{card.desc}</p>
                <div className="flex items-center font-semibold text-[var(--accent-oxblood)] group-hover:translate-x-1 transition-transform duration-200">
                  {t("home.getStarted")} ·
                </div>
              </a>
            ))}
          </div>

          <div className="mb-12 border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.82)] p-8 shadow-[0_18px_40px_-30px_rgba(40,30,24,0.18)]">
            <div className="mb-6 flex items-end justify-between gap-6 border-b border-[rgba(76,63,54,0.14)] pb-4">
              <div>
                <h2 className="mb-3 text-2xl font-semibold leading-tight text-[var(--accent-ink)]">{t("home.quickSetup")}</h2>
                <p className="leading-7 text-[rgba(63,49,43,0.75)]">{t("home.quickSetupDesc")}</p>
              </div>
              <div className="hidden text-[11px] uppercase tracking-[0.18em] text-[rgba(63,49,43,0.52)] sm:block">
                {language === "zh" ? "学习设置" : "Study Settings"}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              <label className="text-sm leading-6 text-[rgba(63,49,43,0.75)]" htmlFor="review-limit">
                {t("home.wordsPerSession")}
              </label>
              <input
                id="review-limit"
                type="number"
                inputMode="numeric"
                min={MIN_REVIEW_LIMIT}
                max={MAX_REVIEW_LIMIT}
                step={1}
                value={reviewLimitInput}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setReviewLimitInput(nextValue);
                  persistReviewLimitInput(nextValue);
                }}
                onBlur={() => {
                  const nextValue = normalizeReviewLimitInput(reviewLimitInput);
                  setReviewLimitInput(nextValue);
                  persistReviewLimitInput(nextValue);
                }}
                className="rounded-none border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.92)] px-3 py-2.5 leading-6 text-[var(--accent-ink)] outline-none focus:border-[var(--accent-oxblood)]"
              />
              <a
                href={`/app/review?limit=${normalizedReviewLimit}`}
                className="inline-flex items-center justify-center border border-[var(--accent-ink)] bg-[var(--accent-ink)] px-4 py-2.5 text-white font-semibold leading-5 hover:bg-[var(--accent-oxblood)] hover:border-[var(--accent-oxblood)] transition-colors"
              >
                {t("home.startReview")}
              </a>
            </div>
          </div>

          <div className="mb-4 grid gap-px overflow-hidden border border-[rgba(76,63,54,0.14)] bg-[rgba(76,63,54,0.14)] md:grid-cols-3">
            {[
              { icon: "🔤", label: t("home.stats.wordsLearned"), value: stats.wordsLearned },
              { icon: "⏰", label: t("home.stats.dueToday"), value: stats.dueToday },
              { icon: "🔥", label: t("home.stats.dayStreak"), value: stats.dayStreak },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-[rgba(255,252,247,0.94)] p-6 text-center"
              >
                <div className="mb-3 text-3xl">{stat.icon}</div>
                <div className="mb-1 text-3xl font-semibold text-[var(--accent-ink)]">{String(stat.value)}</div>
                <div className="text-sm leading-6 text-[rgba(63,49,43,0.65)]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
