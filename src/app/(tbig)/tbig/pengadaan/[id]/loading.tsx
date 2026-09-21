export default function TbigPengadaanDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Nav Back Skeleton */}
      <div className="h-4 w-36 bg-zinc-200 rounded" />

      {/* Header Detail Skeleton */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex space-x-2">
            <div className="h-5 w-28 bg-zinc-200 rounded" />
            <div className="h-5 w-32 bg-zinc-100 rounded-full" />
          </div>
          <div className="h-7 w-64 bg-zinc-200 rounded-lg" />
          <div className="h-3 w-40 bg-zinc-100 rounded" />
        </div>
        <div className="flex space-x-2">
          <div className="h-9 w-24 bg-zinc-200 rounded-lg" />
          <div className="h-9 w-24 bg-zinc-200 rounded-lg" />
        </div>
      </div>

      {/* Grid Content Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri */}
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="h-4 w-36 bg-zinc-200 rounded" />
            <div className="space-y-3">
              <div className="h-8 w-full bg-zinc-100 rounded" />
              <div className="h-8 w-full bg-zinc-100 rounded" />
              <div className="h-8 w-full bg-zinc-100 rounded" />
            </div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="h-4 w-28 bg-zinc-200 rounded" />
            <div className="space-y-2">
              <div className="h-6 w-full bg-zinc-100 rounded" />
              <div className="h-6 w-3/4 bg-zinc-100 rounded" />
            </div>
          </div>
        </div>

        {/* Kolom Kanan (PDF) */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm min-h-[600px] flex flex-col space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-4 w-40 bg-zinc-200 rounded" />
              <div className="h-4 w-16 bg-zinc-100 rounded" />
            </div>
            <div className="flex-1 bg-zinc-100 rounded-lg min-h-[550px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
