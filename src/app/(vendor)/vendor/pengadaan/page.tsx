import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRupiah, formatDateIndo } from "@/lib/pdf/lembar-pengesahan";
import { PengadaanStatus } from "@/generated/prisma/enums";

export default async function VendorPengadaanPage() {
  const user = await requireRole("VENDOR");

  if (!user.vendorId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Pengadaan Vendor</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Daftar pengadaan yang membutuhkan persetujuan dan tanda tangan Anda.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800">
          Akun Anda belum terhubung dengan entitas vendor mana pun. Silakan hubungi tim TBIG.
        </div>
      </div>
    );
  }

  // PRD 7.4 & 8.5: Vendor hanya melihat pengadaan miliknya dengan status >= MENUNGGU_PERSETUJUAN_VENDOR
  const pengadaanList = await prisma.pengadaan.findMany({
    where: {
      vendorId: user.vendorId,
      status: {
        notIn: [PengadaanStatus.DRAFT, PengadaanStatus.MENUNGGU_TTD_TBIG],
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Daftar Pengadaan</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Pengadaan yang telah ditandatangani TBIG dan membutuhkan tindakan atau tinjauan Anda.
          </p>
        </div>
      </div>

      {pengadaanList.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center text-zinc-500 space-y-3">
          <div className="w-12 h-12 rounded-full bg-zinc-100 mx-auto flex items-center justify-center text-zinc-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-base font-semibold text-zinc-800">Belum Ada Pengadaan</p>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto">
            Saat ini belum ada pengadaan yang siap untuk ditinjau atau ditandatangani. Dokumen baru akan muncul di sini setelah ditandatangani oleh TBIG.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-600">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">No. Surat Pesanan</th>
                  <th className="px-6 py-3.5">Nama Pengadaan</th>
                  <th className="px-6 py-3.5">Harga</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Terakhir Diperbarui</th>
                  <th className="px-6 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {pengadaanList.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-zinc-900">
                      {item.noSuratPesanan}
                    </td>
                    <td className="px-6 py-4 font-medium text-zinc-900">
                      {item.namaPengadaan}
                    </td>
                    <td className="px-6 py-4 font-semibold text-zinc-900">
                      {formatRupiah(item.harga)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {formatDateIndo(item.updatedAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/vendor/pengadaan/${item.id}`}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                      >
                        <span>Lihat Detail</span>
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
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
