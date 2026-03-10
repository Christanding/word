import { describe, expect, it } from "vitest";
import {
  parseGenerateWordResponse,
  parseWordCheckResponse,
} from "@/lib/manual-word-check";

describe("parseWordCheckResponse", () => {
  it("parses valid word check payload", () => {
    const response = parseWordCheckResponse('{"exists":true,"lemma":"military"}');
    expect(response).toEqual({ exists: true, lemma: "military" });
  });

  it("parses invalid word with suggestion", () => {
    const response = parseWordCheckResponse('{"exists":false,"suggestion":"military"}');
    expect(response).toEqual({ exists: false, suggestion: "military" });
  });
});

describe("parseGenerateWordResponse", () => {
  it("parses found response with definitions", () => {
    const content = `{
      "status": "found",
      "lemma": "military",
      "definitions": [
        {"pos": "adj.", "senses": ["军事的", "军队的"]},
        {"pos": "n.", "senses": ["军方", "军队"]}
      ]
    }`;

    const parsed = parseGenerateWordResponse(content);
    expect(parsed).toEqual({
      status: "found",
      lemma: "military",
      suggestion: undefined,
      definitions: [
        { pos: "adj.", senses: ["军事的", "军队的"] },
        { pos: "n.", senses: ["军方", "军队"] },
      ],
    });
  });

  it("parses not found response with suggestion", () => {
    const content = `{"status":"not_found","lemma":"militery","suggestion":"military","definitions":[]}`;
    const parsed = parseGenerateWordResponse(content);
    expect(parsed).toEqual({
      status: "not_found",
      lemma: "militery",
      suggestion: "military",
      definitions: [],
    });
  });
});
