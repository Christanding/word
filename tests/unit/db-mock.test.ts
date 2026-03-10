import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { getMockDBAdapter, resetMockDBAdapter } from "@/lib/db/mock";
import type { Document, Word } from "@/lib/models";
import { vi } from "vitest";

describe("Mock DB Adapter", () => {
  let db: ReturnType<typeof getMockDBAdapter>;

  beforeEach(() => {
    resetMockDBAdapter();
    db = getMockDBAdapter();
  });

  it("should create and find a document", async () => {
    const docData = {
      type: "document" as const,
      userId: "user-1",
      filename: "test.pdf",
      originalPath: "/uploads/test.pdf",
      fileSize: 1024,
      fileType: "pdf" as const,
      status: "uploaded" as const,
    };

    const created = await db.create<Document>("documents", docData);
    expect(created.id).toBeDefined();
    expect(created.createdAt).toBeDefined();
    expect(created.filename).toBe("test.pdf");

    const found = await db.findById<Document>("documents", created.id);
    expect(found).toEqual(created);
  });

  it("should find many with filters", async () => {
    await db.create<Document>("documents", {
      type: "document",
      userId: "user-1",
      filename: "test1.pdf",
      originalPath: "/uploads/test1.pdf",
      fileSize: 1024,
      fileType: "pdf",
      status: "uploaded",
    });

    await db.create<Document>("documents", {
      type: "document",
      userId: "user-2",
      filename: "test2.pdf",
      originalPath: "/uploads/test2.pdf",
      fileSize: 2048,
      fileType: "pdf",
      status: "uploaded",
    });

    const user1Docs = await db.findMany<Document>("documents", { userId: "user-1" });
    expect(user1Docs.length).toBe(1);
    expect(user1Docs[0].filename).toBe("test1.pdf");
  });

  it("should update a document", async () => {
    const doc = await db.create<Document>("documents", {
      type: "document",
      userId: "user-1",
      filename: "test.pdf",
      originalPath: "/uploads/test.pdf",
      fileSize: 1024,
      fileType: "pdf",
      status: "uploaded",
    });

    const updated = await db.update<Document>("documents", doc.id, {
      status: "processing",
    });

    expect(updated.status).toBe("processing");
  });

  it("should delete a document", async () => {
    const doc = await db.create<Document>("documents", {
      type: "document",
      userId: "user-1",
      filename: "test.pdf",
      originalPath: "/uploads/test.pdf",
      fileSize: 1024,
      fileType: "pdf",
      status: "uploaded",
    });

    await db.delete("documents", doc.id);
    const found = await db.findById("documents", doc.id);
    expect(found).toBeNull();
  });

  it("should batch create documents", async () => {
    const words = await db.batchCreate<Word>("words", [
      {
        type: "word",
        userId: "user-1",
        documentId: "doc-1",
        lemma: "test",
        frequency: 1,
      },
      {
        type: "word",
        userId: "user-1",
        documentId: "doc-1",
        lemma: "word",
        frequency: 1,
      },
    ]);

    expect(words.length).toBe(2);
    expect(words[0].lemma).toBe("test");
    expect(words[1].lemma).toBe("word");
  });

  it("should count documents", async () => {
    await db.create<Document>("documents", {
      type: "document",
      userId: "user-1",
      filename: "test1.pdf",
      originalPath: "/uploads/test1.pdf",
      fileSize: 1024,
      fileType: "pdf",
      status: "uploaded",
    });

    await db.create<Document>("documents", {
      type: "document",
      userId: "user-1",
      filename: "test2.pdf",
      originalPath: "/uploads/test2.pdf",
      fileSize: 2048,
      fileType: "pdf",
      status: "uploaded",
    });

    const count = await db.count("documents", { userId: "user-1" });
    expect(count).toBe(2);
  });

  it("should check if document exists", async () => {
    const doc = await db.create<Document>("documents", {
      type: "document",
      userId: "user-1",
      filename: "test.pdf",
      originalPath: "/uploads/test.pdf",
      fileSize: 1024,
      fileType: "pdf",
      status: "uploaded",
    });

    const exists = await db.exists("documents", doc.id);
    expect(exists).toBe(true);

    const notExists = await db.exists("documents", "non-existent");
    expect(notExists).toBe(false);
  });

  it("should not persist mock data under project root", async () => {
    const legacyPath = path.join(process.cwd(), ".local", "mock-db.json");
    fs.rmSync(legacyPath, { force: true });

    await db.create<Document>("documents", {
      type: "document",
      userId: "user-1",
      filename: "watcher-test.pdf",
      originalPath: "/uploads/watcher-test.pdf",
      fileSize: 512,
      fileType: "pdf",
      status: "uploaded",
    });

    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  it("should not reload mock data from disk on every read", async () => {
    const readSpy = vi.spyOn(fs, "readFileSync");

    await db.create<Document>("documents", {
      type: "document",
      userId: "user-1",
      filename: "cached-read.pdf",
      originalPath: "/uploads/cached-read.pdf",
      fileSize: 128,
      fileType: "pdf",
      status: "uploaded",
    });

    readSpy.mockClear();

    await db.findMany<Document>("documents", { userId: "user-1" });
    await db.findMany<Document>("documents", { userId: "user-1" });

    expect(readSpy).toHaveBeenCalledTimes(0);
  });
});
