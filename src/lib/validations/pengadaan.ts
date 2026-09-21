import { z } from "zod";

export const pengadaanSchema = z
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

export type PengadaanFormData = z.infer<typeof pengadaanSchema>;
