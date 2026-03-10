import type { LlmProvider, DefinitionResult, LlmOptions } from "./types";

// Mock LLM provider for local development and tests
export class MockLlmProvider implements LlmProvider {
  private callCount = 0;

  async defineWords(words: string[], options?: LlmOptions): Promise<DefinitionResult[]> {
    void options;
    this.callCount++;

    // Deterministic mock definitions for common words
    const mockDefinitions: Record<string, DefinitionResult> = {
      test: {
        lemma: "test",
        pos: "n./v.",
        senses: ["测试", "试验", "检验"],
        model: "mock-v1",
        tokensUsed: 10,
      },
      word: {
        lemma: "word",
        pos: "n.",
        senses: ["单词", "词", "话语"],
        model: "mock-v1",
        tokensUsed: 10,
      },
      example: {
        lemma: "example",
        pos: "n.",
        senses: ["例子", "榜样", "范例"],
        model: "mock-v1",
        tokensUsed: 10,
      },
      vocabulary: {
        lemma: "vocabulary",
        pos: "n.",
        senses: ["词汇", "词汇量", "词库"],
        model: "mock-v1",
        tokensUsed: 10,
      },
    };

    return words.map((word) => {
      const lowerWord = word.toLowerCase();
      const cached = mockDefinitions[lowerWord];
      if (cached) {
        return cached;
      }

      // Generate generic definition for unknown words
      return {
        lemma: lowerWord,
        pos: "n.",
        senses: [`[Mock] ${lowerWord} 的中文释义`, "示例含义"],
        model: "mock-v1",
        tokensUsed: 10,
      };
    });
  }

  // Reset for testing
  reset() {
    this.callCount = 0;
  }

  getCallCount() {
    return this.callCount;
  }
}
