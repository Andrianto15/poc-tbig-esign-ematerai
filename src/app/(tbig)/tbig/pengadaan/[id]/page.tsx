import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import { deletePengadaanAction } from "@/app/(tbig)/actions";
import { StatusBadge } from "@/components/StatusBadge";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatRupiah, formatDateIndo } from "@/lib/pdf/lembar-pengesahan";
import { FileKind, PengadaanStatus, SignJobStatus } from "@/generated/prisma/enums";
import { SignTbigDialog } from "./SignTbigDialog";
import { RetryTbigSignButton } from "./RetryTbigSignButton";

export default async function DetailPengadaanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("TBIG");
  const { id } = await params;

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

  if (!pengadaan) {
    notFound();
  }

  const latestJob = pengadaan.jobs[0];
  const isJobFailed = latestJob?.status === SignJobStatus.FAILED;
  const isProcessing =
    (pengadaan.status === PengadaanStatus.MENUNGGU_TTD_TBIG ||
      pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR) &&
    !isJobFailed;

  // Pilih file dokumen dengan prioritas: FINAL > STAMPED_METERAI > SIGNED_TBIG > PREPARED > ORIGINAL
  const filePriority: FileKind[] = [
    FileKind.FINAL,
    FileKind.STAMPED_METERAI,
    FileKind.SIGNED_TBIG,
    FileKind.PREPARED,
    FileKind.ORIGINAL,
  ];

  const activeFile =
    filePriority
      .map((kind) => pengadaan.files.find((f) => f.kind === kind))
      .find(Boolean) || pengadaan.files[0];

  const deleteActionWithId = deletePengadaanAction.bind(null, pengadaan.id);

  return (
    <div className="space-y-6">
      {/* Auto refresh saat status sedang diproses */}
      {isProcessing && <AutoRefresh intervalMs={3000} />}

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
          {pengadaan.status === PengadaanStatus.DRAFT && (
            <>
              <SignTbigDialog pengadaanId={pengadaan.id} />
              <Link
                href={`/tbig/pengadaan/${pengadaan.id}/edit`}
                className="px-4 py-2 border border-zinc-300 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Edit
              </Link>
              <form action={deleteActionWithId}>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  Hapus
                </button>
              </form>
            </>
          )}
          {isJobFailed && (
            <RetryTbigSignButton pengadaanId={pengadaan.id} />
          )}
          {activeFile && (
            <a
              href={`/api/files/${activeFile.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Unduh PDF
            </a>
          )}
        </div>
      </div>

      {/* Banner Status Sedang Diproses */}
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
                {pengadaan.status === PengadaanStatus.MENUNGGU_TTD_TBIG
                  ? "Sedang Memproses Tanda Tangan TBIG"
                  : "Sedang Dalam Proses Vendor"}
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Dokumen sedang diproses secara elektronik oleh penyedia tanda tangan. Halaman akan diperbarui otomatis setiap beberapa detik...
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-blue-600 font-medium bg-blue-100 px-2.5 py-1 rounded-full animate-pulse">
            Auto-refresh aktif
          </span>
        </div>
      )}

      {/* Banner Error Job Gagal */}
      {isJobFailed && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-red-900">
                Proses Tanda Tangan Gagal
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                {latestJob?.errorMessage || "Penyedia tanda tangan gagal memproses dokumen."} Silakan coba lagi.
              </p>
            </div>
          </div>
          <RetryTbigSignButton pengadaanId={pengadaan.id} />
        </div>
      )}

      {/* Alasan Penolakan jika DITOLAK */}
      {pengadaan.status === PengadaanStatus.DITOLAK && pengadaan.alasanPenolakan && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800">
          <p className="text-xs font-bold uppercase tracking-wider text-red-600 mb-1">
            Alasan Penolakan oleh Vendor
          </p>
          <p className="text-sm">{pengadaan.alasanPenolakan}</p>
        </div>
      )}

      {/* Grid: Data Pengadaan & PDF Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri: Ringkasan Data */}
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
                  {formatDateIndo(pengadaan.tanggalMulai)} s.d. {formatDateIndo(pengadaan.tanggalSelesai)}
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
              Vendor Rekanan
            </h2>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-zinc-500">Nama Perusahaan</p>
                <p className="font-semibold text-zinc-900">{pengadaan.vendor.nama}</p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Alamat Vendor</p>
                <p className="font-medium text-zinc-800">{pengadaan.vendor.alamat || "-"}</p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Penandatangan (PIC)</p>
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
                <div key={log.id} className="border-l-2 border-blue-500 pl-3 py-0.5 text-xs">
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
                  Termasuk halaman Lembar Pengesahan di akhir PDF.
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
                <div className="h-full flex items-center justify-center text-zinc-400 text-sm">
                  Dokumen tidak tersedia
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
