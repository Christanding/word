import { describe, it, expect, beforeEach } from "vitest";
import { MockOcrProvider } from "@/lib/providers/mock-ocr";
import { MockLlmProvider } from "@/lib/providers/mock-llm";

describe("Mock Providers", () => {
  describe("MockOcrProvider", () => {
    let provider: MockOcrProvider;

    beforeEach(() => {
      provider = new MockOcrProvider();
    });

    it("should recognize image and return mock text", async () => {
      const buffer = Buffer.from("test image");
      const result = await provider.recognizeImage(buffer);

      expect(result.text).toContain("Mock OCR Result");
      expect(result.confidence).toBe(0.95);
    });

    it("should recognize multiple PDF pages", async () => {
      const buffers = [Buffer.from("page1"), Buffer.from("page2"), Buffer.from("page3")];
      const results = await provider.recognizePdfPages(buffers);

      expect(results.length).toBe(3);
      expect(results[0].text).toContain("Page 1");
      expect(results[1].text).toContain("Page 2");
    });

    it("should track call count", async () => {
      expect(provider.getCallCount()).toBe(0);

      await provider.recognizeImage(Buffer.from("test"));
      expect(provider.getCallCount()).toBe(1);

      await provider.recognizeImage(Buffer.from("test"));
      expect(provider.getCallCount()).toBe(2);
    });

    it("should reset call count", async () => {
      await provider.recognizeImage(Buffer.from("test"));
      expect(provider.getCallCount()).toBe(1);

      provider.reset();
      expect(provider.getCallCount()).toBe(0);
    });
  });

  describe("MockLlmProvider", () => {
    let provider: MockLlmProvider;

    beforeEach(() => {
      provider = new MockLlmProvider();
    });

    it("should define known words with cached definitions", async () => {
      const results = await provider.defineWords(["test", "word"]);

      expect(results.length).toBe(2);
      expect(results[0].lemma).toBe("test");
      expect(results[0].senses.length).toBeGreaterThan(0);
      expect(results[0].pos).toBeDefined();
    });

    it("should generate generic definitions for unknown words", async () => {
      const results = await provider.defineWords(["xyzabc123"]);

      expect(results.length).toBe(1);
      expect(results[0].lemma).toBe("xyzabc123");
      expect(results[0].senses[0]).toContain("[Mock]");
    });

    it("should handle batch word definitions", async () => {
      const words = ["test", "word", "example", "vocabulary", "unknown"];
      const results = await provider.defineWords(words);

      expect(results.length).toBe(5);
      expect(results.map((r) => r.lemma)).toEqual(words);
    });

    it("should track call count", async () => {
      expect(provider.getCallCount()).toBe(0);

      await provider.defineWords(["test"]);
      expect(provider.getCallCount()).toBe(1);

      await provider.defineWords(["word"]);
      expect(provider.getCallCount()).toBe(2);
    });

    it("should reset call count", async () => {
      await provider.defineWords(["test"]);
      expect(provider.getCallCount()).toBe(1);

      provider.reset();
      expect(provider.getCallCount()).toBe(0);
    });
  });
});
