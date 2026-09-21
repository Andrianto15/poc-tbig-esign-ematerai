import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { buildPengadaanStorageKey } from "@/lib/storage/types";
import { getESignProvider } from "@/lib/esign";
import { ESignEvent } from "@/lib/esign/types";
import { SignJobStatus, SignJobType } from "@/generated/prisma/enums";
import {
  completeTbigSignTransition,
  completeMeteraiTransition,
  completeVendorSignTransition,
} from "./pengadaan-workflow";

export interface HandleEventResult {
  success: boolean;
  reason?: string;
}

/**
 * Memproses event asinkron dari ESignProvider (Mock atau Mekari)
 * Sesuai PRD Bagian 7.3
 */
export async function handleESignEvent(
  event: ESignEvent
): Promise<HandleEventResult> {
  // 1. Cari SignJob berdasarkan externalId (dengan retry toleransi race condition)
  let job = await prisma.signJob.findUnique({
    where: { externalId: event.externalId },
    include: { pengadaan: true },
  });

  if (!job) {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 150));
      job = await prisma.signJob.findUnique({
        where: { externalId: event.externalId },
        include: { pengadaan: true },
      });
      if (job) break;
    }
  }

  if (!job) {
    console.warn(
      `[handleESignEvent] SignJob tidak ditemukan untuk externalId '${event.externalId}'.`
    );
    return { success: false, reason: "JOB_NOT_FOUND" };
  }

  // 2. Jika job sudah COMPLETED atau FAILED, abaikan (idempoten)
  if (
    job.status === SignJobStatus.COMPLETED ||
    job.status === SignJobStatus.FAILED
  ) {
    return { success: true, reason: "ALREADY_PROCESSED" };
  }

  // 3. Jika event bertipe FAILED: tandai job gagal dan catat log
  if (event.type === "FAILED") {
    const errorMsg = event.errorMessage || "Proses penyedia tanda tangan gagal.";
    await prisma.$transaction(async (tx) => {
      await tx.signJob.update({
        where: { id: job.id },
        data: {
          status: SignJobStatus.FAILED,
          errorMessage: errorMsg,
        },
      });

      await tx.activityLog.create({
        data: {
          pengadaanId: job.pengadaanId,
          actorId: null,
          action: `JOB_FAILED_${job.type}`,
          note: `Job ${job.type} gagal: ${errorMsg}`,
        },
      });
    });

    return { success: false, reason: "JOB_FAILED" };
  }

  // 4. Jika event bertipe COMPLETED: unduh dokumen dari provider, simpan ke storage, jalankan transisi
  const provider = getESignProvider();
  const documentBytes = await provider.downloadDocument(event.externalId);

  const storage = getStorage();
  const storageKey = buildPengadaanStorageKey(
    job.pengadaanId,
    job.outputFileKind
  );
  await storage.put(storageKey, documentBytes, "application/pdf");

  const sha256 = crypto
    .createHash("sha256")
    .update(documentBytes)
    .digest("hex");
  const sizeBytes = documentBytes.byteLength;

  const fileData = { storageKey, sizeBytes, sha256 };

  if (job.type === SignJobType.AUTO_SIGN_TBIG) {
    await completeTbigSignTransition(job.id, fileData);
  } else if (job.type === SignJobType.STAMP_METERAI) {
    await completeMeteraiTransition(job.id, fileData);
  } else if (job.type === SignJobType.SIGN_VENDOR) {
    await completeVendorSignTransition(job.id, fileData);
  } else {
    throw new Error(`Tipe job tidak didukung: ${job.type}`);
  }

  return { success: true };
}
