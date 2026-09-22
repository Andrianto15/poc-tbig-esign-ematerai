import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { buildPengadaanStorageKey } from "@/lib/storage/types";
import { generateLembarPengesahan } from "@/lib/pdf/lembar-pengesahan";
import { LAYOUT } from "@/lib/pdf/signature-layout";
import { getESignProvider } from "@/lib/esign";
import {
  PengadaanStatus,
  FileKind,
  SignJobType,
  SignJobStatus,
} from "@/generated/prisma/enums";

export interface CreatePengadaanInput {
  namaPengadaan: string;
  alamat: string;
  harga: bigint;
  tanggalMulai: Date;
  tanggalSelesai: Date;
  noSuratPesanan: string;
  tanggalPenyelesaian: Date;
  vendorId: string;
  picNama: string;
  picJabatan: string;
  pdfBytes: Uint8Array;
  createdById: string;
}

export interface UpdatePengadaanInput {
  pengadaanId: string;
  namaPengadaan: string;
  alamat: string;
  harga: bigint;
  tanggalMulai: Date;
  tanggalSelesai: Date;
  noSuratPesanan: string;
  tanggalPenyelesaian: Date;
  vendorId: string;
  picNama: string;
  picJabatan: string;
  newPdfBytes?: Uint8Array;
  actorId: string;
}

/**
 * Validasi magic bytes PDF (%PDF -> 0x25 0x50 0x44 0x46)
 */
