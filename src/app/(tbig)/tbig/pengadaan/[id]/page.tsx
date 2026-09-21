import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import { deletePengadaanAction } from "@/app/(tbig)/actions";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRupiah, formatDateIndo } from "@/lib/pdf/lembar-pengesahan";
import { FileKind, PengadaanStatus } from "@/generated/prisma/enums";

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
      logs: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!pengadaan) {
    notFound();
  }

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
