import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { Storage } from "./types";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "SUPABASE_URL atau SUPABASE_SECRET_KEY belum dikonfigurasi di environment."
    );
  }

  cachedClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: ws as never,
    },
  });

  return cachedClient;
}

export class SupabaseStorage implements Storage {
  private bucket: string;

  constructor(bucket?: string) {
    this.bucket =
      bucket || process.env.SUPABASE_STORAGE_BUCKET || "pengadaan-docs";
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const client = getSupabaseAdminClient();
    const { error } = await client.storage
      .from(this.bucket)
      .upload(key, bytes, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase Storage upload error: ${error.message}`);
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const client = getSupabaseAdminClient();
    const { data, error } = await client.storage.from(this.bucket).download(key);

    if (error || !data) {
      if (error) {
        console.error(`[SupabaseStorage.get] Error downloading '${key}':`, error);
      }
      return null;
    }

    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async delete(key: string): Promise<void> {
    const client = getSupabaseAdminClient();
    const { error } = await client.storage.from(this.bucket).remove([key]);

    if (error) {
      throw new Error(`Supabase Storage delete error: ${error.message}`);
    }
  }
}
