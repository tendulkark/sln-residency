export default function Card({ className = "", padded = true, ...props }) {
  return <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${padded ? "p-4" : ""} ${className}`} {...props} />;
}
