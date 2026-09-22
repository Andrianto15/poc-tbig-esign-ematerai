// Bypass error server-only saat dijalankan di luar bundler Next.js
// @ts-expect-error bypass server-only for standalone script runner
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
};

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { MekariESignProvider } from "@/lib/esign/mekari/provider";
import { SignJobStatus, SignJobType } from "@/generated/prisma/enums";

async function main() {
  const { POST } = await import("@/app/api/webhooks/esign/route");
  console.log("==================================================");
  console.log("Verifikasi Step 2.4 — Mekari Webhook Handling");
  console.log("==================================================");

  const token = process.env.ESIGN_WEBHOOK_TOKEN || "test-webhook-token";
  process.env.ESIGN_WEBHOOK_TOKEN = token;
  const provider = new MekariESignProvider();

  // 1. Uji Keamanan Token
  console.log("\n[1/4] Menguji keamanan otentikasi token webhook...");
  const unauthorizedReq = new NextRequest(
    `http://localhost:3000/api/webhooks/esign?token=invalid-token`,
    {
      method: "POST",
      body: JSON.stringify({ test: "data" }),
    }
  );
  const unauthRes = await POST(unauthorizedReq);
  if (unauthRes.status !== 401) {
    throw new Error(`Harusnya 401 Unauthorized, didapat: ${unauthRes.status}`);
  }
  console.log("  ✅ Token salah berhasil ditolak dengan HTTP 401.");

  // 2. Uji Parsing Format Payload Mekari
  console.log("\n[2/4] Menguji parsing payload resmi Mekari...");
  const sampleExternalId = "mekari-test-doc-12345";

  // A. Payload Stamping Success
  const stampingSuccessReq = new Request(
    `http://localhost:3000/api/webhooks/esign?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          id: sampleExternalId,
          type: "document",
          attributes: {
            filename: "sp.pdf",
            signing_status: "completed",
            stamping_status: "success",
          },
        },
      }),
    }
  );
  const parsedStamping = await provider.parseWebhook(stampingSuccessReq);
  if (!parsedStamping || parsedStamping.type !== "COMPLETED" || parsedStamping.externalId !== sampleExternalId) {
    throw new Error("Gagal mem-parse callback stamping Mekari");
  }
  console.log("  ✅ Payload stamping success ter-parse COMPLETED.");

  // B. Payload In-Progress (diabaikan)
  const inProgressReq = new Request(
    `http://localhost:3000/api/webhooks/esign?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          id: sampleExternalId,
          type: "document",
          attributes: {
            signing_status: "in_progress",
            stamping_status: "none",
          },
        },
      }),
    }
  );
  const parsedInProgress = await provider.parseWebhook(inProgressReq);
  if (parsedInProgress !== null) {
    throw new Error("Harusnya event in_progress mengembalikan null agar diabaikan.");
  }
  console.log("  ✅ Payload in_progress berhasil diabaikan (return null).");

  // C. Payload Failure / Rejected
  const failedReq = new Request(
    `http://localhost:3000/api/webhooks/esign?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          id: sampleExternalId,
          type: "document",
          attributes: {
            signing_status: "rejected",
            stamping_status: "failed",
          },
        },
      }),
    }
  );
  const parsedFailed = await provider.parseWebhook(failedReq);
  if (!parsedFailed || parsedFailed.type !== "FAILED") {
    throw new Error("Harusnya event rejected/failed ter-parse FAILED.");
  }
  console.log("  ✅ Payload failed ter-parse FAILED.");

  // 3. Uji End-to-End Callback Route & WebhookEvent DB Logging
  console.log("\n[3/4] Menguji pencatatan WebhookEvent dan transisi status via route...");
  const vendor = await prisma.vendor.findFirst();
  if (!vendor) throw new Error("Vendor tidak ditemukan di DB.");
  const tbigUser = await prisma.user.findFirst({ where: { role: "TBIG" } });
  if (!tbigUser) throw new Error("User TBIG tidak ditemukan di DB.");

  const testExternalId = `test-webhook-${Date.now()}`;

  // Buat Pengadaan valid menggunakan workflow
  const { createDraftPengadaan } = await import("@/lib/workflow/pengadaan-workflow");
    const samplePdf = await (await import("pdf-lib")).PDFDocument.create().then((d) => {
      d.addPage([595, 842]);
      return d.save();
    });

    const draft = await createDraftPengadaan({
      namaPengadaan: "Uji Webhook Mekari Step 2.4",
      alamat: "Jl. TB Simatupang Kav. 1, Jakarta",
      harga: BigInt(50000000),
      tanggalMulai: new Date("2026-10-01"),
      tanggalSelesai: new Date("2026-11-01"),
      noSuratPesanan: `SP-TEST-WH-${Date.now()}`,
      tanggalPenyelesaian: new Date("2026-11-05"),
      vendorId: vendor.id,
      picNama: vendor.picNama,
      picJabatan: vendor.picJabatan,
      pdfBytes: samplePdf,
      createdById: tbigUser.id,
    });

  await prisma.signJob.create({
    data: {
      pengadaanId: draft.id,
      provider: "MEKARI",
      type: SignJobType.AUTO_SIGN_TBIG,
      status: SignJobStatus.PENDING,
      externalId: testExternalId,
      inputFileKind: "PREPARED",
      outputFileKind: "SIGNED_TBIG",
    },
  });

  const webhookReq = new NextRequest(
    `http://localhost:3000/api/webhooks/esign?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          id: testExternalId,
          type: "document",
          attributes: {
            filename: "test.pdf",
            signing_status: "failed",
            stamping_status: "none",
          },
        },
      }),
    }
  );

  const response = await POST(webhookReq);
  console.log("  Response status:", response.status);

  // Verifikasi WebhookEvent tersimpan di Prisma
  const savedEvent = await prisma.webhookEvent.findFirst({
    where: { externalId: testExternalId },
    orderBy: { receivedAt: "desc" },
  });

  if (!savedEvent) {
    throw new Error("WebhookEvent tidak tercatat di basis data!");
  }
  console.log(`  ✅ WebhookEvent tercatat: id=${savedEvent.id}, provider=${savedEvent.provider}, externalId=${savedEvent.externalId}`);

  // Verifikasi status job menjadi FAILED
  const updatedJob = await prisma.signJob.findUnique({
    where: { externalId: testExternalId },
  });
  if (updatedJob?.status !== SignJobStatus.FAILED) {
    throw new Error(`Job status tidak berubah menjadi FAILED: ${updatedJob?.status}`);
  }
  console.log("  ✅ Status SignJob berhasil diperbarui menjadi FAILED.");

  // 4. Bersihkan data uji
  console.log("\n[4/4] Membersihkan data uji...");
  await prisma.pengadaan.delete({ where: { id: draft.id } });
  await prisma.webhookEvent.deleteMany({ where: { externalId: testExternalId } });
  console.log("  ✅ Data uji dibersihkan.");

  console.log("\n==================================================");
  console.log("🎉 SELURUH VERIFIKASI STEP 2.4 BERHASIL (100%)!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("\n❌ Verifikasi Step 2.4 Gagal:", err);
  process.exit(1);
});
