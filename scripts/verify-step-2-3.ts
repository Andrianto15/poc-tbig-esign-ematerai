import "dotenv/config";
import { PDFDocument } from "pdf-lib";
import { MekariESignProvider } from "@/lib/esign/mekari/provider";
import { LAYOUT } from "@/lib/pdf/signature-layout";

async function createSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText("Uji Integrasi Dokumen PoC TBIG - Mekari eSign Sandbox", {
    x: 50,
    y: 750,
    size: 14,
  });
  return doc.save();
}

async function main() {
  console.log("==================================================");
  console.log("Verifikasi Step 2.3 — MekariESignProvider Sandbox");
  console.log("==================================================");

  const provider = new MekariESignProvider();
  const pdfBytes = await createSamplePdf();
  const callbackUrl = `${process.env.APP_BASE_URL || "http://localhost:3000"}/api/webhooks/esign?token=${process.env.ESIGN_WEBHOOK_TOKEN || "test-token"}`;

  // 1. Uji stampMeterai
  console.log("\n[1/3] Menguji stampMeterai ke sandbox...");
  const stampRes = await provider.stampMeterai({
    jobId: "test-job-meterai",
    pdf: pdfBytes,
    filename: "sp-meterai-sample.pdf",
    page: 1,
    box: LAYOUT.vendorMeterai,
    callbackUrl,
  });
  console.log("  ✅ stampMeterai externalId:", stampRes.externalId);

  // 2. Uji autoSign TBIG
  console.log("\n[2/3] Menguji autoSign (TBIG) ke sandbox...");
  const autoSignRes = await provider.autoSign({
    jobId: "test-job-autosign",
    pdf: pdfBytes,
    filename: "sp-autosign-sample.pdf",
    page: 1,
    box: LAYOUT.tbigSignature,
    callbackUrl,
  });
  console.log("  ✅ autoSign externalId:", autoSignRes.externalId);

  // 3. Uji requestSign Vendor
  console.log("\n[3/3] Menguji requestSign (Vendor) ke sandbox...");
  const vendorEmail = process.env.SEED_VENDOR1_EMAIL || "vendor1@poc.local";
  const requestSignRes = await provider.requestSign({
    jobId: "test-job-requestsign",
    pdf: pdfBytes,
    filename: "sp-vendor-sample.pdf",
    signer: {
      name: "PT Vendor Sukses Mandiri",
      email: vendorEmail,
    },
    page: 1,
    box: LAYOUT.vendorSignature,
    callbackUrl,
    returnUrl: "http://localhost:3000/vendor/pengadaan/test",
  });
  console.log("  ✅ requestSign externalId:", requestSignRes.externalId);
  console.log("  ℹ signUrl:", requestSignRes.signUrl || "(Dokumen dikirim via email Mekari)");

  // 4. Uji getStatus
  console.log("\n[Status] Menguji getStatus untuk stampMeterai...");
  const statusRes = await provider.getStatus(stampRes.externalId);
  console.log("  ✅ getStatus result:", statusRes ? statusRes.type : "IN_PROGRESS (null)");

  // 5. Uji downloadDocument
  console.log("\n[Download] Menguji downloadDocument untuk stampMeterai...");
  const downloadedBytes = await provider.downloadDocument(stampRes.externalId);
  console.log(`  ✅ downloadDocument berhasil (${downloadedBytes.byteLength} bytes)`);

  console.log("\n==================================================");
  console.log("🎉 SELURUH OPERASI STEP 2.3 BERHASIL DIUJI KE SANDBOX!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("\n❌ Verifikasi Step 2.3 Gagal:", err);
  process.exit(1);
});
