import type { LlmProvider, DefinitionResult, LlmOptions } from "./types";

export interface DashScopeConfig {
  apiKey: string;
  model?: string;
}

export class DashScopeLlmProvider implements LlmProvider {
  private config: DashScopeConfig;
  private readonly baseUrl = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";

  constructor(config: DashScopeConfig) {
    this.config = config;
  }

  async defineWords(words: string[], options?: LlmOptions): Promise<DefinitionResult[]> {
    const model = options?.model || this.config.model || "qwen-plus";
    const maxSenses = options?.maxSenses || 3;

    // Batch words into groups of 30 to avoid token limits
    const batchSize = 30;
    const batches: string[][] = [];
    for (let i = 0; i < words.length; i += batchSize) {
      batches.push(words.slice(i, i + batchSize));
    }

    const allResults: DefinitionResult[] = [];

    for (const batch of batches) {
      const results = await this.processBatch(batch, model, maxSenses, options?.includePos !== false);
      allResults.push(...results);
    }

    return allResults;
  }

  private async processBatch(
    words: string[],
    model: string,
    maxSenses: number,
    includePos: boolean
  ): Promise<DefinitionResult[]> {
    const prompt = this.buildPrompt(words, maxSenses, includePos);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: {
            messages: [
              {
                role: "system",
                content: "You are a bilingual dictionary assistant. Output ONLY valid JSON.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          },
          parameters: {
            result_format: "json",
            temperature: 0.3,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`DashScope API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      const content = data.output?.text || "";

      // Parse JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn("Failed to parse JSON from LLM response:", content);
        return words.map((word) => this.createFallbackResult(word));
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (!Array.isArray(parsed)) {
        return words.map((word) => this.createFallbackResult(word));
      }

      return parsed.map((item) => {
        const entry = isDefinitionLike(item)
          ? item
          : { lemma: "", pos: undefined, senses: [] };
        return {
          lemma: entry.lemma,
          pos: entry.pos,
          senses: entry.senses.slice(0, maxSenses),
          model,
          tokensUsed: data.usage?.total_tokens,
        };
      }).filter((result) => result.lemma.length > 0);
    } catch (error: unknown) {
      console.error("DashScope LLM error:", error);
      // Return fallback results instead of throwing
      return words.map((word) => this.createFallbackResult(word));
    }
  }

  private buildPrompt(words: string[], maxSenses: number, includePos: boolean): string {
    return `For each of these English words, provide a Chinese definition in JSON format:
${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}

Output format (JSON array):
[
  {
    "lemma": "word",
    "pos": "n./v.",
    "senses": ["中文释义 1", "中文释义 2"]
  }
]

Rules:
- Provide ${maxSenses} most common senses
- Include part of speech (${includePos ? "yes" : "no"})
- Output ONLY the JSON array, no other text
- Use simplified Chinese
`;
  }

  private createFallbackResult(word: string): DefinitionResult {
    return {
      lemma: word,
      senses: ["暂无释义"],
      model: "fallback",
      tokensUsed: 0,
    };
  }
}

interface DefinitionLike {
  lemma: string;
  pos?: string;
  senses: string[];
}

function isDefinitionLike(value: unknown): value is DefinitionLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.lemma === "string" &&
    (candidate.pos === undefined || typeof candidate.pos === "string") &&
    Array.isArray(candidate.senses) &&
    candidate.senses.every((sense) => typeof sense === "string")
  );
}
