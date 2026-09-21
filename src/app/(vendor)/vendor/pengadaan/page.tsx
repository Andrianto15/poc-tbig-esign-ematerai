export default function VendorPengadaanPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Pengadaan Vendor</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Daftar pengadaan yang membutuhkan persetujuan dan tanda tangan Anda.
          </p>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-zinc-500">
        <p className="text-base font-medium text-zinc-800">Daftar Pengadaan Vendor</p>
        <p className="text-sm mt-1">Modul review pengadaan vendor akan diaktifkan pada Step 1.9.</p>
      </div>
    </div>
  );
}
