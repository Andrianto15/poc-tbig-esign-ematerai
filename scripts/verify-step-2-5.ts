// Bypass error server-only saat dijalankan di luar bundler Next.js
// @ts-expect-error bypass server-only for standalone script runner
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
};

import "dotenv/config";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db";
import { FileKind, PengadaanStatus, SignJobStatus, SignJobType } from "@/generated/prisma/enums";

async function main() {
  console.log("==================================================");
  console.log("Verifikasi Step 2.5 — Fallback Polling (Cek Status)");
  console.log("==================================================");

  // Ambil user TBIG dan Vendor
  const tbigUser = await prisma.user.findFirst({ where: { role: "TBIG" } });
  if (!tbigUser) throw new Error("User TBIG tidak ditemukan di DB.");

  const vendor = await prisma.vendor.findFirst();
  if (!vendor) throw new Error("Vendor tidak ditemukan di DB.");

  const { createDraftPengadaan } = await import("@/lib/workflow/pengadaan-workflow");
  const { syncPengadaanJobStatus } = await import("@/lib/workflow/sync-status");

  // 1. Buat PDF contoh dan Draft Pengadaan
  console.log("\n[1/4] Membuat pengadaan uji dan job tanda tangan...");
  const samplePdf = await PDFDocument.create().then((doc) => {
    doc.addPage([595, 842]);
    return doc.save();
  });

  const ts = Date.now();
  const draft = await createDraftPengadaan({
    namaPengadaan: "Uji Fallback Polling Step 2.5",
    alamat: "Jl. TB Simatupang No. 25, Jakarta",
    harga: BigInt(25000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: `SP-POLL-${ts}`,
    tanggalPenyelesaian: new Date("2026-11-05"),
    vendorId: vendor.id,
    picNama: vendor.picNama,
    picJabatan: vendor.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  const testExternalId = `poll-test-${ts}`;

  // Buat SignJob dengan status PENDING dan createdAt dibuat 2 menit yang lalu (memenuhi syarat >1 menit)
  const twoMinutesAgo = new Date(Date.now() - 120 * 1000);
  const signJob = await prisma.signJob.create({
    data: {
      pengadaanId: draft.id,
      provider: "mekari",
      type: SignJobType.AUTO_SIGN_TBIG,
      status: SignJobStatus.PENDING,
      externalId: testExternalId,
      inputFileKind: FileKind.PREPARED,
      outputFileKind: FileKind.SIGNED_TBIG,
      createdAt: twoMinutesAgo,
    },
  });

  await prisma.pengadaan.update({
    where: { id: draft.id },
    data: { status: PengadaanStatus.MENUNGGU_TTD_TBIG },
  });

  console.log(`  ✅ Pengadaan dibuat: id=${draft.id}`);
  console.log(`  ✅ SignJob dibuat: id=${signJob.id}, externalId=${testExternalId}, status=PENDING (>1 menit lalu)`);

  // 2. Simulasikan Webhook Gagal / Dimatikan (Token Salah)
  console.log("\n[2/4] Mensimulasikan webhook dimatikan (token salah)...");
  const { POST } = await import("@/app/api/webhooks/esign/route");
  const { NextRequest } = await import("next/server");

  const badWebhookReq = new NextRequest(
    "http://localhost:3000/api/webhooks/esign?token=TOKEN_SALAH_DISENGAJA",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId: testExternalId, type: "COMPLETED" }),
    }
  );

  const webhookRes = await POST(badWebhookReq);
  if (webhookRes.status !== 401) {
    throw new Error(`Webhook harusnya ditolak dengan 401, didapat: ${webhookRes.status}`);
  }
  console.log("  ✅ Webhook ditolak (HTTP 401). Webhook terbukti tidak memperbarui status.");

  // Pastikan status job masih PENDING di database
  const jobStillPending = await prisma.signJob.findUnique({
    where: { id: signJob.id },
  });
  if (jobStillPending?.status !== SignJobStatus.PENDING) {
    throw new Error("Job seharusnya masih PENDING karena webhook ditolak.");
  }
  console.log("  ✅ Terkonfirmasi: SignJob masih berstatus PENDING di database.");

  // 3. Uji Polling Ketika Dokumen Masih Dalam Proses (getStatus return null)
  console.log("\n[3/4] Menguji Polling saat dokumen in-progress...");
  const inProgressResult = await syncPengadaanJobStatus(draft.id);
  console.log("  Hasil polling in-progress:", inProgressResult.message);
  if (inProgressResult.updated) {
    throw new Error("Polling seharusnya tidak memperbarui status jika dokumen belum selesai.");
  }
  console.log("  ✅ Dokumen in-progress ditangani dengan benar (tanpa transisi prematur).");

  // 4. Uji Pembaruan Status via Fallback Polling saat Dokumen Selesai
  console.log("\n[4/4] Menguji Pembaruan Status saat Dokumen Selesai di Penyedia...");
  const { getESignProvider } = await import("@/lib/esign");
  const provider = getESignProvider();
  const originalGetStatus = provider.getStatus;
  const originalDownload = provider.downloadDocument;

  // Stub getStatus & downloadDocument untuk mensimulasikan penyedia menyelesaikan dokumen
  provider.getStatus = async (id: string) => ({
    provider: "mekari",
    externalId: id,
    type: "COMPLETED",
    raw: {},
  });
  provider.downloadDocument = async () => samplePdf;

  try {
    const syncResult = await syncPengadaanJobStatus(draft.id);
    console.log("  Hasil Polling saat Selesai:", syncResult);

    if (!syncResult.success || !syncResult.updated) {
      throw new Error(`Fallback polling gagal memperbarui status: ${syncResult.message}`);
    }

    // Verifikasi perubahan status SignJob di database
    const jobAfterPoll = await prisma.signJob.findUnique({
      where: { id: signJob.id },
    });
    if (jobAfterPoll?.status !== SignJobStatus.COMPLETED) {
      throw new Error(`Status job harusnya COMPLETED, didapat: ${jobAfterPoll?.status}`);
    }
    console.log("  ✅ SignJob berhasil diperbarui menjadi COMPLETED melalui polling.");

    // Verifikasi perubahan status Pengadaan
    const pengadaanAfterPoll = await prisma.pengadaan.findUnique({
      where: { id: draft.id },
      include: { files: true },
    });
    if (pengadaanAfterPoll?.status !== PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR) {
      throw new Error(
        `Status pengadaan harusnya MENUNGGU_PERSETUJUAN_VENDOR, didapat: ${pengadaanAfterPoll?.status}`
      );
    }
    console.log(
      `  ✅ Pengadaan berhasil bertransisi ke: ${pengadaanAfterPoll.status}`
    );

    const hasSignedFile = pengadaanAfterPoll.files.some(
      (f) => f.kind === FileKind.SIGNED_TBIG
    );
    if (!hasSignedFile) {
      throw new Error("File SIGNED_TBIG tidak ditemukan pada pengadaan.");
    }
    console.log("  ✅ Dokumen SIGNED_TBIG berhasil diunduh dan tersimpan di database.");
  } finally {
    // Kembalikan method asli provider
    provider.getStatus = originalGetStatus;
    provider.downloadDocument = originalDownload;
  }

  // 5. Bersihkan data uji
  console.log("\n[Cleanup] Membersihkan data pengadaan uji...");
  await prisma.pengadaan.delete({
    where: { id: draft.id },
  });
  console.log("  ✅ Data uji dibersihkan.");

  console.log("\n==================================================");
  console.log("🎉 SELURUH VERIFIKASI STEP 2.5 BERHASIL (100%)!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("\n❌ Verifikasi Step 2.5 Gagal:", err);
  process.exit(1);
});
