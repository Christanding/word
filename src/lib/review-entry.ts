import { normalizeReviewLimitInput } from "@/lib/review-limit";

export function buildReviewPath(limitInput: string): string {
  const limit = normalizeReviewLimitInput(limitInput);
  return `/app/review?limit=${encodeURIComponent(limit)}`;
}
