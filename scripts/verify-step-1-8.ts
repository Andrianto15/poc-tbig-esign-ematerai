import "dotenv/config";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/db";
import { getStorage } from "../src/lib/storage";
import { buildMockStorageKey } from "../src/lib/storage/types";
import {
  createDraftPengadaan,
  submitTbigSign,
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
  page.drawText("SURAT PERJANJIAN PENGADAAN (UJI STEP 1.8)", {
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
  console.log("=== VERIFIKASI STEP 1.8: TANDA TANGAN TBIG, AUTO-REFRESH & RETRY ===");

  const tbigUser = await prisma.user.findFirst({
    where: { role: "TBIG" },
  });
  if (!tbigUser) {
    throw new Error("User TBIG tidak ditemukan di database. Jalankan seed terlebih dahulu.");
  }

  const vendor = await prisma.vendor.findFirst();
  if (!vendor) {
    throw new Error("Vendor tidak ditemukan di database. Jalankan seed terlebih dahulu.");
  }

  const samplePdf = await createSamplePdf();
  const storage = getStorage();

  // Bersihkan data sisa uji sebelumnya jika ada
  await prisma.pengadaan.deleteMany({
    where: { noSuratPesanan: { startsWith: "TEST-SP-18" } },
  });

  // -------------------------------------------------------------
  // SKENARIO 1: Happy Path Tanda Tangan TBIG
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 1: Happy Path Tanda Tangan TBIG ---");
  const testSp1 = `TEST-SP-18-OK-${Date.now()}`;
  console.log("1.1 Membuat Draft Pengadaan...");
  const draft1 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Switch Test 1.8 Happy Path",
    alamat: "Jl. TB Simatupang No. 25, Jakarta Selatan",
    harga: BigInt(85000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: testSp1,
    tanggalPenyelesaian: new Date("2026-11-05"),
    vendorId: vendor.id,
    picNama: vendor.picNama,
    picJabatan: vendor.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  console.log(`✓ Draft dibuat: ID ${draft1.id}, Status: ${draft1.status}`);

  console.log("1.2 Menjalankan submitTbigSign (Transisi T3: DRAFT -> MENUNGGU_TTD_TBIG)...");
  const submitResult1 = await submitTbigSign(draft1.id, tbigUser.id);
  console.log(`✓ SignJob dibuat: ${submitResult1.jobId}, externalId: ${submitResult1.externalId}`);

  const pengadaanProcessing = await prisma.pengadaan.findUnique({
    where: { id: draft1.id },
  });
  if (pengadaanProcessing?.status !== PengadaanStatus.MENUNGGU_TTD_TBIG) {
    throw new Error(
      `Status harus MENUNGGU_TTD_TBIG, didapat: ${pengadaanProcessing?.status}`
    );
  }
  console.log(`✓ Status pengadaan berubah ke: ${pengadaanProcessing.status} ('Proses tanda tangan TBIG')`);

  console.log(`1.3 Menunggu scheduled event mock provider hingga SignJob COMPLETED...`);
  await waitForJobStatus(submitResult1.jobId, SignJobStatus.COMPLETED);

  const pengadaanSigned = await prisma.pengadaan.findUnique({
    where: { id: draft1.id },
    include: { files: true, jobs: true },
  });

  if (pengadaanSigned?.status !== PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR) {
    throw new Error(
      `Status harus MENUNGGU_PERSETUJUAN_VENDOR (T4), didapat: ${pengadaanSigned?.status}`
    );
  }
  if (!pengadaanSigned.tbigSignedAt) {
    throw new Error("tbigSignedAt tidak terisi!");
  }
  console.log(`✓ Status pengadaan berubah ke: ${pengadaanSigned.status} ('Sudah ttd TBIG, menunggu persetujuan vendor')`);
  console.log(`✓ tbigSignedAt terisi: ${pengadaanSigned.tbigSignedAt.toISOString()}`);

  const signedFile1 = pengadaanSigned.files.find((f) => f.kind === FileKind.SIGNED_TBIG);
  if (!signedFile1) {
    throw new Error("File SIGNED_TBIG tidak ditemukan di database!");
  }
  const signedBytes1 = await storage.get(signedFile1.storageKey);
  if (!signedBytes1 || signedBytes1.byteLength === 0) {
    throw new Error("File SIGNED_TBIG tidak dapat dibaca dari storage!");
  }
  console.log(`✓ File SIGNED_TBIG tersimpan di storage: ${signedBytes1.byteLength} bytes (preview ttd TBIG siap)`);

  // -------------------------------------------------------------
  // SKENARIO 2: Simulasi Kegagalan & "Coba Lagi" (Retry)
  // -------------------------------------------------------------
  console.log("\n--- SKENARIO 2: Kegagalan Job (MOCK_ESIGN_FAIL) & 'Coba Lagi' ---");
  const testSp2 = `TEST-SP-18-FAIL-${Date.now()}`;
  console.log("2.1 Membuat Draft Pengadaan untuk uji kegagalan...");
  const draft2 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Uji Kegagalan Step 1.8",
    alamat: "Jl. Gatot Subroto Kav. 50, Jakarta Selatan",
    harga: BigInt(60000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: testSp2,
    tanggalPenyelesaian: new Date("2026-11-05"),
    vendorId: vendor.id,
    picNama: vendor.picNama,
    picJabatan: vendor.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  console.log(`✓ Draft kedua dibuat: ID ${draft2.id}`);

  // Pasang flag MOCK_ESIGN_FAIL
  process.env.MOCK_ESIGN_FAIL = "AUTO_SIGN_TBIG";
  console.log("2.2 MOCK_ESIGN_FAIL=AUTO_SIGN_TBIG diaktifkan. Memanggil submitTbigSign...");

  const submitResultFail = await submitTbigSign(draft2.id, tbigUser.id);
  console.log(`✓ SignJob awal dibuat: ${submitResultFail.jobId}`);

  console.log("2.3 Menunggu scheduled event kegagalan hingga SignJob FAILED...");
  const jobFailed = await waitForJobStatus(submitResultFail.jobId, SignJobStatus.FAILED);
  console.log(`✓ SignJob berstatus FAILED dengan pesan: "${jobFailed.errorMessage}"`);

  const pengadaanStillProcessing = await prisma.pengadaan.findUnique({
    where: { id: draft2.id },
  });
  if (pengadaanStillProcessing?.status !== PengadaanStatus.MENUNGGU_TTD_TBIG) {
    throw new Error(
      `Status pengadaan tidak boleh berubah saat job gagal! Didapat: ${pengadaanStillProcessing?.status}`
    );
  }
  console.log(`✓ Status pengadaan tetap '${pengadaanStillProcessing.status}' (tidak berubah sesuai PRD 5.2)`);

  // Hapus flag kegagalan & uji tombol "Coba lagi" (Retry)
  delete process.env.MOCK_ESIGN_FAIL;
  console.log("2.4 MOCK_ESIGN_FAIL dihapus. Menguji 'Coba lagi' (retry submitTbigSign)...");

  const retryResult = await submitTbigSign(draft2.id, tbigUser.id);
  console.log(`✓ SignJob retry berhasil dibuat: ID ${retryResult.jobId}, externalId: ${retryResult.externalId}`);

  console.log("2.5 Menunggu scheduled event sukses untuk retry hingga SignJob COMPLETED...");
  const retryJob = await waitForJobStatus(retryResult.jobId, SignJobStatus.COMPLETED);
  console.log(`✓ SignJob retry berhasil COMPLETED! completedAt: ${retryJob.completedAt?.toISOString()}`);

  const pengadaanRetrySuccess = await prisma.pengadaan.findUnique({
    where: { id: draft2.id },
  });
  if (pengadaanRetrySuccess?.status !== PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR) {
    throw new Error(
      `Status pengadaan setelah retry harus MENUNGGU_PERSETUJUAN_VENDOR, didapat: ${pengadaanRetrySuccess?.status}`
    );
  }
  console.log(`✓ Status pengadaan setelah retry berhasil berubah ke: ${pengadaanRetrySuccess.status}`);

  // -------------------------------------------------------------
  // Pembersihan Data Uji
  // -------------------------------------------------------------
  console.log("\n3. Membersihkan data uji pengadaan...");
  await prisma.pengadaan.delete({ where: { id: draft1.id } });
  await prisma.pengadaan.delete({ where: { id: draft2.id } });

  for (const f of pengadaanSigned.files) {
    try {
      await storage.delete(f.storageKey);
    } catch {
      // ignore
    }
  }
  try {
    await storage.delete(buildMockStorageKey(submitResult1.externalId));
    await storage.delete(buildMockStorageKey(submitResultFail.externalId));
    await storage.delete(buildMockStorageKey(retryResult.externalId));
  } catch {
    // ignore
  }

  console.log("=== SELURUH VERIFIKASI STEP 1.8 LOLOS (100%) ===");
}

main()
  .catch((err) => {
    console.error("❌ Verifikasi Step 1.8 Gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
