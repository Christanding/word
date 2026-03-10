import { describe, it, expect } from "vitest";
import { normalizeLanguage, translations, type Language } from "@/lib/i18n";

describe("normalizeLanguage", () => {
  it("returns zh for zh input", () => {
    expect(normalizeLanguage("zh")).toBe<Language>("zh");
  });

  it("returns en for en input", () => {
    expect(normalizeLanguage("en")).toBe<Language>("en");
  });

  it("falls back to en for invalid values", () => {
    expect(normalizeLanguage("de")).toBe<Language>("en");
    expect(normalizeLanguage(null)).toBe<Language>("en");
  });
});

describe("review celebration translations", () => {
  it("contains skip button label in both languages", () => {
    expect(translations.en["review.skipToWords"]).toBeTypeOf("string");
    expect(translations.zh["review.skipToWords"]).toBeTypeOf("string");
  });
});

describe("manual word translations", () => {
  it("contains suggestion action label in both languages", () => {
    expect(translations.en["words.manual.useSuggestion"]).toBeTypeOf("string");
    expect(translations.zh["words.manual.useSuggestion"]).toBeTypeOf("string");
  });
});
