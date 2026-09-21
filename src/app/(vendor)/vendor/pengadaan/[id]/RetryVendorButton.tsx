"use client";

import { useTransition } from "react";
import {
  retryVendorMeteraiAction,
  retryVendorSignAction,
} from "@/app/(vendor)/actions";

interface RetryVendorButtonProps {
  pengadaanId: string;
  type: "STAMP_METERAI" | "SIGN_VENDOR";
}

export function RetryVendorButton({ pengadaanId, type }: RetryVendorButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleRetry = () => {
    startTransition(async () => {
      if (type === "STAMP_METERAI") {
        await retryVendorMeteraiAction(pengadaanId);
      } else {
        await retryVendorSignAction(pengadaanId);
      }
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleRetry}
      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center space-x-1.5 shrink-0 cursor-pointer"
    >
      {isPending ? (
        <>
          <svg
            className="animate-spin h-3.5 w-3.5 text-white"
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
          <span>Mencoba lagi...</span>
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3.5 h-3.5"
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
          <span>Coba Lagi</span>
        </>
      )}
    </button>
  );
}
