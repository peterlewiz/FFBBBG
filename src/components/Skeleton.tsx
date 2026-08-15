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

export function SkeletonHome() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Bar className="h-7 w-48" />
        <Bar className="h-3 w-56" />
      </div>
      <Bar className="aspect-[21/9] w-full rounded-2xl sm:aspect-[21/6]" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SkeletonRows rows={6} className="lg:col-span-2" />
        <SkeletonRows rows={4} />
      </div>
    </div>
  );
}
