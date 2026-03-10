import type { VocabLevel, VocabQuestion } from "./types";

interface RealtimeQuestionPayload {
  word: string;
  pos?: string;
  correctMeaning: string;
  distractors: string[];
  explanation: string;
}

function extractPosPrefix(raw: string): string | undefined {
  const matched = raw.trim().match(/^【([^】]+)】/u);
  return matched?.[1];
}

function parseQuestionPayload(content: string): RealtimeQuestionPayload | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (
      typeof parsed.word !== "string" ||
      typeof parsed.correctMeaning !== "string" ||
      !Array.isArray(parsed.distractors) ||
      typeof parsed.explanation !== "string"
    ) {
      return null;
    }

    const distractors = parsed.distractors.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
    if (distractors.length < 3) {
      return null;
    }

    return {
      word: parsed.word.trim().toLowerCase(),
      pos: typeof parsed.pos === "string" ? parsed.pos : undefined,
      correctMeaning: parsed.correctMeaning.trim(),
      distractors: distractors.slice(0, 3),
      explanation: parsed.explanation.trim(),
    };
  } catch {
    return null;
  }
}

function normalizeDetailedMeaning(raw: string, pos?: string): string {
  const cleaned = raw
    .trim()
    .replace(/^【[^】]+】\s*/u, "")
    .replace(/[。；]+$/g, "");
  if (!cleaned) {
    return cleaned;
  }
  const prefix = pos ? `【${pos}】` : "";
  return `${prefix}${cleaned}；常见语境释义`;
}

function shuffle<T>(items: T[]): T[] {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

export async function generateRealtimeQuestion(
  level: VocabLevel,
  askedWords: string[],
  seenOptionMeanings: string[] = []
): Promise<VocabQuestion | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "You generate vocabulary MCQ questions. Output JSON only. All options must share the same part-of-speech as the target word, and distractors should be highly confusable.",
        },
        {
          role: "user",
          content: `Generate one ${level.toUpperCase()}-level English vocabulary question. Avoid these words: ${askedWords
            .slice(-30)
            .join(", ")}. Also avoid reusing these Chinese meanings: ${seenOptionMeanings.slice(-30).join(" | ")}. Output JSON with fields: word,pos,correctMeaning,distractors(3),explanation. The 3 distractors must use the same POS as word.pos and be semantically close/confusable. Chinese meanings must be simplified Chinese and formatted like 【v.】释义1；释义2；语境提示。`,
        },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseQuestionPayload(content);
  if (!parsed) {
    return null;
  }

  const canonicalPos =
    parsed.pos || extractPosPrefix(parsed.correctMeaning) || parsed.distractors.map(extractPosPrefix).find(Boolean);
  if (!canonicalPos) {
    return null;
  }

  const excluded = new Set(
    seenOptionMeanings.map((item) => item.replace(/^【[^】]+】\s*/u, "").replace(/[；。\s]+/gu, ""))
  );
  const normalizedCorrect = normalizeDetailedMeaning(parsed.correctMeaning, canonicalPos);
  const normalizedDistractors = parsed.distractors
    .filter((item) => {
      const itemPos = extractPosPrefix(item);
      return !itemPos || itemPos === canonicalPos;
    })
    .map((item) => normalizeDetailedMeaning(item, canonicalPos));
  const normalizedUnique = Array.from(new Set([normalizedCorrect, ...normalizedDistractors]));
  const unseen = normalizedUnique.filter(
    (item) => !excluded.has(item.replace(/^【[^】]+】\s*/u, "").replace(/[；。\s]+/gu, ""))
  );
  const seen = normalizedUnique.filter(
    (item) => excluded.has(item.replace(/^【[^】]+】\s*/u, "").replace(/[；。\s]+/gu, ""))
  );
  const detailedOptions = shuffle([...unseen, ...seen].slice(0, 4));
  if (detailedOptions.length < 4) {
    return null;
  }
  return {
    id: crypto.randomUUID(),
    level,
    word: parsed.word,
    pos: canonicalPos,
    correctMeaning: normalizedCorrect,
    options: detailedOptions,
    explanation: parsed.explanation,
    source: "ai",
  };
}
