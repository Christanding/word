import { describe, expect, it } from "vitest";
import { formatDefinitionsInline, formatPrimaryDefinition } from "@/lib/definition-display";

describe("formatDefinitionsInline", () => {
  it("formats multiple parts of speech in one line", () => {
    const result = formatDefinitionsInline(
      [
        { pos: "n.", senses: ["组成部分", "组件"] },
        { pos: "v.", senses: ["构成", "组成"] },
      ],
      "暂无中文释义"
    );

    expect(result).toBe("【n.】组成部分；组件；【v.】构成；组成");
  });

  it("splits mixed pos labels into separate grouped meanings", () => {
    const result = formatDefinitionsInline(
      [{ pos: "adj./n.", senses: ["军事的", "军队的", "军用的", "军方", "军队"] }],
      "暂无中文释义"
    );

    expect(result).toBe("【adj.】军事的；军队的；军用的；【n.】军方；军队");
  });

  it("falls back when no usable definitions", () => {
    const result = formatDefinitionsInline([{ pos: "n.", senses: ["   "] }], "暂无中文释义");
    expect(result).toBe("暂无中文释义");
  });

  it("keeps chinese meanings when pos is missing", () => {
    const result = formatDefinitionsInline([{ senses: ["元素", "部件"] }], "暂无中文释义");
    expect(result).toBe("元素；部件");
  });

  it("returns only primary meaning for summary display", () => {
    const result = formatPrimaryDefinition(
      [{ pos: "adj./n.", senses: ["军事的", "军队的", "军用的", "军方", "军队"] }],
      "暂无中文释义"
    );

    expect(result).toBe("【adj.】军事的");
  });

  it("strips duplicated pos prefix from senses before display", () => {
    expect(
      formatPrimaryDefinition([{ pos: "v.", senses: ["v. 禁止", "不许"] }], "暂无中文释义")
    ).toBe("【v.】禁止");

    expect(
      formatDefinitionsInline([{ pos: "v.", senses: ["【v.】禁止", "v. 阻止"] }], "暂无中文释义")
    ).toBe("【v.】禁止；阻止");
  });
});
