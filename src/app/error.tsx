"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full text-center space-y-5 bg-white border border-zinc-200 rounded-2xl p-8 sm:p-10 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 mx-auto flex items-center justify-center">
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
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
            Terjadi Kendala Sistem
          </h1>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Terjadi kesalahan saat memproses permintaan Anda. Silakan coba muat ulang atau kembali ke beranda.
          </p>
          {error.message && (
            <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-mono text-zinc-600 break-all text-left mt-2">
              {error.message}
            </div>
          )}
        </div>
        <div className="flex items-center justify-center space-x-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
          >
            Coba Lagi
          </button>
          <Link
            href="/"
            className="px-4 py-2 border border-zinc-300 rounded-lg text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
