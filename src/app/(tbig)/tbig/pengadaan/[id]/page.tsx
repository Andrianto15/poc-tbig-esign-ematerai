import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import { deletePengadaanAction } from "@/app/(tbig)/actions";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRupiah, formatDateIndo } from "@/lib/pdf/lembar-pengesahan";
import { FileKind, PengadaanStatus, SignJobStatus } from "@/generated/prisma/enums";
import { ActivityLogTimeline } from "@/components/ActivityLogTimeline";
import { SignTbigDialog } from "./SignTbigDialog";
import { TbigSignOtpDialog } from "./TbigSignOtpDialog";
import { SendToVendorDialog } from "./SendToVendorDialog";
import { RetryTbigSignButton } from "./RetryTbigSignButton";
import { CheckStatusButton } from "@/components/CheckStatusButton";
import { syncPengadaanJobStatus } from "@/lib/workflow/sync-status";

export default async function DetailPengadaanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("TBIG");
  const { id } = await params;

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

  if (!pengadaan) {
    notFound();
  }

  let latestJob = pengadaan.jobs[0];

  // Sinkronkan status tanda tangan dengan provider jika masih ada pihak yang belum selesai
  if (
    (pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR ||
      pengadaan.status === PengadaanStatus.MENUNGGU_TTD_TBIG) &&
    latestJob?.status === SignJobStatus.WAITING_SIGNER &&
    (!pengadaan.vendorSignedAt || !pengadaan.tbigSignedAt) &&
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
  const isWaitingSigner =
    (pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR ||
      pengadaan.status === PengadaanStatus.MENUNGGU_TTD_TBIG) &&
    latestJob?.status === SignJobStatus.WAITING_SIGNER;
  const canTbigSign = isWaitingSigner && !pengadaan.tbigSignedAt;

  // Pastikan tbigSignUrl terisi dari Mekari jika belum tercatat di DB
  let tbigSignUrl = latestJob?.tbigSignUrl;
  if (
    !tbigSignUrl &&
    latestJob?.provider === "mekari" &&
    latestJob?.externalId &&
    canTbigSign
  ) {
    try {
      const { mekariRequest } = await import("@/lib/esign/mekari/client");
      const doc = await mekariRequest<{ data?: { attributes?: { signing_link?: Array<{ recipient_email?: string; signing_link?: string }> } } }>("GET", `/documents/${latestJob.externalId}`);
      const signingLinks = doc.data?.attributes?.signing_link || [];
      const tbigEmail = (process.env.MEKARI_TBIG_SIGNER_EMAIL || "devtujuhsembilan@gmail.com").toLowerCase();
      const found = signingLinks.find(
        (l) => l.recipient_email?.toLowerCase() === tbigEmail
      )?.signing_link;
      if (found) {
        tbigSignUrl = found;
        try {
          await prisma.signJob.update({
            where: { id: latestJob.id },
            data: { tbigSignUrl: found },
          });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  const isProcessing =
    (pengadaan.status === PengadaanStatus.MENUNGGU_TTD_TBIG ||
      pengadaan.status === PengadaanStatus.MENUNGGU_TTD_VENDOR) &&
    !isJobFailed &&
    !canTbigSign;

  // Pilih file dokumen dengan prioritas: FINAL > SIGNED_VENDOR > STAMPED_METERAI > SIGNED_TBIG > PREPARED > ORIGINAL
  const filePriority: FileKind[] = [
    FileKind.FINAL,
    FileKind.SIGNED_VENDOR,
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

      {/* Navigasi Kembali */}
      <div>
        <Link
          href="/tbig/pengadaan"
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
          {pengadaan.status === PengadaanStatus.DRAFT && (
            <>
              <SendToVendorDialog pengadaanId={pengadaan.id} />
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
          {canTbigSign && (
            <TbigSignOtpDialog
              pengadaanId={pengadaan.id}
              noSuratPesanan={pengadaan.noSuratPesanan}
              namaPengadaan={pengadaan.namaPengadaan}
              initialEmail={process.env.MEKARI_TBIG_SIGNER_EMAIL || user.email}
              isMockMode={process.env.ESIGN_MODE === "mock"}
            />
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
              {pengadaan.status === PengadaanStatus.SELESAI ? "Unduh PDF Final" : "Unduh PDF"}
            </a>
          )}
        </div>
      </div>

      {/* Banner Menunggu Review Vendor jika MENUNGGU_PERSETUJUAN_VENDOR */}
      {pengadaan.status === PengadaanStatus.MENUNGGU_PERSETUJUAN_VENDOR && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center space-x-3 shadow-xs">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-amber-900">Menunggu Review Vendor</p>
            <p className="text-xs text-amber-700 mt-0.5">Dokumen pengadaan sedang ditinjau oleh pihak Vendor/Mitra untuk disetujui atau ditolak.</p>
          </div>
        </div>
      )}

      {/* Banner Menunggu Tanda Tangan TBIG In-App */}
      {canTbigSign && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
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
              <p className="text-sm font-bold text-emerald-950">
                Dokumen Siap Ditandatangani TBIG (Pihak Pertama)
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                {pengadaan.vendorSignedAt
                  ? "Pihak Vendor telah menandatangani dokumen. Silakan lakukan verifikasi OTP untuk menyelesaikan penandatanganan pihak TBIG."
                  : "Dokumen telah disetujui Vendor. Silakan lakukan verifikasi kode OTP in-app untuk menandatangani dokumen ini sebagai TBIG."}
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
            {tbigSignUrl ? (
              <a
                href={tbigSignUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs shrink-0 flex items-center space-x-1.5"
              >
                <span>Lanjutkan Tanda Tangan TBIG</span>
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
              <TbigSignOtpDialog
                pengadaanId={pengadaan.id}
                noSuratPesanan={pengadaan.noSuratPesanan}
                namaPengadaan={pengadaan.namaPengadaan}
                initialEmail={process.env.MEKARI_TBIG_SIGNER_EMAIL || user.email}
                isMockMode={process.env.ESIGN_MODE === "mock"}
              />
            )}
          </div>
        </div>
      )}

      {/* Banner TBIG Telah Sign, Menunggu Vendor */}
      {isWaitingSigner && pengadaan.tbigSignedAt && !pengadaan.vendorSignedAt && (
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
                TBIG Telah Menandatangani Dokumen
              </p>
              <p className="text-xs text-blue-800 mt-0.5">
                Anda telah memvalidasi OTP dan menandatangani dokumen ini. Dokumen saat ini sedang menunggu tanda tangan dan pembubuhan eMeterai dari pihak Vendor.
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
                Dokumen pengadaan telah selesai ditandatangani oleh kedua belah pihak dan dibubuhi eMeterai.
              </p>
            </div>
          </div>
        </div>
      )}

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
                Dokumen sedang diproses secara elektronik oleh penyedia tanda tangan. Silakan klik tombol Cek Status untuk memperbarui status terbaru.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {latestJob && (
              <CheckStatusButton
                pengadaanId={pengadaan.id}
                jobCreatedAt={latestJob.createdAt}
                forceShow={true}
                label="Cek Status"
              />
            )}
          </div>
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
                  Termasuk halaman Lembar Pengesahan di akhir PDF.
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
                <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
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
