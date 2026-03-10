import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, isMockOcrEnabled, isMockLlmEnabled } from "@/lib/config";

describe("Config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SESSION_SECRET: "test-secret",
      ADMIN_EMAIL: "test@example.com",
      ADMIN_PASSWORD_HASH: "test-hash",
      WORKER_SECRET: "worker-secret",
      MOCK_OCR: "1",
      MOCK_LLM: "1",
    };
    // Clear cached config by resetting the module cache
    // For simplicity in tests, we just rely on fresh process.env
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should load config with valid env vars", () => {
    const config = loadConfig();
    expect(config.SESSION_SECRET).toBe("test-secret");
    expect(config.ADMIN_EMAIL).toBe("test@example.com");
    expect(config.MOCK_OCR).toBe("1");
    expect(config.MOCK_LLM).toBe("1");
  });

  it("should return true for mock mode when enabled", () => {
    expect(isMockOcrEnabled()).toBe(true);
    expect(isMockLlmEnabled()).toBe(true);
  });

  it("should use default values for optional vars", () => {
    const config = loadConfig();
    expect(config.TENCENT_REGION).toBe("ap-guangzhou");
    expect(config.DASHSCOPE_MODEL).toBe("qwen-plus");
    expect(config.MAX_FILE_MB).toBe("50");
  });
});
