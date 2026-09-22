"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import {
  syncPengadaanJobStatus,
  SyncStatusResult,
} from "@/lib/workflow/sync-status";

export async function syncSignJobStatusAction(
  pengadaanId: string
): Promise<SyncStatusResult> {
  const user = await requireRole(["TBIG", "VENDOR"]);

  // Verifikasi kepemilikan jika role adalah vendor
  if (user.role === "VENDOR") {
    const pengadaan = await prisma.pengadaan.findUnique({
      where: { id: pengadaanId },
      select: { vendorId: true },
    });
    if (!pengadaan || pengadaan.vendorId !== user.vendorId) {
      return {
        success: false,
        updated: false,
        message: "Anda tidak memiliki akses ke pengadaan ini.",
      };
    }
  }

  try {
    const result = await syncPengadaanJobStatus(pengadaanId);

    if (result.updated) {
      try {
        revalidatePath(`/tbig/pengadaan/${pengadaanId}`);
        revalidatePath(`/vendor/pengadaan/${pengadaanId}`);
        revalidatePath("/tbig/pengadaan");
        revalidatePath("/vendor/pengadaan");
      } catch {
        // Abaikan jika dijalankan di luar Next.js request context
      }
    }

    return result;
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan saat memeriksa status ke penyedia.";
    return {
      success: false,
      updated: false,
      message,
    };
  }
}
