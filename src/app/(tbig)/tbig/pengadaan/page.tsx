import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRupiah, formatDateIndo } from "@/lib/pdf/lembar-pengesahan";
import { PengadaanStatus } from "@/generated/prisma/enums";

export default async function TbigPengadaanListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole("TBIG");
  const { status } = await searchParams;

  const statusFilter =
    status && Object.values(PengadaanStatus).includes(status as PengadaanStatus)
      ? (status as PengadaanStatus)
      : undefined;

  const pengadaans = await prisma.pengadaan.findMany({
    where: statusFilter ? { status: statusFilter } : undefined,
    include: { vendor: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Daftar Pengadaan</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Kelola data pengadaan TBIG dan pantau proses tanda tangan elektronik dokumen.
          </p>
        </div>

        <Link
          href="/tbig/pengadaan/baru"
          className="inline-flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer"
        >
          + Buat Pengadaan
        </Link>
      </div>

      {/* Filter Status */}
      <div className="flex items-center space-x-2 bg-white p-3 rounded-xl border border-zinc-200 text-sm">
        <span className="text-zinc-500 font-medium">Filter Status:</span>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/tbig/pengadaan"
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              !statusFilter
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            Semua
          </Link>
          {Object.values(PengadaanStatus).map((st) => (
            <Link
              key={st}
              href={`/tbig/pengadaan?status=${st}`}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === st
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {st}
            </Link>
          ))}
        </div>
      </div>

      {/* Tabel Pengadaan */}
      <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
        {pengadaans.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 space-y-3">
            <p className="text-base font-semibold text-zinc-800">
              Belum ada pengadaan {statusFilter ? `dengan status ${statusFilter}` : ""}
            </p>
            <p className="text-sm text-zinc-500">
              Klik tombol &quot;Buat Pengadaan&quot; di atas untuk membuat dokumen pengadaan baru.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-600 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">No. Surat Pesanan</th>
                  <th className="px-6 py-3.5">Nama Pengadaan</th>
                  <th className="px-6 py-3.5">Vendor</th>
                  <th className="px-6 py-3.5">Harga</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Terakhir Diperbarui</th>
                  <th className="px-6 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {pengadaans.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-zinc-900">
                      {p.noSuratPesanan}
                    </td>
                    <td className="px-6 py-4 font-medium text-zinc-900 max-w-xs break-words">
                      {p.namaPengadaan}
                    </td>
                    <td className="px-6 py-4 text-zinc-600">{p.vendor.nama}</td>
                    <td className="px-6 py-4 font-semibold text-zinc-900">
                      {formatRupiah(p.harga)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {formatDateIndo(p.updatedAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/tbig/pengadaan/${p.id}`}
                        title="Lihat detail pengadaan"
                        aria-label="Lihat detail pengadaan"
                        className="inline-flex items-center justify-center w-8 h-8 text-zinc-600 hover:text-blue-700 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
