"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/user";
import { rejectPengadaanByVendor } from "@/lib/workflow/pengadaan-workflow";

const rejectSchema = z.object({
  alasanPenolakan: z
    .string()
    .trim()
    .min(10, "Alasan penolakan minimal 10 karakter"),
});

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

  revalidatePath(`/vendor/pengadaan/${pengadaanId}`);
  revalidatePath("/vendor/pengadaan");
  revalidatePath(`/tbig/pengadaan/${pengadaanId}`);
  revalidatePath("/tbig/pengadaan");

  return {};
}
