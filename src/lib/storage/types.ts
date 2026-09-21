export interface Storage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export function buildPengadaanStorageKey(
  pengadaanId: string,
  fileKind: string,
  timestamp: number = Date.now()
): string {
  return `pengadaan/${pengadaanId}/${fileKind}-${timestamp}.pdf`;
}

export function buildMockStorageKey(externalId: string): string {
  return `mock/${externalId}.pdf`;
}
