import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import { createPengadaanAction } from "@/app/(tbig)/actions";
import { PengadaanForm } from "@/components/PengadaanForm";

export default async function BuatPengadaanPage() {
  await requireRole("TBIG");

  const vendors = await prisma.vendor.findMany({
    select: {
      id: true,
      nama: true,
      picNama: true,
      picJabatan: true,
    },
    orderBy: { nama: "asc" },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Buat Pengadaan Baru</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Lengkapi data pengadaan dan unggah dokumen PDF untuk menambahkan Lembar Pengesahan.
        </p>
      </div>

      <PengadaanForm action={createPengadaanAction} vendors={vendors} />
    </div>
  );
}
