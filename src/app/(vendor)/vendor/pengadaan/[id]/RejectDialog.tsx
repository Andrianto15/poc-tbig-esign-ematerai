"use client";

import { useState, useTransition, useEffect } from "react";
import { rejectPengadaanAction } from "@/app/(vendor)/actions";

interface RejectDialogProps {
  pengadaanId: string;
}

export function RejectDialog({ pengadaanId }: RejectDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isPending]);

  const trimmedLength = alasan.trim().length;
  const isValid = trimmedLength >= 10;

  const handleReject = () => {
    if (!isValid) {
      setError("Alasan penolakan minimal 10 karakter.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await rejectPengadaanAction(pengadaanId, alasan);
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
          setAlasan("");
          setIsOpen(true);
        }}
        className="px-4 py-2 border border-red-300 hover:bg-red-50 text-red-600 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center space-x-2"
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
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
        <span>Tolak Pengadaan</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-zinc-200 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center font-bold">
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 id="reject-dialog-title" className="text-lg font-bold text-zinc-900">
                  Tolak Pengadaan
                </h3>
                <p className="text-xs text-zinc-500">Konfirmasi Penolakan Dokumen</p>
              </div>
            </div>

            <p className="text-sm text-zinc-600 leading-relaxed">
              Apakah Anda yakin ingin menolak pengadaan ini? Mohon sertakan alasan
              penolakan yang jelas agar dapat ditinjau oleh pihak TBIG.
            </p>

            <div className="space-y-1">
              <label
                htmlFor="alasanPenolakan"
                className="block text-xs font-semibold text-zinc-700"
              >
                Alasan Penolakan <span className="text-red-500">*</span>
              </label>
              <textarea
                id="alasanPenolakan"
                rows={4}
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                placeholder="Tuliskan alasan penolakan secara spesifik (minimal 10 karakter)..."
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
              <div className="flex justify-between items-center text-xs text-zinc-400">
                <span>Minimal 10 karakter</span>
                <span className={trimmedLength >= 10 ? "text-emerald-600 font-medium" : "text-zinc-500"}>
                  {trimmedLength} karakter
                </span>
              </div>
            </div>

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
                disabled={!isValid || isPending}
                onClick={handleReject}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
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
                  <span>Konfirmasi Penolakan</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
