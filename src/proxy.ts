import { NextRequest, NextResponse } from "next/server";
import { unsealData } from "iron-session";
import type { SessionData } from "@/lib/session";

const TEST_SESSION_SECRET = "test-session-secret-for-e2e-tests";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth routes
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Skip static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Get session from cookie
  const sessionCookie = request.cookies.get("word_vocab_session")?.value;
  let isLoggedIn = false;

  if (sessionCookie) {
    try {
      const sessionSecret = process.env.SESSION_SECRET || TEST_SESSION_SECRET;
      const session = await unsealData<SessionData>(sessionCookie, {
        password: sessionSecret,
      });
      isLoggedIn = session?.isLoggedIn ?? false;
    } catch (error) {
      console.error("Session decode error:", error);
      isLoggedIn = false;
    }
  }

  // Protect /app routes
  if (pathname.startsWith("/app") && !isLoggedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect logged-in users away from /login
  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  // Redirect root to login or app
  if (pathname === "/") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
