import { Storage } from "./types";
import { SupabaseStorage } from "./supabase";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

export * from "./types";
export * from "./supabase";
export * from "./local";
export * from "./s3";

let storageInstance: Storage | null = null;

export function getStorage(): Storage {
  if (storageInstance) {
    return storageInstance;
  }

  const driver = (process.env.STORAGE_DRIVER || "neon").toLowerCase();
  if (driver === "local") {
    storageInstance = new LocalStorage();
  } else if (driver === "supabase") {
    storageInstance = new SupabaseStorage();
  } else {
    // Default neon / s3
    storageInstance = new S3Storage();
  }

  return storageInstance;
}
