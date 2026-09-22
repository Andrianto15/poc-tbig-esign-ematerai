"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/user";
import {
  rejectPengadaanByVendor,
  submitVendorApproval,
  retryVendorSign,
} from "@/lib/workflow/pengadaan-workflow";
import { prisma } from "@/lib/db";
import { SignJobStatus, SignJobType } from "@/generated/prisma/enums";
import { MekariESignProvider } from "@/lib/esign/mekari/provider";
import { handleESignEvent } from "@/lib/workflow/handle-esign-event";
import { submitMockSignAction } from "@/app/mock-mekari/actions";

const rejectSchema = z.object({
  alasanPenolakan: z
    .string()
    .trim()
    .min(10, "Alasan penolakan minimal 10 karakter"),
});

function safeRevalidatePengadaan(pengadaanId: string) {
  try {
    revalidatePath(`/vendor/pengadaan/${pengadaanId}`);
    revalidatePath("/vendor/pengadaan");
    revalidatePath(`/tbig/pengadaan/${pengadaanId}`);
    revalidatePath("/tbig/pengadaan");
  } catch {
    // Abaikan saat dipanggil di luar runtime Next.js
  }
}

export async function rejectPengadaanAction(
  pengadaanId: string,
  alasanPenolakan: string
): Promise<{ error?: string }> {
  const user = await requireRole("VENDOR");
  if (!user.vendorId) {
    return { error: "User tidak terhubung dengan entitas vendor mana pun." };
  }

  const parsed = rejectSchema.safeParse({ alasanPenolakan });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || "Alasan penolakan tidak valid.",
    };
  }

  try {
    await rejectPengadaanByVendor({
      pengadaanId,
      vendorId: user.vendorId,
      actorId: user.id,
      alasanPenolakan: parsed.data.alasanPenolakan,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal menolak pengadaan.";
    return { error: message };
  }

  safeRevalidatePengadaan(pengadaanId);
  return {};
}

/**
 * Persetujuan Pengadaan oleh Vendor (Transisi T6)
 */
export async function approvePengadaanAction(
  pengadaanId: string
): Promise<{ error?: string }> {
  const user = await requireRole("VENDOR");
  if (!user.vendorId) {
    return { error: "User tidak terhubung dengan entitas vendor mana pun." };
  }

  try {
    await submitVendorApproval({
      pengadaanId,
      vendorId: user.vendorId,
      actorId: user.id,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal menyetujui pengadaan.";
    return { error: message };
  }

  safeRevalidatePengadaan(pengadaanId);
  return {};
}

/**
 * Pengajuan Ulang Pembubuhan eMeterai jika job FAILED
 */
export async function retryVendorMeteraiAction(
  pengadaanId: string
): Promise<{ error?: string }> {
  const user = await requireRole("VENDOR");
  if (!user.vendorId) {
    return { error: "User tidak terhubung dengan entitas vendor mana pun." };
  }

  try {
    await submitVendorApproval({
      pengadaanId,
      vendorId: user.vendorId,
      actorId: user.id,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal mengulang pembubuhan eMeterai.";
    return { error: message };
  }

  safeRevalidatePengadaan(pengadaanId);
  return {};
}

/**
 * Pengajuan Ulang Permintaan Tanda Tangan Vendor jika job FAILED
 */
export async function retryVendorSignAction(
  pengadaanId: string
): Promise<{ error?: string }> {
  const user = await requireRole("VENDOR");
  if (!user.vendorId) {
    return { error: "User tidak terhubung dengan entitas vendor mana pun." };
  }

  try {
    await retryVendorSign({
      pengadaanId,
      vendorId: user.vendorId,
      actorId: user.id,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal mengulang tanda tangan vendor.";
    return { error: message };
  }

  safeRevalidatePengadaan(pengadaanId);
  return {};
}

/**
 * Permintaan Pengiriman Kode OTP ke Email Vendor (Mekari V2 atau Mock)
 */
export async function requestVendorOtpAction(
  pengadaanId: string
): Promise<{ error?: string; email?: string; isMock?: boolean; mockOtp?: string }> {
  const user = await requireRole("VENDOR");
  if (!user.vendorId) {
    return { error: "User tidak terhubung dengan entitas vendor mana pun." };
  }

  const job = await prisma.signJob.findFirst({
    where: {
      pengadaanId,
      type: SignJobType.SIGN_VENDOR,
      status: SignJobStatus.WAITING_SIGNER,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!job) {
    return { error: "Dokumen belum dalam tahap menunggu tanda tangan vendor." };
  }

  if (job.provider === "mekari") {
    if (!job.signerId) {
      return { error: "Signer ID Mekari tidak ditemukan pada job tanda tangan ini." };
    }
    const provider = new MekariESignProvider();
    try {
      await provider.requestOtp(job.signerId);
      return { email: user.email, isMock: false };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Gagal mengirimkan kode OTP dari Mekari.";
      return { error: message };
    }
  }

  // Mode Mock
  return {
    email: user.email,
    isMock: true,
    mockOtp: "123456",
  };
}

/**
 * Validasi Kode OTP dan Penyelesaian Tanda Tangan Vendor In-App
 */
export async function submitVendorOtpSignAction(
  pengadaanId: string,
  otp: string
): Promise<{ error?: string }> {
  const user = await requireRole("VENDOR");
  if (!user.vendorId) {
    return { error: "User tidak terhubung dengan entitas vendor mana pun." };
  }

  const cleanOtp = otp.trim();
  if (!cleanOtp) {
    return { error: "Kode OTP wajib diisi." };
  }

  const job = await prisma.signJob.findFirst({
    where: {
      pengadaanId,
      type: SignJobType.SIGN_VENDOR,
      status: SignJobStatus.WAITING_SIGNER,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!job || !job.externalId) {
    return { error: "Dokumen belum dalam status menunggu tanda tangan vendor." };
  }

  // Skenario 1: Mode Mock
  if (job.provider === "mock") {
    const mockRes = await submitMockSignAction(job.id, cleanOtp);
    if (mockRes.error) {
      return { error: mockRes.error };
    }
    safeRevalidatePengadaan(pengadaanId);
    return {};
  }

  // Skenario 2: Mode Mekari V2
  if (job.provider === "mekari") {
    if (!job.signerId) {
      return { error: "Signer ID Mekari tidak valid." };
    }

    const provider = new MekariESignProvider();

    // 1. Validasi OTP ke Mekari V2
    const valRes = await provider.validateOtp(job.signerId, cleanOtp);
    if (!valRes.success) {
      return { error: valRes.error || "Kode OTP tidak valid atau telah kedaluwarsa." };
    }

    // 2. Eksekusi penandatanganan dokumen di Mekari V2
    const signRes = await provider.signDocument(job.signerId);
    if (!signRes.success) {
      return { error: signRes.error || "Gagal menyelesaikan tanda tangan di server Mekari." };
    }

    // 3. Picu alur transisi penyelesaian dokumen lokal
    await handleESignEvent({
      provider: "mekari",
      externalId: job.externalId,
      type: "COMPLETED",
      raw: {
        inAppOtpSigned: true,
        signerId: job.signerId,
        timestamp: new Date().toISOString(),
      },
    });

    safeRevalidatePengadaan(pengadaanId);
    return {};
  }

  return { error: `Provider '${job.provider}' tidak didukung.` };
}
