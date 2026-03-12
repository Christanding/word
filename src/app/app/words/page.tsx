"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/language-provider";
import {
  MAX_REVIEW_LIMIT,
  MIN_REVIEW_LIMIT,
  normalizeReviewLimitInput,
  persistReviewLimitInput,
  REVIEW_LIMIT_STORAGE_KEY,
} from "@/lib/review-limit";
import { buildReviewPath } from "@/lib/review-entry";
import { formatDefinitionsInline, formatPrimaryDefinition } from "@/lib/definition-display";
import { shouldSkipDefinitionVerification } from "@/lib/manual-word";
import { resolveGenerateLemma } from "@/lib/manual-word-suggestion";

interface Word {
  id: string;
  lemma: string;
  frequency: number;
  hasDefinition?: boolean;
  hasReviewed?: boolean;
  definition?: {
    pos?: string;
    senses?: string[];
  };
  definitions?: Array<{
    pos?: string;
    senses?: string[];
  }>;
}

interface ManualDefinitionRow {
  id: string;
  pos: string;
  sensesText: string;
}

function normalizeLemma(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function createManualRow(): ManualDefinitionRow {
  return {
    id: crypto.randomUUID(),
    pos: "",
    sensesText: "",
  };
}

export default function WordsPage() {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "reviewed" | "unreviewed">("all");
  const [expandedWordId, setExpandedWordId] = useState<string | null>(null);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualWord, setManualWord] = useState("");
  const [manualRows, setManualRows] = useState<ManualDefinitionRow[]>([createManualRow()]);
  const [manualGenerating, setManualGenerating] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualGeneratedReady, setManualGeneratedReady] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manualSuggestion, setManualSuggestion] = useState("");
  const [manualSuccess, setManualSuccess] = useState("");
  const [reviewLimitInput, setReviewLimitInput] = useState(() => {
    if (typeof window === "undefined") {
      return "20";
    }
    const savedLimit = window.localStorage.getItem(REVIEW_LIMIT_STORAGE_KEY);
    return savedLimit ? normalizeReviewLimitInput(savedLimit) : "20";
  });
  const router = useRouter();
  const { language, t } = useLanguage();

  const loadWords = useCallback(async () => {
    try {
      const res = await fetch("/api/words");
      const data = await res.json();
      setWords(data.words || []);
    } catch (err) {
      console.error("Failed to load words:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  const filteredWords = words.filter((word) => {
    const lemma = normalizeLemma(word.lemma);
    const matchesSearch = lemma.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "reviewed" && word.hasReviewed) ||
      (filter === "unreviewed" && !word.hasReviewed);
    return lemma.length > 0 && matchesSearch && matchesFilter;
  });

  const stats = {
    total: words.length,
    reviewed: words.filter((w) => w.hasReviewed).length,
    unreviewed: words.filter((w) => !w.hasReviewed).length,
  };

  const filteredWordIds = filteredWords.map((word) => word.id);
  const allFilteredSelected =
    filteredWordIds.length > 0 && filteredWordIds.every((id) => selectedWordIds.includes(id));

  const toggleWordSelection = (wordId: string) => {
    setSelectedWordIds((current) =>
      current.includes(wordId) ? current.filter((id) => id !== wordId) : [...current, wordId]
    );
  };

  const toggleSelectAllFiltered = () => {
    setSelectedWordIds((current) => {
      if (allFilteredSelected) {
        return current.filter((id) => !filteredWordIds.includes(id));
      }
      const merged = new Set([...current, ...filteredWordIds]);
      return Array.from(merged);
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedWordIds.length === 0 || deleting) {
      return;
    }

    if (!window.confirm(`${t("words.confirmDeleteSelected")} ${selectedWordIds.length} ${t("words.confirmDeleteSelectedSuffix")}`)) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch("/api/words", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordIds: selectedWordIds }),
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setSelectedWordIds([]);
      setExpandedWordId(null);
      await loadWords();
    } catch (error) {
      console.error("Failed to delete selected words:", error);
      alert(t("words.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (stats.total === 0 || deleting) {
      return;
    }

    if (!window.confirm(t("words.confirmDeleteAll"))) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch("/api/words", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });

      if (!response.ok) {
        throw new Error("Delete all failed");
      }

      setSelectedWordIds([]);
      setExpandedWordId(null);
      await loadWords();
    } catch (error) {
      console.error("Failed to delete all words:", error);
      alert(t("words.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const resetManualForm = () => {
    setManualWord("");
    setManualRows([createManualRow()]);
    setManualError("");
    setManualSuggestion("");
    setManualSuccess("");
    setManualGenerating(false);
    setManualSaving(false);
    setManualGeneratedReady(false);
  };

  const handleOpenManual = () => {
    resetManualForm();
    setManualOpen(true);
  };

  const handleCloseManual = () => {
    setManualOpen(false);
    resetManualForm();
  };

  const handleGenerateDefinitions = async (preferredLemma?: string) => {
    const lemma = resolveGenerateLemma(manualWord, preferredLemma);
    if (!lemma || manualGenerating || manualSaving) {
      return;
    }

    setManualError("");
    setManualSuggestion("");
    setManualSuccess("");
    setManualGenerating(true);
    try {
      const response = await fetch("/api/words/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", lemma }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data?.code === "INVALID_WORD") {
          const suggestion = typeof data?.suggestion === "string" ? data.suggestion.trim() : "";
          setManualSuggestion(suggestion);
          setManualGeneratedReady(false);
          throw new Error(t("words.manual.invalidWord"));
        }
        setManualGeneratedReady(false);
        throw new Error(data.message || t("words.manual.error"));
      }

      const generatedRows = Array.isArray(data.definitions)
        ? data.definitions.map((definition: { pos?: string; senses?: string[] }) => ({
            id: crypto.randomUUID(),
            pos: definition.pos || "",
            sensesText: Array.isArray(definition.senses) ? definition.senses.join("；") : "",
          }))
        : [];

      if (typeof data.lemma === "string" && data.lemma.trim().length > 0) {
        setManualWord(data.lemma.trim());
      }
      setManualSuggestion("");
      setManualGeneratedReady(true);

      setManualRows(generatedRows.length > 0 ? generatedRows : [createManualRow()]);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : t("words.manual.error"));
    } finally {
      setManualGenerating(false);
    }
  };

  const handleSaveManualWord = async () => {
    const lemma = manualWord.trim();
    if (!lemma || manualSaving || manualGenerating) {
      return;
    }

    setManualError("");
    setManualSuggestion("");
    setManualSuccess("");
    setManualSaving(true);
    try {
      const response = await fetch("/api/words/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          lemma,
          skipVerify: shouldSkipDefinitionVerification(manualGeneratedReady),
          definitions: manualRows.map((row) => ({
            pos: row.pos,
            senses: row.sensesText
              .split(/[;；\n]+/)
              .map((sense) => sense.trim())
              .filter((sense) => sense.length > 0),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data?.code === "INVALID_WORD") {
          const suggestion = typeof data?.suggestion === "string" ? data.suggestion.trim() : "";
          setManualSuggestion(suggestion);
          throw new Error(t("words.manual.invalidWord"));
        }
        throw new Error(data.message || t("words.manual.error"));
      }

      setManualSuccess(t("words.manual.success"));
      setManualSuggestion("");
      await loadWords();
      window.setTimeout(() => {
        handleCloseManual();
      }, 500);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : t("words.manual.error"));
    } finally {
      setManualSaving(false);
    }
  };

  const handleUpdateManualRow = (rowId: string, key: "pos" | "sensesText", value: string) => {
    setManualRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    );
  };

  const handleAddManualRow = () => {
    setManualRows((current) => [...current, createManualRow()]);
  };

  const handleRemoveManualRow = (rowId: string) => {
    setManualRows((current) => {
      if (current.length <= 1) {
        return [createManualRow()];
      }
      return current.filter((row) => row.id !== rowId);
    });
  };

  const handleUseSuggestion = () => {
    if (!manualSuggestion) {
      return;
    }

    const nextWord = manualSuggestion;
    setManualWord(nextWord);
    setManualError("");
    setManualSuggestion("");
    setManualSuccess("");
    void handleGenerateDefinitions(nextWord);
  };

  return (
    <>
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(246,241,232,0.96))] px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-[min(1440px,100vw)]">
          {/* Header */}
          <div className="mb-8 border-b border-[rgba(76,63,54,0.14)] pb-8">
            <div className="mb-6 flex items-start justify-between gap-6">
              <div>
                <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-[rgba(63,49,43,0.5)]">
                  {language === "zh" ? "词汇档案" : "Lexicon Archive"}
                </div>
                <h1 className="mb-2 text-4xl font-semibold leading-tight text-[var(--accent-ink)]">
                  {t("words.title")}
                </h1>
                <p className="leading-7 text-[rgba(63,49,43,0.74)]">
                  {stats.total} {t("words.stats")} • {stats.reviewed} {t("words.reviewed")} • {stats.unreviewed} {t("words.unreviewed")}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.92)] px-3 py-2 text-[rgba(63,49,43,0.72)]">
                  <label htmlFor="words-review-limit" className="text-sm text-slate-600 whitespace-nowrap">
                    {t("words.reviewCount")}
                  </label>
                  <input
                    id="words-review-limit"
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
                    className="w-20 border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.96)] px-2 py-1 text-[var(--accent-ink)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => router.push(buildReviewPath(reviewLimitInput))}
                  className="border border-[var(--accent-ink)] bg-[var(--accent-ink)] px-6 py-3 text-white font-medium transition-colors hover:border-[var(--accent-oxblood)] hover:bg-[var(--accent-oxblood)]"
                >
                  § {t("words.reviewCards")}
                </button>
                <button
                  type="button"
                  disabled={selectedWordIds.length === 0 || deleting}
                  onClick={handleDeleteSelected}
                  className="border border-[rgba(110,59,51,0.24)] bg-[rgba(255,253,248,0.96)] px-6 py-3 text-[var(--accent-oxblood)] font-medium transition-colors hover:bg-[rgba(110,59,51,0.08)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("words.deleteSelected")} ({selectedWordIds.length})
                </button>
                <button
                  type="button"
                  disabled={stats.total === 0 || deleting}
                  onClick={handleDeleteAll}
                  className="border border-[rgba(110,59,51,0.28)] bg-[rgba(255,253,248,0.96)] px-6 py-3 text-[var(--accent-oxblood)] font-medium transition-colors hover:bg-[rgba(110,59,51,0.08)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("words.deleteAll")}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/app/upload")}
                  className="border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.96)] px-6 py-3 text-[var(--accent-ink)] font-medium transition-colors hover:bg-[rgba(249,243,235,0.82)]"
                >
                  ¶ {t("words.uploadNew")}
                </button>
                <button
                  type="button"
                  onClick={handleOpenManual}
                  className="border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.96)] px-6 py-3 text-[var(--accent-ink)] font-medium transition-colors hover:bg-[rgba(249,243,235,0.82)]"
                >
                  ※ {t("words.manualAdd")}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder={t("words.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border border-[rgba(76,63,54,0.16)] bg-[rgba(255,253,248,0.96)] px-4 py-3 pl-12 focus:outline-none focus:ring-2 focus:ring-[rgba(110,59,51,0.16)] focus:border-[var(--accent-oxblood)]"
                />
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>{t("words.searchTitle")}</title>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="flex gap-2">
                {[
                  { key: "all", label: t("words.filter.all"), count: stats.total },
                  { key: "reviewed", label: t("words.filter.reviewed"), count: stats.reviewed },
                  { key: "unreviewed", label: t("words.filter.unreviewed"), count: stats.unreviewed },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key as "all" | "reviewed" | "unreviewed")}
                    className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                      filter === f.key
                        ? "border border-[var(--accent-ink)] bg-[var(--accent-ink)] text-white"
                        : "border border-[rgba(76,63,54,0.16)] bg-[rgba(255,253,248,0.96)] text-[rgba(63,49,43,0.68)] hover:bg-[rgba(249,243,235,0.82)]"
                    }`}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] p-12 text-center shadow-[0_18px_40px_-30px_rgba(40,30,24,0.24)]">
              <div className="inline-block w-12 h-12 rounded-full bg-indigo-100 animate-pulse mb-4" />
              <p className="text-slate-600">{t("words.loading")}</p>
            </div>
          ) : filteredWords.length === 0 ? (
            <div className="border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] p-12 text-center shadow-[0_18px_40px_-30px_rgba(40,30,24,0.24)]">
              <div className="mb-4 text-6xl leading-none text-[var(--accent-ink)]">¶</div>
              <p className="text-slate-600 mb-6">
                {searchTerm || filter !== "all"
                  ? t("words.empty.match")
                  : t("words.empty.initial")}
              </p>
              {!searchTerm && filter === "all" && (
                <button
                  type="button"
                  onClick={() => router.push("/app/upload")}
                  className="border border-[var(--accent-ink)] bg-[var(--accent-ink)] px-6 py-3 text-white font-medium transition-colors hover:border-[var(--accent-oxblood)] hover:bg-[var(--accent-oxblood)]"
                >
                  {t("words.uploadDocument")}
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.94)] shadow-[0_18px_40px_-30px_rgba(40,30,24,0.24)]">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[rgba(76,63,54,0.14)] bg-[rgba(255,253,248,0.96)]">
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[rgba(63,49,43,0.62)]">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                        />
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[rgba(63,49,43,0.62)]">
                        {t("words.table.word")}
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[rgba(63,49,43,0.62)]">
                        {t("words.table.definition")}
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[rgba(63,49,43,0.62)]">
                        {t("words.table.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredWords.slice(0, 100).map((word, index) => {
                      const lemma = normalizeLemma(word.lemma);

                      return (
                      <Fragment key={word.id}>
                        <tr
                          className="hover:bg-indigo-50/50 transition-colors duration-150"
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <td className="px-4 py-4 align-top">
                            <input
                              type="checkbox"
                              checked={selectedWordIds.includes(word.id)}
                              onChange={() => toggleWordSelection(word.id)}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                {lemma[0]?.toUpperCase() ?? "?"}
                              </div>
                              <span className="font-semibold text-slate-800 text-base">
                                {lemma}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 max-w-[16rem] sm:max-w-[26rem] text-sm text-slate-700 truncate">
                                {formatPrimaryDefinition(word.definitions, t("words.cnFallback"))}
                              </span>
                              <button
                                type="button"
                                className="shrink-0 text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors whitespace-nowrap"
                                onClick={() => setExpandedWordId(expandedWordId === word.id ? null : word.id)}
                              >
                                {expandedWordId === word.id ? t("words.hide") : t("words.view")} →
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`text-xs px-2 py-1 rounded-md font-medium ${
                                word.hasReviewed
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {word.hasReviewed ? `◆ ${t("words.status.reviewed")}` : `○ ${t("words.status.unreviewed")}`}
                            </span>
                          </td>
                        </tr>
                        {expandedWordId === word.id && word.hasDefinition && (
                          <tr className="bg-indigo-50/40">
                            <td colSpan={4} className="px-6 py-4">
                              <div className="text-sm text-slate-700 leading-7 break-words">
                                {formatDefinitionsInline(word.definitions, t("words.cnFallback"))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );})}
                  </tbody>
                </table>
              </div>
              {filteredWords.length > 100 && (
                <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-center text-sm text-slate-500">
                  {t("words.showing")} 100 {t("words.of")} {filteredWords.length} {t("words.stats")} • {t("words.useSearch")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t("words.manual.cancel")}
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm"
            onClick={handleCloseManual}
          />
          <div className="relative w-full max-w-3xl rounded-3xl border border-white/40 bg-gradient-to-br from-white via-white to-indigo-50/35 shadow-[0_24px_80px_rgba(15,23,42,0.25)] p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">{t("words.manual.title")}</h2>
                <p className="text-sm text-slate-500 mt-1">DeepSeek 生成并校验词性与中文释义</p>
              </div>
              <button
                type="button"
                onClick={handleCloseManual}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                {t("words.manual.cancel")}
              </button>
            </div>

            <div className="grid gap-4">
              <div>
                <label htmlFor="manual-word-input" className="block text-sm font-medium text-slate-700 mb-2">
                  {t("words.manual.wordLabel")}
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="manual-word-input"
                    value={manualWord}
                    onChange={(event) => {
                      setManualWord(event.target.value);
                      setManualSuggestion("");
                      setManualGeneratedReady(false);
                    }}
                    placeholder={t("words.manual.wordPlaceholder")}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleGenerateDefinitions();
                    }}
                    disabled={!manualWord.trim() || manualGenerating || manualSaving}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-white font-semibold disabled:opacity-50"
                  >
                    {manualGenerating ? t("words.manual.generating") : t("words.manual.generate")}
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
                {manualRows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                      <div>
                        <label htmlFor={`manual-pos-${row.id}`} className="block text-xs font-semibold text-slate-500 mb-1">{t("words.manual.posLabel")}</label>
                        <input
                          id={`manual-pos-${row.id}`}
                          value={row.pos}
                          onChange={(event) => handleUpdateManualRow(row.id, "pos", event.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder="adj. / n."
                        />
                      </div>
                      <div>
                        <label htmlFor={`manual-senses-${row.id}`} className="block text-xs font-semibold text-slate-500 mb-1">{t("words.manual.sensesLabel")}</label>
                        <textarea
                          id={`manual-senses-${row.id}`}
                          value={row.sensesText}
                          onChange={(event) => handleUpdateManualRow(row.id, "sensesText", event.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder={t("words.manual.sensesPlaceholder")}
                        />
                      </div>
                      <div className="sm:pt-6">
                        <button
                          type="button"
                          onClick={() => handleRemoveManualRow(row.id)}
                          className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          {t("words.manual.removeRow")}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleAddManualRow}
                  className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  + {t("words.manual.addRow")}
                </button>

                <button
                  type="button"
                  onClick={handleSaveManualWord}
                  disabled={!manualWord.trim() || manualSaving || manualGenerating}
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-white font-semibold disabled:opacity-50"
                >
                  {manualSaving ? t("words.manual.saving") : t("words.manual.save")}
                </button>
              </div>

              {manualError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <p>{manualError}</p>
                  {manualSuggestion ? (
                    <p className="mt-2">
                      {t("words.manual.didYouMean")} 
                      <button
                        type="button"
                        onClick={handleUseSuggestion}
                        className="inline-flex items-center rounded-md border border-rose-300 bg-white/80 px-2 py-0.5 font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        {manualSuggestion}
                      </button>
                      ?
                      <button
                        type="button"
                        onClick={handleUseSuggestion}
                        className="ml-2 text-rose-700 underline underline-offset-2 font-semibold hover:text-rose-800"
                      >
                        {t("words.manual.useSuggestion")}
                      </button>
                    </p>
                  ) : null}
                </div>
              ) : null}
              {manualSuccess ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{manualSuccess}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </>
  );
}
