import { Loader2 } from "lucide-react";

// The one "working on it" indicator — inside buttons, next to a heading
// while a list refreshes, or centered in a small panel.
export default function Spinner({ className = "h-4 w-4", label }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ink-muted">
      <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
