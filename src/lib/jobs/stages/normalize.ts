import { getDBAdapter } from "../../db";
import { getStorageAdapter } from "../../storage";
import { extractWords } from "../../nlp";
import type { Job, Document, Word } from "../../models";

export async function processNormalizingStage(job: Job): Promise<void> {
  const db = getDBAdapter();
  const storage = getStorageAdapter();
  
  // Get full text
  const fullText = job.result?.fullText || job.result?.extractedText || job.result?.ocrText;
  if (!fullText) {
    throw new Error("No text found for normalization");
  }
  
  // Extract words
  const maxWords = parseInt(process.env.MAX_WORDS_PER_DOC || "1000");
  const words = extractWords(fullText, maxWords);
  
  // Save words to database
  const document = await db.findById<Document>("documents", job.documentId);
  if (!document) {
    throw new Error(`Document ${job.documentId} not found`);
  }
  
  // Batch create word records
  await db.batchCreate<Word>("words", words.map((w) => ({
    type: "word",
    userId: document.userId,
    documentId: document.id,
    lemma: w.lemma,
    frequency: w.frequency,
  })));
  
  // Save word list to storage
  const wordListPath = `user/documents/${document.id}/words.json`;
  await storage.saveFile(wordListPath, Buffer.from(JSON.stringify(words, null, 2), "utf-8"));
  
  // Update job
  await db.update("jobs", job.id, {
    result: {
      ...job.result,
      wordCount: words.length,
      wordListPath,
      words: words.map((w) => w.lemma),
    },
  });
}
