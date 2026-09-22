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
  page.drawText("SURAT PESANAN UJI IN-APP OTP SIGNING", {
    x: 50,
    y: 780,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  return await doc.save();
}

async function waitForSignJob(pengadaanId: string, type: SignJobType, status: SignJobStatus) {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const job = await prisma.signJob.findFirst({
      where: { pengadaanId, type, status },
    });
    if (job) return job;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for job ${type} with status ${status}`);
}

async function main() {
  (globalThis as unknown as Record<string, unknown>).__MOCK_SESSION__ = {
    isLoggedIn: true,
    userId: "test",
    email: "test@poc.local",
    nama: "Test User",
    role: "VENDOR",
    vendorId: "test-vendor",
  };

  const {
    createDraftPengadaan,
    submitPengadaanToVendor,
    submitVendorApproval,
  } = await import("../src/lib/workflow/pengadaan-workflow");

  const {
    requestVendorOtpAction,
    submitVendorOtpSignAction,
  } = await import("../src/app/(vendor)/actions");

  console.log("==================================================================");
  console.log("Uji Verifikasi In-App OTP Signing Vendor & Beban eMeterai");
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
  const noSP = `SP-OTP-TEST-${ts}`;

  // 1. Buat Pengadaan DRAFT & Kirim ke Vendor
  console.log("\n[1/5] Membuat Pengadaan & Kirim ke Vendor...");
  const draft = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Uji OTP In-App",
    alamat: "Jl. TB Simatupang No. 12",
    harga: BigInt(75000000),
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
  console.log(`  ✓ Pengadaan siap: ${draft.id} (Status: MENUNGGU_PERSETUJUAN_VENDOR)`);

  // 2. Vendor Setuju -> Memicu eMeterai
  console.log("\n[2/5] Vendor menyetujui pengadaan (Transisi T5)...");
  (globalThis as unknown as Record<string, unknown>).__MOCK_SESSION__ = {
    isLoggedIn: true,
    userId: vendorUser.id,
    email: vendorUser.email,
    nama: vendorUser.vendor.picNama,
    role: "VENDOR",
    vendorId: vendorUser.vendor.id,
  };

  await submitVendorApproval({
    pengadaanId: draft.id,
    vendorId: vendorUser.vendor.id,
    actorId: vendorUser.id,
  });

  // Tunggu STAMP_METERAI selesai & SIGN_VENDOR aktif
  console.log("  Menunggu pembubuhan eMeterai selesai...");
  await waitForSignJob(draft.id, SignJobType.STAMP_METERAI, SignJobStatus.COMPLETED);
  const signVendorJob = await waitForSignJob(
    draft.id,
    SignJobType.SIGN_VENDOR,
    SignJobStatus.WAITING_SIGNER
  );
  console.log(`  ✓ eMeterai selesai, SIGN_VENDOR job aktif: ${signVendorJob.id}`);

  // 3. Uji Server Action: requestVendorOtpAction
  console.log("\n[3/5] Menguji requestVendorOtpAction (Request OTP In-App)...");
  const otpReqRes = await requestVendorOtpAction(draft.id);
  if (otpReqRes.error) {
    throw new Error(`requestVendorOtpAction gagal: ${otpReqRes.error}`);
  }
  console.log(`  ✓ OTP Berhasil diminta untuk email: ${otpReqRes.email}`);
  console.log(`  ✓ Mode Mock: ${otpReqRes.isMock}, Mock OTP Hint: ${otpReqRes.mockOtp}`);

  // 4. Uji submitVendorOtpSignAction dengan OTP Salah
  console.log("\n[4/5] Menguji submitVendorOtpSignAction dengan OTP salah (999999)...");
  const wrongOtpRes = await submitVendorOtpSignAction(draft.id, "999999");
  if (!wrongOtpRes.error) {
    throw new Error("submitVendorOtpSignAction seharusnya gagal dengan OTP salah!");
  }
  console.log(`  ✓ Ditolak sesuai ekspektasi: "${wrongOtpRes.error}"`);

  // 5. Uji submitVendorOtpSignAction dengan OTP Benar (123456)
  console.log("\n[5/5] Menguji submitVendorOtpSignAction dengan OTP benar (123456)...");
  const validOtpRes = await submitVendorOtpSignAction(draft.id, "123456");
  if (validOtpRes.error) {
    throw new Error(`submitVendorOtpSignAction gagal: ${validOtpRes.error}`);
  }

  // Verifikasi job selesai dan status pengadaan maju ke MENUNGGU_TTD_TBIG
  const finishedPengadaan = await prisma.pengadaan.findUnique({
    where: { id: draft.id },
    include: { logs: true },
  });

  if (finishedPengadaan?.status !== PengadaanStatus.MENUNGGU_TTD_TBIG) {
    throw new Error(
      `Status pengadaan harus MENUNGGU_TTD_TBIG, didapat: ${finishedPengadaan?.status}`
    );
  }
  console.log(`  ✓ Status pengadaan maju ke: ${finishedPengadaan.status}`);

  // Verifikasi ActivityLog mencatat pembebanan eMeterai ke vendor
  const vendorSignedLog = finishedPengadaan.logs.find(
    (l) => l.action === "VENDOR_SIGNED"
  );
  console.log(`  ✓ Log VENDOR_SIGNED tercatat: "${vendorSignedLog?.note}"`);

  if (!vendorSignedLog?.note?.includes("bebankan ke akun Vendor")) {
    throw new Error("ActivityLog harus mencatat kuota eMeterai dibebankan ke Vendor!");
  }

  // Tunggu AUTO_SIGN_TBIG selesai jika terpicu agar timer mock tidak error
  const autoSignJob = await prisma.signJob.findFirst({
    where: { pengadaanId: draft.id, type: SignJobType.AUTO_SIGN_TBIG },
  });
  if (autoSignJob) {
    await waitForSignJob(draft.id, SignJobType.AUTO_SIGN_TBIG, SignJobStatus.COMPLETED);
  }

  // Bersihkan data uji
  await prisma.pengadaan.delete({ where: { id: draft.id } });

  console.log("\n==================================================================");
  console.log("🎉 SELURUH PENGUJIAN IN-APP OTP SIGNING VENDOR BERHASIL 100%!");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("\n❌ Uji In-App OTP Signing Gagal:", err);
  process.exit(1);
});
