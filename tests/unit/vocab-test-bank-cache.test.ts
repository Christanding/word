import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("vocab-test built-in bank cache", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTikuDir = process.env.VOCAB_BUILTIN_TIKU_DIR;
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    Reflect.set(process.env, "NODE_ENV", "development");
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-vocab-bank-"));
    process.env.VOCAB_BUILTIN_TIKU_DIR = tempDir;
    fs.writeFileSync(path.join(tempDir, "四级 CET4.csv"), "accept,接受\napply,申请\n", "utf-8");
    fs.writeFileSync(path.join(tempDir, "六级 CET6.csv"), "assess,评估\njustify,证明合理\n", "utf-8");
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
    }
    if (originalTikuDir === undefined) {
      delete process.env.VOCAB_BUILTIN_TIKU_DIR;
    } else {
      process.env.VOCAB_BUILTIN_TIKU_DIR = originalTikuDir;
    }
    Reflect.deleteProperty(globalThis, "__WORD_BUILTIN_BANK_CACHE__");
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reuses built-in bank cache across module reloads", async () => {
    const bankModule1 = await import("@/lib/vocab-test/bank");
    const first = await bankModule1.getBuiltInQuestionBank();
    expect(first.cet4).toHaveLength(2);

    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();

    const bankModule2 = await import("@/lib/vocab-test/bank");
    const second = await bankModule2.getBuiltInQuestionBank();
    expect(second.cet4).toHaveLength(2);
    expect(second.cet6).toHaveLength(2);
  });
});
