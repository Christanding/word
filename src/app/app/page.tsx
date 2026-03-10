import { cookies } from "next/headers";
import AppPageClient from "./app-page-client";
import {
  DEFAULT_REVIEW_LIMIT,
  normalizeReviewLimitInput,
  REVIEW_LIMIT_STORAGE_KEY,
} from "@/lib/review-limit";

function resolveInitialReviewLimit(rawCookieValue: string | undefined): string {
  if (!rawCookieValue) {
    return String(DEFAULT_REVIEW_LIMIT);
  }

  try {
    return normalizeReviewLimitInput(decodeURIComponent(rawCookieValue));
  } catch {
    return normalizeReviewLimitInput(rawCookieValue);
  }
}

export default async function AppPage() {
  const cookieStore = await cookies();
  const reviewLimitCookie = cookieStore.get(REVIEW_LIMIT_STORAGE_KEY)?.value;

  return <AppPageClient initialReviewLimit={resolveInitialReviewLimit(reviewLimitCookie)} />;
}
