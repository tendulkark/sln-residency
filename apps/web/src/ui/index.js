// The design-system barrel. Outside this folder, import primitives ONLY
// from "@/ui/index.js" — never "@/ui/Button.jsx" directly — so a component
// can be renamed, split, or swapped without touching every call site.
// Everything here is domain-agnostic; anything that knows about hotels,
// GST, bookings, etc. belongs in a module, not in ui/.
export { default as Button, button as buttonVariants } from "@/ui/Button.jsx";
export { default as Input } from "@/ui/Input.jsx";
export { default as Textarea } from "@/ui/Textarea.jsx";
export { default as Select } from "@/ui/Select.jsx";
export { default as Combobox } from "@/ui/Combobox.jsx";
export { default as Switch } from "@/ui/Switch.jsx";
export { default as Slider } from "@/ui/Slider.jsx";
export { default as Modal } from "@/ui/Modal.jsx";
export { default as Card } from "@/ui/Card.jsx";
export { default as Badge } from "@/ui/Badge.jsx";
export { default as Chip } from "@/ui/Chip.jsx";
export { default as SegmentedControl } from "@/ui/SegmentedControl.jsx";
export { default as Menu } from "@/ui/Menu.jsx";
export { default as EmptyState } from "@/ui/EmptyState.jsx";
export { default as Skeleton, CardSkeleton, TableSkeleton, ListSkeleton, FormSkeleton } from "@/ui/Skeleton.jsx";
export { default as Spinner } from "@/ui/Spinner.jsx";
export { default as ErrorState } from "@/ui/ErrorState.jsx";
export { default as PageHeader, PageHeaderExtrasContext } from "@/ui/PageHeader.jsx";
export { default as DonutChart } from "@/ui/DonutChart.jsx";
export { default as MiniBarChart } from "@/ui/MiniBarChart.jsx";
export { default as DataTable, Th, Td, Tr } from "@/ui/DataTable.jsx";
