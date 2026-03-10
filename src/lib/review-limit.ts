export const DEFAULT_REVIEW_LIMIT = 20;
export const MIN_REVIEW_LIMIT = 1;
export const MAX_REVIEW_LIMIT = 100;
export const REVIEW_LIMIT_STORAGE_KEY = "vocab-review-limit";

export function persistReviewLimitInput(inputValue: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(REVIEW_LIMIT_STORAGE_KEY, inputValue);
  document.cookie = `${REVIEW_LIMIT_STORAGE_KEY}=${encodeURIComponent(inputValue)}; path=/; max-age=31536000; samesite=lax`;
}

export function parseReviewLimit(limitValue: string | null): number {
  if (!limitValue) {
    return DEFAULT_REVIEW_LIMIT;
  }

  const parsed = Number.parseInt(limitValue, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_REVIEW_LIMIT) {
    return DEFAULT_REVIEW_LIMIT;
  }

  return Math.min(parsed, MAX_REVIEW_LIMIT);
}

export function normalizeReviewLimitInput(inputValue: string): string {
  const trimmed = inputValue.trim();
  if (trimmed.length === 0) {
    return String(DEFAULT_REVIEW_LIMIT);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return String(DEFAULT_REVIEW_LIMIT);
  }

  if (parsed < MIN_REVIEW_LIMIT) {
    return String(MIN_REVIEW_LIMIT);
  }

  if (parsed > MAX_REVIEW_LIMIT) {
    return String(MAX_REVIEW_LIMIT);
  }

  return String(parsed);
}
