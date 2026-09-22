"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncSignJobStatusAction } from "@/app/actions/sync-job";

interface CheckStatusButtonProps {
  pengadaanId: string;
  jobCreatedAt: string | Date;
  label?: string;
  className?: string;
  forceShow?: boolean; // Untuk kebutuhan testing atau bypass threshold 1 menit
}

export function CheckStatusButton({
  pengadaanId,
  jobCreatedAt,
  label = "Cek status ke Mekari",
  className = "",
  forceShow = false,
}: CheckStatusButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isVisible, setIsVisible] = useState(() => {
    if (forceShow) return true;
    const createdMs = new Date(jobCreatedAt).getTime();
    return Date.now() - createdMs >= 60 * 1000;
  });
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "info" | "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (isVisible) return;

    const createdMs = new Date(jobCreatedAt).getTime();
    const remaining = 60 * 1000 - (Date.now() - createdMs);
    const delay = Math.max(remaining, 0);

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [jobCreatedAt, isVisible]);

  if (!isVisible) {
    return null;
  }

  const handleCheckStatus = () => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await syncSignJobStatusAction(pengadaanId);
        if (res.updated) {
          setFeedback({
            text: res.message || "Status berhasil diperbarui!",
            type: "success",
          });
          router.refresh();
        } else {
          setFeedback({
            text: res.message || "Dokumen masih dalam proses.",
            type: "info",
          });
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Gagal menghubungkan ke server.";
        setFeedback({ text: msg, type: "error" });
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleCheckStatus}
        disabled={isPending}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-2xs ${className}`}
      >
        {isPending ? (
          <>
            <svg
              className="animate-spin -ml-0.5 h-3.5 w-3.5 text-zinc-600"
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
            <span>Menghubungi Mekari...</span>
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5 text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{label}</span>
          </>
        )}
      </button>

      {feedback && (
        <span
          className={`text-[11px] px-2 py-0.5 rounded ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : feedback.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-blue-50 text-blue-700 border border-blue-200"
          }`}
        >
          {feedback.text}
        </span>
      )}
    </div>
  );
}
