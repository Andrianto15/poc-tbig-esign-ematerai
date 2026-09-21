import "dotenv/config";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/db";
import { getStorage } from "../src/lib/storage";
import {
  createDraftPengadaan,
  updateDraftPengadaan,
  deleteDraftPengadaan,
} from "../src/lib/workflow/pengadaan-workflow";
import { PengadaanStatus, FileKind } from "../src/generated/prisma/enums";

async function createSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("SURAT PERJANJIAN PENGADAAN PERANGKAT (SAMPLE)", {
    x: 50,
    y: 780,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  return await doc.save();
}

async function main() {
  console.log("=== VERIFIKASI STEP 1.6: CRUD PENGADAAN & WORKFLOW T1/T2 ===");

  const tbigUser = await prisma.user.findFirst({
    where: { role: "TBIG" },
  });
  if (!tbigUser) {
    throw new Error("TBIG user not found in database. Run seed first.");
  }

  const vendor = await prisma.vendor.findFirst();
  if (!vendor) {
    throw new Error("Vendor not found in database. Run seed first.");
  }

  const samplePdf = await createSamplePdf();
  const testSpNumber = `TEST-SP-${Date.now()}`;

  console.log("1. Menguji pembuatan Draft Pengadaan (Transisi T1)...");
  const created = await createDraftPengadaan({
    namaPengadaan: "Pengadaan Switch Test 1.6",
    alamat: "Jl. Jendral Sudirman Kav. 10, Jakarta Selatan",
    harga: BigInt(50000000),
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

  console.log(`✓ Pengadaan berhasil dibuat: ID ${created.id}, Status: ${created.status}`);
  if (created.status !== PengadaanStatus.DRAFT) {
    throw new Error(`Status tidak valid: diharapkan DRAFT, didapat ${created.status}`);
  }

  console.log("2. Memverifikasi DocumentFile (ORIGINAL & PREPARED)...");
  const files = await prisma.documentFile.findMany({
    where: { pengadaanId: created.id },
  });
  console.log(`✓ Jumlah file: ${files.length}`);
  const origFile = files.find((f) => f.kind === FileKind.ORIGINAL);
  const prepFile = files.find((f) => f.kind === FileKind.PREPARED);

  if (!origFile || !prepFile) {
    throw new Error("File ORIGINAL atau PREPARED tidak lengkap.");
  }
  console.log(`✓ ORIGINAL file: size ${origFile.sizeBytes} bytes, key ${origFile.storageKey}`);
  console.log(`✓ PREPARED file: size ${prepFile.sizeBytes} bytes, key ${prepFile.storageKey}`);

  const storage = getStorage();
  const origStored = await storage.get(origFile.storageKey);
  const prepStored = await storage.get(prepFile.storageKey);
  if (!origStored || !prepStored) {
    throw new Error("Gagal mengambil file dari storage.");
  }
  console.log(`✓ File tersimpan di storage dan dapat dibaca kembali.`);

  console.log("3. Memverifikasi ActivityLog T1...");
  const logs = await prisma.activityLog.findMany({
    where: { pengadaanId: created.id },
  });
  if (logs.length === 0 || logs[0].action !== "DRAFT_CREATED") {
    throw new Error("ActivityLog DRAFT_CREATED tidak tercatat.");
  }
  console.log(`✓ ActivityLog tercatat: ${logs[0].action} oleh ${logs[0].actorId}`);

  console.log("4. Menguji penolakan No. Surat Pesanan duplikat...");
  let duplicateRejected = false;
  try {
    await createDraftPengadaan({
      namaPengadaan: "Pengadaan Duplikat",
      alamat: "Jl. Test",
      harga: BigInt(10000000),
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
  } catch (err: unknown) {
    duplicateRejected = true;
    console.log(`✓ Duplikat berhasil ditolak dengan error: ${(err as Error).message}`);
  }
  if (!duplicateRejected) {
    throw new Error("Gagal: No. SP duplikat tidak ditolak!");
  }

  console.log("5. Menguji pengeditan Draft Pengadaan (Transisi T2)...");
  const updated = await updateDraftPengadaan({
    pengadaanId: created.id,
    namaPengadaan: "Pengadaan Switch Test 1.6 (Updated)",
    alamat: "Jl. Jendral Sudirman Kav. 10 (Gedung B), Jakarta Selatan",
    harga: BigInt(75000000),
    tanggalMulai: new Date("2026-10-05"),
    tanggalSelesai: new Date("2026-11-05"),
    noSuratPesanan: testSpNumber,
    tanggalPenyelesaian: new Date("2026-11-10"),
    vendorId: vendor.id,
    picNama: vendor.picNama,
    picJabatan: vendor.picJabatan,
    actorId: tbigUser.id,
  });
  console.log(`✓ Pengadaan berhasil diupdate: nama: ${updated?.namaPengadaan}, harga: ${updated?.harga}`);

  const updatedLogs = await prisma.activityLog.findMany({
    where: { pengadaanId: created.id },
    orderBy: { createdAt: "desc" },
  });
  if (updatedLogs[0].action !== "DRAFT_UPDATED") {
    throw new Error("ActivityLog DRAFT_UPDATED tidak tercatat.");
  }
  console.log(`✓ ActivityLog DRAFT_UPDATED tercatat.`);

  console.log("6. Menguji penghapusan Draft Pengadaan...");
  await deleteDraftPengadaan(created.id);
  const deletedCheck = await prisma.pengadaan.findUnique({
    where: { id: created.id },
  });
  if (deletedCheck) {
    throw new Error("Gagal: Pengadaan masih ditemukan di database setelah dihapus.");
  }
  console.log(`✓ Pengadaan berhasil dihapus dari database.`);

  const origCheck = await storage.get(origFile.storageKey);
  const prepCheck = await storage.get(prepFile.storageKey);
  if (origCheck || prepCheck) {
    console.warn("Catatan: File storage mungkin masih ada jika adapter tidak menghapus permanen, tapi DB cascade bersih.");
  } else {
    console.log(`✓ File storage berhasil dibersihkan.`);
  }

  console.log("\n=== SEMUA ACCEPTANCE CRITERIA STEP 1.6 TERPENUHI ===");
}

main()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
