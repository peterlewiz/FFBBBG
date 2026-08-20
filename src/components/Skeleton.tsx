/**
 * Shape-of-the-content placeholders. These read as "almost there" where a
 * bare spinner reads as "nothing is happening", and they stop the layout
 * jumping when the real data lands.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-2 ${className}`} />;
}

export function SkeletonRows({ rows = 8, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface ${className}`}>
      <div className="border-b border-line px-5 py-4">
        <Bar className="h-4 w-40" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <Bar className="h-3 w-4" />
            <Bar className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Bar className="h-3 w-28" />
              <Bar className="h-2.5 w-40" />
            </div>
            <Bar className="h-6 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rectangle-plus-plinth per podium spot - roughly the real Podium's shape. */
function SkeletonPodiumStep({ tall = false }: { tall?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-end gap-2">
      <Bar className={`rounded-full ${tall ? "h-16 w-16 sm:h-20 sm:w-20" : "h-12 w-12 sm:h-14 sm:w-14"}`} />
      <Bar className="h-3 w-16" />
      <Bar className="h-3 w-10" />
      <Bar className={`w-full rounded-t-lg ${tall ? "h-24" : "h-16"}`} />
    </div>
  );
}

export function SkeletonHome() {
  return (
    <div className="flex flex-col gap-6">
      {/* header, with the draft countdown's usual slot reserved */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Bar className="h-7 w-48" />
          <Bar className="h-3 w-56" />
        </div>
        <Bar className="h-16 w-full rounded-xl sm:w-56" />
      </div>
      <Bar className="h-11 w-full rounded-xl" />

      {/* headline ticker: hero image + text block + dot row */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <Bar className="aspect-[21/9] w-full rounded-none sm:aspect-[21/6]" />
        <div className="space-y-2 px-5 py-4">
          <Bar className="h-5 w-2/3" />
          <Bar className="h-3 w-1/3" />
        </div>
        <div className="border-t border-line px-5 py-2">
          <Bar className="mx-auto h-1.5 w-24 rounded-full" />
        </div>
      </div>

      {/* podium */}
      <div className="rounded-2xl border border-line bg-surface px-4 pt-5 pb-4">
        <Bar className="mx-auto mb-4 h-2.5 w-28" />
        <div className="flex items-end gap-2 sm:gap-4">
          <SkeletonPodiumStep />
          <SkeletonPodiumStep tall />
          <SkeletonPodiumStep />
        </div>
      </div>

      {/* championship banners */}
      <div className="rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <Bar className="h-4 w-52" />
        </div>
        <div className="flex gap-2 p-4 sm:gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bar key={i} className="h-36 w-[5.5rem] shrink-0 rounded-lg sm:w-24" />
          ))}
        </div>
      </div>

      {/* measured against the real page at desktop width: all-time
       * rankings ~932px/14 rows, past champions ~743px, hall of shame
       * ~349px - kept close so the loaded page doesn't jump much */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SkeletonRows rows={14} className="lg:col-span-2" />
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Bar className="h-[46rem] w-full rounded-2xl" />
          <Bar className="h-[22rem] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
