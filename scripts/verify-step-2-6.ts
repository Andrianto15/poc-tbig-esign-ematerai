import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber } from "pdf-lib";
import { PAGE, LAYOUT, toPdfLibCoordinates, toMekariAnnotation, Box } from "@/lib/pdf/signature-layout";
import { generateLembarPengesahan } from "@/lib/pdf/lembar-pengesahan";

async function main() {
  console.log("==================================================");
  console.log("Verifikasi Step 2.6 — Verifikasi Koordinat Anotasi");
  console.log("==================================================");

  // 1. Verifikasi Konsistensi Matematis Antara pdf-lib dan toMekariAnnotation
  console.log("\n[1/3] Verifikasi keselarasan matematis Lembar Pengesahan vs Anotasi Mekari...");

  const boxes: Array<{ name: string; box: Box; typeOf: "signature" | "emeterai" }> = [
    { name: "Tanda Tangan TBIG", box: LAYOUT.tbigSignature, typeOf: "signature" },
    { name: "e-Meterai", box: LAYOUT.vendorMeterai, typeOf: "emeterai" },
    { name: "Tanda Tangan Vendor", box: LAYOUT.vendorSignature, typeOf: "signature" },
  ];

  for (const item of boxes) {
    const mekari = toMekariAnnotation(item.box, 1, item.typeOf);
    const pdfLib = toPdfLibCoordinates(item.box, PAGE.height);

    // Mekari top-left ke native PDF bottom-left:
    // x1 = position_x
    // y1 = canvas_height - position_y - element_height
    // x2 = position_x + element_width
    // y2 = canvas_height - position_y
    const mekariNativeX1 = mekari.position_x;
    const mekariNativeY1 = mekari.canvas_height - mekari.position_y - mekari.element_height;
    const mekariNativeX2 = mekari.position_x + mekari.element_width;
    const mekariNativeY2 = mekari.canvas_height - mekari.position_y;

    const drawnNativeX1 = pdfLib.x;
    const drawnNativeY1 = pdfLib.y;
    const drawnNativeX2 = pdfLib.x + pdfLib.width;
    const drawnNativeY2 = pdfLib.y + pdfLib.height;

    if (
      mekariNativeX1 !== drawnNativeX1 ||
      mekariNativeY1 !== drawnNativeY1 ||
      mekariNativeX2 !== drawnNativeX2 ||
      mekariNativeY2 !== drawnNativeY2
    ) {
      throw new Error(
        `Koordinat tidak selaras untuk ${item.name}! ` +
        `Mekari Native: [${mekariNativeX1}, ${mekariNativeY1}, ${mekariNativeX2}, ${mekariNativeY2}], ` +
        `Drawn Box: [${drawnNativeX1}, ${drawnNativeY1}, ${drawnNativeX2}, ${drawnNativeY2}]`
      );
    }

    console.log(
      `  ✅ ${item.name}: Kotak gambar [${drawnNativeX1}, ${drawnNativeY1}, ${drawnNativeX2}, ${drawnNativeY2}] ` +
      `IDENTIK dengan payload Mekari Native [${mekariNativeX1}, ${mekariNativeY1}, ${mekariNativeX2}, ${mekariNativeY2}].`
    );
  }

  // 2. Verifikasi Batas & Non-Overlapping (Pemisahan Kotak)
  console.log("\n[2/3] Memeriksa batas halaman dan pencegahan overlap kotak...");
  const tbigRight = LAYOUT.tbigSignature.x + LAYOUT.tbigSignature.width;
  const meteraiLeft = LAYOUT.vendorMeterai.x;
  const meteraiRight = LAYOUT.vendorMeterai.x + LAYOUT.vendorMeterai.width;
  const vendorLeft = LAYOUT.vendorSignature.x;

  if (tbigRight >= meteraiLeft) {
    throw new Error(`Kotak TBIG (${tbigRight}) bertabrakan dengan kotak Meterai (${meteraiLeft})!`);
  }
  if (meteraiRight >= vendorLeft) {
    throw new Error(`Kotak Meterai (${meteraiRight}) bertabrakan dengan kotak Vendor (${vendorLeft})!`);
  }
  console.log(`  ✅ Jarak aman horizontal: TBIG -> Meterai (${meteraiLeft - tbigRight} pt), Meterai -> Vendor (${vendorLeft - meteraiRight} pt).`);

  // 3. Verifikasi Bukti Fisik Dokumen Hasil Stamping dari Sandbox Mekari
  console.log("\n[3/3] Memverifikasi /Rect dokumen fisik hasil stamping dari Sandbox Mekari...");
  const samplePdfPath = path.join(process.cwd(), ".tmp-coord-test", "2-downloaded-meterai.pdf");
  
  let stampedDocBytes: Buffer;
  try {
    stampedDocBytes = await fs.readFile(samplePdfPath);
  } catch {
    // Jika file probe lokal belum ada, buat langsung dan unduh bukti
    console.log("  (Menjalankan probe cepat ke sandbox untuk mengunduh bukti PDF)...");
    const { MekariESignProvider } = await import("@/lib/esign/mekari/provider");
    const provider = new MekariESignProvider();
    const baseDoc = await PDFDocument.create();
    baseDoc.addPage([PAGE.width, PAGE.height]);
    const preparedPdf = await generateLembarPengesahan(await baseDoc.save(), {
      namaPengadaan: "Uji Verifikasi Koordinat Final Step 2.6",
      alamat: "Jl. TB Simatupang No. 26",
      harga: BigInt(10000000),
      tanggalMulai: new Date(),
      tanggalSelesai: new Date(),
      noSuratPesanan: `SP-VERIFY-${Date.now()}`,
      tanggalPenyelesaian: new Date(),
      vendorNama: "PT Vendor Contoh",
      picNama: "Budi Santoso",
      picJabatan: "Direktur",
    });

    const stampRes = await provider.stampMeterai({
      jobId: `verify-coord-${Date.now()}`,
      pdf: preparedPdf,
      filename: `verify-coord-${Date.now()}.pdf`,
      page: 2,
      box: LAYOUT.vendorMeterai,
      callbackUrl: "http://localhost:3000/api/webhooks/esign",
    });

    // Tunggu sandbox selesai proses
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const status = await provider.getStatus(stampRes.externalId);
      if (status) break;
    }

    const downloaded = await provider.downloadDocument(stampRes.externalId);
    stampedDocBytes = Buffer.from(downloaded);
    await fs.mkdir(path.dirname(samplePdfPath), { recursive: true });
    await fs.writeFile(samplePdfPath, stampedDocBytes);
  }

  const doc = await PDFDocument.load(stampedDocBytes);
  const page2 = doc.getPage(1);
  const annots = page2.node.Annots();
  if (!annots || annots.size() === 0) {
    throw new Error("Dokumen stamping tidak memiliki objek anotasi di halaman 2!");
  }

  const annotObj = doc.context.lookup(annots.get(0));
  if (!(annotObj instanceof PDFDict)) {
    throw new Error("Objek anotasi tidak valid!");
  }

  const rectArray = annotObj.get(PDFName.of("Rect"));
  if (!(rectArray instanceof PDFArray)) {
    throw new Error("Anotasi tidak memiliki atribut /Rect!");
  }

  const rectValues = rectArray.asArray().map((item) => {
    if (item instanceof PDFNumber) return item.asNumber();
    return Number(item.toString());
  });

  console.log("  Atribut /Rect pada PDF hasil Sandbox Mekari:", rectValues);

  const expectedMeteraiRect = [330, 202, 410, 282];
  const isRectMatch = rectValues.every((val, idx) => Math.abs(val - expectedMeteraiRect[idx]) <= 1);

  if (!isRectMatch) {
    throw new Error(
      `Posisi /Rect Mekari [${rectValues.join(", ")}] tidak cocok dengan kotak Lembar Pengesahan [${expectedMeteraiRect.join(", ")}]!`
    );
  }

  console.log(
    `  ✅ Verifikasi Berhasil: Posisi eMeterai di Sandbox [${rectValues.join(", ")}] ` +
    `mendarat PERSIS di kotak Lembar Pengesahan [${expectedMeteraiRect.join(", ")}].`
  );

  console.log("\n==================================================");
  console.log("🎉 SELURUH VERIFIKASI STEP 2.6 BERHASIL (100%)!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("\n❌ Verifikasi Step 2.6 Gagal:", err);
  process.exit(1);
});
