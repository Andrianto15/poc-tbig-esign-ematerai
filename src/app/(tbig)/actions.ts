"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/user";
import {
  createDraftPengadaan,
  updateDraftPengadaan,
  deleteDraftPengadaan,
  submitPengadaanToVendor,
  submitTbigSign,
} from "@/lib/workflow/pengadaan-workflow";

import { pengadaanSchema } from "@/lib/validations/pengadaan";
import { prisma } from "@/lib/db";
import { SignJobStatus, SignJobType } from "@/generated/prisma/enums";
import { MekariESignProvider } from "@/lib/esign/mekari/provider";
import { handleESignEvent } from "@/lib/workflow/handle-esign-event";
import { submitMockTbigSignAction } from "@/app/mock-mekari/actions";
import { revalidatePath } from "next/cache";

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createPengadaanAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("TBIG");

  const rawData = {
    namaPengadaan: formData.get("namaPengadaan"),
    alamat: formData.get("alamat"),
    harga:
      typeof formData.get("harga") === "string"
        ? (formData.get("harga") as string).replace(/\D/g, "")
        : formData.get("harga"),
    tanggalMulai: formData.get("tanggalMulai"),
    tanggalSelesai: formData.get("tanggalSelesai"),
    noSuratPesanan: formData.get("noSuratPesanan"),
    tanggalPenyelesaian: formData.get("tanggalPenyelesaian"),
    vendorId: formData.get("vendorId"),
    picNama: formData.get("picNama"),
    picJabatan: formData.get("picJabatan"),
  };

  const parsed = pengadaanSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors,
      error: "Terdapat kesalahan pengisian data pada formulir.",
    };
  }

  const pdfFile = formData.get("dokumenPdf") as File | null;
  if (!pdfFile || pdfFile.size === 0) {
    return {
      error: "Dokumen PDF pengadaan wajib diunggah.",
      fieldErrors: { dokumenPdf: ["File PDF wajib diunggah"] },
    };
  }

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  let pengadaanId: string;
  try {
    const created = await createDraftPengadaan({
      ...parsed.data,
      harga: BigInt(parsed.data.harga),
      pdfBytes,
      createdById: user.id,
    });
    pengadaanId = created.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal membuat pengadaan";
    return { error: message };
  }

  redirect(`/tbig/pengadaan/${pengadaanId}`);
}

