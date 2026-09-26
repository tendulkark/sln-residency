import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Lock, Pencil, Star } from "lucide-react";
import { DEFAULTABLE_STATUS_CODES } from "@sln/shared-schemas";
import { apiFetch } from "@/lib/api.js";
import { Button, Badge, Card, Input, Modal, ErrorState, ListSkeleton } from "@/ui/index.js";
import SettingsSection from "@/modules/settings/components/SettingsSection.jsx";
import { statusesKey } from "@/modules/common/constants.js";

const DOMAINS = [
  { domain: "booking", title: "Booking statuses", subtitle: "Reservations, the calendar, Manage Stay and reports" },
  { domain: "room", title: "Room statuses", subtitle: "The room board, Rooms Setup and Housekeeping" },
  { domain: "payment", title: "Payment statuses", subtitle: "Recorded payments and refunds" },
];

// Labels and colors are shown all over the app (room board, calendar,
// reports), so after any change every cached screen is marked stale and
// re-fetches the next time it's on screen.
function useInvalidateEverything() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

function EditStatusModal({ status, onClose }) {
  const invalidate = useInvalidateEverything();
  const [label, setLabel] = useState(status.label);
  const [color, setColor] = useState(status.color);
  const save = useMutation({
    mutationFn: () => apiFetch(`/statuses/${status.id}`, { method: "PATCH", body: JSON.stringify({ label, color }) }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  return (
    <Modal title="Edit status" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {save.error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{save.error.message}</div>}
        <Input label="Label staff see" required maxLength={40} autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink-soft">Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border border-line-strong" />
            <Input className="flex-1" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-ink-soft">
          Preview
          <Badge color={/^#[0-9a-fA-F]{6}$/.test(color) ? color : status.color}>{label || status.label}</Badge>
        </div>
        <p className="text-xs text-ink-muted">
          Only the name and color change — the app still treats it as “{status.code.replace(/_/g, " ")}” in check-in, checkout, the room board
          and reports.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!label.trim()} loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DomainCard({ domain, title, subtitle, onEdit }) {
  const invalidate = useInvalidateEverything();
  const query = useQuery({ queryKey: statusesKey(domain), queryFn: () => apiFetch(`/statuses?domain=${domain}`) });
  const statuses = query.data;
  const [error, setError] = useState(null);

  const reorder = useMutation({
    mutationFn: (ids) => apiFetch("/statuses/order", { method: "PUT", body: JSON.stringify({ domain, ids }) }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });
  const makeDefault = useMutation({
    mutationFn: (status) => apiFetch(`/statuses/${status.id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });

  function move(index, delta) {
    const ids = statuses.map((s) => s.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    reorder.mutate(ids);
  }

  const defaultable = DEFAULTABLE_STATUS_CODES[domain];

  return (
    <Card padded={false}>
      <div className="border-b border-line-soft px-4 py-3">
        <p className="font-semibold text-ink">{title}</p>
        <p className="text-xs text-ink-muted">{subtitle}</p>
      </div>
      {error && <div className="mx-4 mt-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}
      {statuses === undefined && !query.isError && (
        <div className="p-4">
          <ListSkeleton rows={4} />
        </div>
      )}
      {statuses === undefined && query.isError && (
        <div className="p-4">
          <ErrorState compact title="Couldn't load statuses" error={query.error} onRetry={() => query.refetch()} />
        </div>
      )}
      {statuses && (
        <ul className="divide-y divide-line-soft">
          {statuses.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  className="rounded p-0.5 text-ink-faint hover:bg-muted-strong hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${s.label} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-ink-faint hover:bg-muted-strong hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  disabled={i === statuses.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${s.label} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <Badge color={s.color}>{s.label}</Badge>
                {s.isDefault && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                    <Star className="h-3 w-3" />
                    Default
                  </span>
                )}
                {s.isTerminal && <span className="text-xs text-ink-muted">Final</span>}
                {s.isSystem && (
                  <span title="Built in — the app's workflow relies on it, so it can be renamed and recolored but not removed">
                    <Lock className="h-3 w-3 text-ink-faint" aria-label="Built in" />
                  </span>
                )}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {defaultable.includes(s.code) && !s.isDefault && (
                  <Button size="sm" variant="ghost" className="px-2 text-xs" loading={makeDefault.isPending && makeDefault.variables?.id === s.id} onClick={() => makeDefault.mutate(s)}>
                    Make default
                  </Button>
                )}
                <Button size="sm" variant="outline" className="px-2" onClick={() => onEdit(s)} aria-label={`Edit ${s.label}`} title="Edit label and color">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {domain === "booking" && (
        <p className="border-t border-line-soft px-4 py-2.5 text-xs text-ink-muted">The default is the status a new booking starts in.</p>
      )}
    </Card>
  );
}

// Settings → Statuses (statuses.manage). Each hotel names and colors its
// statuses its own way; which statuses exist, and what each one means to
// the check-in/checkout workflow, is fixed.
export default function StatusesPage() {
  const [editing, setEditing] = useState(null);
  return (
    <div className="max-w-5xl">
      <SettingsSection
        title="Statuses"
        subtitle="Rename and recolor the statuses staff see, set the order they're listed in, and choose which status a new booking starts in."
      />
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {DOMAINS.map((d) => (
          <DomainCard key={d.domain} {...d} onEdit={setEditing} />
        ))}
      </div>
      {editing && <EditStatusModal status={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
