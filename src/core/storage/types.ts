export interface StorageConfig {
  type: "s3" | "local";
  // S3 options
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  // Local options
  basePath?: string;
}

export interface UploadResult {
  key: string;
  size: number;
  integrity: string; // sha256-<hex>
}

export interface DownloadResult {
  data: Buffer;
  size: number;
}

export interface StorageProvider {
  upload(key: string, data: Buffer): Promise<UploadResult>;
  download(key: string): Promise<DownloadResult>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export function buildSkillS3Key(author: string, name: string, version: string): string {
  return `skills/${author}/${name}/${version}.tar.gz`;
}
