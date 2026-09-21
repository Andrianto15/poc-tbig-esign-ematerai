import { Storage } from "./types";
import { SupabaseStorage } from "./supabase";
import { LocalStorage } from "./local";

export * from "./types";
export * from "./supabase";
export * from "./local";

let storageInstance: Storage | null = null;

export function getStorage(): Storage {
  if (storageInstance) {
    return storageInstance;
  }

  const driver = process.env.STORAGE_DRIVER || "supabase";
  if (driver === "local") {
    storageInstance = new LocalStorage();
  } else {
    storageInstance = new SupabaseStorage();
  }

  return storageInstance;
}
