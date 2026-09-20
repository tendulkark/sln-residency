import { Badge } from "@/ui/index.js";

export default function StatusBadge({ label, color }) {
  return <Badge color={color}>{label}</Badge>;
}
