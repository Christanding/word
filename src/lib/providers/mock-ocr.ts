import type { OcrProvider, OcrResult, OcrOptions } from "./types";

// Mock OCR provider for local development and tests
export class MockOcrProvider implements OcrProvider {
  private callCount = 0;

  async recognizeImage(imageBuffer: Buffer, options?: OcrOptions): Promise<OcrResult> {
    void imageBuffer;
    void options;
    this.callCount++;
    
    // Return deterministic mock output
    return {
      text: `Mock OCR Result #${this.callCount}\nThis is simulated OCR output for testing.`,
      confidence: 0.95,
      boundingBoxes: [],
    };
  }

  async recognizePdfPages(pdfBuffers: Buffer[], options?: OcrOptions): Promise<OcrResult[]> {
    void options;
    return pdfBuffers.map((_, index) => ({
      text: `Mock OCR Page ${index + 1}\nSimulated content for page ${index + 1}.`,
      confidence: 0.95 - (index * 0.01),
      boundingBoxes: [],
    }));
  }

  // Reset for testing
  reset() {
    this.callCount = 0;
  }

  getCallCount() {
    return this.callCount;
  }
}
