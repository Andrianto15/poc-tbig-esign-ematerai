import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full text-center space-y-5 bg-white border border-zinc-200 rounded-2xl p-8 sm:p-10 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-600 mx-auto flex items-center justify-center font-mono font-bold text-lg">
          404
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Halaman atau dokumen pengadaan yang Anda cari tidak tersedia, telah dihapus, atau Anda tidak memiliki hak akses untuk membukanya.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
