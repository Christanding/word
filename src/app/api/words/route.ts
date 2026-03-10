import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/lib/session";
import { getDBAdapter } from "@/lib/db";
import type { Word, Definition, Card, Review } from "@/lib/models";
import { dedupeWordsByLemma } from "@/lib/words-list";

const POS_MARKERS = new Set(["n", "v", "adj", "adv", "vt", "vi", "prep", "pron", "conj", "det"]);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isUsableDefinition(definition: Definition): boolean {
  const firstSense = definition.senses?.[0] || "";
  return firstSense.length > 0 && !firstSense.startsWith("[Error]") && firstSense !== "暂无释义";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.email!;
    const db = getDBAdapter();
    const url = new URL(request.url);
    const documentId = url.searchParams.get("documentId");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    // Query words
    const query: { userId: string; documentId?: string } = { userId };
    if (documentId) {
      query.documentId = documentId;
    }

    const words = await db.findMany<Word>("words", query, { limit, orderBy: "frequency", order: "desc" });
    const filteredWords = words.filter((word) => !POS_MARKERS.has(word.lemma.toLowerCase()));

    const cards = await db.findMany<Card>("cards", { userId });
    const reviews = await db.findMany<Review>("reviews", { userId });
    const reviewedCardIds = new Set(reviews.map((review) => review.cardId));
    const reviewedWordIds = new Set(
      cards.filter((card) => reviewedCardIds.has(card.id)).map((card) => card.wordId)
    );

    // Check if each word has one or more usable definitions
    const wordsWithDefs = await Promise.all(
      filteredWords.map(async (word) => {
        const defs = await db.findMany<Definition>("definitions", {
          wordId: word.id,
          userId,
        });
        const usableDefinitions = defs.filter(isUsableDefinition);
        const preferredDefinition = usableDefinitions[0];
        return {
          id: word.id,
          lemma: word.lemma,
          frequency: word.frequency,
          hasDefinition: !!preferredDefinition,
          hasReviewed: reviewedWordIds.has(word.id),
          definition: preferredDefinition,
          definitions: usableDefinitions,
        };
      })
    );

    const dedupedWords = dedupeWordsByLemma(wordsWithDefs);

    return NextResponse.json({
      success: true,
      words: dedupedWords,
      count: dedupedWords.length,
    });
  } catch (error: unknown) {
    console.error("Get words error:", error);
    return NextResponse.json(
      { message: "Failed to get words", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.email!;
    const db = getDBAdapter();

    const body = await request.json().catch(() => ({}));
    const deleteAll = body?.deleteAll === true;
    const wordIdsInput = Array.isArray(body?.wordIds)
      ? body.wordIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];

    let targetWords: Word[] = [];

    if (deleteAll) {
      targetWords = await db.findMany<Word>("words", { userId });
    } else if (wordIdsInput.length > 0) {
      const allWords = await db.findMany<Word>("words", { userId });
      const idSet = new Set(wordIdsInput);
      targetWords = allWords.filter((word) => idSet.has(word.id));
    } else {
      return NextResponse.json(
        { message: "Invalid input: provide wordIds or set deleteAll=true" },
        { status: 400 }
      );
    }

    if (targetWords.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: {
          words: 0,
          definitions: 0,
          cards: 0,
          reviews: 0,
        },
      });
    }

    const targetWordIds = new Set(targetWords.map((word) => word.id));

    const allDefinitions = await db.findMany<Definition>("definitions", { userId });
    const targetDefinitions = allDefinitions.filter((definition) => targetWordIds.has(definition.wordId));
    const targetDefinitionIds = new Set(targetDefinitions.map((definition) => definition.id));

    const allCards = await db.findMany<Card>("cards", { userId });
    const targetCards = allCards.filter(
      (card) => targetWordIds.has(card.wordId) || targetDefinitionIds.has(card.definitionId)
    );
    const targetCardIds = new Set(targetCards.map((card) => card.id));

    const allReviews = await db.findMany<Review>("reviews", { userId });
    const targetReviews = allReviews.filter((review) => targetCardIds.has(review.cardId));

    if (targetReviews.length > 0) {
      await db.batchDelete(
        "reviews",
        targetReviews.map((review) => review.id)
      );
    }

    if (targetCards.length > 0) {
      await db.batchDelete(
        "cards",
        targetCards.map((card) => card.id)
      );
    }

    if (targetDefinitions.length > 0) {
      await db.batchDelete(
        "definitions",
        targetDefinitions.map((definition) => definition.id)
      );
    }

    await db.batchDelete(
      "words",
      targetWords.map((word) => word.id)
    );

    return NextResponse.json({
      success: true,
      deleted: {
        words: targetWords.length,
        definitions: targetDefinitions.length,
        cards: targetCards.length,
        reviews: targetReviews.length,
      },
    });
  } catch (error: unknown) {
    console.error("Delete words error:", error);
    return NextResponse.json(
      { message: "Failed to delete words", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
