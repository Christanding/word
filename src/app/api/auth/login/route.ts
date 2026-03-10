import { NextRequest, NextResponse } from "next/server";
import { sealData } from "iron-session";
import bcrypt from "bcryptjs";
import type { SessionData } from "@/lib/session";

// Test credentials for E2E tests
const TEST_ADMIN_EMAIL = "admin@example.com";
const TEST_PASSWORD_HASH = "$2b$10$fzmTd1prr7TKzWGVFKkQFOJ3nZ46XOWlEaU5iVtuK0KmXweXjr7mi";
const TEST_SESSION_SECRET = "test-session-secret-for-e2e-tests";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Validate admin email (use env or test default)
    const adminEmail = process.env.ADMIN_EMAIL || TEST_ADMIN_EMAIL;
    if (email !== adminEmail) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password (use env or test default)
    const passwordHash = process.env.ADMIN_PASSWORD_HASH || TEST_PASSWORD_HASH;
    if (!passwordHash || passwordHash.length < 10) {
      console.error("ADMIN_PASSWORD_HASH not configured properly");
      return NextResponse.json(
        { message: "Server configuration error" },
        { status: 500 }
      );
    }

    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Create session
    const sessionData: SessionData = {
      isLoggedIn: true,
      email: adminEmail,
    };

    const sessionSecret = process.env.SESSION_SECRET || TEST_SESSION_SECRET;
    const sealedData = await sealData(sessionData, {
      password: sessionSecret,
      ttl: 60 * 60 * 24 * 7, // 7 days
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set("word_vocab_session", sealedData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "Login failed" },
      { status: 500 }
    );
  }
}
