import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/user";
import { updatePengadaanAction } from "@/app/(tbig)/actions";
import { PengadaanForm } from "@/components/PengadaanForm";
import { PengadaanStatus } from "@/generated/prisma/enums";

export default async function EditPengadaanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("TBIG");
  const { id } = await params;

  const pengadaan = await prisma.pengadaan.findUnique({
    where: { id },
    include: { vendor: true },
  });

  if (!pengadaan) {
    notFound();
  }

  if (pengadaan.status !== PengadaanStatus.DRAFT) {
    redirect(`/tbig/pengadaan/${pengadaan.id}`);
  }

  const vendors = await prisma.vendor.findMany({
    select: {
      id: true,
      nama: true,
      picNama: true,
      picJabatan: true,
    },
    orderBy: { nama: "asc" },
  });

  const updateActionWithId = updatePengadaanAction.bind(null, pengadaan.id);

  const initialData = {
    id: pengadaan.id,
    namaPengadaan: pengadaan.namaPengadaan,
    alamat: pengadaan.alamat,
    harga: pengadaan.harga.toString(),
    tanggalMulai: pengadaan.tanggalMulai.toISOString().split("T")[0],
    tanggalSelesai: pengadaan.tanggalSelesai.toISOString().split("T")[0],
    noSuratPesanan: pengadaan.noSuratPesanan,
    tanggalPenyelesaian: pengadaan.tanggalPenyelesaian.toISOString().split("T")[0],
    vendorId: pengadaan.vendorId,
    picNama: pengadaan.picNama,
    picJabatan: pengadaan.picJabatan,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Edit Pengadaan</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Perbarui data pengadaan draft (No. SP: {pengadaan.noSuratPesanan}).
        </p>
      </div>

      <PengadaanForm
        action={updateActionWithId}
        vendors={vendors}
        initialData={initialData}
        isEdit={true}
      />
    </div>
  );
}
