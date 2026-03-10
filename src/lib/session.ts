// Session data type
export interface SessionData {
  isLoggedIn: boolean;
  userId?: string;
  email?: string;
  role?: "admin" | "user";
}

const TEST_SESSION_SECRET = "test-session-secret-for-e2e-tests";

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || TEST_SESSION_SECRET;
}

// Default session options
export const sessionOptions = {
  cookieName: "word_vocab_session",
  password: getSessionSecret(),
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: "lax" as const,
  },
};

// Helper to check if user is logged in (for server components)
export async function getSessionData(): Promise<SessionData | null> {
  const { cookies } = await import("next/headers");
  const { unsealData } = await import("iron-session");

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("word_vocab_session")?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const session = await unsealData<SessionData>(sessionCookie, {
      password: getSessionSecret(),
    });
    return session;
  } catch (error) {
    console.error("Session decode error:", error);
    return null;
  }
}
