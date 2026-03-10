import { getDBAdapter } from "../../db";
import { getStorageAdapter } from "../../storage";
import { extractFromDocx, extractFromXlsx, extractFromPdf, needsOcr, type ExtractResult } from "../../extract";
import { getOcrProvider } from "../../providers";
import type { Job, Document } from "../../models";

export async function processExtractingStage(job: Job): Promise<void> {
  const db = getDBAdapter();
  const storage = getStorageAdapter();
  const ocrProvider = getOcrProvider();
  
  // Get document info
  const document = await db.findById<Document>("documents", job.documentId);
  if (!document) {
    throw new Error(`Document ${job.documentId} not found`);
  }
  
  // Download original file
  const fileBuffer = await storage.getFile(document.originalPath);
  
  let extractResult: ExtractResult;
  
  // Extract based on file type
  switch (document.fileType) {
    case "docx":
      extractResult = await extractFromDocx(fileBuffer);
      break;
    case "xlsx":
      extractResult = await extractFromXlsx(fileBuffer);
      break;
    case "pdf":
      extractResult = await extractFromPdf(fileBuffer);
      
      // Check if PDF needs OCR (scanned PDF without text layer)
      if (needsOcr(extractResult)) {
        const ocrResults = await ocrProvider.recognizePdfPages([fileBuffer]);
        const ocrText = ocrResults.map((result) => result.text).join("\n\n");

        // Mark for OCR stage
        await db.update("jobs", job.id, {
          result: {
            ...job.result,
            needsOcr: true,
            extractedText: ocrText,
            ocrText,
            fullText: ocrText,
            metadata: extractResult.metadata,
          },
        });
        return;
      }
      break;
    case "image": {
      // Images are OCR-first
      const imageResult = await ocrProvider.recognizeImage(fileBuffer);
      await db.update("jobs", job.id, {
        result: {
          ...job.result,
          needsOcr: true,
          isImage: true,
          ocrText: imageResult.text,
          fullText: imageResult.text,
        },
      });
      return;
    }
    default:
      throw new Error(`Unsupported file type: ${document.fileType}`);
  }
  
  // Save extracted text
  const extractedKey = `user/documents/${document.id}/extracted.txt`;
  await storage.saveFile(extractedKey, Buffer.from(extractResult.text, "utf-8"));
  
  // Update job with extraction result
  await db.update("jobs", job.id, {
    result: {
      ...job.result,
      extractedText: extractResult.text,
      metadata: extractResult.metadata,
      extractedPath: extractedKey,
    },
  });
}
