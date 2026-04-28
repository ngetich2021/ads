export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-16 bg-linear-to-r from-indigo-800 to-violet-800" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* filter + action bar */}
        <div className="flex flex-wrap gap-3 items-center bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
          <div className="h-9 w-36 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-9 w-44 rounded-lg bg-gray-100 animate-pulse" />
          <div className="ml-auto flex gap-2">
            <div className="h-9 w-24 rounded-lg bg-violet-100 animate-pulse" />
            <div className="h-9 w-24 rounded-lg bg-indigo-100 animate-pulse" />
          </div>
        </div>

        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="h-14 bg-linear-to-r from-indigo-800 to-violet-800 animate-pulse" />
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="grid grid-cols-[2.5rem_1fr_8rem_10rem_7rem_6rem_5rem] gap-2 items-center bg-linear-to-r from-violet-700 to-indigo-700 px-5 py-3.5 border-b border-violet-600/30 last:border-b-0"
              >
                <div className="h-3 w-4 rounded bg-white/20 animate-pulse" />
                <div className="h-7 w-24 rounded-full bg-white/20 animate-pulse" />
                <div className="h-4 w-16 rounded bg-white/20 animate-pulse ml-auto" />
                <div className="h-6 w-20 rounded-md bg-white/20 animate-pulse ml-auto" />
                <div className="h-4 w-12 rounded bg-white/20 animate-pulse ml-auto" />
                <div className="h-3 w-10 rounded bg-white/20 animate-pulse ml-auto" />
                <div className="h-6 w-12 rounded bg-white/10 animate-pulse ml-auto" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
