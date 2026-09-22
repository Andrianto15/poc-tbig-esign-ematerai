import crypto from "node:crypto";

export interface BuildHmacOptions {
  date?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface HmacHeaders {
  Date: string;
  Authorization: string;
  "Content-Type": string;
  Accept: string;
}

/**
 * Membangun HTTP headers untuk autentikasi HMAC Mekari eSign.
 * Sesuai spesifikasi HMAC Mekari:
 * payload = `date: ${date}\n${requestLine}`
 * signature = HMAC-SHA256(payload, clientSecret) -> base64
 */
export function buildHmacHeaders(
  method: string,
  pathWithQuery: string,
  options?: BuildHmacOptions
): HmacHeaders {
  const date = options?.date ?? new Date().toUTCString();
  const clientId = options?.clientId ?? process.env.MEKARI_CLIENT_ID;
  const clientSecret = options?.clientSecret ?? process.env.MEKARI_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "MEKARI_CLIENT_ID atau MEKARI_CLIENT_SECRET belum dikonfigurasi di environment."
    );
  }

  const requestLine = `${method.toUpperCase()} ${pathWithQuery} HTTP/1.1`;
  const payload = `date: ${date}\n${requestLine}`;
  const signature = crypto
    .createHmac("sha256", clientSecret)
    .update(payload)
    .digest("base64");

  return {
    Date: date,
    Authorization:
      `hmac username="${clientId}", ` +
      `algorithm="hmac-sha256", headers="date request-line", ` +
      `signature="${signature}"`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
