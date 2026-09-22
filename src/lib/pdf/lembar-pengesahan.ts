import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PAGE, LAYOUT, toPdfLibCoordinates } from "./signature-layout";

export interface LembarPengesahanData {
  id?: string;
  namaPengadaan: string;
  alamat: string;
  harga: number | bigint;
  tanggalMulai: Date | string;
  tanggalSelesai: Date | string;
  noSuratPesanan: string;
  tanggalPenyelesaian: Date | string;
  vendorNama: string;
  picNama: string;
  picJabatan: string;
  tbigSignerName?: string;
  createdAt?: Date | string;
}

export function formatRupiah(amount: number | bigint): string {
  const num = typeof amount === "bigint" ? Number(amount) : amount;
  return `Rp ${new Intl.NumberFormat("id-ID").format(num)}`;
}

export function formatDateIndo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/**
 * Menambahkan halaman Lembar Pengesahan di akhir dokumen PDF
 */
export async function generateLembarPengesahan(
  originalPdfBytes: Uint8Array,
  data: LembarPengesahanData
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  const { height } = page.getSize();

  // Helper konversi koordinat top-left ke bottom-left pdf-lib
  const toBottomLeftY = (topY: number, itemHeight: number = 0) =>
    height - topY - itemHeight;

  // 1. Judul & Subjudul
  const title = "LEMBAR PENGESAHAN";
  const titleWidth = fontBold.widthOfTextAtSize(title, 16);
  page.drawText(title, {
    x: (PAGE.width - titleWidth) / 2,
    y: toBottomLeftY(50, 16),
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  const subtitle = `No. Surat Pesanan: ${data.noSuratPesanan}`;
  const subtitleWidth = fontRegular.widthOfTextAtSize(subtitle, 11);
  page.drawText(subtitle, {
    x: (PAGE.width - subtitleWidth) / 2,
    y: toBottomLeftY(76, 11),
    size: 11,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Garis pemisah atas
  page.drawLine({
    start: { x: 50, y: toBottomLeftY(100) },
    end: { x: PAGE.width - 50, y: toBottomLeftY(100) },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  // 2. Tabel Data Pengadaan
  const tableRows: [string, string][] = [
    ["Nama Pengadaan", data.namaPengadaan],
    ["Alamat", data.alamat],
    ["Harga Pengadaan", formatRupiah(data.harga)],
    [
      "Periode Pengadaan",
      `${formatDateIndo(data.tanggalMulai)} s.d. ${formatDateIndo(data.tanggalSelesai)}`,
    ],
    ["Tanggal Penyelesaian", formatDateIndo(data.tanggalPenyelesaian)],
    ["Nama Vendor", data.vendorNama],
    ["PIC Vendor", data.picNama],
    ["Jabatan PIC", data.picJabatan],
  ];

  let currentTopY = 115;
  const labelX = 60;
  const valueX = 220;
  const rowHeight = 24;

  for (let i = 0; i < tableRows.length; i++) {
    const [label, value] = tableRows[i];
    const isEven = i % 2 === 0;
    if (isEven) {
      page.drawRectangle({
        x: 50,
        y: toBottomLeftY(currentTopY + rowHeight, 0),
        width: PAGE.width - 100,
        height: rowHeight,
        color: rgb(0.97, 0.98, 0.99),
      });
    }

    page.drawText(label, {
      x: labelX,
      y: toBottomLeftY(currentTopY + 16),
      size: 9.5,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(":", {
      x: valueX - 12,
      y: toBottomLeftY(currentTopY + 16),
      size: 9.5,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Truncate jika teks terlalu panjang agar rapi
    let displayVal = value;
    if (displayVal.length > 55) {
      displayVal = displayVal.substring(0, 52) + "...";
    }

    page.drawText(displayVal, {
      x: valueX,
      y: toBottomLeftY(currentTopY + 16),
      size: 9.5,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });

    currentTopY += rowHeight;
  }

  // Garis pemisah tabel
  page.drawLine({
    start: { x: 50, y: toBottomLeftY(currentTopY + 10) },
    end: { x: PAGE.width - 50, y: toBottomLeftY(currentTopY + 10) },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  // 3. Kolom Tanda Tangan
  // Header Pihak Pertama (TBIG)
  page.drawText("Pihak Pertama — TBIG", {
    x: LAYOUT.tbigSignature.x,
    y: toBottomLeftY(535),
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Header Pihak Kedua (Vendor)
  let vendorHeaderText = `Pihak Kedua — ${data.vendorNama}`;
  if (vendorHeaderText.length > 35) {
    vendorHeaderText = vendorHeaderText.substring(0, 32) + "...";
  }
  page.drawText(vendorHeaderText, {
    x: LAYOUT.vendorMeterai.x,
    y: toBottomLeftY(535),
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Gambar Kotak Penanda (Garis putus-putus tipis tanpa teks di dalamnya agar tanda tangan/meterai bersih & valid)
  // Kotak TBIG
  const tbigPdfCoords = toPdfLibCoordinates(LAYOUT.tbigSignature, height);
  page.drawRectangle({
    x: tbigPdfCoords.x,
    y: tbigPdfCoords.y,
    width: tbigPdfCoords.width,
    height: tbigPdfCoords.height,
    borderWidth: 0.75,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderDashArray: [3, 3],
  });

  // Kotak eMeterai Vendor
  const meteraiPdfCoords = toPdfLibCoordinates(LAYOUT.vendorMeterai, height);
  page.drawRectangle({
    x: meteraiPdfCoords.x,
    y: meteraiPdfCoords.y,
    width: meteraiPdfCoords.width,
    height: meteraiPdfCoords.height,
    borderWidth: 0.75,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderDashArray: [3, 3],
  });

  // Kotak TTD Vendor
  const vendorPdfCoords = toPdfLibCoordinates(LAYOUT.vendorSignature, height);
  page.drawRectangle({
    x: vendorPdfCoords.x,
    y: vendorPdfCoords.y,
    width: vendorPdfCoords.width,
    height: vendorPdfCoords.height,
    borderWidth: 0.75,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderDashArray: [3, 3],
  });

  // Nama & Jabatan Penandatangan di bawah kotak
  const signersTopY = LAYOUT.tbigSignature.y + LAYOUT.tbigSignature.height + 15;

  // Pihak Pertama (TBIG)
  const tbigSigner = data.tbigSignerName || "Admin Pengadaan TBIG";
  page.drawText(tbigSigner, {
    x: LAYOUT.tbigSignature.x,
    y: toBottomLeftY(signersTopY),
    size: 9.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText("PT Tower Bersama Infrastructure Tbk", {
    x: LAYOUT.tbigSignature.x,
    y: toBottomLeftY(signersTopY + 14),
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Pihak Kedua (Vendor)
  page.drawText(data.picNama, {
    x: LAYOUT.vendorMeterai.x,
    y: toBottomLeftY(signersTopY),
    size: 9.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(`${data.picJabatan}, ${data.vendorNama}`, {
    x: LAYOUT.vendorMeterai.x,
    y: toBottomLeftY(signersTopY + 14),
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  // 4. Footer kecil
  const footerY = 805;
  page.drawLine({
    start: { x: 50, y: toBottomLeftY(footerY - 8) },
    end: { x: PAGE.width - 50, y: toBottomLeftY(footerY - 8) },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });

  const docDate = data.createdAt ? formatDateIndo(data.createdAt) : formatDateIndo(new Date());
  const footerText = `ID Pengadaan: ${data.id || "DRAFT"}  •  Tanggal Dokumen: ${docDate}`;
  page.drawText(footerText, {
    x: 50,
    y: toBottomLeftY(footerY + 10),
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  });

  return await pdfDoc.save();
}
