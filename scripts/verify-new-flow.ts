// Bypass error server-only saat dijalankan di luar bundler Next.js
// @ts-expect-error bypass server-only for standalone script runner
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
};

import "dotenv/config";
process.env.ESIGN_MODE = "mock";
process.env.MOCK_ESIGN_DELAY_MS = "500";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/db";
import {
  PengadaanStatus,
  FileKind,
  SignJobStatus,
  SignJobType,
} from "../src/generated/prisma/enums";

async function createSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("SURAT PERJANJIAN PENGADAAN (UJI NEW FLOW)", {
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

async function waitForSignJobType(
  pengadaanId: string,
  jobType: SignJobType,
  timeoutMs = 15000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await prisma.signJob.findFirst({
      where: { pengadaanId, type: jobType },
      orderBy: { createdAt: "desc" },
    });
    if (job) {
      return job;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Job '${jobType}' tidak ditemukan setelah timeout.`);
}

async function main() {
  const { getStorage } = await import("../src/lib/storage");
  const {
    createDraftPengadaan,
    submitPengadaanToVendor,
    submitVendorApproval,
    rejectPengadaanByVendor,
    submitTbigSign,
  } = await import("../src/lib/workflow/pengadaan-workflow");
  const { submitMockSignAction } = await import("../src/app/mock-mekari/actions");

  console.log("=== VERIFIKASI NEW FLOW: TBIG BIKIN -> MITRA REVIEW -> MITRA TTD+METERAI -> TBIG TTD ===");

  const tbigUser = await prisma.user.findFirst({
    where: { role: "TBIG" },
  });
  if (!tbigUser) {
    throw new Error("User TBIG tidak ditemukan di database.");
  }

  const vendorUser = await prisma.user.findFirst({
    where: { email: "vendor1@poc.local" },
    include: { vendor: true },
  });
  if (!vendorUser?.vendor) {
    throw new Error("User vendor1 tidak ditemukan di database.");
  }

  const vendor = vendorUser.vendor;
  const samplePdf = await createSamplePdf();
  const storage = getStorage();

  // Bersihkan sisa data uji sebelumnya jika ada
  await prisma.pengadaan.deleteMany({
    where: { noSuratPesanan: { startsWith: "TEST-NEW-FLOW" } },
  });

  const ts = Date.now();

  // -------------------------------------------------------------
  // SKENARIO 1: Pengujian Jalur Penolakan (Rejection Path)
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 1: Jalur Penolakan oleh Vendor ---");
  const spReject = `TEST-NEW-FLOW-REJ-${ts}`;
  const pengadaan1 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Rejection Test New Flow",
    alamat: "Jl. TB Simatupang No. 201, Jakarta",
    harga: BigInt(50000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: spReject,
    tanggalPenyelesaian: new Date("2026-11-10"),
    vendorId: vendor.id,
    picNama: vendor.picNama,
    picJabatan: vendor.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  if (pengadaan1.status !== PengadaanStatus.DRAFT) {
    throw new Error(`Status awal harus DRAFT, didapat: ${pengadaan1.status}`);
  }
  console.log("✓ Pengadaan 1 dibuat dalam status DRAFT");

  // TBIG kirim ke Vendor (T3)
  const submitted1 = await submitPengadaanToVendor(pengadaan1.id, tbigUser.id);
  if (submitted1?.status !== PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR) {
    throw new Error(`Status setelah kirim ke vendor harus MENUNGGU_PERSETUJUAN_VENDOR, didapat: ${submitted1?.status}`);
  }
  console.log("✓ Transisi T3 sukses: Status pengadaan beralih ke MENUNGGU_PERSETUJUAN_VENDOR");

  // Vendor Tolak (T4)
  const rejectReason = "Harga dan termin pembayaran tidak sesuai kesepakatan";
  await rejectPengadaanByVendor({
    pengadaanId: pengadaan1.id,
    vendorId: vendor.id,
    actorId: vendorUser.id,
    alasanPenolakan: rejectReason,
  });

  const rejected1 = await prisma.pengadaan.findUnique({
    where: { id: pengadaan1.id },
  });

  if (rejected1?.status !== PengadaanStatus.DITOLAK) {
    throw new Error(`Status setelah tolak harus DITOLAK, didapat: ${rejected1?.status}`);
  }
  if (rejected1.alasanPenolakan !== rejectReason) {
    throw new Error("Alasan penolakan tidak tersimpan dengan benar!");
  }
  console.log(`✓ Transisi T4 sukses: Status pengadaan DITOLAK, reason: "${rejected1.alasanPenolakan}"`);

  // -------------------------------------------------------------
  // SKENARIO 2: Happy Path End-to-End
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 2: Happy Path End-to-End ---");
  const spHappy = `TEST-NEW-FLOW-OK-${ts}`;
  const pengadaan2 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Kabel Fiber Optic New Flow Happy Path",
    alamat: "Jl. TB Simatupang No. 202, Jakarta",
    harga: BigInt(120000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: spHappy,
    tanggalPenyelesaian: new Date("2026-11-10"),
    vendorId: vendor.id,
    picNama: vendor.picNama,
    picJabatan: vendor.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  // 2.1 Kirim ke Vendor (T3)
  console.log("2.1 TBIG kirim pengadaan ke Vendor (Transisi T3)...");
  const submitted2 = await submitPengadaanToVendor(pengadaan2.id, tbigUser.id);
  if (submitted2?.status !== PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR) {
    throw new Error(`Status harus MENUNGGU_PERSETUJUAN_VENDOR, didapat: ${submitted2?.status}`);
  }
  console.log("✓ Transisi T3 sukses: Status MENUNGGU_PERSETUJUAN_VENDOR");

  // 2.2 Vendor Setuju (T5) -> Buat STAMP_METERAI job berbasis file PREPARED
  console.log("2.2 Vendor klik Setuju (Transisi T5)...");
  const approveResult = await submitVendorApproval({
    pengadaanId: pengadaan2.id,
    vendorId: vendor.id,
    actorId: vendorUser.id,
  });

  const pengadaan2Approved = await prisma.pengadaan.findUnique({
    where: { id: pengadaan2.id },
  });
  if (pengadaan2Approved?.status !== PengadaanStatus.MENUNGGU_TTD_VENDOR) {
    throw new Error(`Status harus MENUNGGU_TTD_VENDOR, didapat: ${pengadaan2Approved?.status}`);
  }
  if (!pengadaan2Approved.vendorRespondedAt) {
    throw new Error("vendorRespondedAt harus terisi!");
  }
  console.log("✓ Transisi T5 sukses: Status MENUNGGU_TTD_VENDOR, job STAMP_METERAI dibuat");

  // 2.3 Tunggu STAMP_METERAI selesai (T6) -> otomatis buat SIGN_VENDOR job
  console.log("2.3 Menunggu pembubuhan eMeterai selesai...");
  await waitForJobStatus(approveResult.jobId, SignJobStatus.COMPLETED);

  const signVendorJob = await waitForSignJobType(
    pengadaan2.id,
    SignJobType.SIGN_VENDOR
  );
  if (signVendorJob.status !== SignJobStatus.WAITING_SIGNER || !signVendorJob.signUrl) {
    throw new Error("Job SIGN_VENDOR harus WAITING_SIGNER dan memiliki signUrl!");
  }
  console.log(`✓ Transisi T6 sukses: eMeterai selesai, job SIGN_VENDOR aktif (signUrl: ${signVendorJob.signUrl})`);

  // 2.4 Vendor melakukan tanda tangan via Mock Mekari OTP
  console.log("2.4 Vendor tanda tangan dengan OTP (123456)...");
  const mockSignResult = await submitMockSignAction(signVendorJob.id, "123456");
  if (mockSignResult.error) {
    throw new Error(`Tanda tangan vendor gagal: ${mockSignResult.error}`);
  }
  await waitForJobStatus(signVendorJob.id, SignJobStatus.COMPLETED);
  console.log("✓ Job SIGN_VENDOR COMPLETED");

  // 2.5 Verifikasi Transisi T7: File SIGNED_VENDOR tersimpan, status MENUNGGU_TTD_TBIG
  const pengadaan2AfterVendor = await prisma.pengadaan.findUnique({
    where: { id: pengadaan2.id },
    include: { files: true },
  });

  const signedVendorFile = pengadaan2AfterVendor?.files.find((f) => f.kind === FileKind.SIGNED_VENDOR);
  if (!signedVendorFile) {
    throw new Error("File SIGNED_VENDOR harus tersimpan di DocumentFile!");
  }
  console.log(`✓ File SIGNED_VENDOR tersimpan (${(signedVendorFile.sizeBytes / 1024).toFixed(1)} KB)`);

  // 2.6 Verifikasi atau eksekusi Tanda Tangan TBIG (Transisi T8)
  const existingAutoSign = await prisma.signJob.findFirst({
    where: { pengadaanId: pengadaan2.id, type: SignJobType.AUTO_SIGN_TBIG },
    orderBy: { createdAt: "desc" },
  });

  if (existingAutoSign) {
    console.log("2.6 AutoSign TBIG terpicu secara otomatis, menunggu hingga COMPLETED...");
    await waitForJobStatus(existingAutoSign.id, SignJobStatus.COMPLETED);
    console.log("✓ Job AUTO_SIGN_TBIG COMPLETED");
  } else if (pengadaan2AfterVendor?.status === PengadaanStatus.MENUNGGU_TTD_TBIG) {
    console.log("2.6 Pengadaan berada di status MENUNGGU_TTD_TBIG. Menjalankan Tanda Tangan TBIG manual...");
    const tbigSignResult = await submitTbigSign(pengadaan2.id, tbigUser.id);
    await waitForJobStatus(tbigSignResult.jobId, SignJobStatus.COMPLETED);
    console.log("✓ Job SIGN_TBIG manual COMPLETED");
  } else if (pengadaan2AfterVendor?.status === PengadaanStatus.SELESAI) {
    console.log("✓ Pengadaan telah berada di status SELESAI!");
  } else {
    throw new Error(`Status tidak terduga setelah vendor ttd: ${pengadaan2AfterVendor?.status}`);
  }

  // 2.7 Verifikasi Status Akhir Pengadaan
  const pengadaanFinal = await prisma.pengadaan.findUnique({
    where: { id: pengadaan2.id },
    include: { files: true, logs: true },
  });

  if (pengadaanFinal?.status !== PengadaanStatus.SELESAI) {
    throw new Error(`Status akhir harus SELESAI, didapat: ${pengadaanFinal?.status}`);
  }
  if (!pengadaanFinal.meteraiStampedAt || !pengadaanFinal.vendorSignedAt || !pengadaanFinal.tbigSignedAt) {
    throw new Error("meteraiStampedAt, vendorSignedAt, dan tbigSignedAt harus terisi lengkap!");
  }
  console.log(`✓ Status akhir SELESAI:`);
  console.log(`  - meteraiStampedAt : ${pengadaanFinal.meteraiStampedAt.toISOString()}`);
  console.log(`  - vendorSignedAt  : ${pengadaanFinal.vendorSignedAt.toISOString()}`);
  console.log(`  - tbigSignedAt    : ${pengadaanFinal.tbigSignedAt.toISOString()}`);

  // 2.8 Verifikasi File Dokumen
  const finalFile = pengadaanFinal.files.find((f) => f.kind === FileKind.FINAL);
  if (!finalFile) {
    throw new Error("File berkategori FINAL harus tersimpan!");
  }
  const finalBytes = await storage.get(finalFile.storageKey);
  if (!finalBytes || finalBytes.byteLength === 0) {
    throw new Error("File FINAL tidak dapat dibaca dari storage!");
  }
  const finalDoc = await PDFDocument.load(finalBytes);
  console.log(`✓ Dokumen FINAL valid di storage (${(finalFile.sizeBytes / 1024).toFixed(1)} KB, ${finalDoc.getPageCount()} halaman)`);

  // 2.9 Verifikasi ActivityLog
  const logActions = pengadaanFinal.logs.map((l) => l.action);
  const expectedActions = [
    "DRAFT_CREATED",
    "PENGADAAN_SUBMITTED_TO_VENDOR",
    "VENDOR_APPROVED",
    "METERAI_STAMPED",
    "VENDOR_SIGNED",
    "TBIG_SIGN_SUBMITTED",
    "TBIG_SIGNED",
  ];
  for (const act of expectedActions) {
    if (!logActions.includes(act)) {
      throw new Error(`ActivityLog '${act}' tidak ditemukan dalam riwayat!`);
    }
  }
  console.log("✓ Riwayat ActivityLog lengkap: " + expectedActions.join(" -> "));

  // -------------------------------------------------------------
  // Pembersihan Data Uji
  // -------------------------------------------------------------
  console.log("\n--- Pembersihan Data Uji ---");
  await prisma.pengadaan.delete({ where: { id: pengadaan1.id } });
  await prisma.pengadaan.delete({ where: { id: pengadaan2.id } });

  for (const f of [...(pengadaan1.files || []), ...pengadaanFinal.files]) {
    try {
      await storage.delete(f.storageKey);
    } catch {
      // ignore
    }
  }

  console.log("\n=== SELURUH VERIFIKASI NEW FLOW BERHASIL (100%) ===");
}

main()
  .catch((err) => {
    console.error("❌ Verifikasi New Flow Gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
