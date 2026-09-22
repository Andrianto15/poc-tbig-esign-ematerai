"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  requestVendorOtpAction,
  submitVendorOtpSignAction,
} from "@/app/(vendor)/actions";

interface VendorSignOtpDialogProps {
  pengadaanId: string;
  noSuratPesanan: string;
  vendorNama: string;
  initialEmail?: string;
  isMockMode?: boolean;
}

export function VendorSignOtpDialog({
  pengadaanId,
  noSuratPesanan,
  vendorNama,
  initialEmail,
  isMockMode,
}: VendorSignOtpDialogProps) {
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
      const res = await requestVendorOtpAction(pengadaanId);
      if (res.error) {
        setError(res.error);
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
      const res = await submitVendorOtpSignAction(pengadaanId, otp);
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
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center space-x-1.5 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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
        <span>Tandatangani Dokumen (OTP)</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendor-otp-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-zinc-200 space-y-5">
            {/* Header Dialog */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
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
                    id="vendor-otp-dialog-title"
                    className="text-lg font-bold text-zinc-900 tracking-tight"
                  >
                    Tanda Tangan Elektronik & eMeterai
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

            {/* Banner Beban Kuota eMeterai */}
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-900 text-xs flex items-start space-x-2.5">
              <span className="font-bold text-amber-700 uppercase tracking-wider text-[10px] bg-amber-200/70 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                Biaya Meterai
              </span>
              <p className="leading-relaxed text-amber-800">
                Sesuai ketentuan, <strong>1 Kuota eMeterai resmi Peruri</strong> dibebankan langsung ke akun Vendor (<strong>{vendorNama}</strong>).
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
                  Untuk menandatangani dokumen ini secara sah, kode One-Time Password (OTP) akan dikirimkan ke alamat email resmi akun Anda.
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
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm inline-flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    {isPending ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Mengirim Kode...</span>
                      </>
                    ) : (
                      <span>Kirim Kode OTP</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Input & Verifikasi OTP */}
            {step === "INPUT_OTP" && (
              <form onSubmit={handleSubmitOtp} className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-600">
                    Kode 6 digit telah dikirimkan ke:{" "}
                    <strong className="text-zinc-900 font-mono">{targetEmail}</strong>.
                  </p>
                  <p className="text-xs text-zinc-500">
                    Silakan periksa kotak masuk email Anda dan masukkan kodenya di bawah ini.
                  </p>
                </div>

                {/* Helper Mock Hint */}
                {isMock && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
                    <span className="flex items-center space-x-1.5 font-medium">
                      <span>🧪 Mode Simulasi Mock:</span>
                    </span>
                    <span className="font-mono font-bold tracking-widest bg-white border border-emerald-300 px-2 py-0.5 rounded text-emerald-900">
                      {mockOtpHint || "123456"}
                    </span>
                  </div>
                )}

                <div className="space-y-1">
                  <label
                    htmlFor="otp-input"
                    className="block text-xs font-semibold text-zinc-700"
                  >
                    Kode OTP (6 Digit)
                  </label>
                  <input
                    id="otp-input"
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setOtp(val);
                    }}
                    placeholder="Contoh: 123456"
                    className="w-full text-center tracking-[0.35em] text-xl font-mono font-bold px-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                    disabled={isPending}
                    required
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                  <span>Tidak menerima email?</span>
                  {countdown > 0 ? (
                    <span className="text-zinc-400 font-mono">
                      Kirim ulang dalam {countdown}d
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      disabled={isPending}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Kirim Ulang Kode
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={isPending}
                    className="px-4 py-2 border border-zinc-300 text-zinc-700 hover:bg-zinc-50 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Tutup
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || otp.length < 6}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm inline-flex items-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Memproses Tanda Tangan...</span>
                      </>
                    ) : (
                      <span>Verifikasi & Tandatangani</span>
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
