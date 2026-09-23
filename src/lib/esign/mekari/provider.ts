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
import { toMekariAnnotation, LAYOUT } from "@/lib/pdf/signature-layout";

interface MekariDocumentResponse {
  data: {
    id: string;
    type?: string;
    attributes?: {
      filename?: string;
      doc_url?: string;
      signing_status?: string;
      stamping_status?: string;
      type_of_meterai?: string;
      signing_link?: Array<{
        recipient_email?: string;
        recipient_name?: string;
        signing_link?: string;
      }>;
      signers?: Array<{
        id?: string;
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
   * Mengirim permintaan tanda tangan multi-signer (Vendor + eMeterai beban Vendor, dan TBIG auto-sign)
   * menggunakan endpoint v1 agar auto-sign TBIG langsung dieksekusi server-side
   */
  async requestSign(input: RequestSignInput): Promise<SubmitResult> {
    const tbigSignerEmail =
      process.env.MEKARI_TBIG_SIGNER_EMAIL || "devtujuhsembilan@gmail.com";
    const tbigAnnotation = toMekariAnnotation(LAYOUT.tbigSignature, input.page, "signature");

    const base64Doc = Buffer.from(input.pdf).toString("base64");
    const sigAnnotation = toMekariAnnotation(input.box, input.page, "signature");
    const meteraiAnnotation = {
      ...toMekariAnnotation(LAYOUT.vendorMeterai, input.page, "emeterai"),
      meterai_provided: false,
    };

    const payload = {
      doc: base64Doc,
      filename: input.filename,
      signers: [
        {
          name: "Tower Bersama Group",
          email: tbigSignerEmail,
          is_autosign: false,
          requires_otp: true,
          otp_channel: "email",
          annotations: [tbigAnnotation],
        },
        {
          name: input.signer.name,
          email: input.signer.email,
          requires_otp: true,
          otp_channel: "email",
          annotations: [sigAnnotation, meteraiAnnotation],
        },
      ],
      signing_order: false,
      callback_url: input.callbackUrl,
    };

    const res = await mekariRequest<MekariDocumentResponse>(
      "POST",
      "/documents/request_global_sign",
      payload
    );

    const signUrl =
      res.data.attributes?.signing_link?.find(
        (l) => l.recipient_email?.toLowerCase() === input.signer.email.toLowerCase()
      )?.signing_link ||
      res.data.attributes?.signing_link?.[0]?.signing_link ||
      res.data.attributes?.signers?.find(
        (s) => s.email?.toLowerCase() === input.signer.email.toLowerCase()
      )?.signing_url ||
      undefined;

    const vendorSigner = res.data.attributes?.signers?.find(
      (s) => s.email?.toLowerCase() === input.signer.email.toLowerCase()
    );
    const signerId = vendorSigner?.id || res.data.attributes?.signers?.[0]?.id;

    const tbigSignUrl =
      res.data.attributes?.signing_link?.find(
        (l) => l.recipient_email?.toLowerCase() === tbigSignerEmail.toLowerCase()
      )?.signing_link ||
      res.data.attributes?.signers?.find(
        (s) => s.email?.toLowerCase() === tbigSignerEmail.toLowerCase()
      )?.signing_url ||
      undefined;

    const tbigSigner = res.data.attributes?.signers?.find(
      (s) => s.email?.toLowerCase() === tbigSignerEmail.toLowerCase()
    );
    const tbigSignerId = tbigSigner?.id;

    return {
      externalId: res.data.id,
      signerId,
      tbigSignerId,
      signUrl,
      tbigSignUrl,
    };
  }


  /**
   * Memicu pengiriman kode OTP verifikasi penandatanganan ke email signer (Mekari V2)
   */
  async requestOtp(signerId: string): Promise<{ success: boolean; message?: string }> {
    const res = await mekariRequest<{ data?: { message?: string } }>(
      "POST",
      "/documents/request_otp_sign",
      { signer_id: signerId },
      { pathPrefix: "/v2/esign-hmac/v2" }
    );
    return { success: true, message: res.data?.message };
  }

  /**
   * Memvalidasi kode OTP yang dimasukkan oleh signer di Mekari V2
   */
  async validateOtp(signerId: string, otp: string): Promise<{ success: boolean; error?: string }> {
    try {
      await mekariRequest(
        "POST",
        `/documents/validate_otp/${signerId}`,
        { otp: otp.trim() },
        { pathPrefix: "/v2/esign-hmac/v2" }
      );
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof MekariApiError && err.body && typeof err.body === "object") {
        const params = (err.body as { data?: { params?: { otp?: string[] } } })?.data?.params;
        const otpError = params?.otp?.[0] || "Kode OTP tidak valid";
        return { success: false, error: otpError };
      }
      return { success: false, error: (err as Error).message || "Gagal validasi OTP" };
    }
  }

  /**
   * Menyelesaikan penandatanganan dokumen di Mekari V2 setelah validasi OTP
   */
  async signDocument(
    signerId: string,
    signatureBase64?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const dummySign =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      await mekariRequest(
        "POST",
        "/documents/signing",
        {
          signer_id: signerId,
          type: "image",
          signature: signatureBase64 || dummySign,
        },
        { pathPrefix: "/v2/esign-hmac/v2" }
      );
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message || "Gagal menyelesaikan tanda tangan" };
    }
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

    // Cek apakah dokumen ini membutuhkan e-Meterai
    const hasMeterai = Boolean(
      attrs?.type_of_meterai ||
      (stampingStatus && !["none", "not_stamped"].includes(stampingStatus))
    );

    const isSigningDone =
      signingStatus === "completed" || signingStatus === "success";
    const isStampingDone =
      stampingStatus === "success" || stampingStatus === "stamped";

    // Berhasil hanya jika penandatanganan selesai DAN (jika ada meterai) pembubuhan meterai juga telah sukses
    if (isSigningDone && (!hasMeterai || isStampingDone)) {
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
    return {
      provider: "mekari",
      externalId,
      type: "IN_PROGRESS",
      raw: res,
    };
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

    const hasMeterai = Boolean(
      attrsObj?.type_of_meterai ||
      (stampingStatus && !["none", "not_stamped"].includes(stampingStatus))
    );

    const isSigningDone =
      signingStatus === "completed" ||
      signingStatus === "success" ||
      generalStatus === "completed" ||
      generalStatus === "success";

    const isStampingDone =
      stampingStatus === "success" || stampingStatus === "stamped";

    const isSuccess = isSigningDone && (!hasMeterai || isStampingDone);

    const isFailed =
      signingStatus === "failed" ||
      signingStatus === "voided" ||
      signingStatus === "rejected" ||
      stampingStatus === "failed" ||
      generalStatus === "failed";

    if (!isSuccess && !isFailed) {
      if (attrsObj?.signers && Array.isArray(attrsObj.signers)) {
        return {
          provider: "mekari",
          externalId,
          type: "IN_PROGRESS",
          raw: body,
        };
      }
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
