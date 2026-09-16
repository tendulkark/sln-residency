import { cva } from "class-variance-authority";

// Variant/size maps are the single place a button's look is defined —
// adding a new tone or size is a one-line addition here, never a
// hunt-and-replace across the app.
export const button = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        solid: "bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand-ring",
        outline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-300",
        ghost: "text-gray-600 hover:bg-gray-100 focus-visible:ring-gray-300",
        danger: "border border-red-200 text-red-600 hover:bg-red-50 focus-visible:ring-red-300",
        success: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-300",
      },
      size: {
        sm: "px-2.5 py-1.5 text-xs",
        md: "px-3.5 py-2 text-sm",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  }
);

export default function Button({ variant, size, className = "", ...props }) {
  return <button className={`${button({ variant, size })} ${className}`} {...props} />;
}
