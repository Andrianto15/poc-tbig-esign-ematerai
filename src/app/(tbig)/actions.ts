"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/user";
import {
  createDraftPengadaan,
  updateDraftPengadaan,
  deleteDraftPengadaan,
  submitTbigSign,
} from "@/lib/workflow/pengadaan-workflow";

import { pengadaanSchema } from "@/lib/validations/pengadaan";

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
