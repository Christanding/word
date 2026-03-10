import { formatDefinitionsInline } from "@/lib/definition-display";

const DEFAULT_MAX_MEANINGS = 4;

export function getDisplayMeaning(
  senses: string[] | undefined,
  fallback: string,
  maxMeanings: number = DEFAULT_MAX_MEANINGS
): string {
  if (!senses || senses.length === 0) {
    return fallback;
  }

  const normalized = senses
    .map((sense) => sense.trim())
    .filter((sense) => sense.length > 0);

  if (normalized.length === 0) {
    return fallback;
  }

  return normalized.slice(0, maxMeanings).join("；");
}

export function getCardDisplayMeaning(
  pos: string | undefined,
  senses: string[] | undefined,
  fallback: string
): string {
  return formatDefinitionsInline([{ pos, senses }], fallback);
}
