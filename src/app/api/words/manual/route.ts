import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/lib/session";
import { getDBAdapter } from "@/lib/db";
import type { Definition, Word } from "@/lib/models";
import { mergeDefinitionsByPos, normalizeManualLemma, type ManualDefinition } from "@/lib/manual-word";
import { parseGenerateWordResponse, parseWordCheckResponse } from "@/lib/manual-word-check";

type ManualAction = "generate" | "save";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeDefinitions(definitions: ManualDefinition[] | undefined): ManualDefinition[] {
  return (definitions ?? [])
    .map((definition) => ({
      pos: definition.pos?.trim() || undefined,
      senses: (definition.senses ?? []).map((sense) => sense.trim()).filter((sense) => sense.length > 0),
    }))
    .filter((definition) => definition.senses.length > 0);
}

function parseJsonArray(content: string): Array<{ pos?: string; senses?: string[] }> | null {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed as Array<{ pos?: string; senses?: string[] }>;
  } catch {
    return null;
  }
}

async function verifyDefinitionsWithDeepSeek(
  lemma: string,
  inputDefinitions: ManualDefinition[]
): Promise<ManualDefinition[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const prompt = `You are a bilingual dictionary validator.
English word: ${lemma}
Candidate definitions:
${JSON.stringify(inputDefinitions, null, 2)}

Please verify and correct part of speech + Chinese meanings.
Rules:
- Return valid JSON array only
- Format: [{"pos":"adj.","senses":["中文义1","中文义2"]}]
- Keep multiple parts of speech separated
- Use simplified Chinese
- Keep each part of speech with up to 5 common senses
`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "Output JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek verify failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseJsonArray(content);
  if (!parsed) {
    throw new Error("DeepSeek verify returned invalid JSON");
  }

  return normalizeDefinitions(
    parsed.map((entry) => ({
      pos: entry.pos,
      senses: entry.senses ?? [],
    }))
  );
}

async function generateWordPayloadWithDeepSeek(rawLemma: string): Promise<{
  status: "found" | "not_found";
  lemma: string;
  suggestion?: string;
  definitions: ManualDefinition[];
}> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are a bilingual dictionary API. Output JSON only.",
        },
        {
          role: "user",
          content: `Check if this is a valid English word and return grouped Chinese meanings by part of speech in one JSON object. Input word: ${rawLemma}. JSON format: {"status":"found|not_found","lemma":"normalized-word","suggestion":"optional","definitions":[{"pos":"adj.","senses":["释义1","释义2"]}]}. Rules: if word is invalid, use status not_found and provide suggestion when possible; if found, include 1-5 senses per part of speech; output simplified Chinese only; output JSON only.`,
        },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek generate failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseGenerateWordResponse(content);
  if (!parsed) {
    throw new Error("DeepSeek generate returned invalid JSON");
  }

  return {
    status: parsed.status,
    lemma: normalizeManualLemma(parsed.lemma || rawLemma),
    suggestion: parsed.suggestion?.trim() || undefined,
    definitions: normalizeDefinitions(parsed.definitions),
  };
}

async function checkWordExistsWithDeepSeek(rawLemma: string): Promise<{
  exists: boolean;
  lemma: string;
  suggestion?: string;
}> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are an English dictionary validator. Output JSON only.",
        },
        {
          role: "user",
          content: `Check if this is a valid English word used in real contexts: ${rawLemma}. Return JSON object exactly like: {"exists":true|false,"lemma":"normalized-word","suggestion":"closest-valid-word-or-empty"}`,
        },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek word check failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseWordCheckResponse(content);
  if (!parsed) {
    return { exists: true, lemma: normalizeManualLemma(rawLemma) };
  }

  return {
    exists: parsed.exists,
    lemma: normalizeManualLemma(parsed.lemma || rawLemma),
    suggestion: parsed.suggestion?.trim() || undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body?.action as ManualAction | undefined;
    const rawLemma = typeof body?.lemma === "string" ? body.lemma : "";
    const lemma = normalizeManualLemma(rawLemma);

    if (!action || !["generate", "save"].includes(action)) {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 });
    }

    if (!lemma) {
      return NextResponse.json({ message: "Word is required" }, { status: 400 });
    }

    if (!/^[a-z][a-z'-]*[a-z]$|^[a-z]$/i.test(lemma)) {
      return NextResponse.json({ message: "Only English words are supported" }, { status: 400 });
    }

    if (action === "generate") {
      const generatedPayload = await generateWordPayloadWithDeepSeek(lemma);
      if (generatedPayload.status !== "found") {
        return NextResponse.json(
          {
            message: "Word not found",
            code: "INVALID_WORD",
            suggestion: generatedPayload.suggestion,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        lemma: generatedPayload.lemma,
        definitions: generatedPayload.definitions,
      });
    }

    const wordCheck = await checkWordExistsWithDeepSeek(lemma);
    if (!wordCheck.exists) {
      return NextResponse.json(
        {
          message: "Word not found",
          code: "INVALID_WORD",
          suggestion: wordCheck.suggestion,
        },
        { status: 400 }
      );
    }

    const verifiedLemma = wordCheck.lemma;

    const incomingDefinitions = normalizeDefinitions(body?.definitions as ManualDefinition[] | undefined);
    if (incomingDefinitions.length === 0) {
      return NextResponse.json({ message: "Definitions are required" }, { status: 400 });
    }

    const skipVerify = body?.skipVerify === true;

    const checkedDefinitions = skipVerify
      ? incomingDefinitions
      : await verifyDefinitionsWithDeepSeek(verifiedLemma, incomingDefinitions);
    const finalDefinitions = checkedDefinitions.length > 0 ? checkedDefinitions : incomingDefinitions;

    const userId = session.email!;
    const db = getDBAdapter();
    const existingWords = await db.findMany<Word>("words", { userId, lemma: verifiedLemma });

    let targetWord: Word;
    if (existingWords.length > 0) {
      targetWord = await db.update<Word>("words", existingWords[0].id, {
        frequency: (existingWords[0].frequency || 0) + 1,
      });
    } else {
      targetWord = await db.create<Word>("words", {
        type: "word",
        userId,
        documentId: "manual-entry",
        lemma: verifiedLemma,
        frequency: 1,
      });
    }

    const existingDefinitions = await db.findMany<Definition>("definitions", {
      userId,
      wordId: targetWord.id,
    });

    const mergedDefinitions = mergeDefinitionsByPos(
      existingDefinitions.map((definition) => ({
        pos: definition.pos,
        senses: definition.senses,
      })),
      finalDefinitions
    );

    await Promise.all(existingDefinitions.map((definition) => db.delete("definitions", definition.id)));

    await db.batchCreate<Definition>(
      "definitions",
      mergedDefinitions.map((definition) => ({
        type: "definition",
        userId,
        wordId: targetWord.id,
        lemma: verifiedLemma,
        pos: definition.pos,
        senses: definition.senses.slice(0, 5),
        source: "generated",
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        definitionVersion: "v1",
      }))
    );

    return NextResponse.json({
      success: true,
      lemma: verifiedLemma,
      wordId: targetWord.id,
      definitions: mergedDefinitions,
      verifiedBy: skipVerify ? "skip_after_generate" : "deepseek",
    });
  } catch (error: unknown) {
    console.error("Manual word error:", error);
    return NextResponse.json(
      {
        message: "Manual word operation failed",
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
