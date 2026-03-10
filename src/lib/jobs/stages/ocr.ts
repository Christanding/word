import { getDBAdapter } from "../../db";
import { getStorageAdapter } from "../../storage";
import { getOcrProvider } from "../../providers";
import type { Job, Document } from "../../models";

export async function processOcrStage(job: Job): Promise<void> {
  const db = getDBAdapter();
  const storage = getStorageAdapter();
  const ocrProvider = getOcrProvider();
  
  // Get document info
  const document = await db.findById<Document>("documents", job.documentId);
  if (!document) {
    throw new Error(`Document ${job.documentId} not found`);
  }
  
  // Download file
  const fileBuffer = await storage.getFile(document.originalPath);
  
  let ocrText = "";
  
  if (document.fileType === "image") {
    // Single image OCR
    const result = await ocrProvider.recognizeImage(fileBuffer);
    ocrText = result.text;
  } else if (document.fileType === "pdf") {
    // PDF OCR - need to render pages first (simplified: direct OCR)
    const results = await ocrProvider.recognizePdfPages([fileBuffer]);
    ocrText = results.map((r) => r.text).join("\n\n");
  }
  
  // Save OCR text
  const ocrKey = `user/documents/${document.id}/ocr.txt`;
  await storage.saveFile(ocrKey, Buffer.from(ocrText, "utf-8"));
  
  // Merge with extracted text if available
  const extractedText = job.result?.extractedText || "";
  const fullText = extractedText + "\n\n--- OCR Results ---\n\n" + ocrText;
  
  const fullTextKey = `user/documents/${document.id}/fulltext.txt`;
  await storage.saveFile(fullTextKey, Buffer.from(fullText, "utf-8"));
  
  // Update job
  await db.update("jobs", job.id, {
    result: {
      ...job.result,
      ocrText,
      ocrPath: ocrKey,
      fullTextPath: fullTextKey,
      fullText,
    },
  });
}