export function isValidPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function calculateSha256(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Transisi T1: Membuat Pengadaan baru berstatus DRAFT + simpan ORIGINAL & PREPARED
 */
export async function createDraftPengadaan(input: CreatePengadaanInput) {
  // 1. Validasi PDF
  if (!isValidPdf(input.pdfBytes)) {
    throw new Error("File dokumen harus berformat PDF yang valid.");
  }
  if (input.pdfBytes.byteLength > 10 * 1024 * 1024) {
    throw new Error("Ukuran dokumen PDF maksimal 10 MB.");
  }

  // 2. Cek keunikan No. Surat Pesanan
  const existingSP = await prisma.pengadaan.findUnique({
    where: { noSuratPesanan: input.noSuratPesanan },
  });
  if (existingSP) {
    throw new Error(`No. Surat Pesanan '${input.noSuratPesanan}' sudah digunakan.`);
  }

  // 3. Ambil data vendor
  const vendor = await prisma.vendor.findUnique({
    where: { id: input.vendorId },
  });
  if (!vendor) {
    throw new Error("Vendor yang dipilih tidak valid.");
  }

  const storage = getStorage();

  // 4. Generate ID pengadaan awal untuk key storage
  const pengadaanId = crypto.randomUUID();

  // 5. Simpan ORIGINAL
  const originalKey = buildPengadaanStorageKey(pengadaanId, "ORIGINAL");
  await storage.put(originalKey, input.pdfBytes, "application/pdf");
  const originalSha256 = calculateSha256(input.pdfBytes);

  // 6. Generate PREPARED (ORIGINAL + Lembar Pengesahan)
  const preparedBytes = await generateLembarPengesahan(input.pdfBytes, {
    id: pengadaanId,
    namaPengadaan: input.namaPengadaan,
    alamat: input.alamat,
    harga: input.harga,
    tanggalMulai: input.tanggalMulai,
    tanggalSelesai: input.tanggalSelesai,
    noSuratPesanan: input.noSuratPesanan,
    tanggalPenyelesaian: input.tanggalPenyelesaian,
    vendorNama: vendor.nama,
    picNama: input.picNama,
    picJabatan: input.picJabatan,
    createdAt: new Date(),
  });

  const preparedKey = buildPengadaanStorageKey(pengadaanId, "PREPARED");
  await storage.put(preparedKey, preparedBytes, "application/pdf");
  const preparedSha256 = calculateSha256(preparedBytes);

  // 7. Simpan Pengadaan dan DocumentFiles (atomic nested create)
  const pengadaan = await prisma.pengadaan.create({
    data: {
      id: pengadaanId,
      namaPengadaan: input.namaPengadaan,
      alamat: input.alamat,
      harga: input.harga,
      tanggalMulai: input.tanggalMulai,
      tanggalSelesai: input.tanggalSelesai,
      noSuratPesanan: input.noSuratPesanan,
      tanggalPenyelesaian: input.tanggalPenyelesaian,
      vendorId: input.vendorId,
      picNama: input.picNama,
      picJabatan: input.picJabatan,
      status: PengadaanStatus.DRAFT,
      createdById: input.createdById,
      files: {
        create: [
          {
            kind: FileKind.ORIGINAL,
            storageKey: originalKey,
            sizeBytes: input.pdfBytes.byteLength,
            sha256: originalSha256,
          },
          {
            kind: FileKind.PREPARED,
            storageKey: preparedKey,
            sizeBytes: preparedBytes.byteLength,
            sha256: preparedSha256,
          },
        ],
      },
      logs: {
        create: {
          actorId: input.createdById,
          action: "DRAFT_CREATED",
          note: "Pengadaan dibuat sebagai Draft dengan dokumen Lembar Pengesahan.",
        },
      },
    },
    include: {
      vendor: true,
      files: true,
      logs: true,
    },
  });

  return pengadaan;
}

/**
 * Transisi T2: Mengedit pengadaan berstatus DRAFT (regenerate PREPARED jika berubah)
 */
export async function updateDraftPengadaan(input: UpdatePengadaanInput) {
  const existing = await prisma.pengadaan.findUnique({
    where: { id: input.pengadaanId },
    include: { files: true },
  });

  if (!existing) {
    throw new Error("Pengadaan tidak ditemukan.");
  }

  if (existing.status !== PengadaanStatus.DRAFT) {
    throw new Error("Hanya pengadaan berstatus DRAFT yang dapat diedit.");
  }

  // Cek keunikan No. Surat Pesanan jika diubah
  if (input.noSuratPesanan !== existing.noSuratPesanan) {
    const duplicateSP = await prisma.pengadaan.findUnique({
      where: { noSuratPesanan: input.noSuratPesanan },
    });
    if (duplicateSP) {
      throw new Error(`No. Surat Pesanan '${input.noSuratPesanan}' sudah digunakan.`);
    }
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: input.vendorId },
  });
  if (!vendor) {
    throw new Error("Vendor yang dipilih tidak valid.");
  }

  const storage = getStorage();
  let basePdfBytes: Uint8Array;
  let newOriginalSaved = false;
  let originalKey = "";
  let originalSha256 = "";
  let originalSizeBytes = 0;

  if (input.newPdfBytes) {
    if (!isValidPdf(input.newPdfBytes)) {
      throw new Error("File dokumen harus berformat PDF yang valid.");
    }
    if (input.newPdfBytes.byteLength > 10 * 1024 * 1024) {
      throw new Error("Ukuran dokumen PDF maksimal 10 MB.");
    }
    basePdfBytes = input.newPdfBytes;
    originalKey = buildPengadaanStorageKey(input.pengadaanId, "ORIGINAL");
    await storage.put(originalKey, basePdfBytes, "application/pdf");
    originalSha256 = calculateSha256(basePdfBytes);
    originalSizeBytes = basePdfBytes.byteLength;
    newOriginalSaved = true;
  } else {
    // Ambil file ORIGINAL yang tersimpan sebelumnya
    const origFile = existing.files.find((f) => f.kind === FileKind.ORIGINAL);
    if (!origFile) {
      throw new Error("File ORIGINAL tidak ditemukan pada pengadaan.");
    }
    const downloaded = await storage.get(origFile.storageKey);
    if (!downloaded) {
      throw new Error("File ORIGINAL tidak dapat dibaca dari storage.");
    }
    basePdfBytes = downloaded;
  }

  // Regenerate PREPARED dengan data pengadaan terbaru
  const preparedBytes = await generateLembarPengesahan(basePdfBytes, {
    id: input.pengadaanId,
    namaPengadaan: input.namaPengadaan,
    alamat: input.alamat,
    harga: input.harga,
    tanggalMulai: input.tanggalMulai,
    tanggalSelesai: input.tanggalSelesai,
    noSuratPesanan: input.noSuratPesanan,
    tanggalPenyelesaian: input.tanggalPenyelesaian,
    vendorNama: vendor.nama,
    picNama: input.picNama,
    picJabatan: input.picJabatan,
    createdAt: existing.createdAt,
  });

  const preparedKey = buildPengadaanStorageKey(input.pengadaanId, "PREPARED");
  await storage.put(preparedKey, preparedBytes, "application/pdf");
  const preparedSha256 = calculateSha256(preparedBytes);
  const preparedSizeBytes = preparedBytes.byteLength;

  // Jalankan update pengadaan dengan optimistic concurrency check status DRAFT
  const updateResult = await prisma.pengadaan.updateMany({
    where: {
      id: input.pengadaanId,
      status: PengadaanStatus.DRAFT,
    },
    data: {
      namaPengadaan: input.namaPengadaan,
      alamat: input.alamat,
      harga: input.harga,
      tanggalMulai: input.tanggalMulai,
      tanggalSelesai: input.tanggalSelesai,
      noSuratPesanan: input.noSuratPesanan,
      tanggalPenyelesaian: input.tanggalPenyelesaian,
      vendorId: input.vendorId,
      picNama: input.picNama,
      picJabatan: input.picJabatan,
    },
  });

  if (updateResult.count === 0) {
    throw new Error("Gagal memperbarui: Status pengadaan telah berubah.");
  }

  // Update PREPARED file record
  await prisma.documentFile.upsert({
    where: {
      pengadaanId_kind: {
        pengadaanId: input.pengadaanId,
        kind: FileKind.PREPARED,
      },
    },
    update: {
      storageKey: preparedKey,
      sizeBytes: preparedSizeBytes,
      sha256: preparedSha256,
    },
    create: {
      pengadaanId: input.pengadaanId,
      kind: FileKind.PREPARED,
      storageKey: preparedKey,
      sizeBytes: preparedSizeBytes,
      sha256: preparedSha256,
    },
  });

  // Update ORIGINAL file record jika ada PDF baru
  if (newOriginalSaved) {
    await prisma.documentFile.upsert({
      where: {
        pengadaanId_kind: {
          pengadaanId: input.pengadaanId,
          kind: FileKind.ORIGINAL,
        },
      },
      update: {
        storageKey: originalKey,
        sizeBytes: originalSizeBytes,
        sha256: originalSha256,
      },
      create: {
        pengadaanId: input.pengadaanId,
        kind: FileKind.ORIGINAL,
        storageKey: originalKey,
        sizeBytes: originalSizeBytes,
        sha256: originalSha256,
      },
    });
  }

  // Catat ActivityLog
  await prisma.activityLog.create({
    data: {
      pengadaanId: input.pengadaanId,
      actorId: input.actorId,
      action: "DRAFT_UPDATED",
      note: "Data pengadaan dan dokumen Lembar Pengesahan diperbarui.",
    },
  });

  return await prisma.pengadaan.findUnique({
    where: { id: input.pengadaanId },
  });
}

