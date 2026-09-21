import { PengadaanStatus } from "@/generated/prisma/enums";

export const STATUS_CONFIG: Record<
  PengadaanStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  DRAFT: {
    label: "Belum ditandatangani",
    bg: "bg-zinc-100",
    text: "text-zinc-700",
    border: "border-zinc-300",
  },
  MENUNGGU_TTD_TBIG: {
    label: "Proses tanda tangan TBIG",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  MENUNGGU_PERSETUJUAN_VENDOR: {
    label: "Sudah ttd TBIG, menunggu persetujuan vendor",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  MENUNGGU_TTD_VENDOR: {
    label: "Disetujui vendor, menunggu ttd vendor",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  SELESAI: {
    label: "Sudah ttd vendor (selesai)",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  DITOLAK: {
    label: "Pengadaan ditolak",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
};

export function StatusBadge({ status }: { status: PengadaanStatus }) {
  const cfg = STATUS_CONFIG[status] || {
    label: status,
    bg: "bg-zinc-100",
    text: "text-zinc-700",
    border: "border-zinc-300",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}
