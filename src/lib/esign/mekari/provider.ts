import {
  ESignProvider,
  AutoSignInput,
  StampMeteraiInput,
  RequestSignInput,
  SubmitResult,
  ESignEvent,
} from "../types";
import { mekariRequest, MekariApiError } from "./client";
import { buildHmacHeaders } from "./hmac";
import { toMekariAnnotation } from "@/lib/pdf/signature-layout";

interface MekariDocumentResponse {
  data: {
    id: string;
    type?: string;
    attributes?: {
      filename?: string;
      doc_url?: string;
      signing_status?: string;
      stamping_status?: string;
      signing_link?: Array<{
        recipient_email?: string;
        recipient_name?: string;
        signing_link?: string;
      }>;
      signers?: Array<{
        name?: string;
        email?: string;
        status?: string;
        signing_status?: string;
        signing_url?: string | null;
      }>;
    };
  };
}

export class MekariESignProvider implements ESignProvider {
  readonly name = "mekari" as const;

  /**
   * Menandatangani dokumen secara otomatis sebagai TBIG
   */
  async autoSign(input: AutoSignInput): Promise<SubmitResult> {
    const signerName =
      process.env.MEKARI_TBIG_SIGNER_NAME || "TBIG Procurement";
    const signerEmail =
      process.env.MEKARI_TBIG_SIGNER_EMAIL || "devtujuhsembilan@gmail.com";

    const base64Doc = Buffer.from(input.pdf).toString("base64");
    const annotation = toMekariAnnotation(input.box, input.page, "signature");

    const payload = {
      doc: base64Doc,
      filename: input.filename,
      signers: [
        {
          name: signerName,
          email: signerEmail,
          is_autosign: true,
          annotations: [annotation],
        },
      ],
      callback_url: input.callbackUrl,
    };

    const res = await mekariRequest<MekariDocumentResponse>(
      "POST",
      "/documents/request_global_sign",
      payload
    );

    return {
      externalId: res.data.id,
    };
  }

  /**
   * Membubuhkan eMeterai resmi Peruri via Mekari
   */
  async stampMeterai(input: StampMeteraiInput): Promise<SubmitResult> {
    const base64Doc = Buffer.from(input.pdf).toString("base64");
    const annotation = toMekariAnnotation(input.box, input.page, "emeterai");

    const payload = {
      doc: base64Doc,
      filename: input.filename,
      annotations: [annotation],
      callback_url: input.callbackUrl,
    };

    const res = await mekariRequest<MekariDocumentResponse>(
      "POST",
      "/documents/stamp",
      payload
    );

    return {
      externalId: res.data.id,
    };
  }

  /**
   * Mengirim permintaan tanda tangan ke signer eksternal (Vendor)
   */
  async requestSign(input: RequestSignInput): Promise<SubmitResult> {
    const base64Doc = Buffer.from(input.pdf).toString("base64");
    const annotation = toMekariAnnotation(input.box, input.page, "signature");

    const payload = {
      doc: base64Doc,
      filename: input.filename,
      signers: [
        {
          name: input.signer.name,
          email: input.signer.email,
          annotations: [annotation],
        },
      ],
      signing_url: true,
      signing_order: false,
      callback_url: input.callbackUrl,
    };

    const res = await mekariRequest<MekariDocumentResponse>(
      "POST",
      "/documents/request_global_sign",
      payload
    );

    const signUrl =
      res.data.attributes?.signing_link?.[0]?.signing_link ||
      res.data.attributes?.signers?.[0]?.signing_url ||
      undefined;

    return {
      externalId: res.data.id,
      signUrl,
    };
  }

