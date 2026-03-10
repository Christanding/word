import { describe, expect, it } from "vitest";
import { resolveGenerateLemma } from "@/lib/manual-word-suggestion";

describe("resolveGenerateLemma", () => {
  it("uses suggestion when provided", () => {
    expect(resolveGenerateLemma(" militery ", "military")).toBe("military");
  });

  it("falls back to input when suggestion is empty", () => {
    expect(resolveGenerateLemma("  military ", "")).toBe("military");
  });
});
