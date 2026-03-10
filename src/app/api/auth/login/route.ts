import { NextRequest, NextResponse } from "next/server";
import { sealData } from "iron-session";
import bcrypt from "bcryptjs";
import type { SessionData } from "@/lib/session";
import { getDBAdapter } from "@/lib/db";
import type { User } from "@/lib/models";

// Test credentials for E2E tests
const TEST_ADMIN_EMAIL = "admin@example.com";
const TEST_PASSWORD_HASH = "$2b$10$fzmTd1prr7TKzWGVFKkQFOJ3nZ46XOWlEaU5iVtuK0KmXweXjr7mi";
const TEST_SESSION_SECRET = "test-session-secret-for-e2e-tests";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const normalizedEmail = normalizeEmail(email);

    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || TEST_ADMIN_EMAIL);
    const passwordHash = process.env.ADMIN_PASSWORD_HASH || TEST_PASSWORD_HASH;
    if (!passwordHash || passwordHash.length < 10) {
      console.error("ADMIN_PASSWORD_HASH not configured properly");
      return NextResponse.json(
        { message: "Server configuration error" },
        { status: 500 }
      );
    }

    if (normalizedEmail === adminEmail) {
      const isAdminPasswordValid = await bcrypt.compare(password, passwordHash);
      if (isAdminPasswordValid) {
        const sessionData: SessionData = {
          isLoggedIn: true,
          userId: adminEmail,
          email: adminEmail,
          role: "admin",
        };

        const sessionSecret = process.env.SESSION_SECRET || TEST_SESSION_SECRET;
        const sealedData = await sealData(sessionData, {
          password: sessionSecret,
          ttl: 60 * 60 * 24 * 7,
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
      }
    }

    const db = getDBAdapter();
    const users = await db.findMany<User>("users", { email: normalizedEmail });
    const user = users.find((candidate) => candidate.status === "active");
    if (!user) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    const isUserPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isUserPasswordValid) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    const sessionData: SessionData = {
      isLoggedIn: true,
      userId: user.userId,
      email: user.email,
      role: user.role,
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
