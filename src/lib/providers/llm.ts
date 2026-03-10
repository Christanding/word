import type { LlmProvider } from "./types";
import { MockLlmProvider } from "./mock-llm";
import { DashScopeLlmProvider, type DashScopeConfig } from "./dashscope-llm";
import { DeepSeekLlmProvider, type DeepSeekConfig } from "./deepseek-llm";

export function getLlmProvider(): LlmProvider {
  const useMock = process.env.NODE_ENV === "test" || process.env.MOCK_LLM === "1";

  if (useMock) {
    console.log("Using Mock LLM Provider");
    return new MockLlmProvider();
  }

  if (process.env.DEEPSEEK_API_KEY) {
    const config: DeepSeekConfig = {
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    };
    console.log("Using DeepSeek LLM Provider");
    return new DeepSeekLlmProvider(config);
  }

  if (process.env.DASHSCOPE_API_KEY) {
    const config: DashScopeConfig = {
      apiKey: process.env.DASHSCOPE_API_KEY,
      model: process.env.DASHSCOPE_MODEL || "qwen-plus",
    };

    console.log("Using DashScope (Qwen) LLM Provider");
    return new DashScopeLlmProvider(config);
  }

  console.log("No LLM API key found, fallback to Mock LLM Provider");
  return new MockLlmProvider();
}

// Export all providers for direct use
export { MockLlmProvider } from "./mock-llm";
export { DashScopeLlmProvider } from "./dashscope-llm";
export { DeepSeekLlmProvider } from "./deepseek-llm";
