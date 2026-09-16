export default function Skeleton({ className = "" }) {
  return <div className={`rounded-md bg-gray-200 ${className}`} style={{ animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />;
}

export function CardSkeleton({ count = 4, className = "" }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-3 h-6 w-1/2" />
          <Skeleton className="mt-3 h-3 w-full" />
        </div>
      ))}
    </>
  );
}
