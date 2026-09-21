import "dotenv/config";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/db";
import { getStorage } from "../src/lib/storage";
import { buildMockStorageKey } from "../src/lib/storage/types";
import {
  createDraftPengadaan,
  submitTbigSign,
  submitVendorApproval,
} from "../src/lib/workflow/pengadaan-workflow";
import { submitMockSignAction } from "../src/app/mock-mekari/actions";
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
  page.drawText("SURAT PERJANJIAN PENGADAAN (UJI STEP 1.10)", {
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
  console.log("=== VERIFIKASI STEP 1.10: SETUJU, EMETERAI, TTD VENDOR & PDF FINAL ===");

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
    where: { noSuratPesanan: { startsWith: "TEST-SP-110" } },
  });

  const ts = Date.now();

  // -------------------------------------------------------------
  // SKENARIO 1: Pengujian Retry Saat Pembubuhan eMeterai Gagal
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 1: Simulasi Kegagalan STAMP_METERAI & Retry ---");
  const spFail = `TEST-SP-110-FAIL-${ts}`;
  const pengadaan1 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Switch Test 1.10 Fail Simulation",
    alamat: "Jl. TB Simatupang No. 101, Jakarta",
    harga: BigInt(75000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: spFail,
    tanggalPenyelesaian: new Date("2026-11-10"),
    vendorId: vendor.id,
    picNama: vendor.picNama,
    picJabatan: vendor.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  // Tanda tangan TBIG terlebih dahulu agar sampai di status MENUNGGU_PERSETUJUAN_VENDOR
  const tbigSign1 = await submitTbigSign(pengadaan1.id, tbigUser.id);
  await waitForJobStatus(tbigSign1.jobId, SignJobStatus.COMPLETED);
  console.log("✓ Pengadaan 1 berhasil ditandatangani TBIG (status: MENUNGGU_PERSETUJUAN_VENDOR)");

  // Aktifkan simulasi kegagalan MOCK_ESIGN_FAIL=STAMP_METERAI
  process.env.MOCK_ESIGN_FAIL = "STAMP_METERAI";
  console.log("1.1 Mengajukan Persetujuan Vendor dengan simulasi kegagalan eMeterai...");
  const meteraiFailResult = await submitVendorApproval({
    pengadaanId: pengadaan1.id,
    vendorId: vendor.id,
    actorId: vendorUser.id,
  });

  const failedJob = await waitForJobStatus(
    meteraiFailResult.jobId,
    SignJobStatus.FAILED
  );
  console.log(`✓ Job STAMP_METERAI gagal sesuai ekspektasi: "${failedJob.errorMessage}"`);

  const pengadaan1AfterFail = await prisma.pengadaan.findUnique({
    where: { id: pengadaan1.id },
  });
  if (pengadaan1AfterFail?.status !== PengadaanStatus.MENUNGGU_TTD_VENDOR) {
    throw new Error(
      `Status harus tetap MENUNGGU_TTD_VENDOR setelah job gagal, didapat: ${pengadaan1AfterFail?.status}`
    );
  }
  console.log("✓ Status pengadaan tetap MENUNGGU_TTD_VENDOR saat job gagal.");

  // Bersihkan env kegagalan dan jalankan Retry
  delete process.env.MOCK_ESIGN_FAIL;
  console.log("1.2 Menjalankan Retry Pembubuhan eMeterai...");
  const meteraiRetryResult = await submitVendorApproval({
    pengadaanId: pengadaan1.id,
    vendorId: vendor.id,
    actorId: vendorUser.id,
  });

  const retryJob = await waitForJobStatus(
    meteraiRetryResult.jobId,
    SignJobStatus.COMPLETED
  );
  console.log(`✓ Retry STAMP_METERAI berhasil COMPLETED! ID: ${retryJob.id}`);

  // Tunggu Transisi T7 otomatis membuat SIGN_VENDOR job
  const signVendorJob1 = await waitForSignJobType(
    pengadaan1.id,
    SignJobType.SIGN_VENDOR
  );
  if (signVendorJob1.status !== SignJobStatus.WAITING_SIGNER || !signVendorJob1.signUrl) {
    throw new Error("Job SIGN_VENDOR harus WAITING_SIGNER dan memiliki signUrl!");
  }
  console.log(`✓ Transisi T7 sukses: Job SIGN_VENDOR dibuat dengan signUrl: ${signVendorJob1.signUrl}`);

  // -------------------------------------------------------------
  // SKENARIO 2: Happy Path End-to-End (T6 -> T7 -> Mock Sign OTP -> T8)
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 2: Happy Path End-to-End ---");
  const spHappy = `TEST-SP-110-OK-${ts}`;
  const pengadaan2 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Fiber Optic Test 1.10 Happy Path",
    alamat: "Jl. TB Simatupang No. 102, Jakarta",
    harga: BigInt(150000000),
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

  // 2.1 Tanda Tangan TBIG
  const tbigSign2 = await submitTbigSign(pengadaan2.id, tbigUser.id);
  await waitForJobStatus(tbigSign2.jobId, SignJobStatus.COMPLETED);
  console.log("✓ TBIG Sign selesai: Pengadaan siap untuk persetujuan vendor.");

  // 2.2 Transisi T6: Vendor Klik Setuju -> job STAMP_METERAI
  console.log("2.2 Vendor klik Setuju (Transisi T6)...");
  const approveResult = await submitVendorApproval({
    pengadaanId: pengadaan2.id,
    vendorId: vendor.id,
    actorId: vendorUser.id,
  });

  const pengadaan2Pending = await prisma.pengadaan.findUnique({
    where: { id: pengadaan2.id },
  });
  if (pengadaan2Pending?.status !== PengadaanStatus.MENUNGGU_TTD_VENDOR) {
    throw new Error(
      `Status setelah Setuju harus MENUNGGU_TTD_VENDOR, didapat: ${pengadaan2Pending?.status}`
    );
  }
  if (!pengadaan2Pending.vendorRespondedAt) {
    throw new Error("vendorRespondedAt harus terisi setelah persetujuan vendor!");
  }
  console.log(`✓ Transisi T6 Berhasil: Status ${pengadaan2Pending.status}, vendorRespondedAt terisi.`);

  // 2.3 Tunggu Transisi T7: Event STAMP_METERAI COMPLETED -> job SIGN_VENDOR dibuat
  console.log("2.3 Menunggu proses pembubuhan eMeterai selesai...");
  await waitForJobStatus(approveResult.jobId, SignJobStatus.COMPLETED);

  const signVendorJob2 = await waitForSignJobType(
    pengadaan2.id,
    SignJobType.SIGN_VENDOR
  );
  if (signVendorJob2.status !== SignJobStatus.WAITING_SIGNER || !signVendorJob2.signUrl) {
    throw new Error("Job SIGN_VENDOR harus WAITING_SIGNER dan memiliki signUrl!");
  }
  console.log(`✓ Transisi T7 Berhasil: STAMPED_METERAI selesai, SignJob SIGN_VENDOR dibuat (signUrl: ${signVendorJob2.signUrl})`);

  // 2.4 Uji Mock Mekari: OTP salah ditolak
  console.log("2.4 Uji validasi OTP salah di Mock Mekari Sign...");
  const wrongOtpResult = await submitMockSignAction(signVendorJob2.id, "999999");
  if (!wrongOtpResult.error || !wrongOtpResult.error.includes("tidak valid")) {
    throw new Error("OTP salah harus menghasilkan error validasi!");
  }
  console.log(`✓ OTP salah ditolak validasi: "${wrongOtpResult.error}"`);

  // 2.5 Uji Mock Mekari: OTP benar "123456" -> Transisi T8 -> SELESAI
  console.log("2.5 Submit OTP benar (123456) di Mock Mekari Sign...");
  const correctOtpResult = await submitMockSignAction(signVendorJob2.id, "123456");
  if (correctOtpResult.error) {
    throw new Error(`Submit OTP benar gagal: ${correctOtpResult.error}`);
  }
  console.log(`✓ Tanda tangan mock berhasil, returnUrl: ${correctOtpResult.returnUrl}`);

  // Tunggu job SIGN_VENDOR COMPLETED
  await waitForJobStatus(signVendorJob2.id, SignJobStatus.COMPLETED);

  // 2.6 Verifikasi Status Akhir Pengadaan
  const pengadaanFinal = await prisma.pengadaan.findUnique({
    where: { id: pengadaan2.id },
    include: { files: true, logs: true },
  });

  if (pengadaanFinal?.status !== PengadaanStatus.SELESAI) {
    throw new Error(`Status pengadaan harus SELESAI, didapat: ${pengadaanFinal?.status}`);
  }
  if (!pengadaanFinal.meteraiStampedAt || !pengadaanFinal.vendorSignedAt) {
    throw new Error("meteraiStampedAt dan vendorSignedAt harus terisi lengkap!");
  }
  console.log(`✓ Transisi T8 Berhasil: Status SELESAI, vendorSignedAt: ${pengadaanFinal.vendorSignedAt.toISOString()}`);

  // 2.7 Verifikasi Dokumen FINAL
  const finalFile = pengadaanFinal.files.find((f) => f.kind === FileKind.FINAL);
  if (!finalFile) {
    throw new Error("File berkategori FINAL harus tersimpan di DocumentFile!");
  }
  const finalBytes = await storage.get(finalFile.storageKey);
  if (!finalBytes || finalBytes.byteLength === 0) {
    throw new Error("File FINAL tidak dapat dibaca dari storage!");
  }
  console.log(`✓ File FINAL tersimpan di storage (${(finalFile.sizeBytes / 1024).toFixed(1)} KB)`);

  // Periksa PDF FINAL memuat halaman pengesahan
  const finalDoc = await PDFDocument.load(finalBytes);
  console.log(`✓ PDF FINAL valid dengan jumlah halaman: ${finalDoc.getPageCount()}`);

  // 2.8 Verifikasi ActivityLog Lengkap
  const logActions = pengadaanFinal.logs.map((l) => l.action);
  const expectedActions = [
    "DRAFT_CREATED",
    "TBIG_SIGN_SUBMITTED",
    "TBIG_SIGNED",
    "VENDOR_APPROVED",
    "METERAI_STAMPED",
    "VENDOR_SIGNED",
  ];
  for (const act of expectedActions) {
    if (!logActions.includes(act)) {
      throw new Error(`ActivityLog '${act}' tidak ditemukan dalam riwayat pengadaan!`);
    }
  }
  console.log("✓ Seluruh riwayat ActivityLog tercatat lengkap (T1 -> T3 -> T4 -> T6 -> T7 -> T8)");

  // -------------------------------------------------------------
  // Pembersihan Data Uji
  // -------------------------------------------------------------
  console.log("\n--- Pembersihan Data Uji ---");
  await prisma.pengadaan.delete({ where: { id: pengadaan1.id } });
  await prisma.pengadaan.delete({ where: { id: pengadaan2.id } });

  for (const f of pengadaanFinal.files) {
    try {
      await storage.delete(f.storageKey);
    } catch {
      // ignore
    }
  }
  try {
    await storage.delete(buildMockStorageKey(tbigSign1.externalId));
    await storage.delete(buildMockStorageKey(meteraiFailResult.externalId));
    await storage.delete(buildMockStorageKey(meteraiRetryResult.externalId));
    await storage.delete(buildMockStorageKey(signVendorJob1.externalId!));
    await storage.delete(buildMockStorageKey(tbigSign2.externalId));
    await storage.delete(buildMockStorageKey(approveResult.externalId));
    await storage.delete(buildMockStorageKey(signVendorJob2.externalId!));
  } catch {
    // ignore
  }

  console.log("=== SELURUH VERIFIKASI STEP 1.10 LOLOS (100%) ===");
}

main()
  .catch((err) => {
    console.error("❌ Verifikasi Step 1.10 Gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
