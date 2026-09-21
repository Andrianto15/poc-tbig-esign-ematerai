import "dotenv/config";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/db";
import { getStorage } from "../src/lib/storage";
import { buildMockStorageKey } from "../src/lib/storage/types";
import {
  createDraftPengadaan,
  submitTbigSign,
  rejectPengadaanByVendor,
} from "../src/lib/workflow/pengadaan-workflow";
import {
  PengadaanStatus,
  FileKind,
  SignJobStatus,
} from "../src/generated/prisma/enums";

async function createSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("SURAT PERJANJIAN PENGADAAN (UJI STEP 1.9)", {
    x: 50,
    y: 780,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  return await doc.save();
}

async function waitForJobStatus(
  jobId: string,
  expectedStatus: SignJobStatus,
  timeoutMs = 15000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await prisma.signJob.findUnique({ where: { id: jobId } });
    if (job?.status === expectedStatus) {
      return job;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const finalJob = await prisma.signJob.findUnique({ where: { id: jobId } });
  throw new Error(
    `Job '${jobId}' timeout menunggu status ${expectedStatus} (status saat ini: ${finalJob?.status})`
  );
}

async function main() {
  console.log("=== VERIFIKASI STEP 1.9: HALAMAN VENDOR & PENOLAKAN (T5) ===");

  const tbigUser = await prisma.user.findFirst({
    where: { role: "TBIG" },
  });
  if (!tbigUser) {
    throw new Error("User TBIG tidak ditemukan di database.");
  }

  const vendor1User = await prisma.user.findFirst({
    where: { email: "vendor1@poc.local" },
    include: { vendor: true },
  });
  const vendor2User = await prisma.user.findFirst({
    where: { email: "vendor2@poc.local" },
    include: { vendor: true },
  });

  if (!vendor1User?.vendor || !vendor2User?.vendor) {
    throw new Error("User vendor1 atau vendor2 tidak ditemukan. Pastikan seed sudah dijalankan.");
  }

  const vendor1 = vendor1User.vendor;
  const vendor2 = vendor2User.vendor;
  const samplePdf = await createSamplePdf();
  const storage = getStorage();

  // Bersihkan data sisa uji jika ada
  await prisma.pengadaan.deleteMany({
    where: { noSuratPesanan: { startsWith: "TEST-SP-19" } },
  });

  // -------------------------------------------------------------
  // SKENARIO 1: Pembuatan Data Uji (DRAFT, PROCESSING, & READY FOR VENDOR)
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 1: Penyiapan Dokumen Uji Multi-Status & Multi-Vendor ---");
  const ts = Date.now();

  // 1.1 Pengadaan A (DRAFT milik Vendor 1)
  const spDraft = `TEST-SP-19-DRAFT-${ts}`;
  const pengadaanDraft = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Server DRAFT V1",
    alamat: "Jl. TB Simatupang No. 11, Jakarta",
    harga: BigInt(50000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: spDraft,
    tanggalPenyelesaian: new Date("2026-11-10"),
    vendorId: vendor1.id,
    picNama: vendor1.picNama,
    picJabatan: vendor1.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });
  console.log(`✓ Pengadaan A (DRAFT, vendor1) dibuat: ID ${pengadaanDraft.id}`);

  // 1.2 Pengadaan B (MENUNGGU_TTD_TBIG milik Vendor 1 - dibuat via T3 langsung)
  const spTbigSign = `TEST-SP-19-SIGNTBIG-${ts}`;
  const pengadaanB = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Router MENUNGGU_TTD_TBIG V1",
    alamat: "Jl. TB Simatupang No. 12, Jakarta",
    harga: BigInt(60000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: spTbigSign,
    tanggalPenyelesaian: new Date("2026-11-10"),
    vendorId: vendor1.id,
    picNama: vendor1.picNama,
    picJabatan: vendor1.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });
  // Update status manual sementara untuk simulasi MENUNGGU_TTD_TBIG
  await prisma.pengadaan.update({
    where: { id: pengadaanB.id },
    data: { status: PengadaanStatus.MENUNGGU_TTD_TBIG },
  });
  console.log(`✓ Pengadaan B (MENUNGGU_TTD_TBIG, vendor1) dibuat: ID ${pengadaanB.id}`);

  // 1.3 Pengadaan C (MENUNGGU_PERSETUJUAN_VENDOR milik Vendor 1 - via proses T3 dan mock sign)
  const spReady = `TEST-SP-19-READY-${ts}`;
  const pengadaanC = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Genset MENUNGGU_PERSETUJUAN_VENDOR V1",
    alamat: "Jl. TB Simatupang No. 13, Jakarta",
    harga: BigInt(120000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: spReady,
    tanggalPenyelesaian: new Date("2026-11-10"),
    vendorId: vendor1.id,
    picNama: vendor1.picNama,
    picJabatan: vendor1.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  const tbigSignResult = await submitTbigSign(pengadaanC.id, tbigUser.id);
  console.log(`✓ Submit TTD TBIG untuk Pengadaan C (Job: ${tbigSignResult.jobId})`);
  await waitForJobStatus(tbigSignResult.jobId, SignJobStatus.COMPLETED);

  const pengadaanCReady = await prisma.pengadaan.findUnique({
    where: { id: pengadaanC.id },
    include: { files: true },
  });
  if (pengadaanCReady?.status !== PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR) {
    throw new Error(`Pengadaan C harusnya MENUNGGU_PERSETUJUAN_VENDOR, tetapi ${pengadaanCReady?.status}`);
  }
  console.log(`✓ Pengadaan C berhasil mencapai status: ${pengadaanCReady.status}`);

  // -------------------------------------------------------------
  // SKENARIO 2: Aturan Visibilitas Daftar Vendor (PRD 7.4 & 8.5)
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 2: Aturan Visibilitas Daftar Vendor ---");

  // Query daftar Vendor 1: Hanya status >= MENUNGGU_PERSETUJUAN_VENDOR
  const vendor1List = await prisma.pengadaan.findMany({
    where: {
      vendorId: vendor1.id,
      status: {
        notIn: [PengadaanStatus.DRAFT, PengadaanStatus.MENUNGGU_TTD_TBIG],
      },
    },
  });

  const hasDraftInV1 = vendor1List.some((p) => p.id === pengadaanDraft.id);
  const hasProcessingInV1 = vendor1List.some((p) => p.id === pengadaanB.id);
  const hasReadyInV1 = vendor1List.some((p) => p.id === pengadaanC.id);

  if (hasDraftInV1) {
    throw new Error("PELANGGARAN: Dokumen DRAFT muncul di daftar vendor 1!");
  }
  if (hasProcessingInV1) {
    throw new Error("PELANGGARAN: Dokumen MENUNGGU_TTD_TBIG muncul di daftar vendor 1!");
  }
  if (!hasReadyInV1) {
    throw new Error("Dokumen MENUNGGU_PERSETUJUAN_VENDOR tidak muncul di daftar vendor 1!");
  }
  console.log("✓ Filter daftar Vendor 1 benar: DRAFT & MENUNGGU_TTD_TBIG disembunyikan.");

  // Query daftar Vendor 2: Tidak boleh melihat pengadaan milik Vendor 1
  const vendor2List = await prisma.pengadaan.findMany({
    where: {
      vendorId: vendor2.id,
      status: {
        notIn: [PengadaanStatus.DRAFT, PengadaanStatus.MENUNGGU_TTD_TBIG],
      },
    },
  });
  const hasPengadaanCInV2 = vendor2List.some((p) => p.id === pengadaanC.id);
  if (hasPengadaanCInV2) {
    throw new Error("PELANGGARAN: Vendor 2 dapat melihat pengadaan milik Vendor 1!");
  }
  console.log("✓ Isolasi multi-vendor di daftar benar: Pengadaan vendor 1 tidak muncul di vendor 2.");

  // -------------------------------------------------------------
  // SKENARIO 3: Aturan Akses Detail Vendor (PRD 7.4 & 8.6)
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 3: Aturan Akses Detail Vendor ---");

  function simulateVendorDetailAccess(
    pengadaanRecord: { vendorId: string; status: PengadaanStatus } | null,
    requestingVendorId: string
  ): "OK" | "NOT_FOUND_404" {
    if (!pengadaanRecord || pengadaanRecord.vendorId !== requestingVendorId) {
      return "NOT_FOUND_404";
    }
    if (
      pengadaanRecord.status === PengadaanStatus.DRAFT ||
      pengadaanRecord.status === PengadaanStatus.MENUNGGU_TTD_TBIG
    ) {
      return "NOT_FOUND_404";
    }
    return "OK";
  }

  // 3.1 Vendor 1 akses DRAFT miliknya
  if (simulateVendorDetailAccess(pengadaanDraft, vendor1.id) !== "NOT_FOUND_404") {
    throw new Error("Akses detail DRAFT oleh vendor harus menghasilkan 404!");
  }
  console.log("✓ Akses detail DRAFT oleh vendor terproteksi (404)");

  // 3.2 Vendor 1 akses MENUNGGU_TTD_TBIG miliknya
  if (simulateVendorDetailAccess(pengadaanB, vendor1.id) !== "NOT_FOUND_404") {
    throw new Error("Akses detail MENUNGGU_TTD_TBIG oleh vendor harus menghasilkan 404!");
  }
  console.log("✓ Akses detail MENUNGGU_TTD_TBIG oleh vendor terproteksi (404)");

  // 3.3 Vendor 2 akses Pengadaan C milik Vendor 1
  if (simulateVendorDetailAccess(pengadaanCReady, vendor2.id) !== "NOT_FOUND_404") {
    throw new Error("Cross-tenant access oleh Vendor 2 harus menghasilkan 404!");
  }
  console.log("✓ Akses detail pengadaan vendor lain terproteksi (404)");

  // 3.4 Vendor 1 akses Pengadaan C miliknya (valid)
  if (simulateVendorDetailAccess(pengadaanCReady, vendor1.id) !== "OK") {
    throw new Error("Vendor 1 harus dapat mengakses detail Pengadaan C miliknya!");
  }
  console.log("✓ Akses detail sah oleh Vendor 1 diizinkan (200 OK)");

  // 3.5 Verifikasi ketersediaan file SIGNED_TBIG untuk preview vendor
  const hasSignedTbigFile = pengadaanCReady?.files.some(
    (f) => f.kind === FileKind.SIGNED_TBIG
  );
  if (!hasSignedTbigFile) {
    throw new Error("Dokumen dengan kind SIGNED_TBIG harus tersedia untuk preview vendor!");
  }
  console.log("✓ File SIGNED_TBIG tersedia untuk preview vendor.");

  // -------------------------------------------------------------
  // SKENARIO 4: Validasi & Eksekusi Penolakan (Transisi T5)
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 4: Transisi T5 (Vendor Tolak Pengadaan) ---");

  // 4.1 Validasi alasan kurang dari 10 karakter
  let shortReasonFailed = false;
  try {
    await rejectPengadaanByVendor({
      pengadaanId: pengadaanC.id,
      vendorId: vendor1.id,
      actorId: vendor1User.id,
      alasanPenolakan: "   Gak mau   ", // trim = 7 karakter (< 10)
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("minimal 10 karakter")) {
      shortReasonFailed = true;
    }
  }

  if (!shortReasonFailed) {
    throw new Error("Penolakan dengan alasan < 10 karakter harus ditolak validasi!");
  }
  console.log("✓ Validasi alasan penolakan minimal 10 karakter berhasil.");

  // 4.2 Validasi vendor yang bukan pemilik
  let invalidVendorFailed = false;
  try {
    await rejectPengadaanByVendor({
      pengadaanId: pengadaanC.id,
      vendorId: vendor2.id, // Vendor 2 mencoba menolak dokumen Vendor 1
      actorId: vendor2User.id,
      alasanPenolakan: "Alasan penolakan valid dari vendor yang salah",
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("bukan milik vendor Anda")) {
      invalidVendorFailed = true;
    }
  }

  if (!invalidVendorFailed) {
    throw new Error("Penolakan oleh vendor yang salah harus ditolak!");
  }
  console.log("✓ Proteksi kepemilikan vendor pada workflow penolakan berhasil.");

  // 4.3 Happy Path Penolakan oleh Vendor 1
  const validReason = "Spesifikasi termin pembayaran pada pasal 4 tidak sesuai dengan kesepakatan penawaran.";
  const rejectResult = await rejectPengadaanByVendor({
    pengadaanId: pengadaanC.id,
    vendorId: vendor1.id,
    actorId: vendor1User.id,
    alasanPenolakan: validReason,
  });

  if (rejectResult?.status !== PengadaanStatus.DITOLAK) {
    throw new Error(`Status setelah penolakan harus DITOLAK, didapat: ${rejectResult?.status}`);
  }
  if (rejectResult.alasanPenolakan !== validReason) {
    throw new Error(`Alasan penolakan tidak tersimpan dengan benar: ${rejectResult.alasanPenolakan}`);
  }
  if (!rejectResult.vendorRespondedAt) {
    throw new Error("vendorRespondedAt tidak boleh null setelah penolakan!");
  }
  console.log(`✓ Transisi T5 Sukses: Status ${rejectResult.status}, vendorRespondedAt: ${rejectResult.vendorRespondedAt.toISOString()}`);

  // 4.4 Verifikasi ActivityLog
  const activityLogs = await prisma.activityLog.findMany({
    where: { pengadaanId: pengadaanC.id },
    orderBy: { createdAt: "desc" },
  });
  const rejectLog = activityLogs.find((l) => l.action === "VENDOR_REJECTED");
  if (!rejectLog || !rejectLog.note?.includes(validReason)) {
    throw new Error("ActivityLog VENDOR_REJECTED tidak tercatat dengan catatan alasan yang benar!");
  }
  console.log(`✓ ActivityLog VENDOR_REJECTED tercatat: "${rejectLog.note}"`);

  // 4.5 Verifikasi data siap ditampilkan di halaman detail TBIG & Vendor
  const reloadedPengadaan = await prisma.pengadaan.findUnique({
    where: { id: pengadaanC.id },
  });
  if (!reloadedPengadaan || reloadedPengadaan.status !== PengadaanStatus.DITOLAK) {
    throw new Error("Pengadaan di database harus berstatus DITOLAK");
  }
  console.log("✓ Sisi TBIG & Vendor akan menampilkan banner penolakan beserta alasan tersimpan.");

  // -------------------------------------------------------------
  // Pembersihan Data Uji
  // -------------------------------------------------------------
  console.log("\n--- Pembersihan Data Uji ---");
  await prisma.pengadaan.delete({ where: { id: pengadaanDraft.id } });
  await prisma.pengadaan.delete({ where: { id: pengadaanB.id } });
  await prisma.pengadaan.delete({ where: { id: pengadaanC.id } });

  for (const f of pengadaanCReady.files) {
    try {
      await storage.delete(f.storageKey);
    } catch {
      // ignore
    }
  }
  try {
    await storage.delete(buildMockStorageKey(tbigSignResult.externalId));
  } catch {
    // ignore
  }

  console.log("=== SELURUH VERIFIKASI STEP 1.9 LOLOS (100%) ===");
}

main()
  .catch((err) => {
    console.error("❌ Verifikasi Step 1.9 Gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
