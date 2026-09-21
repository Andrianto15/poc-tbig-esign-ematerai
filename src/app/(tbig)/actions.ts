"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/user";
import {
  createDraftPengadaan,
  updateDraftPengadaan,
  deleteDraftPengadaan,
} from "@/lib/workflow/pengadaan-workflow";

const pengadaanSchema = z
  .object({
    namaPengadaan: z
      .string()
      .trim()
      .min(3, "Nama Pengadaan minimal 3 karakter")
      .max(200, "Nama Pengadaan maksimal 200 karakter"),
    alamat: z
      .string()
      .trim()
      .min(5, "Alamat minimal 5 karakter")
      .max(500, "Alamat maksimal 500 karakter"),
    harga: z.coerce
      .number()
      .int("Harga harus bilangan bulat")
      .positive("Harga harus lebih besar dari 0"),
    tanggalMulai: z.coerce.date({ message: "Tanggal mulai wajib diisi" }),
    tanggalSelesai: z.coerce.date({ message: "Tanggal selesai wajib diisi" }),
    noSuratPesanan: z.string().trim().min(1, "No. Surat Pesanan wajib diisi"),
    tanggalPenyelesaian: z.coerce.date({
      message: "Tanggal penyelesaian wajib diisi",
    }),
    vendorId: z.string().trim().min(1, "Vendor wajib dipilih"),
    picNama: z.string().trim().min(1, "PIC Vendor wajib diisi"),
    picJabatan: z.string().trim().min(1, "Jabatan PIC wajib diisi"),
  })
  .refine((data) => data.tanggalSelesai >= data.tanggalMulai, {
    message: "Tanggal pengadaan (sampai) harus >= tanggal pengadaan (dari)",
    path: ["tanggalSelesai"],
  })
  .refine((data) => data.tanggalPenyelesaian >= data.tanggalMulai, {
    message: "Tanggal penyelesaian harus >= tanggal pengadaan (dari)",
    path: ["tanggalPenyelesaian"],
  });

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
    harga: formData.get("harga"),
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
    harga: formData.get("harga"),
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
