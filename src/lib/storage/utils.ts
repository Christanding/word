import { createHash } from "crypto";

export function computeFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function getFileType(filename: string): "pdf" | "docx" | "xlsx" | "image" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "xlsx":
    case "xls":
      return "xlsx";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
      return "image";
    default:
      return "unknown";
  }
}

export function validateFile(buffer: Buffer, filename: string, limits: { maxFileMB: number }) {
  const fileSizeMB = buffer.length / (1024 * 1024);
  const fileType = getFileType(filename);

  if (fileSizeMB > limits.maxFileMB) {
    throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB > ${limits.maxFileMB}MB limit`);
  }

  if (fileType === "unknown") {
    throw new Error(`Unsupported file type: ${filename}`);
  }

  return { fileSizeMB, fileType };
}

export function generateStorageKey(userId: string, documentId: string, filename: string): string {
  return `user/${userId}/documents/${documentId}/original/${filename}`;
}

export function generateExtractedKey(documentId: string): string {
  return `user/documents/${documentId}/extracted.txt`;
}

export function generateFullTextKey(documentId: string): string {
  return `user/documents/${documentId}/fulltext.txt`;
}
