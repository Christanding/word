import type { OcrProvider, OcrResult, OcrOptions } from "./types";

interface TencentSdk {
  ocr: {
    v20181119: {
      Client: new (config: {
        credential: { secretId: string; secretKey: string };
        region: string;
        profile: { httpProfile: { endpoint: string } };
      }) => {
        GeneralBasicOCR: (params: {
          ImageBase64: string;
          LanguageType?: "en" | "zh";
        }) => Promise<Record<string, unknown>>;
      };
    };
  };
}

let _tencentcloud: TencentSdk | null = null;

async function getTencentCloud() {
  if (!_tencentcloud) {
    const mod = await import("tencentcloud-sdk-nodejs");
    const sdk = (mod.default || mod) as unknown;
    _tencentcloud = sdk as TencentSdk;
  }
  return _tencentcloud;
}

export interface TencentOcrConfig {
  secretId: string;
  secretKey: string;
  region?: string;
}

export class TencentOcrProvider implements OcrProvider {
  private client: {
    GeneralBasicOCR: (params: {
      ImageBase64: string;
      LanguageType?: "en" | "zh";
    }) => Promise<Record<string, unknown>>;
  } | null = null;
  private config: TencentOcrConfig;

  constructor(config: TencentOcrConfig) {
    this.config = config;
  }

  private async getClient() {
    if (this.client) {
      return this.client;
    }

    const tencentcloud = await getTencentCloud();
    const OcrClient = tencentcloud.ocr.v20181119.Client;
    this.client = new OcrClient({
      credential: {
        secretId: this.config.secretId,
        secretKey: this.config.secretKey,
      },
      region: this.config.region || "ap-guangzhou",
      profile: {
        httpProfile: {
          endpoint: "ocr.tencentcloudapi.com",
        },
      },
    });

    return this.client;
  }

  async recognizeImage(imageBuffer: Buffer, options?: OcrOptions): Promise<OcrResult> {
    const base64Image = imageBuffer.toString("base64");

    try {
      const client = await this.getClient();
      const params: { ImageBase64: string; LanguageType?: "en" | "zh" } = {
        ImageBase64: base64Image,
      };
      if (options?.language === "en" || options?.language === "zh") {
        params.LanguageType = options.language;
      }

      const response = await client.GeneralBasicOCR(params);
      const detections: Array<Record<string, unknown>> =
        (response.TextDetections as Array<Record<string, unknown>> | undefined) ||
        (response.TextDetail as Array<Record<string, unknown>> | undefined) ||
        [];

      const text = detections
        .map((item) => {
          const detected = item.DetectedText;
          const legacy = item.Text;
          return typeof detected === "string" ? detected : typeof legacy === "string" ? legacy : "";
        })
        .filter((line) => line.length > 0)
        .join("\n");

      const confidenceValue = detections[0]?.Confidence;
      const confidence = typeof confidenceValue === "number" ? confidenceValue : 0;

      return {
        text,
        confidence,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Tencent OCR error:", error);
      throw new Error(`OCR failed: ${message}`);
    }
  }

  async recognizePdfPages(pdfBuffers: Buffer[], options?: OcrOptions): Promise<OcrResult[]> {
    // Process each page sequentially to avoid rate limits
    const results: OcrResult[] = [];
    for (const buffer of pdfBuffers) {
      const result = await this.recognizeImage(buffer, options);
      results.push(result);
    }
    return results;
  }
}
