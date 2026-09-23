"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  requestTbigOtpAction,
  submitTbigOtpSignAction,
} from "@/app/(tbig)/actions";

interface TbigSignOtpDialogProps {
  pengadaanId: string;
  noSuratPesanan: string;
  namaPengadaan: string;
  initialEmail?: string;
  isMockMode?: boolean;
}

export function TbigSignOtpDialog({
  pengadaanId,
  noSuratPesanan,
  namaPengadaan,
  initialEmail,
  isMockMode,
}: TbigSignOtpDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"READY" | "INPUT_OTP">("READY");
  const [otp, setOtp] = useState("");
  const [targetEmail, setTargetEmail] = useState(initialEmail || "");
  const [isMock, setIsMock] = useState(Boolean(isMockMode));
  const [mockOtpHint, setMockOtpHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [isPending, startTransition] = useTransition();

  const otpInputRef = useRef<HTMLInputElement>(null);

  // Keyboard accessibility: ESC untuk menutup dialog saat tidak pending
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

  // Autofocus input saat masuk ke step input OTP
  useEffect(() => {
    if (isOpen && step === "INPUT_OTP") {
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, step]);

  // Timer hitung mundur untuk kirim ulang OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleOpenDialog = () => {
    setError(null);
    setOtp("");
    setStep("READY");
    setIsOpen(true);
  };

  const handleRequestOtp = () => {
    setError(null);
    startTransition(async () => {
      const res = await requestTbigOtpAction(pengadaanId);
      if (res.error) {
        setError(res.error);
        return;
      }

      if (res.signUrl) {
        window.open(res.signUrl, "_blank");
        setIsOpen(false);
        return;
      }

      if (res.email) setTargetEmail(res.email);
      if (res.isMock) {
        setIsMock(true);
        setMockOtpHint(res.mockOtp || "123456");
      }
      setCountdown(60);
      setStep("INPUT_OTP");
    });
  };

  const handleSubmitOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError("Kode OTP wajib diisi.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await submitTbigOtpSignAction(pengadaanId, otp);
      if (res.error) {
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
        onClick={handleOpenDialog}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center space-x-1.5 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
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
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
        <span>Tandatangani sebagai TBIG (OTP)</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tbig-otp-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-zinc-200 space-y-5">
            {/* Header Dialog */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
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
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div>
                  <h3
                    id="tbig-otp-dialog-title"
                    className="text-lg font-bold text-zinc-900 tracking-tight"
                  >
                    Tanda Tangan Pihak Pertama (TBIG)
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">
                    No. SP: {noSuratPesanan}
                  </p>
                </div>
              </div>

              {!isPending && (
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg transition-colors cursor-pointer"
                  aria-label="Tutup modal"
                >
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Banner Informasi TBIG */}
            <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/90 text-emerald-900 text-xs flex items-start space-x-2.5">
              <span className="font-bold text-emerald-700 uppercase tracking-wider text-[10px] bg-emerald-200/70 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                Otentikasi TBIG
              </span>
              <p className="leading-relaxed text-emerald-800">
                Dokumen pengadaan <strong>{namaPengadaan}</strong> akan ditandatangani secara resmi atas nama <strong>Tower Bersama Group</strong> menggunakan verifikasi OTP.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 shrink-0 text-rose-600 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* STEP 1: Persiapan & Kirim OTP */}
            {step === "READY" && (
              <div className="space-y-4 pt-1">
                <p className="text-sm text-zinc-600 leading-relaxed">
                  Untuk menandatangani dokumen ini secara sah, kode One-Time Password (OTP) akan dikirimkan ke alamat email penandatangan resmi TBIG.
                </p>

                {targetEmail && (
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs flex items-center justify-between">
                    <span className="text-zinc-500">Email Tujuan OTP:</span>
                    <span className="font-semibold text-zinc-800 font-mono">
                      {targetEmail}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={isPending}
                    className="px-4 py-2 border border-zinc-300 text-zinc-700 hover:bg-zinc-50 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={isPending}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm inline-flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    {isPending ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <span>Mengirim OTP...</span>
                      </>
                    ) : (
                      <>
                        <span>Kirim Kode OTP</span>
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
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Input OTP & Validasi */}
            {step === "INPUT_OTP" && (
              <form onSubmit={handleSubmitOtp} className="space-y-4 pt-1">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="tbig-otp-input"
                      className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider"
                    >
                      Masukkan Kode OTP
                    </label>
                    {countdown > 0 ? (
                      <span className="text-xs text-zinc-400 font-mono">
                        Kirim ulang dalam {countdown}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRequestOtp}
                        disabled={isPending}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 underline cursor-pointer disabled:opacity-50"
                      >
                        Kirim Ulang OTP
                      </button>
                    )}
                  </div>

                  <input
                    ref={otpInputRef}
                    id="tbig-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="Contoh: 123456"
                    className="w-full px-4 py-3 border border-zinc-300 rounded-xl text-center text-2xl font-mono tracking-widest font-bold text-zinc-900 placeholder:text-zinc-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-inner"
                    disabled={isPending}
                    required
                  />

                  <p className="text-[11px] text-zinc-500 mt-2 text-center">
                    Kode 6-digit telah dikirimkan ke{" "}
                    <span className="font-semibold text-zinc-700 font-mono">
                      {targetEmail}
                    </span>
                  </p>
                </div>

                {/* Mock Mode Hint */}
                {isMock && mockOtpHint && (
                  <div className="p-3 bg-zinc-100 border border-zinc-200 rounded-xl text-center text-xs text-zinc-600">
                    <span className="font-bold text-zinc-800">Mode Mock Aktif:</span>{" "}
                    Gunakan kode OTP{" "}
                    <code className="px-1.5 py-0.5 bg-white border border-zinc-300 rounded text-emerald-600 font-bold font-mono">
                      {mockOtpHint}
                    </code>
                  </div>
                )}

                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep("READY")}
                    disabled={isPending}
                    className="px-4 py-2 border border-zinc-300 text-zinc-700 hover:bg-zinc-50 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Kembali
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || otp.length < 6}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm inline-flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    {isPending ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <span>Memverifikasi & Menandatangani...</span>
                      </>
                    ) : (
                      <>
                        <span>Verifikasi & Tanda Tangani</span>
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
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
