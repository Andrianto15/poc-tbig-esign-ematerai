import { prisma } from "@/lib/db";
import { getESignProvider } from "@/lib/esign";
import { handleESignEvent } from "@/lib/workflow/handle-esign-event";
import { SignJobStatus } from "@/generated/prisma/enums";

export interface SyncStatusResult {
  success: boolean;
  updated: boolean;
  message: string;
  externalId?: string;
  status?: string;
}

/**
 * Memeriksa status dokumen terkini ke penyedia eSign (fallback polling jika webhook tidak sampai).
 * Sesuai PRD Bagian Step 2.5
 */
export async function syncPengadaanJobStatus(
  pengadaanId: string
): Promise<SyncStatusResult> {
  const pengadaan = await prisma.pengadaan.findUnique({
    where: { id: pengadaanId },
    include: {
      jobs: {
        where: {
          status: { in: [SignJobStatus.PENDING, SignJobStatus.WAITING_SIGNER] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!pengadaan) {
    return {
      success: false,
      updated: false,
      message: "Pengadaan tidak ditemukan.",
    };
  }

  const job = pengadaan.jobs[0];
  if (!job) {
    return {
      success: false,
      updated: false,
      message: "Tidak ada proses tanda tangan atau e-Meterai yang sedang berjalan.",
    };
  }

  if (!job.externalId) {
    return {
      success: false,
      updated: false,
      message: "Proses ini belum memiliki ID eksternal pada penyedia tanda tangan.",
    };
  }

  const provider = getESignProvider();
  if (!provider.getStatus) {
    return {
      success: false,
      updated: false,
      message: "Penyedia tanda tangan saat ini tidak mendukung pengecekan status manual.",
    };
  }

  const event = await provider.getStatus(job.externalId);
  if (!event) {
    return {
      success: true,
      updated: false,
      externalId: job.externalId,
      message: "Dokumen masih dalam proses di penyedia tanda tangan (belum selesai).",
    };
  }

  const handleResult = await handleESignEvent(event);
  if (!handleResult.success && handleResult.reason !== "ALREADY_PROCESSED") {
    return {
      success: false,
      updated: false,
      externalId: job.externalId,
      message: `Gagal memproses event eSign: ${handleResult.reason}`,
    };
  }

  return {
    success: true,
    updated: true,
    externalId: job.externalId,
    status: event.type,
    message:
      event.type === "COMPLETED"
        ? "Status dokumen berhasil diperbarui: Selesai."
        : `Status dokumen gagal: ${event.errorMessage || "Gagal di penyedia."}`,
  };
}
