import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/db";
import { getStorage } from "../src/lib/storage";
import { buildMockStorageKey } from "../src/lib/storage/types";
import { getESignProvider } from "../src/lib/esign";
import {
  createDraftPengadaan,
  submitTbigSign,
} from "../src/lib/workflow/pengadaan-workflow";
import { handleESignEvent } from "../src/lib/workflow/handle-esign-event";
import { PengadaanStatus, FileKind, SignJobStatus } from "../src/generated/prisma/enums";

async function createSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("SURAT PERJANJIAN PENGADAAN (UJI STEP 1.7)", {
    x: 50,
    y: 780,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  return await doc.save();
}

async function main() {
  console.log("=== VERIFIKASI STEP 1.7: ESignProvider, MockESignProvider & handleESignEvent ===");

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
  const testSpNumber = `TEST-SP-17-${Date.now()}`;

  // 1. Buat Draft Pengadaan
  console.log("1. Membuat Draft Pengadaan untuk pengujian...");
  const draft = await createDraftPengadaan({
    namaPengadaan: "Uji Coba AutoSign Step 1.7",
    alamat: "Jl. TB Simatupang Kav. 1, Jakarta Selatan",
    harga: BigInt(75000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-11-01"),
    noSuratPesanan: testSpNumber,
    tanggalPenyelesaian: new Date("2026-11-05"),
    vendorId: vendor.id,
    picNama: vendor.picNama,
    picJabatan: vendor.picJabatan,
    pdfBytes: samplePdf,
    createdById: tbigUser.id,
  });

  console.log(`✓ Draft Pengadaan dibuat: ID ${draft.id}, Status: ${draft.status}`);

  // 2. Submit Auto Sign TBIG (Transisi T3)
  console.log("2. Memanggil submitTbigSign (Transisi T3: DRAFT -> MENUNGGU_TTD_TBIG)...");
  const { jobId, externalId } = await submitTbigSign(draft.id, tbigUser.id);
  console.log(`✓ SignJob dibuat: ID ${jobId}, externalId: ${externalId}`);

  const pengadaanAfterSubmit = await prisma.pengadaan.findUnique({
    where: { id: draft.id },
  });
  if (pengadaanAfterSubmit?.status !== PengadaanStatus.MENUNGGU_TTD_TBIG) {
    throw new Error(`Status tidak sesuai: diharapkan MENUNGGU_TTD_TBIG, didapat ${pengadaanAfterSubmit?.status}`);
  }
  console.log(`✓ Status pengadaan berhasil diperbarui ke: ${pengadaanAfterSubmit.status}`);

  // 3. Verifikasi file mock tersimpan di storage provider
  const provider = getESignProvider();
  console.log(`✓ Provider aktif: ${provider.name}`);
  const downloadedMock = await provider.downloadDocument(externalId);
  if (!downloadedMock || downloadedMock.byteLength === 0) {
    throw new Error("Gagal mengunduh dokumen mock dari provider storage.");
  }
  console.log(`✓ Dokumen mock tersimpan di storage: ${downloadedMock.byteLength} bytes`);

  // 4. Tunggu jeda asinkron simulasi event (delay mock provider)
  const delayMs = parseInt(process.env.MOCK_ESIGN_DELAY_MS || "2000", 10);
  console.log(`3. Menunggu eksekusi scheduled event mock provider (${delayMs} ms + buffer)...`);
  await new Promise((resolve) => setTimeout(resolve, delayMs + 600));

  // 5. Periksa status SignJob dan Pengadaan setelah handleESignEvent berjalan
  console.log("4. Memverifikasi efek pemrosesan handleESignEvent...");
  const jobAfterEvent = await prisma.signJob.findUnique({
    where: { id: jobId },
  });
  if (jobAfterEvent?.status !== SignJobStatus.COMPLETED) {
    throw new Error(`SignJob belum COMPLETED! Status saat ini: ${jobAfterEvent?.status}`);
  }
  console.log(`✓ SignJob berhasil berubah status ke: ${jobAfterEvent.status}, completedAt: ${jobAfterEvent.completedAt?.toISOString()}`);

  const pengadaanAfterEvent = await prisma.pengadaan.findUnique({
    where: { id: draft.id },
    include: { files: true, logs: true },
  });
  if (pengadaanAfterEvent?.status !== PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR) {
    throw new Error(`Status Pengadaan salah: diharapkan MENUNGGU_PERSETUJUAN_VENDOR, didapat ${pengadaanAfterEvent?.status}`);
  }
  if (!pengadaanAfterEvent.tbigSignedAt) {
    throw new Error("tbigSignedAt belum terisi!");
  }
  console.log(`✓ Status Pengadaan berubah ke: ${pengadaanAfterEvent.status} (Transisi T4 sukses)`);
  console.log(`✓ tbigSignedAt terisi: ${pengadaanAfterEvent.tbigSignedAt.toISOString()}`);

  // 6. Verifikasi file SIGNED_TBIG tersimpan di storage & periksa visual tanda tangan
  const signedFile = pengadaanAfterEvent.files.find((f) => f.kind === FileKind.SIGNED_TBIG);
  if (!signedFile) {
    throw new Error("DocumentFile SIGNED_TBIG tidak ditemukan!");
  }
  console.log(`✓ DocumentFile SIGNED_TBIG tercatat: key ${signedFile.storageKey}, size ${signedFile.sizeBytes} bytes`);

  const storage = getStorage();
  const storedBytes = await storage.get(signedFile.storageKey);
  if (!storedBytes) {
    throw new Error("File SIGNED_TBIG tidak ditemukan di storage!");
  }

  const loadedDoc = await PDFDocument.load(storedBytes);
  const pageCount = loadedDoc.getPageCount();
  console.log(`✓ Dokumen hasil berhasil dimuat dengan pdf-lib: ${pageCount} halaman`);

  // Simpan output ke .tmp untuk verifikasi visual
  const tmpDir = path.resolve(process.cwd(), ".tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const previewPath = path.join(tmpDir, "verify-step-1-7-signed.pdf");
  fs.writeFileSync(previewPath, storedBytes);
  console.log(`✓ Dokumen bertanda tangan simulasi disimpan ke: ${previewPath}`);

  // 7. Verifikasi idempotensi handleESignEvent
  console.log("5. Menguji idempotensi handleESignEvent...");
  const duplicateResult = await handleESignEvent({
    provider: "mock",
    externalId,
    type: "COMPLETED",
    raw: { duplicate: true },
  });
  if (duplicateResult.reason !== "ALREADY_PROCESSED") {
    throw new Error(`Idempotensi gagal: didapat reason ${duplicateResult.reason}`);
  }
  console.log(`✓ Event duplikat diabaikan secara idempoten (reason: ${duplicateResult.reason})`);

  // 8. Verifikasi parseWebhook mock
  console.log("6. Menguji parser parseWebhook mock...");
  const mockWebhookReq = new Request("http://localhost:3000/api/webhooks/esign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      externalId: "mock-test-webhook",
      type: "COMPLETED",
    }),
  });
  const parsed = await provider.parseWebhook(mockWebhookReq);
  if (!parsed || parsed.externalId !== "mock-test-webhook" || parsed.type !== "COMPLETED") {
    throw new Error("parseWebhook mock tidak menghasilkan ESignEvent yang valid.");
  }
  console.log(`✓ parseWebhook berhasil mem-parse payload mock: externalId=${parsed.externalId}, type=${parsed.type}`);

  // 9. Bersihkan data uji
  console.log("7. Membersihkan data uji pengadaan...");
  await prisma.pengadaan.delete({
    where: { id: draft.id },
  });
  for (const f of pengadaanAfterEvent.files) {
    try {
      await storage.delete(f.storageKey);
    } catch {
      // ignore
    }
  }
  try {
    await storage.delete(buildMockStorageKey(externalId));
  } catch {
    // ignore
  }

  console.log("=== SELURUH VERIFIKASI STEP 1.7 LOLOS (100%) ===");
}

main()
  .catch((err) => {
    console.error("❌ Verifikasi Step 1.7 Gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
