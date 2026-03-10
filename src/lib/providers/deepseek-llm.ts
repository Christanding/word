import type { LlmProvider, DefinitionResult, LlmOptions } from "./types";

export interface DeepSeekConfig {
  apiKey: string;
  model?: string;
}

export class DeepSeekLlmProvider implements LlmProvider {
  private config: DeepSeekConfig;
  private readonly baseUrl = "https://api.deepseek.com/chat/completions";

  constructor(config: DeepSeekConfig) {
    this.config = config;
  }

  async defineWords(words: string[], options?: LlmOptions): Promise<DefinitionResult[]> {
    const model = options?.model || this.config.model || "deepseek-chat";
    const maxSenses = options?.maxSenses || 3;
    const includePos = options?.includePos !== false;

    const batchSize = 30;
    const results: DefinitionResult[] = [];
    for (let i = 0; i < words.length; i += batchSize) {
      const batch = words.slice(i, i + batchSize);
      const batchResults = await this.processBatch(batch, model, maxSenses, includePos);
      results.push(...batchResults);
    }
    return results;
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
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return words.map((word) => this.createFallbackResult(word));
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((item: { lemma?: string; pos?: string; senses?: string[] }) => ({
        lemma: item.lemma || "",
        pos: item.pos,
        senses: (item.senses || []).slice(0, maxSenses),
        model,
        tokensUsed: data.usage?.total_tokens,
      }));
    } catch {
      return words.map((word) => this.createFallbackResult(word));
    }
  }

  private buildPrompt(words: string[], maxSenses: number, includePos: boolean): string {
    return `For each English word below, provide Chinese meanings in JSON array format:
${words.map((word, index) => `${index + 1}. ${word}`).join("\n")}

Output JSON format:
[
  {
    "lemma": "word",
    "pos": "n./v.",
    "senses": ["中文释义1", "中文释义2"]
  }
]

Rules:
- Use simplified Chinese
- Provide up to ${maxSenses} common senses
- Include part of speech (${includePos ? "yes" : "no"})
- Output ONLY JSON array`;}

  private createFallbackResult(word: string): DefinitionResult {
    return {
      lemma: word,
      senses: ["暂无释义"],
      model: "fallback",
      tokensUsed: 0,
    };
  }
}
