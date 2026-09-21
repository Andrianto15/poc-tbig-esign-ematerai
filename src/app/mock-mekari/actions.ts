"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { buildMockStorageKey } from "@/lib/storage/types";
import { applySimulatedSignature } from "@/lib/pdf/stamp-simulation";
import { LAYOUT } from "@/lib/pdf/signature-layout";
import { PDFDocument } from "pdf-lib";
import { handleESignEvent } from "@/lib/workflow/handle-esign-event";
import { SignJobStatus, SignJobType } from "@/generated/prisma/enums";

export async function submitMockSignAction(
  jobId: string,
  otp: string
): Promise<{ error?: string; returnUrl?: string }> {
  if (process.env.ESIGN_MODE !== "mock") {
    return { error: "Mock Mekari Sign hanya aktif pada mode ESIGN_MODE=mock." };
  }

  if (otp.trim() !== "123456") {
    return {
      error: "Kode OTP tidak valid. Gunakan 123456 untuk simulasi Mekari Sign.",
    };
  }

  const job = await prisma.signJob.findUnique({
    where: { id: jobId },
    include: { pengadaan: true },
  });

  if (!job || !job.externalId) {
    return { error: "Job penandatanganan tidak ditemukan atau belum valid." };
  }

  if (job.type !== SignJobType.SIGN_VENDOR) {
    return { error: "Tipe job ini bukan untuk tanda tangan vendor." };
  }

  if (job.status === SignJobStatus.COMPLETED) {
    return {
      returnUrl: `/vendor/pengadaan/${job.pengadaanId}`,
    };
  }

  if (job.status !== SignJobStatus.WAITING_SIGNER) {
    return {
      error: `Dokumen tidak dalam status menunggu tanda tangan (status saat ini: ${job.status}).`,
    };
  }

  const storage = getStorage();
  const mockStorageKey = buildMockStorageKey(job.externalId);
  const pdfBytes = await storage.get(mockStorageKey);

  if (!pdfBytes) {
    return {
      error: "Dokumen PDF untuk penandatanganan tidak ditemukan di storage mock.",
    };
  }

  // 1. Gambar tanda tangan simulasi vendor pada PDF
  const doc = await PDFDocument.load(pdfBytes);
  const targetPage = doc.getPageCount();
  const signerName = job.pengadaan.picNama || "PIC Vendor";

  const signedPdfBytes = await applySimulatedSignature(
    pdfBytes,
    targetPage,
    LAYOUT.vendorSignature,
    signerName
  );

  // 2. Simpan kembali PDF bertanda tangan di mock storage dengan key externalId
  await storage.put(mockStorageKey, signedPdfBytes, "application/pdf");

  // 3. Evaluasi simulasi kegagalan
  const shouldFail = process.env.MOCK_ESIGN_FAIL === "SIGN_VENDOR";

  // 4. Proses event ke workflow
  await handleESignEvent({
    provider: "mock",
    externalId: job.externalId,
    type: shouldFail ? "FAILED" : "COMPLETED",
    errorMessage: shouldFail
      ? "Simulasi kegagalan tanda tangan vendor (MOCK_ESIGN_FAIL aktif)"
      : undefined,
    raw: {
      simulated: true,
      jobId: job.id,
      otp: "123456",
      timestamp: new Date().toISOString(),
    },
  });

  try {
    revalidatePath(`/vendor/pengadaan/${job.pengadaanId}`);
    revalidatePath("/vendor/pengadaan");
    revalidatePath(`/tbig/pengadaan/${job.pengadaanId}`);
    revalidatePath("/tbig/pengadaan");
  } catch {
    // Abaikan jika dipanggil dari luar runtime Next.js (mis. standalone script)
  }

  return {
    returnUrl: `/vendor/pengadaan/${job.pengadaanId}`,
  };
}
