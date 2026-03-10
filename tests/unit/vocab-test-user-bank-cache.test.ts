import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedUserQuestionBank,
  getCachedUserQuestionBank,
  loadUserQuestionBank,
  primeUserQuestionBank,
} from "@/lib/vocab-test/user-bank-cache";
import type { QuestionBank } from "@/lib/vocab-test/bank";

function makeBank(): QuestionBank {
  return {
    cet4: [{ word: "accept", pos: "v.", meaning: "接受", explanation: "" }],
    cet6: [{ word: "assess", pos: "v.", meaning: "评估", explanation: "" }],
    ielts: [{ word: "feasible", pos: "adj.", meaning: "可行的", explanation: "" }],
    gre: [{ word: "lucid", pos: "adj.", meaning: "清晰的", explanation: "" }],
  };
}

describe("vocab-test user bank cache", () => {
  beforeEach(() => {
    clearCachedUserQuestionBank();
  });

  it("dedupes concurrent loads for the same user", async () => {
    const bank = makeBank();
    const loader = vi.fn(async () => bank);

    const [first, second] = await Promise.all([
      loadUserQuestionBank("user@example.com", loader),
      loadUserQuestionBank("user@example.com", loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(bank);
    expect(second).toBe(bank);
    expect(getCachedUserQuestionBank("user@example.com")).toBe(bank);
  });

  it("reuses cached bank after priming", async () => {
    const bank = makeBank();
    const loader = vi.fn(async () => bank);

    await primeUserQuestionBank("user@example.com", loader);

    const loaded = await loadUserQuestionBank("user@example.com", async () => {
      throw new Error("should not reload cached bank");
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loaded).toBe(bank);
  });
});
