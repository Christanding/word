import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/vocab-test/import/route";
import { resetMockDBAdapter } from "@/lib/db/mock";

const currentUserEmail = "vocab-import@example.com";

vi.mock("@/lib/session", () => ({
  getSessionData: vi.fn(async () => ({ isLoggedIn: true, email: currentUserEmail })),
}));

function postRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers["x-vocab-import-token"] = token;
  }
  return new NextRequest("http://localhost/api/vocab-test/import", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

describe.sequential("vocab-test import route", () => {
  beforeEach(() => {
    resetMockDBAdapter();
    delete process.env.VOCAB_IMPORT_TOKEN;
  });

  afterEach(() => {
    delete process.env.VOCAB_IMPORT_TOKEN;
  });

  it("imports multiple level lists without exposing UI", async () => {
    const res = await POST(
      postRequest({
        lists: {
          cet4: [
            { word: "ability", pos: "n.", meaning: "能力", explanation: "做事本领" },
            { word: "campus", pos: "n.", meaning: "校园", explanation: "学校区域" },
          ],
          ielts: [{ word: "crucial", pos: "adj.", meaning: "关键的", explanation: "非常重要" }],
        },
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.imported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "cet4", count: 2 }),
        expect.objectContaining({ level: "ielts", count: 1 }),
      ])
    );
  });

  it("checks optional import token when configured", async () => {
    process.env.VOCAB_IMPORT_TOKEN = "secret-token";

    const forbidden = await POST(
      postRequest({ level: "cet6", entries: [{ word: "assess", meaning: "评估", explanation: "判断" }] })
    );
    expect(forbidden.status).toBe(403);

    const ok = await POST(
      postRequest(
        { level: "cet6", entries: [{ word: "assess", meaning: "评估", explanation: "判断" }] },
        "secret-token"
      )
    );
    expect(ok.status).toBe(200);
  });
});
