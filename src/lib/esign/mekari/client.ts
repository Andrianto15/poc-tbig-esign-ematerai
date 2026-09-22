import { buildHmacHeaders } from "./hmac";

export class MekariApiError extends Error {
  status: number;
  statusText: string;
  body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    const serializedBody =
      typeof body === "string" ? body : JSON.stringify(body);
    super(`Mekari API Error [${status} ${statusText}]: ${serializedBody}`);
    this.name = "MekariApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export interface MekariRequestOptions {
  baseUrl?: string;
  pathPrefix?: string;
  timeoutMs?: number;
}

/**
 * Mengirim HTTP request ke Mekari eSign API dengan autentikasi HMAC.
 * Tidak me-log kredensial (client secret) maupun isi dokumen base64.
 */
export async function mekariRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  options?: MekariRequestOptions
): Promise<T> {
  const baseUrl =
    options?.baseUrl ??
    process.env.MEKARI_BASE_URL ??
    "https://sandbox-api.mekari.com";
  const pathPrefix =
    options?.pathPrefix ??
    process.env.MEKARI_ESIGN_PATH_PREFIX ??
    "/v2/esign-hmac/v1";
  const timeoutMs = options?.timeoutMs ?? 30_000;

  // Pastikan path diawali slash dan prefix lengkap disertakan
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const fullPath = normalizedPath.startsWith(pathPrefix)
    ? normalizedPath
    : `${pathPrefix}${normalizedPath}`;

  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${cleanBaseUrl}${fullPath}`;

  const hmacHeaders = buildHmacHeaders(method, fullPath);

  const fetchOptions: RequestInit = {
    method: method.toUpperCase(),
    headers: {
      ...hmacHeaders,
    },
    signal: AbortSignal.timeout(timeoutMs),
  };

  const upperMethod = method.toUpperCase();
  if (body !== undefined && upperMethod !== "GET" && upperMethod !== "HEAD") {
    fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  const contentType = response.headers.get("content-type") || "";
  let responseData: unknown;

  if (contentType.includes("application/json")) {
    try {
      responseData = await response.json();
    } catch {
      responseData = await response.text();
    }
  } else {
    responseData = await response.text();
  }

  if (!response.ok) {
    throw new MekariApiError(response.status, response.statusText, responseData);
  }

  return responseData as T;
}
