"use client";

import { useState, useTransition } from "react";
import { approvePengadaanAction } from "@/app/(vendor)/actions";

interface ApproveDialogProps {
  pengadaanId: string;
}

export function ApproveDialog({ pengadaanId }: ApproveDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    setError(null);
    startTransition(async () => {
      const res = await approvePengadaanAction(pengadaanId);
      if (res?.error) {
        setError(res.error);
      } else {
        setIsOpen(false);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center space-x-1.5 cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span>Setuju & Lanjutkan</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-zinc-200 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  Konfirmasi Persetujuan
                </h3>
                <p className="text-xs text-zinc-500">Persetujuan Dokumen Pengadaan</p>
              </div>
            </div>

            <p className="text-sm text-zinc-600 leading-relaxed">
              Dokumen akan dibubuhi eMeterai lalu Anda akan diarahkan ke proses tanda tangan elektronik. Apakah Anda yakin ingin melanjutkan?
            </p>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 border border-zinc-300 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleApprove}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
              >
                {isPending ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 text-white"
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
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Setujui Dokumen</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
