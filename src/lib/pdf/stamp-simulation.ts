import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { Box, toPdfLibCoordinates } from "./signature-layout";

function formatTimestamp(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date) + " WIB";
}

function drawSimulatedWatermark(
  page: import("pdf-lib").PDFPage,
  fontBold: import("pdf-lib").PDFFont
) {
  const { width, height } = page.getSize();
  page.drawText("SIMULASI", {
    x: width * 0.25,
    y: height * 0.38,
    size: 64,
    font: fontBold,
    color: rgb(0.85, 0.85, 0.85),
    opacity: 0.22,
    rotate: degrees(45),
  });
}

/**
 * Membubuhkan tanda tangan simulasi pada dokumen PDF di koordinat box yang ditentukan
 */
export async function applySimulatedSignature(
  pdfBytes: Uint8Array,
  pageNumber: number,
  box: Box,
  signerName: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const targetPageIndex = Math.max(0, Math.min(pageNumber - 1, pages.length - 1));
  const targetPage = pages[targetPageIndex];

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { x, y, width, height } = toPdfLibCoordinates(
    box,
    targetPage.getHeight()
  );

  // 1. Gambar kotak ttd simulasi
  targetPage.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.18, 0.35, 0.65),
    borderWidth: 1,
    color: rgb(0.96, 0.98, 1.0),
  });

  // 2. Garis dekoratif sisi kiri kotak
  targetPage.drawRectangle({
    x,
    y,
    width: 3,
    height,
    color: rgb(0.18, 0.35, 0.65),
  });

  // 3. Teks informasi ttd
  const textX = x + 8;
  targetPage.drawText("Ditandatangani secara elektronik", {
    x: textX,
    y: y + height - 16,
    size: 7,
    font: fontRegular,
    color: rgb(0.2, 0.25, 0.35),
  });

  const displayName = signerName.length > 26 ? signerName.slice(0, 24) + "…" : signerName;
  targetPage.drawText(displayName, {
    x: textX,
    y: y + height - 32,
    size: 8.5,
    font: fontBold,
    color: rgb(0.08, 0.2, 0.45),
  });

  targetPage.drawText(formatTimestamp(), {
    x: textX,
    y: y + height - 46,
    size: 6.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.5),
  });

  targetPage.drawText("[ SIMULASI MOCK ]", {
    x: textX,
    y: y + 10,
    size: 6.5,
    font: fontBold,
    color: rgb(0.8, 0.2, 0.2),
  });

  // 4. Watermark diagonal tipis di Lembar Pengesahan
  drawSimulatedWatermark(targetPage, fontBold);

  return await doc.save();
}

/**
 * Membubuhkan meterai simulasi pada dokumen PDF di koordinat box yang ditentukan
 */
export async function applySimulatedMeterai(
  pdfBytes: Uint8Array,
  pageNumber: number,
  box: Box
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const targetPageIndex = Math.max(0, Math.min(pageNumber - 1, pages.length - 1));
  const targetPage = pages[targetPageIndex];

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { x, y, width, height } = toPdfLibCoordinates(
    box,
    targetPage.getHeight()
  );

  // 1. Gambar kotak meterai simulasi
  targetPage.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.75, 0.15, 0.15),
    borderWidth: 1.5,
    color: rgb(1.0, 0.96, 0.96),
  });

  // 2. Teks meterai
  const title = "e-METERAI";
  const titleWidth = fontBold.widthOfTextAtSize(title, 8.5);
  targetPage.drawText(title, {
    x: x + (width - titleWidth) / 2,
    y: y + height - 20,
    size: 8.5,
    font: fontBold,
    color: rgb(0.75, 0.15, 0.15),
  });

  const valueText = "SIMULASI 10000";
  const valueWidth = fontBold.widthOfTextAtSize(valueText, 7);
  targetPage.drawText(valueText, {
    x: x + (width - valueWidth) / 2,
    y: y + height - 35,
    size: 7,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });

  const randomHex = Math.random().toString(16).substring(2, 10).toUpperCase();
  const snText = `SN: MOCK-${randomHex}`;
  const snWidth = fontRegular.widthOfTextAtSize(snText, 5.5);
  targetPage.drawText(snText, {
    x: x + (width - snWidth) / 2,
    y: y + height - 50,
    size: 5.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const dateText = formatTimestamp().split(" ")[0] || "";
  const dateWidth = fontRegular.widthOfTextAtSize(dateText, 5.5);
  targetPage.drawText(dateText, {
    x: x + (width - dateWidth) / 2,
    y: y + 10,
    size: 5.5,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  });

  // 3. Watermark diagonal tipis di Lembar Pengesahan
  drawSimulatedWatermark(targetPage, fontBold);

  return await doc.save();
}
