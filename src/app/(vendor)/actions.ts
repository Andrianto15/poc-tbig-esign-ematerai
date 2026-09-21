"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/user";
import {
  rejectPengadaanByVendor,
  submitVendorApproval,
  retryVendorSign,
} from "@/lib/workflow/pengadaan-workflow";

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
