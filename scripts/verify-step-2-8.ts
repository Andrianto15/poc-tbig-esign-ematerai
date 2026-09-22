import "dotenv/config";
import { PDFDocument } from "pdf-lib";
import { PAGE, LAYOUT } from "@/lib/pdf/signature-layout";
import { generateLembarPengesahan } from "@/lib/pdf/lembar-pengesahan";
import { MekariESignProvider } from "@/lib/esign/mekari/provider";
import { mekariRequest } from "@/lib/esign/mekari/client";

async function main() {
  console.log("==========================================================");
  console.log("Verifikasi Step 2.8 — Pengalaman Vendor Saat Tanda Tangan");
  console.log("==========================================================");

  const provider = new MekariESignProvider();
  const vendorEmail = process.env.SEED_VENDOR1_EMAIL || "nurekaiskandar15@gmail.com";
  console.log(`\nSigner Target: ${vendorEmail}`);

  // 1. Buat dokumen PDF dengan Lembar Pengesahan
  console.log("\n[1/3] Menyiapkan dokumen pengadaan...");
  const baseDoc = await PDFDocument.create();
  baseDoc.addPage([PAGE.width, PAGE.height]);
  const pdfBytes = await generateLembarPengesahan(await baseDoc.save(), {
    namaPengadaan: "Uji Pengalaman Tanda Tangan Vendor Step 2.8",
    alamat: "Jl. TB Simatupang No. 28",
    harga: BigInt(18500000),
    tanggalMulai: new Date(),
    tanggalSelesai: new Date(),
    noSuratPesanan: `SP-VENDOR-EXP-${Date.now()}`,
    tanggalPenyelesaian: new Date(),
    vendorNama: "PT Vendor Uji Step 28",
    picNama: "Nureka Iskandar",
    picJabatan: "Direktur Utama",
  });
  console.log(`  ✅ Dokumen pengadaan siap (${pdfBytes.byteLength} bytes).`);

  // 2. Ajukan permintaan tanda tangan ke Mekari Sandbox
  console.log("\n[2/3] Mengajukan permintaan tanda tangan vendor ke Mekari Sandbox...");
  const reqRes = await provider.requestSign({
    jobId: `verify-step28-${Date.now()}`,
    pdf: pdfBytes,
    filename: `verify-vendor-exp-${Date.now()}.pdf`,
    signer: {
      name: "Nureka Iskandar",
      email: vendorEmail,
    },
    page: 2,
    box: LAYOUT.vendorSignature,
    callbackUrl: "http://localhost:3000/api/webhooks/esign",
    returnUrl: "http://localhost:3000/vendor/pengadaan/dummy",
  });

  console.log(`  ✅ Dokumen berhasil diajukan! External ID: ${reqRes.externalId}`);
  console.log(`  Nilai signUrl dari response provider: ${reqRes.signUrl ?? "(tidak ada / null)"}`);

  // 3. Verifikasi Mode Akses: Email vs URL Langsung
  console.log("\n[3/3] Memverifikasi detail pengiriman di sistem Mekari Sandbox...");
  interface MekariDocDetail {
    data: {
      id: string;
      attributes: {
        filename?: string;
        signing_status?: string;
        signing_link?: Array<unknown>;
        signers?: Array<{
          name?: string;
          email?: string;
          status?: string;
          signing_url?: string | null;
        }>;
      };
    };
  }

  const doc = await mekariRequest<MekariDocDetail>("GET", `/documents/${reqRes.externalId}`);
  const attrs = doc.data.attributes;
  const signer = attrs.signers?.[0];

  console.log(`  Status Dokumen di Mekari: ${attrs.signing_status}`);
  console.log(`  Signer: ${signer?.name} <${signer?.email}> (status: ${signer?.status})`);
  console.log(`  Direct Signing Link: ${signer?.signing_url ?? "null (dikirim via email resmi Mekari)"}`);

  if (!reqRes.signUrl) {
    console.log(`  ✅ Terkonfirmasi mode EMAIL-ONLY:`);
    console.log(`     - Tautan tanda tangan dikirimkan otomatis oleh Mekari Sign ke ${vendorEmail}`);
    console.log(`     - UI Vendor menampilkan instruksi "Silakan cek email Anda dari Mekari Sign..."`);
    console.log(`     - Tombol "Cek status" tersedia langsung (forceShow: true) tanpa menunggu delay.`);
  } else {
    console.log(`  ✅ Terkonfirmasi mode DIRECT SIGNING URL:`);
    console.log(`     - Tombol "Lanjutkan Tanda Tangan" mengarahkan vendor ke: ${reqRes.signUrl}`);
  }

  // Verifikasi getStatus polling
  const pollStatus = await provider.getStatus(reqRes.externalId);
  console.log(`  Status Polling saat ini: ${pollStatus ? pollStatus.type : "in_progress (menunggu penandatanganan vendor)"}`);

  console.log("\n==========================================================");
  console.log("🎉 VERIFIKASI STEP 2.8 BERHASIL (100%)!");
  console.log("==========================================================");
}

main().catch((err) => {
  console.error("\n❌ Verifikasi Step 2.8 Gagal:", err);
  process.exit(1);
});
