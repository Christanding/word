// OCR Provider interface
export interface OcrResult {
  text: string;
  confidence: number;
  boundingBoxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
  }>;
}

export interface OcrProvider {
  recognizeImage(imageBuffer: Buffer, options?: OcrOptions): Promise<OcrResult>;
  recognizePdfPages(pdfBuffers: Buffer[], options?: OcrOptions): Promise<OcrResult[]>;
}

export interface OcrOptions {
  language?: "zh-en" | "en" | "zh";
  detectLayout?: boolean;
}

// LLM Provider interface
export interface DefinitionResult {
  lemma: string;
  pos?: string;
  senses: string[];
  model?: string;
  tokensUsed?: number;
}

export interface LlmProvider {
  defineWords(words: string[], options?: LlmOptions): Promise<DefinitionResult[]>;
}

export interface LlmOptions {
  model?: string;
  maxSenses?: number;
  includePos?: boolean;
}
