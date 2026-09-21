import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { MockSignForm } from "./MockSignForm";
import { SignJobStatus } from "@/generated/prisma/enums";

export default async function MockMekariSignPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  if (process.env.ESIGN_MODE !== "mock") {
    notFound();
  }

  const { jobId } = await params;
  if (!jobId) {
    notFound();
  }

  const job = await prisma.signJob.findUnique({
    where: { id: jobId },
    include: {
      pengadaan: {
        include: { vendor: true },
      },
    },
  });

  if (!job) {
    notFound();
  }

  const isCompleted = job.status === SignJobStatus.COMPLETED;

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col">
      {/* Banner Simulasi PRD 8.7 */}
      <div className="bg-amber-500 text-amber-950 px-4 py-2 text-center text-xs font-bold tracking-wider uppercase border-b border-amber-600 shadow-xs flex items-center justify-center space-x-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-amber-950"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>SIMULASI — bukan Mekari Sign asli (Fase 1 PoC)</span>
      </div>

      {/* Header Mock Mekari */}
      <header className="bg-white border-b border-zinc-200 py-3.5 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              M
            </div>
            <div>
              <span className="font-bold text-zinc-900 text-lg tracking-tight">
                Mekari Sign
              </span>
              <span className="ml-2 text-xs font-mono text-zinc-400">
                [Sandbox Mock]
              </span>
            </div>
          </div>
          <Link
            href={`/vendor/pengadaan/${job.pengadaanId}`}
            className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            Kembali ke Portal Vendor
          </Link>
        </div>
      </header>

      {/* Konten Utama */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Kolom Kiri: Panel Informasi & Form OTP */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-4">
              <div>
                <span className="text-xs font-mono bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">
                  {job.pengadaan.noSuratPesanan}
                </span>
                <h1 className="text-lg font-bold text-zinc-900 mt-2">
                  {job.pengadaan.namaPengadaan}
                </h1>
                <p className="text-xs text-zinc-500 mt-0.5">
                  ID Job: <span className="font-mono">{job.id}</span>
                </p>
              </div>

              <div className="border-t border-zinc-100 pt-3 space-y-2 text-xs">
                <div>
                  <span className="text-zinc-500">Penandatangan (Signer):</span>
                  <p className="font-semibold text-zinc-900 text-sm">
                    {job.pengadaan.picNama}
                  </p>
                  <p className="text-zinc-600">{job.pengadaan.picJabatan}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Perusahaan Vendor:</span>
                  <p className="font-medium text-zinc-800">
                    {job.pengadaan.vendor.nama}
                  </p>
                </div>
              </div>

              {isCompleted ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 space-y-2">
                  <p className="font-semibold text-xs uppercase tracking-wider">
                    Dokumen Sudah Ditandatangani
                  </p>
                  <p className="text-xs">
                    Job ini telah selesai diproses. Dokumen akhir dapat diunduh melalui portal vendor.
                  </p>
                  <Link
                    href={`/vendor/pengadaan/${job.pengadaanId}`}
                    className="inline-block mt-2 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Buka Detail Pengadaan
                  </Link>
                </div>
              ) : (
                <div className="border-t border-zinc-100 pt-4">
                  <MockSignForm jobId={job.id} />
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1 shadow-xs">
              <p className="font-bold flex items-center space-x-1.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Informasi Simulasi Fase 1</span>
              </p>
              <p className="leading-relaxed">
                Di lingkungan produksi / Fase 2, alur ini akan diarahkan ke halaman resmi Mekari Sign. Pada Fase 1, halaman ini bertindak sebagai mock browser signer untuk menguji end-to-end tanpa integrasi API eksternal.
              </p>
            </div>
          </div>

          {/* Kolom Kanan: Preview Dokumen PDF */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm h-full flex flex-col">
              <div className="pb-3 border-b border-zinc-100 mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
                    Pratinjau Dokumen
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Dokumen telah berisi tanda tangan TBIG dan pembubuhan eMeterai simulasi.
                  </p>
                </div>
                <span className="text-xs font-mono text-zinc-400">PDF Preview</span>
              </div>

              <div className="flex-1 min-h-[650px] bg-zinc-100 rounded-lg overflow-hidden border border-zinc-200">
                <iframe
                  src={`/api/mock-mekari/preview/${job.id}`}
                  className="w-full h-full min-h-[650px]"
                  title="Pratinjau Dokumen Mock Mekari"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
