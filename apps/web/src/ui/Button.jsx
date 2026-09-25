import { Loader2 } from "lucide-react";
import { cva } from "class-variance-authority";

// Variant/size maps are the single place a button's look is defined —
// adding a new tone or size is a one-line addition here, never a
// hunt-and-replace across the app.
export const button = cva(
  // While `loading`, the button's own icon steps aside for the spinner.
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 aria-busy:[&>svg:not(.animate-spin)]:hidden",
  {
    variants: {
      variant: {
        solid: "bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand-ring",
        outline: "border border-line-strong bg-card text-ink-soft hover:bg-muted focus-visible:ring-brand-ring",
        ghost: "text-ink-soft hover:bg-muted-strong focus-visible:ring-brand-ring",
        danger: "border border-danger/30 text-danger hover:bg-danger-tint focus-visible:ring-danger/40",
        success: "bg-success text-white hover:bg-success-dark focus-visible:ring-success/40",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-3.5 py-2 text-sm",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  }
);

// `loading` puts a spinner in front of the label and blocks further clicks
// while the action it started is still running.
export default function Button({ variant, size, className = "", loading = false, disabled, children, ...props }) {
  return (
    <button className={`${button({ variant, size })} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
