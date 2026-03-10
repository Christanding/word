import type { OcrProvider } from "./types";
import { MockOcrProvider } from "./mock-ocr";
import { TencentOcrProvider, type TencentOcrConfig } from "./tencent-ocr";

export function getOcrProvider(): OcrProvider {
  const useMock =
    process.env.NODE_ENV === "test" ||
    process.env.MOCK_OCR === "1" ||
    !process.env.TENCENT_SECRET_ID;

  if (useMock) {
    console.log("Using Mock OCR Provider");
    return new MockOcrProvider();
  }

  const config: TencentOcrConfig = {
    secretId: process.env.TENCENT_SECRET_ID!,
    secretKey: process.env.TENCENT_SECRET_KEY!,
    region: process.env.TENCENT_REGION || "ap-guangzhou",
  };

  console.log("Using Tencent Cloud OCR Provider");
  return new TencentOcrProvider(config);
}

// Export all providers for direct use
export { MockOcrProvider } from "./mock-ocr";
export { TencentOcrProvider } from "./tencent-ocr";
