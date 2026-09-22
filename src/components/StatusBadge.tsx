import { PengadaanStatus } from "@/generated/prisma/enums";

export const STATUS_CONFIG: Record<
  PengadaanStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  DRAFT: {
    label: "Draft (belum diajukan)",
    bg: "bg-zinc-100",
    text: "text-zinc-800",
    border: "border-zinc-300",
  },
  MENUNGGU_PERSETUJUAN_VENDOR: {
    label: "Menunggu persetujuan vendor",
    bg: "bg-amber-50",
    text: "text-amber-900",
    border: "border-amber-300",
  },
  MENUNGGU_TTD_VENDOR: {
    label: "Disetujui vendor, proses ttd & meterai",
    bg: "bg-purple-50",
    text: "text-purple-900",
    border: "border-purple-200",
  },
  MENUNGGU_TTD_TBIG: {
    label: "Sudah ttd vendor, menunggu ttd TBIG",
    bg: "bg-blue-50",
    text: "text-blue-900",
    border: "border-blue-200",
  },
  SELESAI: {
    label: "Selesai ditandatangani",
    bg: "bg-emerald-50",
    text: "text-emerald-900",
    border: "border-emerald-300",
  },
  DITOLAK: {
    label: "Pengadaan ditolak",
    bg: "bg-red-50",
    text: "text-red-900",
    border: "border-red-200",
  },
};

export function StatusBadge({ status }: { status: PengadaanStatus }) {
  const cfg = STATUS_CONFIG[status] || {
    label: status,
    bg: "bg-zinc-100",
    text: "text-zinc-800",
    border: "border-zinc-300",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}
