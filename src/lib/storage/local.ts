import fs from "node:fs/promises";
import path from "node:path";
import { Storage } from "./types";

export class LocalStorage implements Storage {
  private baseDir: string;

  constructor(baseDir?: string) {
    if (process.env.VERCEL) {
      throw new Error(
        "LocalStorage tidak boleh digunakan di lingkungan Vercel (read-only filesystem)."
      );
    }
    this.baseDir = path.resolve(
      /*turbopackIgnore: true*/
      baseDir || process.env.LOCAL_STORAGE_DIR || "./.storage"
    );
  }

  private getFilePath(key: string): string {
    return path.join(this.baseDir, key);
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const filePath = this.getFilePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const filePath = this.getFilePath(key);
    try {
      const buffer = await fs.readFile(filePath);
      return new Uint8Array(buffer);
    } catch (err: unknown) {
      const nodeErr = err as { code?: string };
      if (nodeErr.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      const nodeErr = err as { code?: string };
      if (nodeErr.code !== "ENOENT") {
        throw err;
      }
    }
  }
}
