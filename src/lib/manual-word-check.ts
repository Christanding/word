export interface WordCheckResponse {
  exists: boolean;
  lemma?: string;
  suggestion?: string;
}

export interface GenerateWordResponse {
  status: "found" | "not_found";
  lemma: string;
  suggestion?: string;
  definitions: Array<{
    pos?: string;
    senses: string[];
  }>;
}

export function parseWordCheckResponse(content: string): WordCheckResponse | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.exists !== "boolean") {
      return null;
    }

    return {
      exists: candidate.exists,
      lemma: typeof candidate.lemma === "string" ? candidate.lemma : undefined,
      suggestion: typeof candidate.suggestion === "string" ? candidate.suggestion : undefined,
    };
  } catch {
    return null;
  }
}

export function parseGenerateWordResponse(content: string): GenerateWordResponse | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    const status = candidate.status;
    const lemma = candidate.lemma;
    if ((status !== "found" && status !== "not_found") || typeof lemma !== "string") {
      return null;
    }

    const definitionsRaw = Array.isArray(candidate.definitions) ? candidate.definitions : [];
    const definitions = definitionsRaw
      .map((item) => {
        if (typeof item !== "object" || item === null) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const senses = Array.isArray(record.senses)
          ? record.senses.filter((sense): sense is string => typeof sense === "string")
          : [];
        if (senses.length === 0) {
          return null;
        }
        return {
          pos: typeof record.pos === "string" ? record.pos : undefined,
          senses,
        };
      })
      .filter((item) => item !== null) as Array<{ pos?: string; senses: string[] }>;

    return {
      status,
      lemma,
      suggestion: typeof candidate.suggestion === "string" ? candidate.suggestion : undefined,
      definitions,
    };
  } catch {
    return null;
  }
}
