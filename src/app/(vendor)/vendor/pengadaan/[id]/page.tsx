import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import { StatusBadge } from "@/components/StatusBadge";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatRupiah, formatDateIndo } from "@/lib/pdf/lembar-pengesahan";
import {
  FileKind,
  PengadaanStatus,
  SignJobStatus,
  SignJobType,
} from "@/generated/prisma/enums";
import { RejectDialog } from "./RejectDialog";
import { ApproveDialog } from "./ApproveDialog";
import { RetryVendorButton } from "./RetryVendorButton";
import { VendorSignOtpDialog } from "./VendorSignOtpDialog";
import { ActivityLogTimeline } from "@/components/ActivityLogTimeline";
import { CheckStatusButton } from "@/components/CheckStatusButton";
import { syncPengadaanJobStatus } from "@/lib/workflow/sync-status";

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

  let pengadaan = await prisma.pengadaan.findUnique({
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

  // PRD 7.4: Vendor tidak boleh melihat pengadaan berstatus DRAFT
  if (pengadaan.status === PengadaanStatus.DRAFT) {
    notFound();
  }

  let latestJob = pengadaan.jobs[0];

  // Jika vendor belum tercatat signed tapi job WAITING_SIGNER, sinkronkan status dengan provider
  if (
    pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR &&
    latestJob?.status === SignJobStatus.WAITING_SIGNER &&
    !pengadaan.vendorSignedAt &&
    latestJob?.externalId
  ) {
    try {
      const syncResult = await syncPengadaanJobStatus(pengadaan.id);
      if (syncResult.updated) {
        const refreshed = await prisma.pengadaan.findUnique({
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
        if (refreshed) {
          pengadaan = refreshed;
          latestJob = pengadaan.jobs[0];
        }
      }
    } catch {
      // Abaikan jika sync background gagal
    }
  }
  const isJobFailed = latestJob?.status === SignJobStatus.FAILED;

  const isMeteraiPending =
    pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR &&
    latestJob?.type === SignJobType.STAMP_METERAI &&
    latestJob?.status === SignJobStatus.PENDING;

  const isWaitingSigner =
    pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR &&
    latestJob?.type === SignJobType.SIGN_VENDOR &&
    latestJob?.status === SignJobStatus.WAITING_SIGNER;

  // Auto-refresh saat proses meterai, tanda tangan, atau menunggu ttd TBIG
  const isProcessing =
    isMeteraiPending ||
    pengadaan.status === PengadaanStatus.MENUNGGU_TTD_TBIG;

  // PRD 8.6: Preview PDF
  const vendorFilePriority: FileKind[] = [
    FileKind.FINAL,
    FileKind.SIGNED_VENDOR,
    FileKind.STAMPED_METERAI,
    FileKind.SIGNED_TBIG,
    FileKind.PREPARED,
    FileKind.ORIGINAL,
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
          <p className="text-xs text-zinc-500 mt-1">ID: {pengadaan.id}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {pengadaan.status === PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR && (
            <>
              <RejectDialog pengadaanId={pengadaan.id} />
              <ApproveDialog pengadaanId={pengadaan.id} />
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
              <span>{pengadaan.status === PengadaanStatus.SELESAI ? "Unduh PDF Final" : "Unduh PDF"}</span>
            </a>
          )}
        </div>
      </div>

      {/* Banner Menunggu Tanda Tangan TBIG */}
      {pengadaan.status === PengadaanStatus.MENUNGGU_TTD_TBIG && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-blue-900">
                Menunggu Tanda Tangan TBIG
              </p>
              <p className="text-sm text-blue-800 leading-relaxed">
                Dokumen telah Anda setujui dan ditandatangani serta dibubuhi eMeterai. Saat ini sedang menunggu proses tanda tangan pihak TBIG. Halaman akan diperbarui otomatis saat proses selesai.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Banner Selesai jika SELESAI */}
      {pengadaan.status === PengadaanStatus.SELESAI && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-emerald-900">
                Pengadaan Telah Selesai
              </p>
              <p className="text-sm text-emerald-800 leading-relaxed">
                Dokumen pengadaan telah selesai ditandatangani oleh kedua belah pihak dan dibubuhi eMeterai. Anda dapat mengunduh salinan dokumen final melalui tombol di atas.
              </p>
              {pengadaan.vendorSignedAt && (
                <p className="text-xs text-emerald-700 pt-1">
                  Ditandatangani vendor pada {formatDateIndo(pengadaan.vendorSignedAt)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Banner Error Job Gagal */}
      {isJobFailed && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
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
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-red-900">
                {latestJob?.type === SignJobType.STAMP_METERAI
                  ? "Proses Pembubuhan eMeterai Gagal"
                  : "Proses Tanda Tangan Vendor Gagal"}
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                {latestJob?.errorMessage || "Penyedia tanda tangan gagal memproses dokumen."} Silakan coba lagi.
              </p>
            </div>
          </div>
          {latestJob && (
            <RetryVendorButton
              pengadaanId={pengadaan.id}
              type={latestJob.type as "STAMP_METERAI" | "SIGN_VENDOR"}
            />
          )}
        </div>
      )}

      {/* Banner Menunggu Tanda Tangan (Job WAITING_SIGNER) */}
      {isWaitingSigner && (
        pengadaan.vendorSignedAt ? (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 shrink-0 mt-0.5">
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-950">
                  Anda Telah Menandatangani Dokumen
                </p>
                <p className="text-xs text-blue-800 mt-0.5">
                  Tanda tangan dan eMeterai telah selesai Anda verifikasi. Dokumen saat ini sedang menunggu penyelesaian tanda tangan dari pihak TBIG.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {latestJob && (
                <CheckStatusButton
                  pengadaanId={pengadaan.id}
                  jobCreatedAt={latestJob.createdAt}
                  forceShow={true}
                  label="Cek status"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0 mt-0.5">
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
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-indigo-950">
                  Dokumen Siap Ditandatangani & Dibubuhi eMeterai
                </p>
                <p className="text-xs text-indigo-800 mt-0.5">
                  {latestJob?.signUrl
                    ? "eMeterai resmi (kuota Vendor) telah disiapkan. Klik tombol di samping untuk menandatangani dokumen dan memvalidasi OTP di Mekari Sign."
                    : "eMeterai resmi (kuota Vendor) telah disiapkan. Silakan verifikasi OTP untuk menyelesaikan tanda tangan."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {latestJob && (
                <CheckStatusButton
                  pengadaanId={pengadaan.id}
                  jobCreatedAt={latestJob.createdAt}
                  forceShow={true}
                  label="Cek status"
                />
              )}
              {latestJob?.signUrl ? (
                <a
                  href={latestJob.signUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs shrink-0 flex items-center space-x-1.5"
                >
                  <span>Lanjutkan Tanda Tangan</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </a>
              ) : (
                <VendorSignOtpDialog
                  pengadaanId={pengadaan.id}
                  noSuratPesanan={pengadaan.noSuratPesanan}
                  vendorNama={pengadaan.vendor.nama}
                  initialEmail={user.email}
                  isMockMode={process.env.ESIGN_MODE === "mock"}
                />
              )}
            </div>
          </div>
        )
      )}

      {/* Banner Sedang Membubuhkan eMeterai (Auto-Refresh) */}
      {isMeteraiPending && (
        <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
              <svg
                className="animate-spin h-4 w-4 text-purple-600"
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
              <p className="text-sm font-bold text-purple-900">
                Sedang Membubuhkan eMeterai…
              </p>
              <p className="text-xs text-purple-700 mt-0.5">
                Dokumen sedang diproses untuk pembubuhan eMeterai secara elektronik. Halaman akan diperbarui otomatis setelah selesai.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {latestJob && (
              <CheckStatusButton
                pengadaanId={pengadaan.id}
                jobCreatedAt={latestJob.createdAt}
              />
            )}
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-900 bg-purple-100/80 border border-purple-200 px-2.5 py-1 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
              Auto-refresh aktif
            </span>
          </div>
        </div>
      )}

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

            <ActivityLogTimeline logs={pengadaan.logs} />
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
                  {pengadaan.status === PengadaanStatus.SELESAI
                    ? "Dokumen final yang telah ditandatangani lengkap oleh kedua belah pihak beserta eMeterai."
                    : "Dokumen perjanjian kerja sama yang sedang dalam proses pengesahan."}
                </p>
              </div>
              {activeFile && (
                <span className="text-xs text-zinc-500 font-mono">
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
                <div className="h-full min-h-[650px] flex items-center justify-center text-zinc-500 text-sm">
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
