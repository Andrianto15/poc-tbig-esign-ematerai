"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitMockSignAction } from "@/app/mock-mekari/actions";

interface MockSignFormProps {
  jobId: string;
}

export function MockSignForm({ jobId }: MockSignFormProps) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError("Silakan masukkan kode OTP.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await submitMockSignAction(jobId, otp);
      if (res?.error) {
        setError(res.error);
      } else if (res?.returnUrl) {
        setIsSuccess(true);
        router.push(res.returnUrl);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="otpInput"
          className="block text-xs font-semibold text-zinc-700 mb-1"
        >
          Kode Verifikasi OTP <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center space-x-2">
          <input
            id="otpInput"
            type="text"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-center tracking-widest font-mono text-lg font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => setOtp("123456")}
            className="px-3 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium rounded-lg shrink-0 transition-colors cursor-pointer"
            title="Isi otomatis OTP simulasi"
          >
            Auto OTP (123456)
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Gunakan kode OTP <strong className="font-mono text-zinc-800">123456</strong> untuk menyelesaikan simulasi penandatanganan.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start space-x-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 shrink-0 mt-0.5"
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

      {isSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center space-x-2">
          <svg
            className="animate-spin h-4 w-4 text-emerald-600"
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
          <span>Tanda tangan berhasil! Mengalihkan ke halaman detail...</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || isSuccess}
        className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
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
            <span>Memproses Tanda Tangan...</span>
          </>
        ) : (
          <>
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
            <span>Tanda Tangani Dokumen</span>
          </>
        )}
      </button>
    </form>
  );
}
