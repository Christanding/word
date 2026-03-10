import type { VocabLevel } from "./types";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface QuestionSeed {
  word: string;
  pos?: string;
  meaning: string;
  explanation: string;
}

export type QuestionBank = Record<VocabLevel, QuestionSeed[]>;

export const LEVEL_ORDER: VocabLevel[] = ["cet4", "cet6", "ielts", "gre"];

export const LEVEL_WORD_TOTAL: Record<VocabLevel, number> = {
  cet4: 4500,
  cet6: 6500,
  ielts: 9000,
  gre: 13000,
};

export const QUESTION_BANK: QuestionBank = {
  cet4: [
    { word: "ability", pos: "n.", meaning: "能力", explanation: "表示做事的本领。" },
    { word: "accept", pos: "v.", meaning: "接受", explanation: "表示同意接收或认可。" },
    { word: "achieve", pos: "v.", meaning: "实现", explanation: "表示达成目标。" },
    { word: "apply", pos: "v.", meaning: "申请", explanation: "在四级高频中常指申请职位或学校。" },
    { word: "arrange", pos: "v.", meaning: "安排", explanation: "表示组织或布置事务。" },
    { word: "attend", pos: "v.", meaning: "参加", explanation: "常用于参加会议、课程。" },
    { word: "average", pos: "adj.", meaning: "平均的", explanation: "表示均值水平。" },
    { word: "benefit", pos: "n.", meaning: "益处", explanation: "表示好处、利益。" },
    { word: "borrow", pos: "v.", meaning: "借入", explanation: "从他人处借来。" },
    { word: "campus", pos: "n.", meaning: "校园", explanation: "学校区域。" },
    { word: "compare", pos: "v.", meaning: "比较", explanation: "对比两个或多个对象。" },
    { word: "confirm", pos: "v.", meaning: "确认", explanation: "核实并确定。" },
    { word: "create", pos: "v.", meaning: "创造", explanation: "产生新事物。" },
    { word: "deliver", pos: "v.", meaning: "递送", explanation: "把东西送到目的地。" },
    { word: "describe", pos: "v.", meaning: "描述", explanation: "用语言说明特征。" },
    { word: "develop", pos: "v.", meaning: "发展", explanation: "逐步成长或完善。" },
  ],
  cet6: [
    { word: "allocate", pos: "v.", meaning: "分配", explanation: "把资源按计划分给不同对象。" },
    { word: "assess", pos: "v.", meaning: "评估", explanation: "系统判断价值或水平。" },
    { word: "coherent", pos: "adj.", meaning: "连贯的", explanation: "逻辑清晰、前后衔接。" },
    { word: "compensate", pos: "v.", meaning: "补偿", explanation: "弥补损失或不足。" },
    { word: "constrain", pos: "v.", meaning: "限制", explanation: "施加约束条件。" },
    { word: "controversy", pos: "n.", meaning: "争议", explanation: "存在分歧的讨论。" },
    { word: "convert", pos: "v.", meaning: "转化", explanation: "改变形式或用途。" },
    { word: "criteria", pos: "n.", meaning: "标准", explanation: "评价或判断依据。" },
    { word: "diminish", pos: "v.", meaning: "减少", explanation: "数量或程度降低。" },
    { word: "eliminate", pos: "v.", meaning: "消除", explanation: "彻底去掉。" },
    { word: "emerge", pos: "v.", meaning: "出现", explanation: "逐渐显现。" },
    { word: "enhance", pos: "v.", meaning: "增强", explanation: "提高效果或能力。" },
    { word: "fluctuate", pos: "v.", meaning: "波动", explanation: "上下变化不稳定。" },
    { word: "implement", pos: "v.", meaning: "实施", explanation: "把计划付诸执行。" },
    { word: "inevitable", pos: "adj.", meaning: "不可避免的", explanation: "必然会发生。" },
    { word: "justify", pos: "v.", meaning: "证明合理", explanation: "给出充分理由。" },
  ],
  ielts: [
    { word: "abundant", pos: "adj.", meaning: "丰富的", explanation: "数量充足、很多。" },
    { word: "adverse", pos: "adj.", meaning: "不利的", explanation: "产生负面影响。" },
    { word: "advocate", pos: "v.", meaning: "提倡", explanation: "公开支持某观点。" },
    { word: "consecutive", pos: "adj.", meaning: "连续的", explanation: "一个接一个不断。" },
    { word: "contemporary", pos: "adj.", meaning: "当代的", explanation: "属于当前时代。" },
    { word: "crucial", pos: "adj.", meaning: "关键的", explanation: "非常重要，决定成败。" },
    { word: "decline", pos: "v.", meaning: "下降", explanation: "数量或质量减少。" },
    { word: "diversity", pos: "n.", meaning: "多样性", explanation: "种类丰富。" },
    { word: "ethical", pos: "adj.", meaning: "道德的", explanation: "与伦理标准相关。" },
    { word: "exposure", pos: "n.", meaning: "接触", explanation: "接触某信息或环境的机会。" },
    { word: "feasible", pos: "adj.", meaning: "可行的", explanation: "可以被实际执行。" },
    { word: "fundamental", pos: "adj.", meaning: "根本的", explanation: "最基础、最核心。" },
    { word: "generate", pos: "v.", meaning: "产生", explanation: "制造或引发结果。" },
    { word: "incentive", pos: "n.", meaning: "激励", explanation: "促使行动的动力。" },
    { word: "mitigate", pos: "v.", meaning: "缓解", explanation: "减轻负面后果。" },
    { word: "sustainable", pos: "adj.", meaning: "可持续的", explanation: "长期可维持。" },
  ],
  gre: [
    { word: "aberration", pos: "n.", meaning: "异常", explanation: "偏离常态的现象。" },
    { word: "abstain", pos: "v.", meaning: "戒除", explanation: "有意避免做某事。" },
    { word: "alleviate", pos: "v.", meaning: "缓和", explanation: "减轻痛苦或问题。" },
    { word: "ambivalent", pos: "adj.", meaning: "矛盾的", explanation: "同时有相反情绪。" },
    { word: "anomaly", pos: "n.", meaning: "反常现象", explanation: "与预期不一致。" },
    { word: "appease", pos: "v.", meaning: "安抚", explanation: "平息不满或愤怒。" },
    { word: "bolster", pos: "v.", meaning: "加强", explanation: "增强论点或力量。" },
    { word: "candid", pos: "adj.", meaning: "坦率的", explanation: "直言不讳。" },
    { word: "circumspect", pos: "adj.", meaning: "谨慎的", explanation: "行动前仔细考虑。" },
    { word: "convoluted", pos: "adj.", meaning: "复杂难懂的", explanation: "结构曲折不清晰。" },
    { word: "deference", pos: "n.", meaning: "敬重", explanation: "出于尊重而顺从。" },
    { word: "equivocal", pos: "adj.", meaning: "模棱两可的", explanation: "含义不明确。" },
    { word: "fastidious", pos: "adj.", meaning: "挑剔的", explanation: "对细节要求高。" },
    { word: "implacable", pos: "adj.", meaning: "难以平息的", explanation: "情绪或态度无法缓和。" },
    { word: "lucid", pos: "adj.", meaning: "清晰易懂的", explanation: "表达明白透彻。" },
    { word: "obfuscate", pos: "v.", meaning: "使晦涩", explanation: "故意让内容难懂。" },
  ],
};