export async function updatePengadaanAction(
  pengadaanId: string,
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("TBIG");

  const rawData = {
    namaPengadaan: formData.get("namaPengadaan"),
    alamat: formData.get("alamat"),
    harga:
      typeof formData.get("harga") === "string"
        ? (formData.get("harga") as string).replace(/\D/g, "")
        : formData.get("harga"),
    tanggalMulai: formData.get("tanggalMulai"),
    tanggalSelesai: formData.get("tanggalSelesai"),
    noSuratPesanan: formData.get("noSuratPesanan"),
    tanggalPenyelesaian: formData.get("tanggalPenyelesaian"),
    vendorId: formData.get("vendorId"),
    picNama: formData.get("picNama"),
    picJabatan: formData.get("picJabatan"),
  };

  const parsed = pengadaanSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors,
      error: "Terdapat kesalahan pengisian data pada formulir.",
    };
  }

  const pdfFile = formData.get("dokumenPdf") as File | null;
  let newPdfBytes: Uint8Array | undefined;
  if (pdfFile && pdfFile.size > 0) {
    const arrayBuffer = await pdfFile.arrayBuffer();
    newPdfBytes = new Uint8Array(arrayBuffer);
  }

  try {
    await updateDraftPengadaan({
      pengadaanId,
      ...parsed.data,
      harga: BigInt(parsed.data.harga),
      newPdfBytes,
      actorId: user.id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memperbarui pengadaan";
    return { error: message };
  }

  redirect(`/tbig/pengadaan/${pengadaanId}`);
}

export async function deletePengadaanAction(pengadaanId: string): Promise<void> {
  await requireRole("TBIG");
  await deleteDraftPengadaan(pengadaanId);
  redirect("/tbig/pengadaan");
}

export async function sendPengadaanToVendorAction(
  pengadaanId: string
): Promise<{ error?: string }> {
  const user = await requireRole("TBIG");
  try {
    await submitPengadaanToVendor(pengadaanId, user.id);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal mengajukan pengadaan ke vendor";
    return { error: message };
  }
  redirect(`/tbig/pengadaan/${pengadaanId}`);
}

export async function signPengadaanAsTbigAction(
  pengadaanId: string
): Promise<{ error?: string }> {
  const user = await requireRole("TBIG");
  try {
    await submitTbigSign(pengadaanId, user.id);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memproses pengajuan tanda tangan TBIG";
    return { error: message };
  }
  redirect(`/tbig/pengadaan/${pengadaanId}`);
}

function safeRevalidatePengadaan(pengadaanId: string) {
  try {
    revalidatePath(`/tbig/pengadaan/${pengadaanId}`);
    revalidatePath("/tbig/pengadaan");
    revalidatePath(`/vendor/pengadaan/${pengadaanId}`);
    revalidatePath("/vendor/pengadaan");
  } catch {
    // Abaikan jika di luar runtime Next.js
  }
}

/**
 * Permintaan Kode OTP Verifikasi Tanda Tangan TBIG In-App
 */
export async function requestTbigOtpAction(
  pengadaanId: string
): Promise<{ error?: string; email?: string; isMock?: boolean; mockOtp?: string; signUrl?: string }> {
  await requireRole("TBIG");

  const job = await prisma.signJob.findFirst({
    where: {
      pengadaanId,
      type: SignJobType.SIGN_VENDOR,
      status: SignJobStatus.WAITING_SIGNER,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!job) {
    return { error: "Dokumen belum dalam tahap menunggu tanda tangan." };
  }

  const tbigSignerEmail =
    process.env.MEKARI_TBIG_SIGNER_EMAIL || "devtujuhsembilan@gmail.com";

  if (job.provider === "mekari") {
    let tbigSignUrl = job.tbigSignUrl;

    if (!tbigSignUrl && job.externalId) {
      try {
        const { mekariRequest } = await import("@/lib/esign/mekari/client");
        const doc = await mekariRequest<{ data?: { attributes?: { signing_link?: Array<{ recipient_email?: string; signing_link?: string }> } } }>("GET", `/documents/${job.externalId}`);
        const signingLinks = doc.data?.attributes?.signing_link || [];
        const found = signingLinks.find(
          (l) => l.recipient_email?.toLowerCase() === tbigSignerEmail.toLowerCase()
        )?.signing_link;
        if (found) {
          tbigSignUrl = found;
          try {
            await prisma.signJob.update({
              where: { id: job.id },
              data: { tbigSignUrl: found },
            });
          } catch {
            // Abaikan jika prisma belum reload
          }
        }
      } catch (err) {
        console.error("Error fetching mekari doc for tbigSignUrl:", err);
      }
    }

    if (tbigSignUrl) {
      return { email: tbigSignerEmail, isMock: false, signUrl: tbigSignUrl };
    }
    if (!job.tbigSignerId) {
      return { error: "Link atau Signer ID TBIG Mekari tidak ditemukan pada job tanda tangan ini." };
    }
    const provider = new MekariESignProvider();
    try {
      await provider.requestOtp(job.tbigSignerId);
      return { email: tbigSignerEmail, isMock: false };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Gagal mengirimkan kode OTP dari Mekari.";
      return { error: message };
    }
  }

  // Mode Mock
  return {
    email: tbigSignerEmail,
    isMock: true,
    mockOtp: "123456",
  };
}

/**
 * Validasi Kode OTP dan Penyelesaian Tanda Tangan TBIG In-App
 */
export async function submitTbigOtpSignAction(
  pengadaanId: string,
  otp: string
): Promise<{ error?: string }> {
  const user = await requireRole("TBIG");

  const cleanOtp = otp.trim();
  if (!cleanOtp) {
    return { error: "Kode OTP wajib diisi." };
  }

  const job = await prisma.signJob.findFirst({
    where: {
      pengadaanId,
      status: SignJobStatus.WAITING_SIGNER,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!job || !job.externalId) {
    return { error: "Dokumen belum dalam status menunggu tanda tangan." };
  }

  // Skenario 1: Mode Mock
  if (job.provider === "mock") {
    const mockRes = await submitMockTbigSignAction(job.id, cleanOtp);
    if (mockRes.error) {
      return { error: mockRes.error };
    }
    safeRevalidatePengadaan(pengadaanId);
    return {};
  }

  // Skenario 2: Mode Mekari V2
  if (job.provider === "mekari") {
    if (!job.tbigSignerId) {
      return { error: "Signer ID TBIG Mekari tidak valid." };
    }

    const provider = new MekariESignProvider();

    // 1. Validasi OTP ke Mekari V2
    const valRes = await provider.validateOtp(job.tbigSignerId, cleanOtp);
    if (!valRes.success) {
      return { error: valRes.error || "Kode OTP tidak valid atau telah kedaluwarsa." };
    }

    // 2. Eksekusi penandatanganan dokumen di Mekari V2
    const signRes = await provider.signDocument(job.tbigSignerId);
    if (!signRes.success) {
      return { error: signRes.error || "Gagal menyelesaikan tanda tangan di server Mekari." };
    }

    const now = new Date();
    // 3. Update status tanda tangan TBIG pada pengadaan
    const updatedPengadaan = await prisma.pengadaan.update({
      where: { id: pengadaanId },
      data: {
        tbigSignedAt: now,
      },
    });

    await prisma.activityLog.create({
      data: {
        pengadaanId,
        actorId: user.id,
        action: "TBIG_SIGNED_OTP",
        note: "TBIG telah menandatangani dokumen dan memvalidasi OTP secara in-app.",
      },
    });

    // 4. Jika Vendor juga sudah tanda tangan, selesaikan dokumen dan picu alur transisi
    if (updatedPengadaan.vendorSignedAt) {
      await handleESignEvent({
        provider: "mekari",
        externalId: job.externalId,
        type: "COMPLETED",
        raw: {
          inAppOtpSigned: true,
          signerId: job.tbigSignerId,
          timestamp: now.toISOString(),
        },
      });
    }

    safeRevalidatePengadaan(pengadaanId);
    return {};
  }

  return { error: `Provider '${job.provider}' tidak didukung.` };
}

