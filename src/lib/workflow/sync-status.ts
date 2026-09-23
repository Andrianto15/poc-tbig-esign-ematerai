import { prisma } from "@/lib/db";
import { getESignProvider } from "@/lib/esign";
import { handleESignEvent } from "@/lib/workflow/handle-esign-event";
import { PengadaanStatus, SignJobStatus } from "@/generated/prisma/enums";

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
          status: {
            in: [
              SignJobStatus.PENDING,
              SignJobStatus.WAITING_SIGNER,
              SignJobStatus.COMPLETED,
            ],
          },
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

  if (pengadaan.status === PengadaanStatus.SELESAI) {
    return {
      success: true,
      updated: false,
      message: "Pengadaan sudah selesai.",
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

  // Sinkronkan signing links jika belum tersimpan di DB
  try {
    const rawObj = event.raw as Record<string, unknown> | undefined;
    const dataObj = rawObj?.data as Record<string, unknown> | undefined;
    const attrsObj =
      (dataObj?.attributes as Record<string, unknown> | undefined) ||
      (rawObj?.attributes as Record<string, unknown> | undefined);

    const signingLinks = (attrsObj?.signing_link as Array<{
      recipient_email?: string;
      signing_link?: string;
    }>) || [];

    const tbigEmail = (
      process.env.MEKARI_TBIG_SIGNER_EMAIL || "devtujuhsembilan@gmail.com"
    ).toLowerCase();

    const foundTbigLink = signingLinks.find(
      (l) => l.recipient_email?.toLowerCase() === tbigEmail
    )?.signing_link;

    const foundVendorLink = signingLinks.find(
      (l) => l.recipient_email?.toLowerCase() !== tbigEmail
    )?.signing_link;

    if (
      (foundTbigLink && !job.tbigSignUrl) ||
      (foundVendorLink && !job.signUrl)
    ) {
      await prisma.signJob.update({
        where: { id: job.id },
        data: {
          tbigSignUrl: job.tbigSignUrl || foundTbigLink,
          signUrl: job.signUrl || foundVendorLink,
        },
      });
    }
  } catch {
    // Abaikan jika gagal parse link
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

  if (handleResult.reason === "VENDOR_SIGNED_WAITING_TBIG") {
    return {
      success: true,
      updated: true,
      externalId: job.externalId,
      status: "VENDOR_SIGNED",
      message: "Vendor telah selesai tanda tangan. Menunggu tanda tangan pihak TBIG.",
    };
  }

  if (handleResult.reason === "TBIG_SIGNED_WAITING_VENDOR") {
    return {
      success: true,
      updated: true,
      externalId: job.externalId,
      status: "TBIG_SIGNED",
      message: "TBIG telah selesai tanda tangan. Menunggu tanda tangan pihak Vendor.",
    };
  }

  if (handleResult.reason === "WAITING_EMETERAI_STAMP") {
    return {
      success: true,
      updated: true,
      externalId: job.externalId,
      status: "WAITING_EMETERAI_STAMP",
      message:
        "Tanda tangan kedua belah pihak telah lengkap. Sedang memproses pembubuhan e-Meterai resmi.",
    };
  }

  if (handleResult.reason === "IN_PROGRESS") {
    const isVendorSigned = Boolean(pengadaan.vendorSignedAt);
    return {
      success: true,
      updated: false,
      externalId: job.externalId,
      status: "IN_PROGRESS",
      message: isVendorSigned
        ? "Vendor sudah tanda tangan. Menunggu tanda tangan pihak TBIG."
        : "Dokumen masih dalam proses di penyedia tanda tangan (belum selesai).",
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