const DEFAULT_TIKU_DIR = process.env.VOCAB_BUILTIN_TIKU_DIR || "C:\\Users\\a'a'a\\Desktop\\Code\\tiku";
const FILE_LEVEL_MAP: Array<{ level: VocabLevel; keyword: string }> = [
  { level: "cet4", keyword: "四级" },
  { level: "cet6", keyword: "六级" },
  { level: "ielts", keyword: "雅思" },
  { level: "gre", keyword: "GRE" },
];

const BUILT_IN_BANK_CACHE_KEY = "__WORD_BUILTIN_BANK_CACHE__";

type GlobalBankCache = typeof globalThis & {
  [BUILT_IN_BANK_CACHE_KEY]?: Promise<QuestionBank>;
};

function getGlobalBuiltInBankCache(): Promise<QuestionBank> | null {
  return (globalThis as GlobalBankCache)[BUILT_IN_BANK_CACHE_KEY] || null;
}

function setGlobalBuiltInBankCache(cache: Promise<QuestionBank> | null) {
  const target = globalThis as GlobalBankCache;
  if (cache) {
    target[BUILT_IN_BANK_CACHE_KEY] = cache;
    return;
  }
  delete target[BUILT_IN_BANK_CACHE_KEY];
}

let builtInBankCache: Promise<QuestionBank> | null = getGlobalBuiltInBankCache();

function normalizeWord(raw: string): string {
  return raw.trim().toLowerCase();
}

function parseCsvLine(line: string): [string, string] | null {
  const idx = line.indexOf(",");
  if (idx <= 0) {
    return null;
  }
  const left = line.slice(0, idx).trim();
  const right = line.slice(idx + 1).trim();
  if (!left || !right) {
    return null;
  }
  return [left, right];
}

function cleanMeaning(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("\uFEFF")) {
    value = value.slice(1);
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1);
  }
  value = value.replace(/""/g, '"').replace(/\r/g, "").trim();
  return value;
}

