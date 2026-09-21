import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import { StatusBadge } from "@/components/StatusBadge";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatRupiah, formatDateIndo } from "@/lib/pdf/lembar-pengesahan";
import { FileKind, PengadaanStatus } from "@/generated/prisma/enums";
import { RejectDialog } from "./RejectDialog";

export default async function VendorDetailPengadaanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("VENDOR");
  const { id } = await params;

  if (!user.vendorId) {
    notFound();
  }

  const pengadaan = await prisma.pengadaan.findUnique({
    where: { id },
    include: {
      vendor: true,
      files: true,
      jobs: {
        orderBy: { createdAt: "desc" },
      },
      logs: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // PRD 7.4: Pengadaan harus milik vendor pengguna
  if (!pengadaan || pengadaan.vendorId !== user.vendorId) {
    notFound();
  }

  // PRD 7.4: Vendor tidak boleh melihat pengadaan DRAFT atau MENUNGGU_TTD_TBIG
  if (
    pengadaan.status === PengadaanStatus.DRAFT ||
    pengadaan.status === PengadaanStatus.MENUNGGU_TTD_TBIG
  ) {
    notFound();
  }

  const isProcessing = pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR;

  // PRD 8.6: Preview PDF versi yang sudah ditandatangani TBIG atau lebih baru
  const vendorFilePriority: FileKind[] = [
    FileKind.FINAL,
    FileKind.STAMPED_METERAI,
    FileKind.SIGNED_TBIG,
  ];

  const activeFile = vendorFilePriority
    .map((kind) => pengadaan.files.find((f) => f.kind === kind))
    .find(Boolean);

  return (
    <div className="space-y-6">
      {/* Auto refresh jika status sedang diproses di sisi vendor */}
      {isProcessing && <AutoRefresh intervalMs={3000} />}

      {/* Navigasi Kembali */}
      <div>
        <Link
          href="/vendor/pengadaan"
          className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Kembali ke Daftar Pengadaan
        </Link>
      </div>

      {/* Header Detail */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className="text-xs font-mono text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
              {pengadaan.noSuratPesanan}
            </span>
            <StatusBadge status={pengadaan.status} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">{pengadaan.namaPengadaan}</h1>
          <p className="text-xs text-zinc-400 mt-1">ID: {pengadaan.id}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {pengadaan.status === PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR && (
            <>
              <RejectDialog pengadaanId={pengadaan.id} />
              <button
                type="button"
                disabled
                title="Fitur Setuju & Tanda Tangan akan aktif pada Step 1.10"
                className="px-4 py-2 bg-emerald-600/50 text-white rounded-lg text-sm font-medium cursor-not-allowed flex items-center space-x-1.5 opacity-80"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Setuju (Step 1.10)</span>
              </button>
            </>
          )}

          {activeFile && (
            <a
              href={`/api/files/${activeFile.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm inline-flex items-center space-x-1.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>Unduh PDF</span>
            </a>
          )}
        </div>
      </div>

      {/* Banner Alasan Penolakan jika DITOLAK */}
      {pengadaan.status === PengadaanStatus.DITOLAK && pengadaan.alasanPenolakan && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-red-900">
                Pengadaan Ditolak oleh Vendor
              </p>
              <p className="text-sm text-red-800">
                <span className="font-semibold">Alasan:</span> &ldquo;{pengadaan.alasanPenolakan}&rdquo;
              </p>
              {pengadaan.vendorRespondedAt && (
                <p className="text-xs text-red-600">
                  Ditolak pada {formatDateIndo(pengadaan.vendorRespondedAt)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Banner Sedang Diproses */}
      {isProcessing && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <svg
                className="animate-spin h-4 w-4 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-900">
                Sedang Memproses Dokumen Elektronik
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Proses pembubuhan eMeterai dan penyiapan tanda tangan vendor sedang berjalan...
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-blue-600 font-medium bg-blue-100 px-2.5 py-1 rounded-full animate-pulse">
            Auto-refresh aktif
          </span>
        </div>
      )}

      {/* Grid: Informasi & Preview PDF */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri: Ringkasan Pengadaan & Riwayat */}
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider border-b border-zinc-100 pb-2">
              Informasi Pengadaan
            </h2>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-zinc-500">Harga Pengadaan</p>
                <p className="font-semibold text-zinc-900 text-base">
                  {formatRupiah(pengadaan.harga)}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Periode Pekerjaan</p>
                <p className="font-medium text-zinc-800">
                  {formatDateIndo(pengadaan.tanggalMulai)} s.d.{" "}
                  {formatDateIndo(pengadaan.tanggalSelesai)}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Target Penyelesaian</p>
                <p className="font-medium text-zinc-800">
                  {formatDateIndo(pengadaan.tanggalPenyelesaian)}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Lokasi / Alamat</p>
                <p className="font-medium text-zinc-800 whitespace-pre-line">
                  {pengadaan.alamat}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider border-b border-zinc-100 pb-2">
              Data Rekanan Anda
            </h2>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-zinc-500">Perusahaan Vendor</p>
                <p className="font-semibold text-zinc-900">{pengadaan.vendor.nama}</p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">PIC Penandatangan</p>
                <p className="font-medium text-zinc-800">{pengadaan.picNama}</p>
                <p className="text-xs text-zinc-500">{pengadaan.picJabatan}</p>
              </div>
            </div>
          </div>

          {/* Activity Log Timeline */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider border-b border-zinc-100 pb-2">
              Riwayat Aktivitas
            </h2>

            <div className="space-y-4">
              {pengadaan.logs.map((log) => (
                <div key={log.id} className="border-l-2 border-emerald-500 pl-3 py-0.5 text-xs">
                  <p className="font-semibold text-zinc-800">{log.action}</p>
                  {log.note && <p className="text-zinc-600 mt-0.5">{log.note}</p>}
                  <p className="text-zinc-400 mt-1">
                    {new Intl.DateTimeFormat("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(log.createdAt))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Preview Dokumen PDF */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm h-full flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
                  Preview Dokumen ({activeFile?.kind || "PDF"})
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Dokumen perjanjian kerja sama yang telah ditandatangani oleh pihak TBIG.
                </p>
              </div>
              {activeFile && (
                <span className="text-xs text-zinc-400 font-mono">
                  {(activeFile.sizeBytes / 1024).toFixed(1)} KB
                </span>
              )}
            </div>

            <div className="flex-1 min-h-[650px] bg-zinc-100 rounded-lg overflow-hidden border border-zinc-200">
              {activeFile ? (
                <iframe
                  src={`/api/files/${activeFile.id}`}
                  className="w-full h-full min-h-[650px]"
                  title="Preview Dokumen Pengadaan"
                />
              ) : (
                <div className="h-full min-h-[650px] flex items-center justify-center text-zinc-400 text-sm">
                  Dokumen belum tersedia untuk pratinjau vendor
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
