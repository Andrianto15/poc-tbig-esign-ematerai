import crypto from "node:crypto";
import { after } from "next/server";
import { getStorage } from "@/lib/storage";
import { buildMockStorageKey } from "@/lib/storage/types";
import {
  ESignProvider,
  AutoSignInput,
  StampMeteraiInput,
  RequestSignInput,
  SubmitResult,
  ESignEvent,
} from "../types";
import {
  applySimulatedSignature,
  applySimulatedMeterai,
} from "@/lib/pdf/stamp-simulation";
import { handleESignEvent } from "@/lib/workflow/handle-esign-event";

function scheduleEvent(delayMs: number, fn: () => Promise<void>) {
  let scheduled = false;
  try {
    if (typeof after === "function") {
      after(async () => {
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        await fn();
      });
      scheduled = true;
    }
  } catch {
    scheduled = false;
  }

  if (!scheduled) {
    setTimeout(async () => {
      try {
        await fn();
      } catch (err) {
        console.error("[MockESignProvider] Error running scheduled event:", err);
      }
    }, delayMs);
  }
}

export class MockESignProvider implements ESignProvider {
  readonly name = "mock" as const;

  async autoSign(input: AutoSignInput): Promise<SubmitResult> {
    const externalId = `mock-autosign-${crypto.randomUUID()}`;

    // 1. Gambar tanda tangan simulasi & watermark pada PDF
    const signerName = "Admin Pengadaan TBIG";
    const signedPdfBytes = await applySimulatedSignature(
      input.pdf,
      input.page,
      input.box,
      signerName
    );

    // 2. Simpan dokumen hasil di storage dengan key mock/{externalId}.pdf
    const storage = getStorage();
    const mockStorageKey = buildMockStorageKey(externalId);
    await storage.put(mockStorageKey, signedPdfBytes, "application/pdf");

    // 3. Evaluasi simulasi kegagalan
    const shouldFail = process.env.MOCK_ESIGN_FAIL === "AUTO_SIGN_TBIG";
    const delayMs = parseInt(process.env.MOCK_ESIGN_DELAY_MS || "2000", 10);

    // 4. Jadwalkan event COMPLETED / FAILED
    scheduleEvent(delayMs, async () => {
      await handleESignEvent({
        provider: "mock",
        externalId,
        type: shouldFail ? "FAILED" : "COMPLETED",
        errorMessage: shouldFail
          ? "Simulasi kegagalan Auto Sign TBIG (MOCK_ESIGN_FAIL aktif)"
          : undefined,
        raw: {
          simulated: true,
          jobId: input.jobId,
          shouldFail,
          timestamp: new Date().toISOString(),
        },
      });
    });

    return { externalId };
  }

  async stampMeterai(input: StampMeteraiInput): Promise<SubmitResult> {
    const externalId = `mock-meterai-${crypto.randomUUID()}`;

    // 1. Gambar meterai simulasi & watermark pada PDF
    const stampedPdfBytes = await applySimulatedMeterai(
      input.pdf,
      input.page,
      input.box
    );

    // 2. Simpan di storage mock
    const storage = getStorage();
    const mockStorageKey = buildMockStorageKey(externalId);
    await storage.put(mockStorageKey, stampedPdfBytes, "application/pdf");

    // 3. Evaluasi simulasi kegagalan
    const shouldFail = process.env.MOCK_ESIGN_FAIL === "STAMP_METERAI";
    const delayMs = parseInt(process.env.MOCK_ESIGN_DELAY_MS || "2000", 10);

    // 4. Jadwalkan event
    scheduleEvent(delayMs, async () => {
      await handleESignEvent({
        provider: "mock",
        externalId,
        type: shouldFail ? "FAILED" : "COMPLETED",
        errorMessage: shouldFail
          ? "Simulasi kegagalan Stamp eMeterai (MOCK_ESIGN_FAIL aktif)"
          : undefined,
        raw: {
          simulated: true,
          jobId: input.jobId,
          shouldFail,
          timestamp: new Date().toISOString(),
        },
      });
    });

    return { externalId };
  }

  async requestSign(input: RequestSignInput): Promise<SubmitResult> {
    const externalId = `mock-reqsign-${crypto.randomUUID()}`;

    // Simpan PDF input di mock storage agar dapat diakses oleh halaman mock tanda tangan
    const storage = getStorage();
    const mockStorageKey = buildMockStorageKey(externalId);
    await storage.put(mockStorageKey, input.pdf, "application/pdf");

    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    const signUrl = `${baseUrl}/mock-mekari/sign/${input.jobId}`;

    // PRD Bagian 9: Tidak ada event sampai signer menandatangani di halaman mock
    return {
      externalId,
      signUrl,
      signerId: `mock-vendor-${input.jobId}`,
      tbigSignerId: `mock-tbig-${input.jobId}`,
    };
  }

  async downloadDocument(externalId: string): Promise<Uint8Array> {
    const storage = getStorage();
    const mockStorageKey = buildMockStorageKey(externalId);
    const bytes = await storage.get(mockStorageKey);
    if (!bytes) {
      throw new Error(
        `Dokumen mock dengan externalId '${externalId}' tidak ditemukan di storage (${mockStorageKey}).`
      );
    }
    return bytes;
  }

  async parseWebhook(req: Request): Promise<ESignEvent> {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      throw new Error("Payload webhook harus berupa JSON object.");
    }
    const externalId = (body as Record<string, unknown>).externalId;
    const type = (body as Record<string, unknown>).type;

    if (
      typeof externalId !== "string" ||
      (type !== "COMPLETED" && type !== "FAILED")
    ) {
      throw new Error(
        "Payload webhook mock tidak valid: butuh externalId (string) dan type ('COMPLETED' | 'FAILED')."
      );
    }

    return {
      provider: "mock",
      externalId,
      type,
      errorMessage:
        typeof (body as Record<string, unknown>).errorMessage === "string"
          ? ((body as Record<string, unknown>).errorMessage as string)
          : undefined,
      raw: body,
    };
  }

  async getStatus(externalId: string): Promise<ESignEvent | null> {
    const storage = getStorage();
    const bytes = await storage.get(buildMockStorageKey(externalId));
    if (bytes) {
      return {
        provider: "mock",
        externalId,
        type: "COMPLETED",
        raw: { checked: true },
      };
    }
    return null;
  }
}