function splitSenses(rawMeaning: string): string[] {
  return rawMeaning
    .split(/[；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePosAndSense(segment: string): { pos?: string; sense: string } {
  const matched = segment.match(/^([a-z]{1,6}\.)\s*(.+)$/i);
  if (!matched) {
    return { sense: segment };
  }
  return {
    pos: matched[1].toLowerCase(),
    sense: matched[2].trim(),
  };
}

function isValidWord(word: string): boolean {
  if (!/[a-z]/i.test(word)) {
    return false;
  }
  if (/[\u4e00-\u9fff]/u.test(word)) {
    return false;
  }
  return true;
}

function isLikelyNoise(pos: string, text: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerPos = (pos || "").toLowerCase();

  // 形容词后缀检测
  const adjSuffixes = ["的", "地"];

  // 如果是形容词,允许"的"和"地"
  if (lowerPos.includes("adj")) {
    return false;
  }

  // 如果是名词或动词,检测是否包含形容词后缀
  if (adjSuffixes.some((suffix) => lowerText.includes(suffix))) {
    // 检查词性是否匹配
    if (lowerPos.includes("n.") || lowerPos.includes("v.")) {
      // 进一步检查:如果释义的前4个字符内包含"的"或"地",很可能是形容词噪声
      const prefix = lowerText.slice(0, 4);
      if (adjSuffixes.some((suffix) => prefix.includes(suffix))) {
        return true; // 标记为噪声
      }
    }
  }

  return false;
}

async function loadLevelEntriesFromFiles(_level: VocabLevel, files: string[]): Promise<QuestionSeed[]> {
  const merged = new Map<string, { meaning: string; explanation: string; pos?: string }>();

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const lines = content.split(/\n/);
    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (!line) {
        continue;
      }
      const parsed = parseCsvLine(line);
      if (!parsed) {
        continue;
      }
      const [rawWord, rawMeaning] = parsed;
      if (/^\uFEFF?单词$/u.test(rawWord) || /^\(共$/u.test(rawWord)) {
        continue;
      }
      const word = normalizeWord(rawWord);
      if (!isValidWord(word)) {
        continue;
      }
      const meaning = cleanMeaning(rawMeaning);
      if (!meaning) {
        continue;
      }

      const firstPos = splitSenses(meaning)
        .map((seg) => parsePosAndSense(seg).pos)
        .find((pos): pos is string => !!pos);

      if (!merged.has(word)) {
        merged.set(word, { meaning, explanation: "", pos: firstPos });
        continue;
      }

      const existing = merged.get(word)!;
      if (meaning.length > existing.meaning.length) {
        existing.meaning = meaning;
      }
      if (!existing.pos && firstPos) {
        existing.pos = firstPos;
      }
    }
  }

  return Array.from(merged.entries()).map(([word, entry]) => ({
    word,
    pos: entry.pos,
    meaning: entry.meaning,
    explanation: entry.explanation,
  }));
}


async function buildBuiltInQuestionBank(dirPath: string): Promise<QuestionBank> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const csvFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));

  if (csvFiles.length === 0) {
    throw new Error(`No CSV files found in tiku directory: ${dirPath}`);
  }

  const grouped: Record<VocabLevel, string[]> = {
    cet4: [],
    cet6: [],
    ielts: [],
    gre: [],
  };

  for (const file of csvFiles) {
    const fileName = path.basename(file);
    for (const item of FILE_LEVEL_MAP) {
      if (fileName.includes(item.keyword)) {
        grouped[item.level].push(file);
      }
    }
  }

  const cet4 = grouped.cet4.length > 0 ? await loadLevelEntriesFromFiles("cet4", grouped.cet4) : [];
  const cet6 = grouped.cet6.length > 0 ? await loadLevelEntriesFromFiles("cet6", grouped.cet6) : [];
  const ielts = grouped.ielts.length > 0 ? await loadLevelEntriesFromFiles("ielts", grouped.ielts) : [];
  const gre = grouped.gre.length > 0 ? await loadLevelEntriesFromFiles("gre", grouped.gre) : [];

  return {
    cet4,
    cet6,
    ielts,
    gre,
  };
}

export async function getBuiltInQuestionBank(): Promise<QuestionBank> {
  if (process.env.NODE_ENV === "test") {
    return QUESTION_BANK;
  }
  if (!builtInBankCache) {
    builtInBankCache = buildBuiltInQuestionBank(DEFAULT_TIKU_DIR);
    setGlobalBuiltInBankCache(builtInBankCache);
  }
  return builtInBankCache;
}

export function __resetBuiltInBankCacheForTests() {
  builtInBankCache = null;
  setGlobalBuiltInBankCache(null);
}
