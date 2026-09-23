import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { buildPengadaanStorageKey } from "@/lib/storage/types";
import { getESignProvider } from "@/lib/esign";
import { ESignEvent } from "@/lib/esign/types";
import { PengadaanStatus, SignJobStatus, SignJobType } from "@/generated/prisma/enums";
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

  // 2. Jika job sudah COMPLETED dan pengadaan sudah SELESAI, atau FAILED, abaikan (idempoten)
  if (
    (job.status === SignJobStatus.COMPLETED &&
      job.pengadaan.status === PengadaanStatus.SELESAI) ||
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

  // 3b. Jika event bertipe IN_PROGRESS: periksa progres tanda tangan tiap pihak
  if (event.type === "IN_PROGRESS") {
    const rawObj = event.raw as Record<string, unknown> | undefined;
    const dataObj = rawObj?.data as Record<string, unknown> | undefined;
    const attrsObj =
      (dataObj?.attributes as Record<string, unknown> | undefined) ||
      (rawObj?.attributes as Record<string, unknown> | undefined);

    const signers = (attrsObj?.signers as Array<{
      email?: string;
      status?: string;
      signed_at?: string | null;
    }>) || [];

    const tbigEmail = (
      process.env.MEKARI_TBIG_SIGNER_EMAIL || "devtujuhsembilan@gmail.com"
    ).toLowerCase();

    const tbigSigner = signers.find(
      (s) => s.email?.toLowerCase() === tbigEmail
    );
    const vendorSigner = signers.find(
      (s) => s.email?.toLowerCase() !== tbigEmail
    );

    const vendorDone =
      vendorSigner?.status === "completed" || Boolean(vendorSigner?.signed_at);
    const tbigDone =
      tbigSigner?.status === "completed" || Boolean(tbigSigner?.signed_at);

    // Jika KEDUA pihak telah selesai tanda tangan:
    if (vendorDone && tbigDone) {
      const stampingStatus = (
        (attrsObj?.stamping_status as string) || ""
      ).toLowerCase();
      const hasMeterai = Boolean(
        attrsObj?.type_of_meterai ||
        (stampingStatus && !["none", "not_stamped"].includes(stampingStatus))
      );
      const isStampingDone =
        stampingStatus === "success" || stampingStatus === "stamped";

      if (!hasMeterai || isStampingDone) {
        event = {
          ...event,
          type: "COMPLETED",
        };
      } else {
        // Tanda tangan lengkap, tetapi e-Meterai masih diproses oleh Mekari/Peruri
        const tbigSignedAt = tbigSigner?.signed_at
          ? new Date(tbigSigner.signed_at)
          : new Date();
        const vendorSignedAt = vendorSigner?.signed_at
          ? new Date(vendorSigner.signed_at)
          : new Date();

        if (!job.pengadaan.tbigSignedAt || !job.pengadaan.vendorSignedAt) {
          await prisma.pengadaan.update({
            where: { id: job.pengadaanId },
            data: {
              tbigSignedAt: job.pengadaan.tbigSignedAt || tbigSignedAt,
              vendorSignedAt: job.pengadaan.vendorSignedAt || vendorSignedAt,
            },
          });
        }

        return { success: true, reason: "WAITING_EMETERAI_STAMP" };
      }
    } else if (vendorDone) {
      const vendorSignedAt = vendorSigner?.signed_at
        ? new Date(vendorSigner.signed_at)
        : new Date();

      const needsVendorUpdate = !job.pengadaan.vendorSignedAt;
      const needsStatusUpdate =
        job.pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR;

      if (needsVendorUpdate || needsStatusUpdate) {
        await prisma.$transaction(async (tx) => {
          await tx.pengadaan.update({
            where: { id: job.pengadaanId },
            data: {
              vendorSignedAt: job.pengadaan.vendorSignedAt || vendorSignedAt,
              status: PengadaanStatus.MENUNGGU_TTD_TBIG,
            },
          });

          await tx.activityLog.create({
            data: {
              pengadaanId: job.pengadaanId,
              actorId: null,
              action: "VENDOR_SIGNED",
              note: "Vendor telah menandatangani dokumen dan memvalidasi OTP di Mekari Sign. Menunggu tanda tangan TBIG.",
            },
          });
        });

        return { success: true, reason: "VENDOR_SIGNED_WAITING_TBIG" };
      }

      return { success: true, reason: "IN_PROGRESS" };
    } else if (tbigDone) {
      const tbigSignedAt = tbigSigner?.signed_at
        ? new Date(tbigSigner.signed_at)
        : new Date();

      if (!job.pengadaan.tbigSignedAt) {
        await prisma.$transaction(async (tx) => {
          await tx.pengadaan.update({
            where: { id: job.pengadaanId },
            data: {
              tbigSignedAt,
            },
          });

          await tx.activityLog.create({
            data: {
              pengadaanId: job.pengadaanId,
              actorId: null,
              action: "TBIG_SIGNED",
              note: "TBIG telah menandatangani dokumen di Mekari Sign. Menunggu tanda tangan Vendor.",
            },
          });
        });

        return { success: true, reason: "TBIG_SIGNED_WAITING_VENDOR" };
      }

      return { success: true, reason: "IN_PROGRESS" };
    } else {
      return { success: true, reason: "IN_PROGRESS" };
    }
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