/**
 * Hapus draft pengadaan (hanya status DRAFT) beserta dokumennya
 */
export async function deleteDraftPengadaan(pengadaanId: string) {
  const existing = await prisma.pengadaan.findUnique({
    where: { id: pengadaanId },
    include: { files: true },
  });

  if (!existing) {
    throw new Error("Pengadaan tidak ditemukan.");
  }

  if (existing.status !== PengadaanStatus.DRAFT) {
    throw new Error("Hanya pengadaan berstatus DRAFT yang dapat dihapus.");
  }

  const storage = getStorage();

  // Hapus dari database (cascade DocumentFile, SignJob, ActivityLog)
  const deleted = await prisma.pengadaan.deleteMany({
    where: {
      id: pengadaanId,
      status: PengadaanStatus.DRAFT,
    },
  });

  if (deleted.count === 0) {
    throw new Error("Gagal menghapus: Status pengadaan telah berubah.");
  }

  // Hapus files dari storage
  for (const file of existing.files) {
    try {
      await storage.delete(file.storageKey);
    } catch (e) {
      console.warn(`Gagal menghapus file storage ${file.storageKey}:`, e);
    }
  }

  return { success: true };
}

/**
 * Transisi T3: TBIG mengajukan dokumen pengadaan ke Mitra/Vendor (DRAFT -> MENUNGGU_PERSETUJUAN_VENDOR)
 */
export async function submitPengadaanToVendor(
  pengadaanId: string,
  actorId: string
) {
  const pengadaan = await prisma.pengadaan.findUnique({
    where: { id: pengadaanId },
    include: { files: true },
  });

  if (!pengadaan) {
    throw new Error("Pengadaan tidak ditemukan.");
  }

  if (pengadaan.status !== PengadaanStatus.DRAFT) {
    throw new Error(
      `Pengadaan hanya dapat diajukan ke vendor saat status DRAFT (saat ini: ${pengadaan.status}).`
    );
  }

  const prepFile = pengadaan.files.find((f) => f.kind === FileKind.PREPARED);
  if (!prepFile) {
    throw new Error("Dokumen PREPARED (Lembar Pengesahan) belum tersedia.");
  }

  // Optimistic update status pengadaan DRAFT -> MENUNGGU_PERSETUJUAN_VENDOR
  const updated = await prisma.pengadaan.updateMany({
    where: {
      id: pengadaanId,
      status: PengadaanStatus.DRAFT,
    },
    data: {
      status: PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR,
    },
  });

  if (updated.count === 0) {
    throw new Error("Gagal mengajukan pengadaan: Status pengadaan telah berubah.");
  }

  // Catat ActivityLog
  await prisma.activityLog.create({
    data: {
      pengadaanId,
      actorId,
      action: "PENGADAAN_SUBMITTED_TO_VENDOR",
      note: "Dokumen pengadaan diajukan ke pihak Mitra/Vendor untuk ditinjau.",
    },
  });

  return await prisma.pengadaan.findUnique({
    where: { id: pengadaanId },
    include: { vendor: true, files: true, logs: true },
  });
}

