import { NextResponse } from "next/server";
import { getSessionData } from "@/lib/session";
import { getDBAdapter } from "@/lib/db";
import type { Card, Document, Review } from "@/lib/models";
import { buildLearningStats } from "@/lib/stats";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function GET() {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.email!;
    const db = getDBAdapter();

    const [documents, cards, reviews] = await Promise.all([
      db.findMany<Document>("documents", { userId }),
      db.findMany<Card>("cards", { userId }),
      db.findMany<Review>("reviews", { userId }),
    ]);

    const stats = buildLearningStats({
      documentCount: documents.length,
      cards,
      reviews,
    });

    return NextResponse.json({ success: true, stats });
  } catch (error: unknown) {
    console.error("Get stats error:", error);
    return NextResponse.json(
      { message: "Failed to get stats", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
