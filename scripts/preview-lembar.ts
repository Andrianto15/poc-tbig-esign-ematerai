import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { generateLembarPengesahan, LembarPengesahanData } from "../src/lib/pdf/lembar-pengesahan";
import { LAYOUT, PAGE } from "../src/lib/pdf/signature-layout";

async function main() {
  console.log("=== Generate Preview Lembar Pengesahan (Step 1.5) ===");

  // 1. Buat dokumen PDF dasar (1 halaman dokumen pengadaan awal)
  const baseDoc = await PDFDocument.create();
  const basePage = baseDoc.addPage([PAGE.width, PAGE.height]);
  const fontBold = await baseDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await baseDoc.embedFont(StandardFonts.Helvetica);

  basePage.drawText("SURAT PERJANJIAN PENGADAAN BARANG & JASA", {
    x: 70,
    y: 750,
    size: 15,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  basePage.drawText("Ini adalah contoh halaman dokumen utama pengadaan TBIG.", {
    x: 70,
    y: 710,
    size: 11,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  basePage.drawText("Halaman berikutnya adalah Lembar Pengesahan yang ditambahkan secara otomatis.", {
    x: 70,
    y: 685,
    size: 11,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  const basePdfBytes = await baseDoc.save();

  // 2. Data dummy pengadaan
  const dummyData: LembarPengesahanData = {
    id: "pengadaan-demo-001",
    namaPengadaan: "Pengadaan Perangkat Server & Jaringan TBIG Wilayah Jabodetabek",
    alamat: "Gedung Menara Karya Lt. 19, Jl. H.R. Rasuna Said Blok X-5 Kav. 1-2, Jakarta Selatan",
    harga: BigInt(1250000000),
    tanggalMulai: new Date("2026-10-01"),
    tanggalSelesai: new Date("2026-12-31"),
    noSuratPesanan: "SP-TBIG/PROC/2026/09/0088",
    tanggalPenyelesaian: new Date("2027-01-15"),
    vendorNama: "PT Contoh Konstruksi Satu",
    picNama: "Budi Santoso",
    picJabatan: "Direktur Operasional",
    tbigSignerName: "Admin Pengadaan TBIG",
    createdAt: new Date(),
  };

  // 3. Generate PDF gabungan (halaman utama + Lembar Pengesahan)
  const finalPdfBytes = await generateLembarPengesahan(basePdfBytes, dummyData);

  // 4. Simpan ke ./.tmp/
  const tmpDir = path.resolve("./.tmp");
  await fs.mkdir(tmpDir, { recursive: true });

  const outputPath = path.join(tmpDir, "preview-lembar-pengesahan.pdf");
  await fs.writeFile(outputPath, finalPdfBytes);

  console.log(`✓ PDF berhasil dibuat di: ${outputPath}`);
  console.log(`✓ Total halaman: 2 (Halaman 1: Dokumen Utama, Halaman 2: Lembar Pengesahan)`);
  console.log("✓ Koordinat Box pada Lembar Pengesahan:");
  console.log("  - TBIG Signature  :", LAYOUT.tbigSignature);
  console.log("  - Vendor eMeterai :", LAYOUT.vendorMeterai);
  console.log("  - Vendor Signature:", LAYOUT.vendorSignature);
  console.log("=== Preview Berhasil Selesai ===");
}

main().catch((err) => {
  console.error("Gagal membuat preview:", err);
  process.exit(1);
});
