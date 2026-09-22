import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  baseUrl: string;
  searchParams?: Record<string, string | undefined>;
}

function buildPageUrl(
  baseUrl: string,
  page: number,
  searchParams?: Record<string, string | undefined>
): string {
  const [pathname, existingQuery] = baseUrl.split("?");
  const params = new URLSearchParams(existingQuery);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") {
        params.set(key, value);
      }
    }
  }

  if (page > 1) {
    params.set("page", page.toString());
  } else {
    params.delete("page");
  }

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "...",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "...",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "...",
    totalPages,
  ];
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  baseUrl,
  searchParams,
}: PaginationProps) {
  if (totalItems <= 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <nav
      aria-label="Navigasi halaman pengadaan"
      className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 bg-white border-t border-zinc-200 text-sm"
    >
      <p className="text-sm text-zinc-600">
        Menampilkan <span className="font-semibold text-zinc-900">{startItem}</span>
        {" - "}
        <span className="font-semibold text-zinc-900">{endItem}</span> dari{" "}
        <span className="font-semibold text-zinc-900">{totalItems}</span> pengadaan
      </p>

      <div className="flex items-center gap-1 sm:gap-2">
        {/* Tombol Sebelumnya */}
        {currentPage <= 1 ? (
          <span
            aria-disabled="true"
            className="inline-flex items-center gap-1 min-h-[38px] px-3 py-2 text-xs sm:text-sm font-medium text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-lg cursor-not-allowed select-none"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Sebelumnya</span>
          </span>
        ) : (
          <Link
            href={buildPageUrl(baseUrl, currentPage - 1, searchParams)}
            aria-label="Ke halaman sebelumnya"
            className="inline-flex items-center gap-1 min-h-[38px] px-3 py-2 text-xs sm:text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Sebelumnya</span>
          </Link>
        )}

        {/* Nomor Halaman */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="inline-flex items-center justify-center min-w-[36px] min-h-[38px] text-sm text-zinc-400 select-none"
                  aria-hidden="true"
                >
                  ...
                </span>
              );
            }

            const isCurrent = p === currentPage;
            if (isCurrent) {
              return (
                <span
                  key={p}
                  aria-current="page"
                  className="inline-flex items-center justify-center min-w-[36px] min-h-[38px] px-3 text-xs sm:text-sm font-semibold text-white bg-zinc-900 rounded-lg select-none"
                >
                  {p}
                </span>
              );
            }

            return (
              <Link
                key={p}
                href={buildPageUrl(baseUrl, p, searchParams)}
                aria-label={`Halaman ${p}`}
                className="inline-flex items-center justify-center min-w-[36px] min-h-[38px] px-3 text-xs sm:text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
              >
                {p}
              </Link>
            );
          })}
        </div>

        {/* Tombol Selanjutnya */}
        {currentPage >= totalPages ? (
          <span
            aria-disabled="true"
            className="inline-flex items-center gap-1 min-h-[38px] px-3 py-2 text-xs sm:text-sm font-medium text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-lg cursor-not-allowed select-none"
          >
            <span className="hidden sm:inline">Selanjutnya</span>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        ) : (
          <Link
            href={buildPageUrl(baseUrl, currentPage + 1, searchParams)}
            aria-label="Ke halaman selanjutnya"
            className="inline-flex items-center gap-1 min-h-[38px] px-3 py-2 text-xs sm:text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
          >
            <span className="hidden sm:inline">Selanjutnya</span>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
    </nav>
  );
}
