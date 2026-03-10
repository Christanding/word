import { NextResponse } from "next/server";
import { getSessionData } from "@/lib/session";
import { getDBAdapter } from "@/lib/db";

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

    const documents = await db.findMany("documents", { userId });

    return NextResponse.json({
      success: true,
      documents,
    });
  } catch (error: unknown) {
    console.error("Get documents error:", error);
    return NextResponse.json(
      { message: "Failed to get documents", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
