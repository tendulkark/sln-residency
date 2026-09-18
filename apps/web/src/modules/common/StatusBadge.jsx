import Badge from "@/ui/Badge.jsx";

export default function StatusBadge({ label, color }) {
  return <Badge color={color}>{label}</Badge>;
}
