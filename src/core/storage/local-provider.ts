import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { StorageConfig, StorageProvider, UploadResult, DownloadResult } from "./types.js";

export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor(config: StorageConfig) {
    this.basePath = config.basePath ?? path.join(process.cwd(), ".storage");
  }

  private fullPath(key: string): string {
    return path.join(this.basePath, key);
  }

  async upload(key: string, data: Buffer): Promise<UploadResult> {
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    const integrity = `sha256-${hash}`;

    const filePath = this.fullPath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);

    return { key, size: data.length, integrity };
  }

  async download(key: string): Promise<DownloadResult> {
    const filePath = this.fullPath(key);
    const data = await fs.readFile(filePath);
    return { data, size: data.length };
  }

  async getSignedUrl(key: string): Promise<string> {
    const filePath = this.fullPath(key);
    return pathToFileURL(filePath).href;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.fullPath(key);
    await fs.rm(filePath, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(key));
      return true;
    } catch {
      return false;
    }
  }
}
