"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshProps {
  intervalMs?: number;
}

/**
 * Komponen auto-refresh periodik menggunakan router.refresh()
 * Sesuai PRD Bagian 8.4 untuk status yang sedang dalam proses
 */
export function AutoRefresh({ intervalMs = 3000 }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
