import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/lib/session";
import { getDBAdapter } from "@/lib/db";
import { LEVEL_ORDER, type QuestionSeed } from "@/lib/vocab-test/bank";
import { clearCachedUserQuestionBank } from "@/lib/vocab-test/user-bank-cache";
import type { VocabLevel } from "@/lib/vocab-test/types";
import type { VocabWordlist } from "@/lib/models";

interface ImportPayload {
  level?: VocabLevel;
  entries?: QuestionSeed[];
  lists?: Partial<Record<VocabLevel, QuestionSeed[]>>;
}

function normalizeEntry(entry: QuestionSeed): QuestionSeed | null {
  const word = entry.word?.trim().toLowerCase();
  const meaning = entry.meaning?.trim();
  const explanation = entry.explanation?.trim();
  if (!word || !meaning || !explanation) {
    return null;
  }
  return {
    word,
    pos: entry.pos?.trim(),
    meaning,
    explanation,
  };
}

function requireImportToken(request: NextRequest): boolean {
  const expected = process.env.VOCAB_IMPORT_TOKEN;
  if (!expected) {
    return true;
  }
  const provided = request.headers.get("x-vocab-import-token");
  return provided === expected;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (!requireImportToken(request)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ImportPayload;
    const userId = session.email!;
    const db = getDBAdapter();

    const saveLevelEntries = async (level: VocabLevel, entries: QuestionSeed[]) => {
      const normalized = entries
        .map((item) => normalizeEntry(item))
        .filter((item): item is QuestionSeed => !!item);
      if (normalized.length === 0) {
        return { level, count: 0 };
      }

      await db.create<VocabWordlist>("vocab_wordlists", {
        type: "vocab_wordlist",
        userId,
        level,
        entries: normalized,
      });
      return { level, count: normalized.length };
    };

    if (body.level && Array.isArray(body.entries)) {
      const result = await saveLevelEntries(body.level, body.entries);
      clearCachedUserQuestionBank(userId);
      return NextResponse.json({ success: true, imported: [result] });
    }

    if (body.lists && typeof body.lists === "object") {
      const imported = [] as Array<{ level: VocabLevel; count: number }>;
      for (const level of LEVEL_ORDER) {
        const list = body.lists[level];
        if (Array.isArray(list)) {
          imported.push(await saveLevelEntries(level, list));
        }
      }
      clearCachedUserQuestionBank(userId);
      return NextResponse.json({ success: true, imported });
    }

    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message: "Import failed", error: message }, { status: 500 });
  }
}
