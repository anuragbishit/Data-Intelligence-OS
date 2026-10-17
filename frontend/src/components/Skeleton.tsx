/** Loading placeholders that match the shape of what's coming.
 *  A spinner says "wait"; a skeleton says "here is what you'll get". */
export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="h-5 w-1/2 rounded-md bg-slate-200" />
      <div className="mt-3 h-3 w-3/4 rounded-md bg-slate-100" />
      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="h-10 rounded-lg bg-slate-100" />
        <div className="h-10 rounded-lg bg-slate-100" />
        <div className="h-10 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

export function SkeletonLines({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3.5 rounded-md bg-slate-200"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  );
}
