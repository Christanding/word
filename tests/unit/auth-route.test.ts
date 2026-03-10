import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import type { DBAdapter } from "@/lib/db/adapter";
import type { Entity, User } from "@/lib/models";

const userStore = new Map<string, User>();

function resetUserStore() {
  userStore.clear();
}

const isolatedDbAdapter: DBAdapter = {
  async create<T extends Entity>(collection: string, data: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T> {
    if (collection !== "users") {
      throw new Error(`Unsupported collection in test adapter: ${collection}`);
    }

    const timestamp = new Date().toISOString();
    const user = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    } as T;

    userStore.set((user as User).email, user as User);
    return user;
  },
  async findById<T extends Entity>(collection: string, id: string): Promise<T | null> {
    if (collection !== "users") {
      return null;
    }

    for (const user of userStore.values()) {
      if (user.id === id) {
        return user as T;
      }
    }

    return null;
  },
  async findMany<T extends Entity>(collection: string, query: Partial<T> & { userId?: string }): Promise<T[]> {
    if (collection !== "users") {
      return [];
    }

    return [...userStore.values()].filter((user) => {
      return Object.entries(query).every(([key, value]) => {
        if (value === undefined) {
          return true;
        }
        return user[key as keyof User] === value;
      });
    }) as T[];
  },
  async update<T extends Entity>(): Promise<T> {
    throw new Error("Unsupported operation in auth-route test adapter");
  },
  async delete(): Promise<void> {
    throw new Error("Unsupported operation in auth-route test adapter");
  },
  async count(): Promise<number> {
    throw new Error("Unsupported operation in auth-route test adapter");
  },
  async exists(): Promise<boolean> {
    throw new Error("Unsupported operation in auth-route test adapter");
  },
  async batchCreate<T extends Entity>(): Promise<T[]> {
    throw new Error("Unsupported operation in auth-route test adapter");
  },
  async batchUpdate<T extends Entity>(): Promise<T[]> {
    throw new Error("Unsupported operation in auth-route test adapter");
  },
  async batchDelete(): Promise<void> {
    throw new Error("Unsupported operation in auth-route test adapter");
  },
};

vi.mock("@/lib/db", () => ({
  getDBAdapter: () => isolatedDbAdapter,
}));

vi.mock("iron-session", () => ({
  sealData: vi.fn(async (session: unknown) => JSON.stringify(session)),
}));

function postRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe.sequential("auth routes", () => {
  const adminEmail = "owner@example.com";
  const adminPassword = "OwnerPass@2026";

  beforeEach(() => {
    resetUserStore();
    process.env.ADMIN_EMAIL = adminEmail;
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(adminPassword, 10);
    process.env.SESSION_SECRET = "unit-test-session-secret";
  });

  it("registers a new user and creates a logged-in session", async () => {
    const { POST: registerPOST } = await import("@/app/api/auth/register/route");

    const response = await registerPOST(
      postRequest("http://localhost/api/auth/register", {
        email: "reader@example.com",
        password: "ReaderPass@2026",
        confirmPassword: "ReaderPass@2026",
      })
    );

    expect(response.status).toBe(201);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.user.email).toBe("reader@example.com");
    expect(payload.user.role).toBe("user");

    const sessionCookie = response.cookies.get("word_vocab_session")?.value;
    expect(sessionCookie).toBeDefined();

    const session = JSON.parse(sessionCookie ?? "{}");
    expect(session).toMatchObject({
      isLoggedIn: true,
      email: "reader@example.com",
      role: "user",
    });
    expect(session.userId).toBeTruthy();
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("rejects duplicate registration emails", async () => {
    const { POST: registerPOST } = await import("@/app/api/auth/register/route");

    const first = await registerPOST(
      postRequest("http://localhost/api/auth/register", {
        email: "duplicate@example.com",
        password: "ReaderPass@2026",
        confirmPassword: "ReaderPass@2026",
      })
    );
    expect(first.status).toBe(201);

    const second = await registerPOST(
      postRequest("http://localhost/api/auth/register", {
        email: "duplicate@example.com",
        password: "ReaderPass@2026",
        confirmPassword: "ReaderPass@2026",
      })
    );

    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({
      message: "Email already registered",
    });
  });

  it("allows the configured admin account to keep logging in", async () => {
    const response = await loginPOST(
      postRequest("http://localhost/api/auth/login", {
        email: adminEmail,
        password: adminPassword,
      })
    );

    expect(response.status).toBe(200);

    const session = JSON.parse(response.cookies.get("word_vocab_session")?.value ?? "{}");
    expect(session).toMatchObject({
      isLoggedIn: true,
      email: adminEmail,
      role: "admin",
    });
    expect(session.userId).toBe(adminEmail);
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("allows a registered user to log in with the stored password hash", async () => {
    const { POST: registerPOST } = await import("@/app/api/auth/register/route");

    const registerResponse = await registerPOST(
      postRequest("http://localhost/api/auth/register", {
        email: "member@example.com",
        password: "MemberPass@2026",
        confirmPassword: "MemberPass@2026",
      })
    );
    expect(registerResponse.status).toBe(201);

    const loginResponse = await loginPOST(
      postRequest("http://localhost/api/auth/login", {
        email: "member@example.com",
        password: "MemberPass@2026",
      })
    );

    expect(loginResponse.status).toBe(200);

    const session = JSON.parse(loginResponse.cookies.get("word_vocab_session")?.value ?? "{}");
    expect(session).toMatchObject({
      isLoggedIn: true,
      email: "member@example.com",
      role: "user",
    });
    expect(session.userId).toBeTruthy();
    expect(session.userId).toBe("member@example.com");
  });
});
