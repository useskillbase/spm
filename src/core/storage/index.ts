import type { StorageConfig, StorageProvider } from "./types.js";
import { S3StorageProvider } from "./s3-provider.js";
import { LocalStorageProvider } from "./local-provider.js";

export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.type) {
    case "s3":
      return new S3StorageProvider(config);
    case "local":
      return new LocalStorageProvider(config);
    default:
      throw new Error(`Unknown storage type: ${(config as StorageConfig).type}`);
  }
}

export function loadStorageConfigFromEnv(): StorageConfig {
  const type = (process.env["STORAGE_TYPE"] as "s3" | "local") ?? "local";

  if (type === "s3") {
    return {
      type: "s3",
      bucket: process.env["S3_BUCKET"] ?? "skillbase-registry",
      region: process.env["S3_REGION"] ?? "auto",
      endpoint: process.env["S3_ENDPOINT"],
      accessKeyId: process.env["S3_ACCESS_KEY_ID"],
      secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
    };
  }

  return {
    type: "local",
    basePath: process.env["STORAGE_PATH"],
  };
}

export type { StorageConfig, StorageProvider, UploadResult, DownloadResult } from "./types.js";
export { buildSkillS3Key } from "./types.js";
export { S3StorageProvider } from "./s3-provider.js";
export { LocalStorageProvider } from "./local-provider.js";
export { packSkill, unpackSkill, computeIntegrity } from "./packager.js";
