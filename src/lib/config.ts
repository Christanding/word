import { z } from "zod";

// Define the schema for environment variables
const envSchema = z.object({
  // Session
  SESSION_SECRET: z.string().min(1),

  // Admin (single-user allowlist)
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(1),

  // Mock mode switches
  MOCK_OCR: z.enum(["0", "1"]).optional().default("0"),
  MOCK_LLM: z.enum(["0", "1"]).optional().default("0"),

  // Tencent Cloud OCR
  TENCENT_SECRET_ID: z.string().optional(),
  TENCENT_SECRET_KEY: z.string().optional(),
  TENCENT_REGION: z.string().optional().default("ap-guangzhou"),

  // Alibaba DashScope (Qwen)
  DASHSCOPE_API_KEY: z.string().optional(),
  DASHSCOPE_MODEL: z.string().optional().default("qwen-plus"),

  // DeepSeek (preferred for definitions)
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().optional().default("deepseek-chat"),

  // Worker secret for background tasks
  WORKER_SECRET: z.string().min(1),

  // Limits and quotas
  MAX_FILE_MB: z.string().optional().default("50"),
  MAX_PDF_PAGES: z.string().optional().default("100"),
  MAX_WORDS_PER_DOC: z.string().optional().default("1000"),
  DAILY_OCR_PAGES: z.string().optional().default("100"),
  DAILY_LLM_TOKENS: z.string().optional().default("100000"),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedConfig: EnvConfig | null = null;

export function loadConfig(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const envVars = Object.fromEntries(Object.entries(process.env));

  const result = envSchema.safeParse(envVars);

  if (!result.success) {
    const errors = result.error.issues
      .map((err) => `${err.path.join(".")}: ${err.message}`)
      .join("\n  ");
    throw new Error(`Invalid environment variables:\n  ${errors}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function getConfig(): EnvConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function isMockOcrEnabled(): boolean {
  return getConfig().MOCK_OCR === "1";
}

export function isMockLlmEnabled(): boolean {
  return getConfig().MOCK_LLM === "1";
}
