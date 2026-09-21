import Link from "next/link";
import { requireRole } from "@/lib/auth/user";
import { logoutAction } from "@/lib/auth/actions";

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("VENDOR");

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            href="/vendor/pengadaan"
            className="flex items-center space-x-3 hover:opacity-90 transition-opacity"
          >
            <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
              V
            </span>
            <span className="font-semibold text-zinc-900 text-lg">
              Portal Rekanan Vendor
            </span>
            <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200">
              Vendor
            </span>
          </Link>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium text-zinc-900">{user.nama}</p>
              <p className="text-xs text-zinc-500">{user.email}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-lg transition-colors cursor-pointer"
              >
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
