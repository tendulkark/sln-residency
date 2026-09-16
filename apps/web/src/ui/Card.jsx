export default function Card({ className = "", padded = true, ...props }) {
  return <div className={`rounded-xl border border-line bg-card shadow-sm ${padded ? "p-4" : ""} ${className}`} {...props} />;
}
