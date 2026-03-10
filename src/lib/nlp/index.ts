import lemmatizer from "wink-lemmatizer";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "must", "shall", "can", "need",
  "dare", "ought", "used", "it", "its", "this", "that", "these", "those",
  "i", "you", "he", "she", "we", "they", "what", "which", "who", "whom",
  "where", "when", "why", "how", "all", "each", "every", "both", "few",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only",
  "own", "same", "so", "than", "too", "very", "just", "also",
]);

const POS_TAG_WORDS = new Set(["n", "v", "adj", "adv", "vt", "vi", "prep", "pron", "conj", "det"]);

export interface WordToken {
  lemma: string;
  original: string;
  frequency: number;
}

export function tokenize(text: string): string[] {
  // Match English words with optional internal apostrophe or hyphen
  const matches = text.match(/[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]/g) || [];
  return matches;
}

export function normalizeWord(word: string): string {
  // Lowercase
  let normalized = word.toLowerCase();
  
  // Remove leading/trailing punctuation
  normalized = normalized.replace(/^['-]+|['-]+$/g, "");

  // Lemmatize
  const lemmaFns = [
    (lemmatizer as { verb?: (w: string) => string }).verb,
    (lemmatizer as { noun?: (w: string) => string }).noun,
    (lemmatizer as { adjective?: (w: string) => string }).adjective,
    (lemmatizer as { adverb?: (w: string) => string }).adverb,
  ];

  const candidates = lemmaFns
    .filter((fn): fn is (w: string) => string => typeof fn === "function")
    .map((fn) => fn(normalized))
    .filter(Boolean);

  normalized = candidates.find((lemma) => lemma !== normalized) ?? normalized;

  return normalized;
}

export function isNoiseWord(word: string): boolean {
  // Too short
  if (word.length <= 2) return true;
  
  // Stopword
  if (STOPWORDS.has(word.toLowerCase())) return true;

  // POS tags extracted from glossary-like sources
  if (POS_TAG_WORDS.has(word.toLowerCase())) return true;
  
  // Too many repeated characters (OCR noise)
  if (/(.)\1{3,}/.test(word)) return true;
  
  // Contains digits (unless it's a known word with digits)
  if (/\d/.test(word) && !/^[A-Za-z]+$/.test(word)) return true;
  
  return false;
}

export function extractWords(text: string, maxWords: number = 1000): WordToken[] {
  const tokens = tokenize(text);
  const wordMap = new Map<string, { original: string; count: number }>();
  
  for (const token of tokens) {
    const normalized = normalizeWord(token);
    
    if (isNoiseWord(normalized)) continue;
    if (!/^[a-z]+$/.test(normalized)) continue;
    
    const existing = wordMap.get(normalized);
    if (existing) {
      existing.count++;
    } else {
      wordMap.set(normalized, { original: token, count: 1 });
    }
  }
  
  // Convert to array and sort by frequency
  const words: WordToken[] = Array.from(wordMap.entries())
    .map(([lemma, data]) => ({
      lemma,
      original: data.original,
      frequency: data.count,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, maxWords);
  
  return words;
}
