export default function TbigPengadaanLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-zinc-200 rounded-lg" />
          <div className="h-4 w-72 bg-zinc-100 rounded-md" />
        </div>
        <div className="h-10 w-36 bg-zinc-200 rounded-lg" />
      </div>

      {/* Filter Tabs Skeleton */}
      <div className="flex space-x-2 border-b border-zinc-200 pb-2">
        <div className="h-8 w-20 bg-zinc-200 rounded-lg" />
        <div className="h-8 w-24 bg-zinc-100 rounded-lg" />
        <div className="h-8 w-24 bg-zinc-100 rounded-lg" />
        <div className="h-8 w-20 bg-zinc-100 rounded-lg" />
      </div>

      {/* Table Skeleton */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-zinc-100 flex space-x-4">
          <div className="h-4 w-32 bg-zinc-200 rounded" />
          <div className="h-4 w-48 bg-zinc-100 rounded" />
          <div className="h-4 w-24 bg-zinc-100 rounded" />
        </div>
        <div className="divide-y divide-zinc-100">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 flex items-center justify-between space-x-4">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-3/4 bg-zinc-200 rounded" />
                <div className="h-3 w-1/2 bg-zinc-100 rounded" />
              </div>
              <div className="h-6 w-24 bg-zinc-100 rounded-full" />
              <div className="h-8 w-20 bg-zinc-200 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
