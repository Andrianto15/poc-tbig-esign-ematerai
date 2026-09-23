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
process.env.MOCK_ESIGN_DELAY_MS = "200";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/db";
import {
  PengadaanStatus,
  SignJobStatus,
  SignJobType,
} from "../src/generated/prisma/enums";

async function createSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("SURAT PESANAN UJI TBIG IN-APP OTP SIGNING", {
    x: 50,
    y: 780,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  return await doc.save();
}

async function main() {
  const {
    createDraftPengadaan,
    submitPengadaanToVendor,
    submitVendorApproval,
  } = await import("../src/lib/workflow/pengadaan-workflow");

  const {
    requestVendorOtpAction,
    submitVendorOtpSignAction,
  } = await import("../src/app/(vendor)/actions");

  const {
    requestTbigOtpAction,
    submitTbigOtpSignAction,
  } = await import("../src/app/(tbig)/actions");

  console.log("==================================================================");
  console.log("Uji Verifikasi In-App OTP Signing TBIG (is_autosign: false)");
  console.log("==================================================================");

  const tbigUser = await prisma.user.findFirst({ where: { role: "TBIG" } });
  const vendorUser = await prisma.user.findFirst({
    where: { role: "VENDOR" },
    include: { vendor: true },
  });

  if (!tbigUser || !vendorUser || !vendorUser.vendor) {
    throw new Error("User uji tidak lengkap di database.");
  }

  const samplePdf = await createSamplePdf();
  const ts = Date.now();
  const noSP = `SP-TBIG-OTP-${ts}`;

  // 1. Buat Pengadaan DRAFT & Kirim ke Vendor
  console.log("\n[1/6] Membuat Pengadaan & Kirim ke Vendor...");
  const draft = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Uji OTP TBIG In-App",
    alamat: "Jl. TB Simatupang No. 12",
    harga: BigInt(85000000),
    tanggalMulai: new Date(),
    tanggalSelesai: new Date(),
    noSuratPesanan: noSP,
    tanggalPenyelesaian: new Date(),
    vendorId: vendorUser.vendor.id,
    picNama: vendorUser.vendor.picNama,
    picJabatan: vendorUser.vendor.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  await submitPengadaanToVendor(draft.id, tbigUser.id);
  console.log(`✓ Pengadaan diajukan ke Vendor (ID: ${draft.id}, Status: MENUNGGU_PERSETUJUAN_VENDOR)`);

  // 2. Vendor Menyetujui Pengadaan -> Buat Single Multi-Signer Envelope
  console.log("\n[2/6] Vendor menyetujui pengadaan (Multi-Signer Envelope)...");
  await submitVendorApproval({
    pengadaanId: draft.id,
    vendorId: vendorUser.vendor.id,
    actorId: vendorUser.id,
  });

  const job = await prisma.signJob.findFirst({
    where: { pengadaanId: draft.id, type: SignJobType.SIGN_VENDOR },
  });

  if (!job) throw new Error("SignJob tidak ditemukan!");
  console.log(`✓ SignJob terbentuk: ${job.id}`);
  console.log(`  - Status: ${job.status}`);
  console.log(`  - Vendor Signer ID: ${job.signerId}`);
  console.log(`  - TBIG Signer ID: ${job.tbigSignerId}`);

  if (!job.tbigSignerId) {
    throw new Error("FAIL: tbigSignerId tidak tersimpan pada SignJob!");
  }

  // 3. Vendor Menandatangani via In-App OTP
  console.log("\n[3/6] Vendor meminta OTP & memverifikasi...");
  (globalThis as unknown as Record<string, unknown>).__MOCK_SESSION__ = {
    isLoggedIn: true,
    userId: vendorUser.id,
    email: vendorUser.email,
    nama: vendorUser.nama,
    role: "VENDOR",
    vendorId: vendorUser.vendor.id,
  };

  const vendorOtpReq = await requestVendorOtpAction(draft.id);
  console.log(`✓ Vendor request OTP: mockOtp=${vendorOtpReq.mockOtp}`);

  const vendorSignRes = await submitVendorOtpSignAction(draft.id, "123456");
  if (vendorSignRes.error) throw new Error(`Vendor sign error: ${vendorSignRes.error}`);
  console.log("✓ Vendor berhasil menandatangani in-app via OTP");

  // Periksa bahwa pengadaan BELUM SELESAI karena TBIG belum tanda tangan
  const afterVendor = await prisma.pengadaan.findUnique({ where: { id: draft.id } });
  console.log(`  - Status setelah Vendor sign: ${afterVendor?.status}`);
  console.log(`  - vendorSignedAt: ${afterVendor?.vendorSignedAt?.toISOString()}`);
  console.log(`  - tbigSignedAt: ${afterVendor?.tbigSignedAt ? "SUDAH" : "BELUM (menunggu TBIG)"}`);

  if (afterVendor?.status === PengadaanStatus.SELESAI) {
    throw new Error("FAIL: Pengadaan premature SELESAI padahal TBIG belum sign!");
  }

  // 4. TBIG Menandatangani via In-App OTP
  console.log("\n[4/6] TBIG meminta OTP & memverifikasi...");
  (globalThis as unknown as Record<string, unknown>).__MOCK_SESSION__ = {
    isLoggedIn: true,
    userId: tbigUser.id,
    email: tbigUser.email,
    nama: tbigUser.nama,
    role: "TBIG",
  };

  const tbigOtpReq = await requestTbigOtpAction(draft.id);
  console.log(`✓ TBIG request OTP: mockOtp=${tbigOtpReq.mockOtp}, targetEmail=${tbigOtpReq.email}`);

  const tbigSignRes = await submitTbigOtpSignAction(draft.id, "123456");
  if (tbigSignRes.error) throw new Error(`TBIG sign error: ${tbigSignRes.error}`);
  console.log("✓ TBIG berhasil menandatangani in-app via OTP");

  // 5. Periksa Status Akhir Pengadaan
  console.log("\n[5/6] Verifikasi finalisasi dokumen...");
  const finalPengadaan = await prisma.pengadaan.findUnique({
    where: { id: draft.id },
    include: { files: true, jobs: true, logs: true },
  });

  console.log(`✓ Status Pengadaan: ${finalPengadaan?.status}`);
  console.log(`✓ Vendor Signed At: ${finalPengadaan?.vendorSignedAt?.toISOString()}`);
  console.log(`✓ TBIG Signed At:   ${finalPengadaan?.tbigSignedAt?.toISOString()}`);

  if (finalPengadaan?.status !== PengadaanStatus.SELESAI) {
    throw new Error(`FAIL: Status akhir bukan SELESAI (status: ${finalPengadaan?.status})`);
  }

  const finalFile = finalPengadaan.files.find((f) => f.kind === "FINAL");
  if (!finalFile) {
    throw new Error("FAIL: Dokumen file FINAL tidak ditemukan!");
  }
  console.log(`✓ Dokumen FINAL tersimpan: ${finalFile.storageKey} (${finalFile.sizeBytes} bytes)`);

  // 6. Verifikasi Audit Log
  console.log("\n[6/6] Verifikasi Activity Log...");
  const actions = finalPengadaan.logs.map((l) => l.action);
  console.log("Action logs:", actions);
  if (!actions.includes("VENDOR_SIGNED_OTP") || !actions.includes("TBIG_SIGNED_OTP")) {
    throw new Error("FAIL: Log VENDOR_SIGNED_OTP atau TBIG_SIGNED_OTP tidak tercatat!");
  }

  console.log("\n==================================================================");
  console.log("Uji Skenario 2: TBIG Tanda Tangan Dulu, Baru Vendor Tanda Tangan");
  console.log("==================================================================");

  const noSP2 = `SP-TBIG-FIRST-${Date.now()}`;
  const draft2 = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Uji OTP TBIG First",
    alamat: "Jl. TB Simatupang No. 12",
    harga: BigInt(90000000),
    tanggalMulai: new Date(),
    tanggalSelesai: new Date(),
    noSuratPesanan: noSP2,
    tanggalPenyelesaian: new Date(),
    vendorId: vendorUser.vendor.id,
    picNama: vendorUser.vendor.picNama,
    picJabatan: vendorUser.vendor.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  await submitPengadaanToVendor(draft2.id, tbigUser.id);
  await submitVendorApproval({
    pengadaanId: draft2.id,
    vendorId: vendorUser.vendor.id,
    actorId: vendorUser.id,
  });

  // TBIG signs first
  console.log("[1/3] TBIG menandatangani terlebih dahulu...");
  (globalThis as unknown as Record<string, unknown>).__MOCK_SESSION__ = {
    isLoggedIn: true,
    userId: tbigUser.id,
    email: tbigUser.email,
    nama: tbigUser.nama,
    role: "TBIG",
  };
  const tbigSignRes2 = await submitTbigOtpSignAction(draft2.id, "123456");
  if (tbigSignRes2.error) throw new Error(`TBIG sign error: ${tbigSignRes2.error}`);

  const midPengadaan = await prisma.pengadaan.findUnique({ where: { id: draft2.id } });
  console.log(`✓ Status setelah TBIG sign: ${midPengadaan?.status}`);
  console.log(`  - tbigSignedAt: ${midPengadaan?.tbigSignedAt?.toISOString()}`);
  console.log(`  - vendorSignedAt: ${midPengadaan?.vendorSignedAt ? "SUDAH" : "BELUM (menunggu Vendor)"}`);

  if (midPengadaan?.status === PengadaanStatus.SELESAI) {
    throw new Error("FAIL: Pengadaan premature SELESAI padahal Vendor belum sign!");
  }

  // Vendor signs second
  console.log("[2/3] Vendor menandatangani berikutnya...");
  (globalThis as unknown as Record<string, unknown>).__MOCK_SESSION__ = {
    isLoggedIn: true,
    userId: vendorUser.id,
    email: vendorUser.email,
    nama: vendorUser.nama,
    role: "VENDOR",
    vendorId: vendorUser.vendor.id,
  };
  const vendorSignRes2 = await submitVendorOtpSignAction(draft2.id, "123456");
  if (vendorSignRes2.error) throw new Error(`Vendor sign error: ${vendorSignRes2.error}`);

  // Verify final status
  console.log("[3/3] Verifikasi finalisasi dokumen...");
  const finalPengadaan2 = await prisma.pengadaan.findUnique({
    where: { id: draft2.id },
    include: { files: true },
  });
  console.log(`✓ Status Pengadaan: ${finalPengadaan2?.status}`);
  if (finalPengadaan2?.status !== PengadaanStatus.SELESAI) {
    throw new Error(`FAIL: Status akhir bukan SELESAI (status: ${finalPengadaan2?.status})`);
  }

  console.log("\n==================================================================");
  console.log("🎉 SEMUA PENGUJIAN IN-APP OTP TBIG (KEDUA SKENARIO) BERHASIL!");
  console.log("==================================================================");
}

main()
  .catch((err) => {
    console.error("❌ Terjadi Error Pengujian:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
