// Placeholder shapes shown while data loads — each mirrors the layout it
// stands in for (cards, a table, a list, a form), so the page doesn't jump
// when the real content arrives.
export default function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={`rounded-md bg-muted-strong ${className}`} style={{ animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />;
}

export function CardSkeleton({ count = 4, className = "" }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} aria-hidden="true" className={`rounded-xl border border-line bg-card p-4 shadow-sm ${className}`}>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-3 h-6 w-1/2" />
          <Skeleton className="mt-3 h-3 w-full" />
        </div>
      ))}
    </>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div role="status" aria-label="Loading" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex gap-4 border-b border-line bg-muted px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-line-soft px-4 py-3.5 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={`h-3 flex-1 ${c === 0 ? "max-w-40" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 rounded-md border border-line px-3 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 5 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
