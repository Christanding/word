import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/lib/session";
import { getDBAdapter } from "@/lib/db";
import { getStorageAdapter } from "@/lib/storage";
import { validateFile, generateStorageKey, getFileType } from "@/lib/storage/utils";
import type { Document, Job } from "@/lib/models";

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.email!;

    // Parse multipart form
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 });
    }

    // Validate file
    const buffer = Buffer.from(await file.arrayBuffer());
    const limits = {
      maxFileMB: parseInt(process.env.MAX_FILE_MB || "50"),
    };

    let fileType: Exclude<ReturnType<typeof getFileType>, "unknown">;
    try {
      const validation = validateFile(buffer, file.name, limits);
      fileType = validation.fileType;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid file";
      return NextResponse.json({ message }, { status: 400 });
    }

    // Initialize DB adapter
    const db = getDBAdapter();

    // Create document record
    const document = await db.create<Document>("documents", {
      type: "document",
      userId,
      filename: file.name,
      originalPath: "", // Will be set after storage
      fileSize: buffer.length,
      fileType,
      status: "uploaded",
    });

    // Save file to storage
    const storage = getStorageAdapter();
    const storageKey = generateStorageKey(userId, document.id, file.name);
    await storage.saveFile(storageKey, buffer);

    // Update document with storage path
    await db.update("documents", document.id, {
      originalPath: storageKey,
    });

    // Create initial job for processing
    const job = await db.create<Job>("jobs", {
      type: "job",
      userId,
      documentId: document.id,
      stage: "ingested",
      progress: 0,
      maxAttempts: 3,
      attempts: 0,
    });

    return NextResponse.json({
      success: true,
      documentId: document.id,
      jobId: job.id,
      filename: file.name,
      fileType,
      fileSize: buffer.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Upload error:", error);
    return NextResponse.json(
      { message: "Upload failed", error: message },
      { status: 500 }
    );
  }
}
