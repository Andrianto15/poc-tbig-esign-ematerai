import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { buildPengadaanStorageKey } from "@/lib/storage/types";
import { generateLembarPengesahan } from "@/lib/pdf/lembar-pengesahan";
import { PengadaanStatus, FileKind } from "@/generated/prisma/enums";

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
