import { describe, it, expect } from "vitest";
import { computeFileHash, getFileType, validateFile } from "@/lib/storage/utils";

describe("Storage Utils", () => {
  describe("computeFileHash", () => {
    it("should compute SHA256 hash of buffer", () => {
      const buffer = Buffer.from("test content");
      const hash = computeFileHash(buffer);
      
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA256 hex length
    });

    it("should produce same hash for same content", () => {
      const buffer = Buffer.from("test content");
      const hash1 = computeFileHash(buffer);
      const hash2 = computeFileHash(buffer);
      
      expect(hash1).toBe(hash2);
    });

    it("should produce different hash for different content", () => {
      const hash1 = computeFileHash(Buffer.from("content1"));
      const hash2 = computeFileHash(Buffer.from("content2"));
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("getFileType", () => {
    it("should identify PDF files", () => {
      expect(getFileType("document.pdf")).toBe("pdf");
      expect(getFileType("DOCUMENT.PDF")).toBe("pdf");
    });

    it("should identify DOCX files", () => {
      expect(getFileType("document.docx")).toBe("docx");
    });

    it("should identify XLSX files", () => {
      expect(getFileType("spreadsheet.xlsx")).toBe("xlsx");
      expect(getFileType("spreadsheet.xls")).toBe("xlsx");
    });

    it("should identify image files", () => {
      expect(getFileType("image.png")).toBe("image");
      expect(getFileType("image.jpg")).toBe("image");
      expect(getFileType("image.jpeg")).toBe("image");
      expect(getFileType("image.gif")).toBe("image");
    });

    it("should return unknown for unsupported types", () => {
      expect(getFileType("file.txt")).toBe("unknown");
      expect(getFileType("file.zip")).toBe("unknown");
    });
  });

  describe("validateFile", () => {
    it("should accept valid PDF file", () => {
      const buffer = Buffer.from("PDF content");
      const result = validateFile(buffer, "test.pdf", { maxFileMB: 50 });
      
      expect(result.fileType).toBe("pdf");
      expect(result.fileSizeMB).toBeLessThan(0.001);
    });

    it("should reject file exceeding size limit", () => {
      const buffer = Buffer.alloc(51 * 1024 * 1024); // 51 MB
      expect(() => validateFile(buffer, "large.pdf", { maxFileMB: 50 })).toThrow("File too large");
    });

    it("should reject unsupported file type", () => {
      const buffer = Buffer.from("text content");
      expect(() => validateFile(buffer, "file.txt", { maxFileMB: 50 })).toThrow("Unsupported file type");
    });
  });
});
