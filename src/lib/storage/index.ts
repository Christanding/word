import * as fs from "fs";
import * as path from "path";

interface CloudBaseStorageApp {
  uploadFile(params: { cloudPath: string; fileContent: Buffer }): Promise<{ fileID: string }>;
  downloadFile(params: { fileID: string }): Promise<{ fileContent: Buffer }>;
  deleteFile(params: { fileList: string[] }): Promise<unknown>;
}

// Storage adapter interface
export interface StorageAdapter {
  saveFile(key: string, buffer: Buffer): Promise<string>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  fileExists(key: string): Promise<boolean>;
}

// Local file system storage (for development)
export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async saveFile(key: string, buffer: Buffer): Promise<string> {
    const filePath = path.join(this.basePath, key);
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  async getFile(key: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, key);
    return fs.readFileSync(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async fileExists(key: string): Promise<boolean> {
    const filePath = path.join(this.basePath, key);
    return fs.existsSync(filePath);
  }
}

// CloudBase storage adapter (for production)
export class CloudBaseStorageAdapter implements StorageAdapter {
  private env: string;
  private app: CloudBaseStorageApp | null;

  constructor(env: string) {
    this.env = env;
    this.app = null;
  }

  private async getApp() {
    if (!this.app) {
      const cloudbaseModule = await import("@cloudbase/node-sdk");
      const sdk = (cloudbaseModule.default || cloudbaseModule) as unknown as {
        init(config: {
          env: string;
          secretId?: string;
          secretKey?: string;
        }): CloudBaseStorageApp;
      };
      this.app = sdk.init({
        env: this.env,
        secretId: process.env.TENCENT_SECRET_ID || undefined,
        secretKey: process.env.TENCENT_SECRET_KEY || undefined,
      });
    }
    return this.app;
  }

  async saveFile(key: string, buffer: Buffer): Promise<string> {
    const app = await this.getApp();
    const uploadResult = await app.uploadFile({
      cloudPath: key,
      fileContent: buffer,
    });
    return uploadResult.fileID;
  }

  async getFile(key: string): Promise<Buffer> {
    const app = await this.getApp();
    const result = await app.downloadFile({
      fileID: key,
    });
    return result.fileContent;
  }

  async deleteFile(key: string): Promise<void> {
    const app = await this.getApp();
    await app.deleteFile({
      fileList: [key],
    });
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.getFile(key);
      return true;
    } catch {
      return false;
    }
  }
}

// Factory function
export function getStorageAdapter(): StorageAdapter {
  const useLocal =
    process.env.NODE_ENV === "test" ||
    process.env.USE_LOCAL_STORAGE === "1" ||
    !process.env.CLOUDBASE_ENV;

  if (useLocal) {
    const basePath = path.join(process.cwd(), ".local", "uploads");
    console.log("Using Local Storage Adapter");
    return new LocalStorageAdapter(basePath);
  }

  console.log("Using CloudBase Storage Adapter");
  return new CloudBaseStorageAdapter(process.env.CLOUDBASE_ENV!);
}
