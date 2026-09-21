import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { Storage } from "./types";

let cachedClient: S3Client | null = null;

export function getS3Client(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }

  const endpoint =
    process.env.AWS_ENDPOINT_URL_S3 ||
    process.env.NEON_STORAGE_ENDPOINT;
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.NEON_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.NEON_STORAGE_SECRET_ACCESS_KEY;
  const region =
    process.env.AWS_REGION ||
    process.env.NEON_STORAGE_REGION ||
    "ap-southeast-1";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Konfigurasi S3/Neon Storage belum lengkap di environment (AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)."
    );
  }

  cachedClient = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });

  return cachedClient;
}

export class S3Storage implements Storage {
  private bucket: string;

  constructor(bucket?: string) {
    this.bucket =
      bucket ||
      process.env.AWS_BUCKET_NAME ||
      process.env.NEON_STORAGE_BUCKET ||
      process.env.SUPABASE_STORAGE_BUCKET ||
      "pengadaan-docs";
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const client = getS3Client();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`S3 Storage upload error: ${msg}`);
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const client = getS3Client();
    try {
      const res = await client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      if (!res.Body) {
        return null;
      }
      return await res.Body.transformToByteArray();
    } catch (err: unknown) {
      const s3Err = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        s3Err instanceof NoSuchKey ||
        s3Err.name === "NoSuchKey" ||
        s3Err.name === "NotFound" ||
        s3Err.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      console.error(`[S3Storage.get] Error downloading '${key}':`, err);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const client = getS3Client();
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`S3 Storage delete error: ${msg}`);
    }
  }
}