  /**
   * Mengunduh dokumen PDF hasil penandatanganan/meterai dari Mekari
   */
  async downloadDocument(externalId: string): Promise<Uint8Array> {
    const baseUrl =
      process.env.MEKARI_BASE_URL || "https://sandbox-api.mekari.com";
    const prefix =
      process.env.MEKARI_ESIGN_PATH_PREFIX || "/v2/esign-hmac/v1";
    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
    const fullPath = `${normalizedPrefix}/documents/${externalId}/download`;

    const headers = buildHmacHeaders("GET", fullPath);

    const res = await fetch(`${cleanBaseUrl}${fullPath}`, {
      method: "GET",
      headers: {
        ...headers,
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(
        `Gagal mengunduh dokumen dari Mekari [${res.status}]: ${errorText}`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Cek status dokumen (fallback polling jika webhook terlambat)
   */
  async getStatus(externalId: string): Promise<ESignEvent | null> {
    let res: MekariDocumentResponse;
    try {
      res = await mekariRequest<MekariDocumentResponse>(
        "GET",
        `/documents/${externalId}`
      );
    } catch (err: unknown) {
      if (err instanceof MekariApiError && err.status === 404) {
        return null;
      }
      throw err;
    }

    const attrs = res.data.attributes;
    const signingStatus = (attrs?.signing_status || "").toLowerCase();
    const stampingStatus = (attrs?.stamping_status || "").toLowerCase();

    // Berhasil jika meterai sukses atau ttd selesai
    if (
      stampingStatus === "success" ||
      stampingStatus === "stamped" ||
      signingStatus === "completed" ||
      signingStatus === "success"
    ) {
      return {
        provider: "mekari",
        externalId,
        type: "COMPLETED",
        raw: res,
      };
    }

    // Gagal jika salah satu status berindikasi gagal/ditolak
    if (
      stampingStatus === "failed" ||
      signingStatus === "failed" ||
      signingStatus === "voided" ||
      signingStatus === "rejected" ||
      signingStatus === "declined"
    ) {
      return {
        provider: "mekari",
        externalId,
        type: "FAILED",
        errorMessage: `Status dokumen Mekari: signing=${signingStatus}, stamping=${stampingStatus}`,
        raw: res,
      };
    }

    // Dokumen masih dalam proses ("in_progress", "none", "pending")
    return null;
  }

  /**
   * Parse dan verifikasi event webhook dari Mekari
   */
  async parseWebhook(req: Request): Promise<ESignEvent | null> {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const expectedToken = process.env.ESIGN_WEBHOOK_TOKEN;

    if (expectedToken && token !== expectedToken) {
      throw new Error("Token webhook eSign tidak valid.");
    }

    const body = (await req.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object") {
      throw new Error("Payload webhook harus berupa JSON object.");
    }

    const dataObj = body.data as Record<string, unknown> | undefined;
    const attrsObj = dataObj?.attributes as Record<string, unknown> | undefined;

    const externalId =
      (typeof dataObj?.id === "string" ? dataObj.id : null) ||
      (typeof body.document_id === "string" ? body.document_id : null) ||
      (typeof body.externalId === "string" ? body.externalId : null) ||
      (typeof body.id === "string" ? body.id : null);

    if (!externalId) {
      throw new Error("Payload webhook Mekari tidak memuat ID dokumen.");
    }

    const signingStatus = (
      typeof attrsObj?.signing_status === "string"
        ? attrsObj.signing_status
        : ""
    ).toLowerCase();
    const stampingStatus = (
      typeof attrsObj?.stamping_status === "string"
        ? attrsObj.stamping_status
        : ""
    ).toLowerCase();
    const generalStatus = (
      typeof body.status === "string" ? body.status : ""
    ).toLowerCase();

    const isSuccess =
      signingStatus === "completed" ||
      signingStatus === "success" ||
      stampingStatus === "success" ||
      generalStatus === "completed" ||
      generalStatus === "success";

    const isFailed =
      signingStatus === "failed" ||
      signingStatus === "voided" ||
      signingStatus === "rejected" ||
      stampingStatus === "failed" ||
      generalStatus === "failed";

    if (!isSuccess && !isFailed) {
      // Event masih in_progress atau event pembuka, tidak perlu memicu transisi dokumen
      return null;
    }

    return {
      provider: "mekari",
      externalId,
      type: isFailed ? "FAILED" : "COMPLETED",
      errorMessage: isFailed
        ? `Status webhook gagal: signing=${signingStatus}, stamping=${stampingStatus}`
        : undefined,
      raw: body,
    };
  }
}
