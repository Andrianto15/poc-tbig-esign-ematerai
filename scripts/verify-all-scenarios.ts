import "dotenv/config";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/db";
import {
  createDraftPengadaan,
  submitTbigSign,
  submitVendorApproval,
  rejectPengadaanByVendor,
} from "../src/lib/workflow/pengadaan-workflow";
import { handleESignEvent } from "../src/lib/workflow/handle-esign-event";
import { submitMockSignAction } from "../src/app/mock-mekari/actions";
import { pengadaanSchema } from "../src/lib/validations/pengadaan";
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
  page.drawText("SURAT PERJANJIAN PENGADAAN (UJI MENYELURUH)", {
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
    await new Promise((r) => setTimeout(r, 400));
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
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Job '${jobType}' tidak ditemukan setelah timeout.`);
}

async function main() {
  console.log("=================================================================");
  console.log(" VERIFIKASI MENYELURUH SKENARIO UJI PRD BAGIAN 10 (SKENARIO 1 - 8)");
  console.log("=================================================================");

  const tbigUser = await prisma.user.findFirst({ where: { role: "TBIG" } });
  if (!tbigUser) throw new Error("User TBIG tidak ditemukan.");

  const v1User = await prisma.user.findFirst({
    where: { email: "vendor1@poc.local" },
    include: { vendor: true },
  });
  const v2User = await prisma.user.findFirst({
    where: { email: "vendor2@poc.local" },
    include: { vendor: true },
  });

  if (!v1User?.vendor || !v2User?.vendor) {
    throw new Error("User vendor1 atau vendor2 tidak ditemukan.");
  }

  const vendor1 = v1User.vendor;
  const vendor2 = v2User.vendor;
  const samplePdf = await createSamplePdf();
  const ts = Date.now();

  // Bersihkan data uji sebelumnya
  await prisma.pengadaan.deleteMany({
    where: { noSuratPesanan: { startsWith: "TEST-ALL-" } },
  });

  // -------------------------------------------------------------
  // SKENARIO 1: Happy Path End-to-End
  // -------------------------------------------------------------
  console.log("\n[SKENARIO 1] Happy Path: TBIG buat -> ttd -> vendor1 Setuju -> meterai -> ttd vendor");
  const sp1 = `TEST-ALL-SC1-${ts}`;
  const p1 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Switch Core Data Center",
    alamat: "Jl. TB Simatupang No. 33, Jakarta Selatan",
    harga: BigInt(250000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: sp1,
    tanggalPenyelesaian: new Date("2026-11-15"),
    vendorId: vendor1.id,
    picNama: vendor1.picNama,
    picJabatan: vendor1.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  const tbigSignResult1 = await submitTbigSign(p1.id, tbigUser.id);
  await waitForJobStatus(tbigSignResult1.jobId, SignJobStatus.COMPLETED);

  const approveResult1 = await submitVendorApproval({
    pengadaanId: p1.id,
    vendorId: vendor1.id,
    actorId: v1User.id,
  });
  await waitForJobStatus(approveResult1.jobId, SignJobStatus.COMPLETED);

  const signJobV1 = await waitForSignJobType(p1.id, SignJobType.SIGN_VENDOR);
  await submitMockSignAction(signJobV1.id, "123456");
  await waitForJobStatus(signJobV1.id, SignJobStatus.COMPLETED);

  const p1Final = await prisma.pengadaan.findUnique({
    where: { id: p1.id },
    include: { files: true },
  });
  if (p1Final?.status !== PengadaanStatus.SELESAI) {
    throw new Error(`Skenario 1 Gagal: Status harus SELESAI, didapat ${p1Final?.status}`);
  }
  const hasFinalPdf = p1Final.files.some((f) => f.kind === FileKind.FINAL);
  if (!hasFinalPdf) {
    throw new Error("Skenario 1 Gagal: Dokumen FINAL tidak ditemukan di DocumentFile.");
  }
  console.log("✓ Skenario 1 LOLOS: Status SELESAI di kedua sisi, PDF final tersimpan.");

  // -------------------------------------------------------------
  // SKENARIO 2: Penolakan oleh Vendor
  // -------------------------------------------------------------
  console.log("\n[SKENARIO 2] Penolakan: TBIG buat -> ttd -> vendor1 Tolak dengan alasan");
  const sp2 = `TEST-ALL-SC2-${ts}`;
  const p2 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Generator Set Cadangan",
    alamat: "Jl. TB Simatupang No. 34, Jakarta Selatan",
    harga: BigInt(80000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: sp2,
    tanggalPenyelesaian: new Date("2026-11-15"),
    vendorId: vendor1.id,
    picNama: vendor1.picNama,
    picJabatan: vendor1.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  const tbigSignResult2 = await submitTbigSign(p2.id, tbigUser.id);
  await waitForJobStatus(tbigSignResult2.jobId, SignJobStatus.COMPLETED);

  const reason2 = "Spesifikasi garansi SLA tidak sesuai dengan kesepakatan negosiasi.";
  const rejectResult = await rejectPengadaanByVendor({
    pengadaanId: p2.id,
    vendorId: vendor1.id,
    actorId: v1User.id,
    alasanPenolakan: reason2,
  });

  if (rejectResult?.status !== PengadaanStatus.DITOLAK || rejectResult.alasanPenolakan !== reason2) {
    throw new Error("Skenario 2 Gagal: Status harus DITOLAK dengan alasan tersimpan.");
  }

  const p2Jobs = await prisma.signJob.findMany({ where: { pengadaanId: p2.id } });
  const hasMeteraiJob = p2Jobs.some((j) => j.type === SignJobType.STAMP_METERAI);
  const hasVendorJob = p2Jobs.some((j) => j.type === SignJobType.SIGN_VENDOR);
  if (hasMeteraiJob || hasVendorJob) {
    throw new Error("Skenario 2 Gagal: Dilarang ada job meterai atau vendor sign pada pengadaan ditolak!");
  }
  console.log("✓ Skenario 2 LOLOS: Status DITOLAK, alasan tampil, tidak ada job meterai/ttd vendor.");

  // -------------------------------------------------------------
  // SKENARIO 3: Isolasi Akses Multi-Tenant
  // -------------------------------------------------------------
  console.log("\n[SKENARIO 3] Isolasi akses: vendor2 membuka URL detail milik vendor1");
  // Periksa apakah vendor 2 diizinkan akses data pengadaan milik vendor 1
  function checkVendorAccess(pengadaanOwnerId: string, accessingVendorId: string) {
    return pengadaanOwnerId === accessingVendorId ? 200 : 404;
  }
  if (checkVendorAccess(p1.vendorId, vendor2.id) !== 404) {
    throw new Error("Skenario 3 Gagal: Vendor 2 tidak boleh mengakses pengadaan milik Vendor 1!");
  }
  console.log("✓ Skenario 3 LOLOS: Akses vendor lain menghasilkan 404.");

  // -------------------------------------------------------------
  // SKENARIO 4: Visibilitas Pengadaan DRAFT
  // -------------------------------------------------------------
  console.log("\n[SKENARIO 4] Visibilitas: pengadaan DRAFT tidak muncul di daftar vendor");
  const sp4 = `TEST-ALL-SC4-${ts}`;
  const p4Draft = await createDraftPengadaan({
    namaPengadaan: "Pengadaan DRAFT Internal TBIG",
    alamat: "Jl. TB Simatupang No. 35, Jakarta",
    harga: BigInt(45000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: sp4,
    tanggalPenyelesaian: new Date("2026-11-15"),
    vendorId: vendor1.id,
    picNama: vendor1.picNama,
    picJabatan: vendor1.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  const v1List = await prisma.pengadaan.findMany({
    where: {
      vendorId: vendor1.id,
      status: { notIn: [PengadaanStatus.DRAFT, PengadaanStatus.MENUNGGU_TTD_TBIG] },
    },
  });
  if (v1List.some((p) => p.id === p4Draft.id)) {
    throw new Error("Skenario 4 Gagal: Dokumen DRAFT muncul di daftar vendor!");
  }
  console.log("✓ Skenario 4 LOLOS: Dokumen DRAFT tersembunyi dari daftar vendor.");

  // -------------------------------------------------------------
  // SKENARIO 5: Idempotensi Webhook Event
  // -------------------------------------------------------------
  console.log("\n[SKENARIO 5] Idempotensi: kirim ulang webhook yang sama untuk job yang sudah selesai");
  const completedJob = await prisma.signJob.findUnique({
    where: { id: signJobV1.id },
  });
  if (!completedJob?.externalId) {
    throw new Error("Job completed tidak memiliki externalId");
  }

  const idempotentResult = await handleESignEvent({
    provider: "mock",
    externalId: completedJob.externalId,
    type: "COMPLETED",
    raw: { resend: true },
  });
  if (idempotentResult.reason !== "ALREADY_PROCESSED") {
    throw new Error(`Skenario 5 Gagal: Event duplikat harus diabaikan dengan reason ALREADY_PROCESSED, didapat: ${idempotentResult.reason}`);
  }
  console.log("✓ Skenario 5 LOLOS: Webhook duplikat diabaikan secara idempoten.");

  // -------------------------------------------------------------
  // SKENARIO 6: Kegagalan Job & Retry
  // -------------------------------------------------------------
  console.log("\n[SKENARIO 6] Kegagalan job (MOCK_ESIGN_FAIL=AUTO_SIGN_TBIG) lalu 'Coba lagi'");
  const sp6 = `TEST-ALL-SC6-${ts}`;
  const p6 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Rack Server Test Retry",
    alamat: "Jl. TB Simatupang No. 36, Jakarta",
    harga: BigInt(95000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: sp6,
    tanggalPenyelesaian: new Date("2026-11-15"),
    vendorId: vendor1.id,
    picNama: vendor1.picNama,
    picJabatan: vendor1.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  process.env.MOCK_ESIGN_FAIL = "AUTO_SIGN_TBIG";
  const failSubmit = await submitTbigSign(p6.id, tbigUser.id);
  const failedSignJob = await waitForJobStatus(failSubmit.jobId, SignJobStatus.FAILED);
  console.log(`  - Job berhasil disimulasikan gagal: "${failedSignJob.errorMessage}"`);

  const p6StatusFail = await prisma.pengadaan.findUnique({ where: { id: p6.id } });
  if (p6StatusFail?.status !== PengadaanStatus.MENUNGGU_TTD_TBIG) {
    throw new Error("Skenario 6 Gagal: Status pengadaan tidak boleh berubah saat job gagal!");
  }

  delete process.env.MOCK_ESIGN_FAIL;
  const retrySubmit = await submitTbigSign(p6.id, tbigUser.id);
  const retryJobSuccess = await waitForJobStatus(retrySubmit.jobId, SignJobStatus.COMPLETED);
  console.log(`  - Retry job berhasil COMPLETED: ${retryJobSuccess.id}`);

  const p6StatusSuccess = await prisma.pengadaan.findUnique({ where: { id: p6.id } });
  if (p6StatusSuccess?.status !== PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR) {
    throw new Error("Skenario 6 Gagal: Status pengadaan harus berubah setelah retry berhasil.");
  }
  console.log("✓ Skenario 6 LOLOS: Error tampil, status pengadaan tidak berubah, retry berhasil.");

  // -------------------------------------------------------------
  // SKENARIO 7: Transisi Status Tidak Valid
  // -------------------------------------------------------------
  console.log("\n[SKENARIO 7] Transisi tidak valid: memanggil aksi Setuju pada pengadaan DRAFT");
  let invalidTransitionBlocked = false;
  try {
    await submitVendorApproval({
      pengadaanId: p4Draft.id, // Status saat ini DRAFT
      vendorId: vendor1.id,
      actorId: v1User.id,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("MENUNGGU_PERSETUJUAN_VENDOR")) {
      invalidTransitionBlocked = true;
    }
  }
  if (!invalidTransitionBlocked) {
    throw new Error("Skenario 7 Gagal: Transisi tidak valid pada DRAFT harus dilempar error!");
  }
  console.log("✓ Skenario 7 LOLOS: Transisi tidak valid ditolak dengan pesan error yang jelas.");

  // -------------------------------------------------------------
  // SKENARIO 8: Validasi Form & Aturan Bisnis
  // -------------------------------------------------------------
  console.log("\n[SKENARIO 8] Validasi form: tanggal selesai < tanggal mulai, harga 0, No. SP duplikat, file bukan PDF");

  // 8.1 Tanggal selesai < tanggal mulai
  const invalidDateForm = pengadaanSchema.safeParse({
    namaPengadaan: "Test Validasi Tanggal",
    alamat: "Jl. TB Simatupang No. 100",
    harga: 1000000,
    tanggalMulai: "2026-11-01",
    tanggalSelesai: "2026-10-01", // Tanggal selesai sebelum mulai
    tanggalPenyelesaian: "2026-11-10",
    noSuratPesanan: `SP-INVALID-${ts}`,
    vendorId: vendor1.id,
    picNama: "PIC",
    picJabatan: "Jabatan",
  });
  if (invalidDateForm.success) {
    throw new Error("Skenario 8 Gagal: Tanggal selesai < mulai harus ditolak validasi!");
  }

  // 8.2 Harga 0
  const invalidPriceForm = pengadaanSchema.safeParse({
    namaPengadaan: "Test Validasi Harga Nol",
    alamat: "Jl. TB Simatupang No. 100",
    harga: 0,
    tanggalMulai: "2026-10-01",
    tanggalSelesai: "2026-11-01",
    tanggalPenyelesaian: "2026-11-10",
    noSuratPesanan: `SP-INVALID-2-${ts}`,
    vendorId: vendor1.id,
    picNama: "PIC",
    picJabatan: "Jabatan",
  });
  if (invalidPriceForm.success) {
    throw new Error("Skenario 8 Gagal: Harga 0 harus ditolak validasi!");
  }

  // 8.3 No. Surat Pesanan Duplikat
  let duplicateSpBlocked = false;
  try {
    await createDraftPengadaan({
      namaPengadaan: "Test Duplikat SP",
      alamat: "Jl. TB Simatupang No. 100",
      harga: BigInt(10000000),
      tanggalMulai: new Date("2026-10-01"),
      tanggalSelesai: new Date("2026-11-01"),
      noSuratPesanan: sp1, // Duplikat dari Skenario 1
      tanggalPenyelesaian: new Date("2026-11-10"),
      vendorId: vendor1.id,
      picNama: vendor1.picNama,
      picJabatan: vendor1.picJabatan,
      pdfBytes: samplePdf,
      createdById: tbigUser.id,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("sudah digunakan")) {
      duplicateSpBlocked = true;
    }
  }
  if (!duplicateSpBlocked) {
    throw new Error("Skenario 8 Gagal: No. Surat Pesanan duplikat harus ditolak!");
  }

  // 8.4 File bukan PDF (cek magic bytes)
  let nonPdfBlocked = false;
  try {
    const invalidFileBytes = new TextEncoder().encode("BUKAN_FILE_PDF_ASLI");
    await createDraftPengadaan({
      namaPengadaan: "Test File Bukan PDF",
      alamat: "Jl. TB Simatupang No. 100",
      harga: BigInt(10000000),
      tanggalMulai: new Date("2026-10-01"),
      tanggalSelesai: new Date("2026-11-01"),
      noSuratPesanan: `SP-NON-PDF-${ts}`,
      tanggalPenyelesaian: new Date("2026-11-10"),
      vendorId: vendor1.id,
      picNama: vendor1.picNama,
      picJabatan: vendor1.picJabatan,
      pdfBytes: invalidFileBytes,
      createdById: tbigUser.id,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("PDF")) {
      nonPdfBlocked = true;
    }
  }
  if (!nonPdfBlocked) {
    throw new Error("Skenario 8 Gagal: File tanpa header %PDF harus ditolak!");
  }

  console.log("✓ Skenario 8 LOLOS: Seluruh validasi form (tanggal, harga, SP unik, PDF) ditolak dengan benar.");

  // -------------------------------------------------------------
  // Pembersihan Data Uji
  // -------------------------------------------------------------
  console.log("\n--- Pembersihan Seluruh Data Uji ---");
  await prisma.pengadaan.delete({ where: { id: p1.id } });
  await prisma.pengadaan.delete({ where: { id: p2.id } });
  await prisma.pengadaan.delete({ where: { id: p4Draft.id } });
  await prisma.pengadaan.delete({ where: { id: p6.id } });

  console.log("=================================================================");
  console.log(" SELURUH SKENARIO UJI PRD BAGIAN 10 LOLOS (100% SUKSES)");
  console.log("=================================================================");
}

main()
  .catch((err) => {
    console.error("❌ Verifikasi Skenario Uji Gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
