interface DedupableWord {
  lemma: string;
  hasDefinition?: boolean;
  hasReviewed?: boolean;
  frequency?: number;
}

function rankWord(word: DedupableWord): number {
  const hasDefinitionScore = word.hasDefinition ? 1000 : 0;
  const hasReviewedScore = word.hasReviewed ? 100 : 0;
  const frequencyScore = word.frequency ?? 0;
  return hasDefinitionScore + hasReviewedScore + frequencyScore;
}

export function dedupeWordsByLemma<T extends DedupableWord>(words: T[]): T[] {
  const kept = new Map<string, T>();

  words.forEach((word) => {
    const key = word.lemma.trim().toLowerCase();
    const existing = kept.get(key);
    if (!existing) {
      kept.set(key, word);
      return;
    }

    if (rankWord(word) > rankWord(existing)) {
      kept.set(key, word);
    }
  });

  return Array.from(kept.values());
}