export interface SubmitVendorApprovalInput {
  pengadaanId: string;
  vendorId: string;
  actorId: string;
}

/**
 * Transisi T6: Vendor menyetujui pengadaan (MENUNGGU_PERSETUJUAN_VENDOR -> MENUNGGU_TTD_VENDOR)
 * Pada Arsitektur 2 (Single Multi-Signer Envelope):
 * Mengirim dokumen PREPARED ke provider requestSign dengan Multi-Signer:
 * - TBIG: auto-sign
 * - Vendor: tanda tangan OTP & eMeterai (beban Vendor)
 * Juga menangani retry jika job SIGN_VENDOR sebelumnya FAILED pada status MENUNGGU_TTD_VENDOR.
 */
export async function submitVendorApproval(input: SubmitVendorApprovalInput) {
  const pengadaan = await prisma.pengadaan.findUnique({
    where: { id: input.pengadaanId },
    include: {
      vendor: { include: { users: true } },
      files: true,
      jobs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!pengadaan) {
    throw new Error("Pengadaan tidak ditemukan.");
  }

  if (pengadaan.vendorId !== input.vendorId) {
    throw new Error("Pengadaan ini bukan milik vendor Anda.");
  }

  const isInitialApproval =
    pengadaan.status === PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR;
  const isRetrySign =
    pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR &&
    pengadaan.jobs[0]?.type === SignJobType.SIGN_VENDOR &&
    pengadaan.jobs[0]?.status === SignJobStatus.FAILED;

  if (!isInitialApproval && !isRetrySign) {
    throw new Error(
      `Persetujuan vendor hanya dapat diajukan saat status MENUNGGU_PERSETUJUAN_VENDOR atau saat job tanda tangan gagal (saat ini: ${pengadaan.status}).`
    );
  }

  const prepFile = pengadaan.files.find(
    (f) => f.kind === FileKind.PREPARED
  );
  if (!prepFile) {
    throw new Error("Dokumen PREPARED (Lembar Pengesahan) tidak ditemukan.");
  }

  const storage = getStorage();
  const pdfBytes = await storage.get(prepFile.storageKey);
  if (!pdfBytes) {
    throw new Error("Gagal mengunduh dokumen PREPARED dari storage.");
  }

  const doc = await PDFDocument.load(pdfBytes);
  const targetPage = doc.getPageCount();

  const provider = getESignProvider();
  const jobId = crypto.randomUUID();
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const token = process.env.ESIGN_WEBHOOK_TOKEN || "";
  const callbackUrl = `${baseUrl}/api/webhooks/esign?token=${token}`;
  const returnUrl = `${baseUrl}/vendor/pengadaan/${pengadaan.id}`;

  const vendorUser = pengadaan.vendor.users[0];
  const signerEmail = vendorUser?.email || "vendor@poc.local";

  // 1. Panggil provider requestSign (Single Multi-Signer Envelope)
  let result;
  try {
    result = await provider.requestSign({
      jobId,
      pdf: pdfBytes,
      filename: `pengadaan-${pengadaan.noSuratPesanan}-final.pdf`,
      signer: {
        name: pengadaan.picNama,
        email: signerEmail,
      },
      page: targetPage,
      box: LAYOUT.vendorSignature,
      callbackUrl,
      returnUrl,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.signJob.create({
      data: {
        id: jobId,
        pengadaanId: input.pengadaanId,
        type: SignJobType.SIGN_VENDOR,
        status: SignJobStatus.FAILED,
        provider: provider.name,
        inputFileKind: FileKind.PREPARED,
        outputFileKind: FileKind.FINAL,
        errorMessage: errorMsg,
      },
    });
    throw err;
  }

  // 2. Transisi status pengadaan jika persetujuan awal
  if (isInitialApproval) {
    const updated = await prisma.pengadaan.updateMany({
      where: {
        id: input.pengadaanId,
        vendorId: input.vendorId,
        status: PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR,
      },
      data: {
        status: PengadaanStatus.MENUNGGU_TTD_VENDOR,
        vendorRespondedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new Error("Gagal menyetujui pengadaan: Status pengadaan telah berubah.");
    }
  }

  // 3. Simpan SignJob baru status WAITING_SIGNER
  const job = await prisma.signJob.create({
    data: {
      id: jobId,
      pengadaanId: input.pengadaanId,
      type: SignJobType.SIGN_VENDOR,
      status: SignJobStatus.WAITING_SIGNER,
      provider: provider.name,
      externalId: result.externalId,
      signerId: result.signerId,
      signUrl: result.signUrl,
      inputFileKind: FileKind.PREPARED,
      outputFileKind: FileKind.FINAL,
    },
  });

  // 4. Catat ActivityLog
  await prisma.activityLog.create({
    data: {
      pengadaanId: input.pengadaanId,
      actorId: input.actorId,
      action: isRetrySign ? "VENDOR_SIGN_RETRY" : "VENDOR_APPROVED",
      note: isRetrySign
        ? "Pengajuan ulang permintaan tanda tangan vendor dan pembubuhan eMeterai setelah kegagalan."
        : "Pengadaan disetujui oleh Vendor. Memulai proses tanda tangan dan pembubuhan eMeterai (beban Vendor).",
    },
  });

  return {
    pengadaanId: input.pengadaanId,
    jobId: job.id,
    externalId: result.externalId,
    signUrl: result.signUrl,
  };
}

/**
 * Pengajuan ulang tanda tangan vendor (retry SIGN_VENDOR) jika sebelumnya gagal.
 */
export async function retryVendorSign(input: SubmitVendorApprovalInput) {
  const pengadaan = await prisma.pengadaan.findUnique({
    where: { id: input.pengadaanId },
    include: {
      vendor: { include: { users: true } },
      files: true,
      jobs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!pengadaan) {
    throw new Error("Pengadaan tidak ditemukan.");
  }

  if (pengadaan.vendorId !== input.vendorId) {
    throw new Error("Pengadaan ini bukan milik vendor Anda.");
  }

  const latestJob = pengadaan.jobs[0];
  if (
    pengadaan.status !== PengadaanStatus.MENUNGGU_TTD_VENDOR ||
    latestJob?.type !== SignJobType.SIGN_VENDOR ||
    latestJob?.status !== SignJobStatus.FAILED
  ) {
    throw new Error(
      "Retry tanda tangan vendor hanya dapat dilakukan saat status MENUNGGU_TTD_VENDOR dan job SIGN_VENDOR gagal."
    );
  }

  const prepFile = pengadaan.files.find(
    (f) => f.kind === FileKind.PREPARED
  );
  if (!prepFile) {
    throw new Error("Dokumen PREPARED (Lembar Pengesahan) tidak ditemukan.");
  }

  const storage = getStorage();
  const prepBytes = await storage.get(prepFile.storageKey);
  if (!prepBytes) {
    throw new Error("Gagal mengunduh dokumen PREPARED dari storage.");
  }

  const doc = await PDFDocument.load(prepBytes);
  const targetPage = doc.getPageCount();

  const provider = getESignProvider();
  const nextJobId = crypto.randomUUID();
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const token = process.env.ESIGN_WEBHOOK_TOKEN || "";
  const callbackUrl = `${baseUrl}/api/webhooks/esign?token=${token}`;
  const returnUrl = `${baseUrl}/vendor/pengadaan/${pengadaan.id}`;

  const vendorUser = pengadaan.vendor.users[0];
  const signerEmail = vendorUser?.email || "vendor@poc.local";

  const requestResult = await provider.requestSign({
    jobId: nextJobId,
    pdf: prepBytes,
    filename: `pengadaan-${pengadaan.noSuratPesanan}-final.pdf`,
    signer: {
      name: pengadaan.picNama,
      email: signerEmail,
    },
    page: targetPage,
    box: LAYOUT.vendorSignature,
    callbackUrl,
    returnUrl,
  });

  const job = await prisma.signJob.create({
    data: {
      id: nextJobId,
      pengadaanId: pengadaan.id,
      type: SignJobType.SIGN_VENDOR,
      status: SignJobStatus.WAITING_SIGNER,
      provider: provider.name,
      externalId: requestResult.externalId,
      signerId: requestResult.signerId,
      signUrl: requestResult.signUrl,
      inputFileKind: FileKind.PREPARED,
      outputFileKind: FileKind.FINAL,
    },
  });

  await prisma.activityLog.create({
    data: {
      pengadaanId: pengadaan.id,
      actorId: input.actorId,
      action: "VENDOR_SIGN_RETRY",
      note: "Pengajuan ulang permintaan tanda tangan vendor dan eMeterai setelah kegagalan.",
    },
  });

  return {
    pengadaanId: pengadaan.id,
    jobId: job.id,
    externalId: requestResult.externalId,
    signUrl: requestResult.signUrl,
  };
}

/**
 * Transisi T6 (Legacy Fallback): Job STAMP_METERAI COMPLETED
 * Menyimpan STAMPED_METERAI dan mencatat log
 */
export async function completeMeteraiTransition(
  jobId: string,
  fileData: { storageKey: string; sizeBytes: number; sha256: string }
) {
  const job = await prisma.signJob.findUnique({
    where: { id: jobId },
    include: { pengadaan: { include: { vendor: { include: { users: true } } } } },
  });

  if (!job) {
    throw new Error(`SignJob '${jobId}' tidak ditemukan.`);
  }

  if (job.status === SignJobStatus.COMPLETED) {
    return job;
  }

  // 1. Update SignJob STAMP_METERAI
  const updatedJob = await prisma.signJob.update({
    where: { id: job.id },
    data: {
      status: SignJobStatus.COMPLETED,
      completedAt: new Date(),
    },
  });

  // 2. Update Pengadaan meteraiStampedAt
  await prisma.pengadaan.update({
    where: { id: job.pengadaanId },
    data: {
      meteraiStampedAt: new Date(),
    },
  });

  // 3. Upsert STAMPED_METERAI file record
  await prisma.documentFile.upsert({
    where: {
      pengadaanId_kind: {
        pengadaanId: job.pengadaanId,
        kind: FileKind.STAMPED_METERAI,
      },
    },
    update: {
      storageKey: fileData.storageKey,
      sizeBytes: fileData.sizeBytes,
      sha256: fileData.sha256,
    },
    create: {
      pengadaanId: job.pengadaanId,
      kind: FileKind.STAMPED_METERAI,
      storageKey: fileData.storageKey,
      sizeBytes: fileData.sizeBytes,
      sha256: fileData.sha256,
    },
  });

  // 4. Catat ActivityLog
  await prisma.activityLog.create({
    data: {
      pengadaanId: job.pengadaanId,
      actorId: null,
      action: "METERAI_STAMPED",
      note: "eMeterai berhasil dibubuhkan pada dokumen.",
    },
  });

  return updatedJob;
}


/**
 * Transisi T7: Job SIGN_VENDOR COMPLETED (MENUNGGU_TTD_VENDOR -> SELESAI)
 * Pada Arsitektur 2 (Single Multi-Signer Envelope):
 * Vendor ttd + eMeterai dan TBIG auto-sign selesai bersamaan dalam satu envelope.
 * Dokumen langsung berstatus FINAL dan status pengadaan maju ke SELESAI.
 */
export async function completeVendorSignTransition(
  jobId: string,
  fileData: { storageKey: string; sizeBytes: number; sha256: string }
) {
  const job = await prisma.signJob.findUnique({
    where: { id: jobId },
    include: { pengadaan: true },
  });

  if (!job) {
    throw new Error(`SignJob '${jobId}' tidak ditemukan.`);
  }

  if (job.status === SignJobStatus.COMPLETED) {
    return job;
  }

  const now = new Date();

  // Optimistic update status pengadaan langsung ke SELESAI
  const updated = await prisma.pengadaan.updateMany({
    where: {
      id: job.pengadaanId,
      status: PengadaanStatus.MENUNGGU_TTD_VENDOR,
    },
    data: {
      status: PengadaanStatus.SELESAI,
      vendorSignedAt: now,
      tbigSignedAt: now,
      meteraiStampedAt: now,
    },
  });

  if (updated.count === 0) {
    console.warn(
      `[completeVendorSignTransition] Status pengadaan '${job.pengadaanId}' bukan MENUNGGU_TTD_VENDOR.`
    );
  }

  // Update SignJob ke COMPLETED
  const updatedJob = await prisma.signJob.update({
    where: { id: job.id },
    data: {
      status: SignJobStatus.COMPLETED,
      completedAt: now,
    },
  });

  // Upsert DocumentFile SIGNED_VENDOR dan FINAL
  await prisma.documentFile.upsert({
    where: {
      pengadaanId_kind: {
        pengadaanId: job.pengadaanId,
        kind: FileKind.SIGNED_VENDOR,
      },
    },
    update: {
      storageKey: fileData.storageKey,
      sizeBytes: fileData.sizeBytes,
      sha256: fileData.sha256,
    },
    create: {
      pengadaanId: job.pengadaanId,
      kind: FileKind.SIGNED_VENDOR,
      storageKey: fileData.storageKey,
      sizeBytes: fileData.sizeBytes,
      sha256: fileData.sha256,
    },
  });

  await prisma.documentFile.upsert({
    where: {
      pengadaanId_kind: {
        pengadaanId: job.pengadaanId,
        kind: FileKind.FINAL,
      },
    },
    update: {
      storageKey: fileData.storageKey,
      sizeBytes: fileData.sizeBytes,
      sha256: fileData.sha256,
    },
    create: {
      pengadaanId: job.pengadaanId,
      kind: FileKind.FINAL,
      storageKey: fileData.storageKey,
      sizeBytes: fileData.sizeBytes,
      sha256: fileData.sha256,
    },
  });

  // Catat ActivityLog
  await prisma.activityLog.create({
    data: {
      pengadaanId: job.pengadaanId,
      actorId: null,
      action: "VENDOR_SIGNED",
      note: "Dokumen pengadaan selesai ditandatangani oleh Vendor dan TBIG (Auto Sign). eMeterai resmi berhasil dibubuhkan (kuota dibebankan ke akun Vendor). Alur pengadaan selesai.",
    },
  });

  return updatedJob;
}

/**
 * Transisi T8a: TBIG menandatangani pengadaan (MENUNGGU_TTD_TBIG -> AUTO_SIGN_TBIG)
 */
export async function submitTbigSign(
  pengadaanId: string,
  actorId: string | null
) {
  const pengadaan = await prisma.pengadaan.findUnique({
    where: { id: pengadaanId },
    include: {
      files: true,
      jobs: {
        where: { type: SignJobType.AUTO_SIGN_TBIG },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!pengadaan) {
    throw new Error("Pengadaan tidak ditemukan.");
  }

  const isWaitingTbig =
    pengadaan.status === PengadaanStatus.MENUNGGU_TTD_TBIG;
  const isRetry =
    isWaitingTbig && pengadaan.jobs[0]?.status === SignJobStatus.FAILED;

  if (!isWaitingTbig) {
    throw new Error(
      `Pengadaan hanya dapat ditandatangani TBIG saat status MENUNGGU_TTD_TBIG (saat ini: ${pengadaan.status}).`
    );
  }

  // Cari file SIGNED_VENDOR (atau fallback STAMPED_METERAI / PREPARED)
  const vendorFile =
    pengadaan.files.find((f) => f.kind === FileKind.SIGNED_VENDOR) ||
    pengadaan.files.find((f) => f.kind === FileKind.STAMPED_METERAI) ||
    pengadaan.files.find((f) => f.kind === FileKind.PREPARED);

  if (!vendorFile) {
    throw new Error("Dokumen dengan tanda tangan Vendor tidak ditemukan.");
  }

  const storage = getStorage();
  const pdfBytes = await storage.get(vendorFile.storageKey);
  if (!pdfBytes) {
    throw new Error("Gagal mengunduh dokumen bertanda tangan Vendor dari storage.");
  }

  const doc = await PDFDocument.load(pdfBytes);
  const targetPage = doc.getPageCount();

  const provider = getESignProvider();
  const jobId = crypto.randomUUID();
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const token = process.env.ESIGN_WEBHOOK_TOKEN || "";
  const callbackUrl = `${baseUrl}/api/webhooks/esign?token=${token}`;

  let result;
  try {
    result = await provider.autoSign({
      jobId,
      pdf: pdfBytes,
      filename: `pengadaan-${pengadaan.noSuratPesanan}-final.pdf`,
      page: targetPage,
      box: LAYOUT.tbigSignature,
      callbackUrl,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.signJob.create({
      data: {
        id: jobId,
        pengadaanId,
        type: SignJobType.AUTO_SIGN_TBIG,
        status: SignJobStatus.FAILED,
        provider: provider.name,
        inputFileKind: vendorFile.kind,
        outputFileKind: FileKind.FINAL,
        errorMessage: errorMsg,
      },
    });
    throw err;
  }

  const job = await prisma.signJob.create({
    data: {
      id: jobId,
      pengadaanId,
      type: SignJobType.AUTO_SIGN_TBIG,
      status: SignJobStatus.PENDING,
      provider: provider.name,
      externalId: result.externalId,
      inputFileKind: vendorFile.kind,
      outputFileKind: FileKind.FINAL,
    },
  });

  await prisma.activityLog.create({
    data: {
      pengadaanId,
      actorId,
      action: isRetry ? "TBIG_SIGN_RETRY" : "TBIG_SIGN_SUBMITTED",
      note: isRetry
        ? "Pengajuan ulang tanda tangan elektronik TBIG setelah kegagalan."
        : "Pengadaan diajukan untuk proses tanda tangan elektronik TBIG (Auto Sign).",
    },
  });

  return {
    pengadaanId,
    jobId: job.id,
    externalId: result.externalId,
  };
}

/**
 * Transisi T8b: Job AUTO_SIGN_TBIG COMPLETED (MENUNGGU_TTD_TBIG -> SELESAI)
 */
export async function completeTbigSignTransition(
  jobId: string,
  fileData: { storageKey: string; sizeBytes: number; sha256: string }
) {
  const job = await prisma.signJob.findUnique({
    where: { id: jobId },
    include: { pengadaan: true },
  });

  if (!job) {
    throw new Error(`SignJob '${jobId}' tidak ditemukan.`);
  }

  if (job.status === SignJobStatus.COMPLETED) {
    return job;
  }

  // Optimistic update status pengadaan ke SELESAI
  const updated = await prisma.pengadaan.updateMany({
    where: {
      id: job.pengadaanId,
      status: PengadaanStatus.MENUNGGU_TTD_TBIG,
    },
    data: {
      status: PengadaanStatus.SELESAI,
      tbigSignedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    console.warn(
      `[completeTbigSignTransition] Status pengadaan '${job.pengadaanId}' bukan MENUNGGU_TTD_TBIG.`
    );
  }

  // Update SignJob ke COMPLETED
  const updatedJob = await prisma.signJob.update({
    where: { id: job.id },
    data: {
      status: SignJobStatus.COMPLETED,
      completedAt: new Date(),
    },
  });

  // Upsert DocumentFile FINAL
  await prisma.documentFile.upsert({
    where: {
      pengadaanId_kind: {
        pengadaanId: job.pengadaanId,
        kind: FileKind.FINAL,
      },
    },
    update: {
      storageKey: fileData.storageKey,
      sizeBytes: fileData.sizeBytes,
      sha256: fileData.sha256,
    },
    create: {
      pengadaanId: job.pengadaanId,
      kind: FileKind.FINAL,
      storageKey: fileData.storageKey,
      sizeBytes: fileData.sizeBytes,
      sha256: fileData.sha256,
    },
  });

  // Catat ActivityLog
  await prisma.activityLog.create({
    data: {
      pengadaanId: job.pengadaanId,
      actorId: null,
      action: "TBIG_SIGNED",
      note: "Dokumen berhasil ditandatangani oleh TBIG (Auto Sign). Alur pengadaan selesai.",
    },
  });

  return updatedJob;
}

export interface RejectPengadaanInput {
  pengadaanId: string;
  vendorId: string;
  actorId: string;
  alasanPenolakan: string;
}

/**
 * Transisi T5: Vendor menolak pengadaan (MENUNGGU_PERSETUJUAN_VENDOR -> DITOLAK)
 */
export async function rejectPengadaanByVendor(input: RejectPengadaanInput) {
  const trimmedReason = input.alasanPenolakan.trim();
  if (trimmedReason.length < 10) {
    throw new Error("Alasan penolakan minimal 10 karakter.");
  }

  const pengadaan = await prisma.pengadaan.findUnique({
    where: { id: input.pengadaanId },
  });

  if (!pengadaan) {
    throw new Error("Pengadaan tidak ditemukan.");
  }

  if (pengadaan.vendorId !== input.vendorId) {
    throw new Error("Pengadaan ini bukan milik vendor Anda.");
  }

  if (pengadaan.status !== PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR) {
    throw new Error(
      `Pengadaan hanya dapat ditolak saat status MENUNGGU_PERSETUJUAN_VENDOR (saat ini: ${pengadaan.status}).`
    );
  }

  // Optimistic update status pengadaan ke DITOLAK
  const updated = await prisma.pengadaan.updateMany({
    where: {
      id: input.pengadaanId,
      vendorId: input.vendorId,
      status: PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR,
    },
    data: {
      status: PengadaanStatus.DITOLAK,
      alasanPenolakan: trimmedReason,
      vendorRespondedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    throw new Error("Gagal menolak pengadaan: Status pengadaan telah berubah.");
  }

  // Catat ActivityLog
  await prisma.activityLog.create({
    data: {
      pengadaanId: input.pengadaanId,
      actorId: input.actorId,
      action: "VENDOR_REJECTED",
      note: `Pengadaan ditolak oleh vendor. Alasan: "${trimmedReason}"`,
    },
  });

  return await prisma.pengadaan.findUnique({
    where: { id: input.pengadaanId },
  });
}

