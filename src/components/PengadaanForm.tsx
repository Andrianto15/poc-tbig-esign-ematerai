"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ActionState } from "@/app/(tbig)/actions";

interface VendorOption {
  id: string;
  nama: string;
  picNama: string;
  picJabatan: string;
}

interface InitialData {
  id?: string;
  namaPengadaan: string;
  alamat: string;
  harga: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  noSuratPesanan: string;
  tanggalPenyelesaian: string;
  vendorId: string;
  picNama: string;
  picJabatan: string;
}

export function PengadaanForm({
  action,
  vendors,
  initialData,
  isEdit = false,
}: {
  action: (prevState: ActionState | null, formData: FormData) => Promise<ActionState>;
  vendors: VendorOption[];
  initialData?: InitialData;
  isEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  const [selectedVendorId, setSelectedVendorId] = useState(
    initialData?.vendorId || (vendors.length > 0 ? vendors[0].id : "")
  );
  const [picNama, setPicNama] = useState(
    initialData?.picNama || (vendors.length > 0 ? vendors[0].picNama : "")
  );
  const [picJabatan, setPicJabatan] = useState(
    initialData?.picJabatan || (vendors.length > 0 ? vendors[0].picJabatan : "")
  );

  const handleVendorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vId = e.target.value;
    setSelectedVendorId(vId);
    const vendor = vendors.find((v) => v.id === vId);
    if (vendor && !isEdit) {
      setPicNama(vendor.picNama);
      setPicJabatan(vendor.picJabatan);
    }
  };

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <p className="font-semibold">{state.error}</p>
        </div>
      )}

      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-5">
        <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
          Informasi Pengadaan
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Nama Pengadaan <span className="text-red-500">*</span>
            </label>
            <input
              name="namaPengadaan"
              defaultValue={initialData?.namaPengadaan}
              required
              minLength={3}
              maxLength={200}
              placeholder="Contoh: Pengadaan Perangkat Jaringan Wilayah 1"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {state?.fieldErrors?.namaPengadaan && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.namaPengadaan[0]}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Alamat <span className="text-red-500">*</span>
            </label>
            <textarea
              name="alamat"
              defaultValue={initialData?.alamat}
              required
              minLength={5}
              maxLength={500}
              rows={3}
              placeholder="Alamat lengkap lokasi pengadaan"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {state?.fieldErrors?.alamat && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.alamat[0]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              No. Surat Pesanan <span className="text-red-500">*</span>
            </label>
            <input
              name="noSuratPesanan"
              defaultValue={initialData?.noSuratPesanan}
              required
              placeholder="Contoh: SP/TBIG/2026/001"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {state?.fieldErrors?.noSuratPesanan && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.noSuratPesanan[0]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Harga Pengadaan (Rupiah) <span className="text-red-500">*</span>
            </label>
            <input
              name="harga"
              type="number"
              min={1}
              step={1}
              defaultValue={initialData?.harga}
              required
              placeholder="Contoh: 150000000"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {state?.fieldErrors?.harga && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.harga[0]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Tanggal Pengadaan (Dari) <span className="text-red-500">*</span>
            </label>
            <input
              name="tanggalMulai"
              type="date"
              defaultValue={initialData?.tanggalMulai}
              required
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {state?.fieldErrors?.tanggalMulai && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.tanggalMulai[0]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Tanggal Pengadaan (Sampai) <span className="text-red-500">*</span>
            </label>
            <input
              name="tanggalSelesai"
              type="date"
              defaultValue={initialData?.tanggalSelesai}
              required
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {state?.fieldErrors?.tanggalSelesai && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.tanggalSelesai[0]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Tanggal Penyelesaian <span className="text-red-500">*</span>
            </label>
            <input
              name="tanggalPenyelesaian"
              type="date"
              defaultValue={initialData?.tanggalPenyelesaian}
              required
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {state?.fieldErrors?.tanggalPenyelesaian && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.tanggalPenyelesaian[0]}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-5">
        <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
          Vendor & Penandatangan
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Pilih Vendor <span className="text-red-500">*</span>
            </label>
            <select
              name="vendorId"
              value={selectedVendorId}
              onChange={handleVendorChange}
              required
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nama}
                </option>
              ))}
            </select>
            {state?.fieldErrors?.vendorId && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.vendorId[0]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Nama PIC Vendor <span className="text-red-500">*</span>
            </label>
            <input
              name="picNama"
              value={picNama}
              onChange={(e) => setPicNama(e.target.value)}
              required
              placeholder="Nama penandatangan vendor"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {state?.fieldErrors?.picNama && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.picNama[0]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Jabatan PIC Vendor <span className="text-red-500">*</span>
            </label>
            <input
              name="picJabatan"
              value={picJabatan}
              onChange={(e) => setPicJabatan(e.target.value)}
              required
              placeholder="Contoh: Direktur Utama"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {state?.fieldErrors?.picJabatan && (
              <p className="text-xs text-red-600 mt-1">
                {state.fieldErrors.picJabatan[0]}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-5">
        <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
          Dokumen Pengadaan
        </h2>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Upload File PDF {isEdit ? "(Opsional jika tidak diubah)" : <span className="text-red-500">*</span>}
          </label>
          <input
            type="file"
            name="dokumenPdf"
            accept="application/pdf"
            required={!isEdit}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Format: PDF, ukuran maksimal 10 MB. Sistem akan otomatis menambahkan Lembar Pengesahan di akhir PDF.
          </p>
          {state?.fieldErrors?.dokumenPdf && (
            <p className="text-xs text-red-600 mt-1">
              {state.fieldErrors.dokumenPdf[0]}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end space-x-3 pt-2">
        <Link
          href={isEdit && initialData?.id ? `/tbig/pengadaan/${initialData.id}` : "/tbig/pengadaan"}
          className="px-4 py-2 border border-zinc-300 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Batal
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
        >
          {isPending ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Pengadaan"}
        </button>
      </div>
    </form>
  );
}
