import React from "react";

export interface LogItem {
  id: string;
  action: string;
  note: string | null;
  actorId?: string | null;
  createdAt: Date | string;
}

interface ActivityLogTimelineProps {
  logs: LogItem[];
}

interface ActionMeta {
  label: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
}

function getActionMeta(action: string): ActionMeta {
  switch (action) {
    case "DRAFT_CREATED":
      return {
        label: "Draft Dibuat",
        dotColor: "bg-zinc-400",
        badgeBg: "bg-zinc-100",
        badgeText: "text-zinc-700",
      };
    case "DRAFT_UPDATED":
      return {
        label: "Draft Diperbarui",
        dotColor: "bg-zinc-400",
        badgeBg: "bg-zinc-100",
        badgeText: "text-zinc-700",
      };
    case "TBIG_SIGN_SUBMITTED":
      return {
        label: "Tanda Tangan TBIG Diajukan",
        dotColor: "bg-blue-500",
        badgeBg: "bg-blue-50",
        badgeText: "text-blue-700",
      };
    case "TBIG_SIGNED":
      return {
        label: "Tanda Tangan TBIG Selesai",
        dotColor: "bg-blue-600",
        badgeBg: "bg-blue-50",
        badgeText: "text-blue-700",
      };
    case "TBIG_SIGN_RETRY":
      return {
        label: "Pengajuan Ulang Tanda Tangan TBIG",
        dotColor: "bg-amber-500",
        badgeBg: "bg-amber-50",
        badgeText: "text-amber-800",
      };
    case "VENDOR_APPROVED":
      return {
        label: "Disetujui Rekanan Vendor",
        dotColor: "bg-emerald-500",
        badgeBg: "bg-emerald-50",
        badgeText: "text-emerald-700",
      };
    case "VENDOR_REJECTED":
      return {
        label: "Ditolak Rekanan Vendor",
        dotColor: "bg-red-500",
        badgeBg: "bg-red-50",
        badgeText: "text-red-700",
      };
    case "METERAI_STAMPED":
      return {
        label: "eMeterai Berhasil Dibubuhkan",
        dotColor: "bg-purple-500",
        badgeBg: "bg-purple-50",
        badgeText: "text-purple-700",
      };
    case "METERAI_STAMP_RETRY":
      return {
        label: "Pengajuan Ulang eMeterai",
        dotColor: "bg-amber-500",
        badgeBg: "bg-amber-50",
        badgeText: "text-amber-800",
      };
    case "VENDOR_SIGNED":
      return {
        label: "Tanda Tangan Vendor Selesai (Final)",
        dotColor: "bg-emerald-600",
        badgeBg: "bg-emerald-50",
        badgeText: "text-emerald-800",
      };
    case "VENDOR_SIGN_RETRY":
      return {
        label: "Pengajuan Ulang Tanda Tangan Vendor",
        dotColor: "bg-amber-500",
        badgeBg: "bg-amber-50",
        badgeText: "text-amber-800",
      };
    default:
      if (action.startsWith("JOB_FAILED")) {
        return {
          label: "Proses Penyedia Gagal",
          dotColor: "bg-red-500",
          badgeBg: "bg-red-50",
          badgeText: "text-red-700",
        };
      }
      return {
        label: action,
        dotColor: "bg-zinc-400",
        badgeBg: "bg-zinc-100",
        badgeText: "text-zinc-700",
      };
  }
}

function formatLogTimestamp(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return (
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }).format(d) + " WIB"
  );
}

export function ActivityLogTimeline({ logs }: ActivityLogTimelineProps) {
  if (logs.length === 0) {
    return (
      <div className="text-xs text-zinc-400 py-3 text-center">
        Belum ada riwayat aktivitas.
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul role="list" className="-mb-6">
        {logs.map((log, logIdx) => {
          const meta = getActionMeta(log.action);
          const isLast = logIdx === logs.length - 1;

          return (
            <li key={log.id} className="relative pb-5">
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute left-2 top-4 -ml-px h-full w-0.5 bg-zinc-200"
                />
              )}
              <div className="relative flex items-start space-x-3">
                <div className="relative">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${meta.dotColor}`}
                  />
                </div>
                <div className="min-w-0 flex-1 -mt-0.5">
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-md ${meta.badgeBg} ${meta.badgeText}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <time
                      dateTime={new Date(log.createdAt).toISOString()}
                      className="text-[11px] font-mono text-zinc-400 shrink-0"
                    >
                      {formatLogTimestamp(log.createdAt)}
                    </time>
                  </div>
                  {log.note && (
                    <p className="mt-1 text-xs text-zinc-600 leading-relaxed break-words">
                      {log.note}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
