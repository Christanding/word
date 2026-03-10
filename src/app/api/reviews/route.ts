import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/lib/session";
import { processReview, getDueCards } from "@/lib/srs";
import { parseReviewLimit } from "@/lib/review-limit";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { cardId, quality } = await request.json();
    
    if (typeof cardId !== "string" || typeof quality !== "number") {
      return NextResponse.json(
        { message: "Invalid input: cardId and quality required" },
        { status: 400 }
      );
    }

    if (quality < 0 || quality > 5) {
      return NextResponse.json(
        { message: "Quality must be between 0 and 5" },
        { status: 400 }
      );
    }

    const review = await processReview({
      cardId,
      quality,
      userId: session.email!,
    });

    return NextResponse.json({
      success: true,
      review,
    });
  } catch (error: unknown) {
    console.error("Review error:", error);
    return NextResponse.json(
      { message: "Review failed", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseReviewLimit(url.searchParams.get("limit"));

    const dueCards = await getDueCards(session.email!, limit);

    return NextResponse.json({
      success: true,
      cards: dueCards,
      count: dueCards.length,
    });
  } catch (error: unknown) {
    console.error("Get due cards error:", error);
    return NextResponse.json(
      { message: "Failed to get due cards", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
