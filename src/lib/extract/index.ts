import mammoth from "mammoth";
import * as XLSX from "xlsx";

// Lazy load pdfjs to avoid DOMMatrix issues in tests
interface PdfTextItem {
  str?: string;
}

interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNum: number): Promise<PdfPage>;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
}

interface PdfJsModule {
  version: string;
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(input: { data: Uint8Array }): PdfLoadingTask;
}

class SimpleDOMMatrix {
  static fromMatrix() {
    return new SimpleDOMMatrix();
  }

  multiply() {
    return this;
  }
}

let _pdfjs: PdfJsModule | null = null;

async function getPdfjs() {
  if (!_pdfjs) {
    // Set up DOMMatrix polyfill for Node.js
    if (typeof globalThis.DOMMatrix === "undefined") {
      Reflect.set(globalThis, "DOMMatrix", SimpleDOMMatrix);
    }
    const pdfjsModule = await import("pdfjs-dist");
    _pdfjs = pdfjsModule as unknown as PdfJsModule;
  }
  return _pdfjs;
}

export interface ExtractResult {
  text: string;
  metadata?: {
    pageCount?: number;
    sheetCount?: number;
    wordCount?: number;
  };
}

export async function extractFromDocx(buffer: Buffer): Promise<ExtractResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;
  const wordCount = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  
  return {
    text,
    metadata: { wordCount },
  };
}

export async function extractFromXlsx(buffer: Buffer): Promise<ExtractResult> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const texts: string[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const sheetText = rows
      .map((row) => row.map((cell) => String(cell ?? "")).join(" "))
      .join("\n");
    texts.push(sheetText);
  }
  
  const text = texts.join("\n\n");
  const wordCount = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  
  return {
    text,
    metadata: {
      sheetCount: workbook.SheetNames.length,
      wordCount,
    },
  };
}

export async function extractFromPdf(buffer: Buffer): Promise<ExtractResult> {
  const pdfjs = await getPdfjs();
  
  // Set up PDF.js worker
  pdfjs.GlobalWorkerOptions.workerSrc = await getWorkerSrc();
  
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });
  
  const pdf = await loadingTask.promise;
  const texts: string[] = [];
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .join(" ");
    texts.push(pageText);
  }
  
  const text = texts.join("\n\n");
  const wordCount = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  
  return {
    text,
    metadata: {
      pageCount: pdf.numPages,
      wordCount,
    },
  };
}

async function getWorkerSrc(): Promise<string> {
  try {
    const workerPath = require.resolve("pdfjs-dist/build/pdf.worker.mjs");
    return workerPath;
  } catch {
    const pdfjs = await getPdfjs();
    return `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  }
}

export function hasTextLayer(text: string, threshold: number = 100): boolean {
  return text.trim().length > threshold;
}

export function needsOcr(extractResult: ExtractResult, threshold: number = 100): boolean {
  return !hasTextLayer(extractResult.text, threshold);
}
