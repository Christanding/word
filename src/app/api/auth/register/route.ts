import { NextRequest, NextResponse } from "next/server";
import { sealData } from "iron-session";
import bcrypt from "bcryptjs";
import { getDBAdapter } from "@/lib/db";
import type { User } from "@/lib/models";
import { createSessionCookieOptions, type SessionData } from "@/lib/session";

const TEST_ADMIN_EMAIL = "admin@example.com";
const TEST_SESSION_SECRET = "test-session-secret-for-e2e-tests";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, confirmPassword } = await request.json();

    const normalizedEmail = normalizeEmail(email ?? "");
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || TEST_ADMIN_EMAIL);

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return NextResponse.json({ message: "Please enter a valid email" }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ message: "Password must be at least 8 characters" }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ message: "Passwords do not match" }, { status: 400 });
    }

    if (normalizedEmail === adminEmail) {
      return NextResponse.json({ message: "Email already registered" }, { status: 409 });
    }

    const db = getDBAdapter();
    const existingUsers = await db.findMany<User>("users", { email: normalizedEmail });
    if (existingUsers.some((candidate) => candidate.status === "active")) {
      return NextResponse.json({ message: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.create<User>("users", {
      type: "user",
      userId: normalizedEmail,
      email: normalizedEmail,
      passwordHash,
      role: "user",
      status: "active",
    });

    const sessionData: SessionData = {
      isLoggedIn: true,
      userId: user.userId,
      email: user.email,
      role: user.role,
    };

    const sessionSecret = process.env.SESSION_SECRET || TEST_SESSION_SECRET;
    const sealedData = await sealData(sessionData, {
      password: sessionSecret,
      ttl: 60 * 60 * 24 * 7,
    });

    const response = NextResponse.json(
      {
        success: true,
        user: {
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    );

    response.cookies.set("word_vocab_session", sealedData, createSessionCookieOptions(request));

    return response;
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ message: "Registration failed" }, { status: 500 });
  }
}
