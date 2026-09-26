import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Lock, Trash2 } from "lucide-react";
import { apiFetch, syncSession } from "@/lib/api.js";
import { Button, Card, ConfirmModal, Input } from "@/ui/index.js";
import { ROLES_QUERY_KEY, PERMISSION_GROUPS } from "@/modules/roles/constants.js";

const MANAGE_ROLES = "roles.manage";

// The catalog, grouped under readable headings in PERMISSION_GROUPS order;
// a code with an unknown prefix still shows, under that prefix.
function groupCatalog(catalog) {
  const labelOf = (code) => PERMISSION_GROUPS.find((g) => g.prefix === code.split(".")[0])?.label ?? code.split(".")[0];
  const order = [...new Set(PERMISSION_GROUPS.map((g) => g.label))];
  const groups = new Map();
  for (const p of catalog) {
    const label = labelOf(p.code);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(p);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

// Ticking any permission in a group also ticks that group's ".view", since
// every other action in it starts from seeing the records (creating a
// booking without seeing bookings isn't a workable role).
function withViews(codes, catalog) {
  const next = new Set(codes);
  for (const code of codes) {
    const view = `${code.split(".")[0]}.view`;
    if (view !== code && catalog.some((p) => p.code === view)) next.add(view);
  }
  return next;
}

// Edit one role's name and permissions — or, for a draft (role.id null),
// create it. The built-in Admin role renders read-only: it always has every
// permission, so nobody can lock the hotel out of its own console.
export default function RoleEditor({ role, catalog, isOwnRole, onSaved, onDeleted, onDuplicate }) {
  const queryClient = useQueryClient();
  const isNew = !role.id;
  const readOnly = role.isSystemRole;
  const [name, setName] = useState(role.name);
  const [codes, setCodes] = useState(() => new Set(role.permissionCodes));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);

  const dirty = isNew || name.trim() !== role.name || codes.size !== role.permissionCodes.length || role.permissionCodes.some((c) => !codes.has(c));

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ name: name.trim(), permissionCodes: [...codes] });
      return isNew ? apiFetch("/roles", { method: "POST", body }) : apiFetch(`/roles/${role.id}`, { method: "PATCH", body });
    },
    onSuccess: (saved) => {
      // Put the saved role in the cache straight away — the page remounts
      // this editor from it before the background refetch lands.
      queryClient.setQueryData([ROLES_QUERY_KEY], (old) =>
        old ? (isNew ? [...old, saved] : old.map((r) => (r.id === saved.id ? { ...r, ...saved } : r))) : old
      );
      queryClient.invalidateQueries({ queryKey: [ROLES_QUERY_KEY] });
      // Editing your own role changes what you can see right now.
      if (isOwnRole) syncSession({ force: true });
      onSaved(saved);
    },
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/roles/${role.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROLES_QUERY_KEY] });
      setConfirmDelete(false);
      onDeleted();
    },
  });

  function toggle(code, on) {
    setCodes((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return on ? withViews(next, catalog) : next;
    });
  }
  function toggleGroup(perms, on) {
    setCodes((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (on) next.add(p.code);
        else if (!(isOwnRole && p.code === MANAGE_ROLES)) next.delete(p.code);
      }
      return next;
    });
  }

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-soft px-4 py-3">
        {readOnly ? (
          <div>
            <p className="flex items-center gap-1.5 font-display text-xl font-bold text-ink">
              {role.name}
              <Lock className="h-4 w-4 text-ink-muted" />
            </p>
            <p className="text-xs text-ink-muted">Built-in · always has every permission, including ones added in future updates</p>
          </div>
        ) : (
          <div className="min-w-[14rem] flex-1">
            <Input label="Role name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front Desk, Night Auditor" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">
            {readOnly ? catalog.length : codes.size} of {catalog.length} permissions
          </span>
          {!isNew && (
            <Button size="sm" variant="outline" onClick={() => onDuplicate({ ...role, permissionCodes: readOnly ? catalog.map((p) => p.code) : [...codes] })}>
              <Copy className="h-3 w-3" />
              Duplicate
            </Button>
          )}
          {!isNew && !readOnly && (
            <Button
              size="sm"
              variant="danger"
              disabled={role.userCount > 0}
              title={role.userCount > 0 ? "Move its staff to another role first" : "Delete this role"}
              onClick={() => {
                remove.reset();
                setConfirmDelete(true);
              }}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {isOwnRole && !readOnly && (
        <p className="border-b border-line-soft bg-warning-tint px-4 py-2 text-xs text-warning">
          This is your own role — changes apply to you as soon as you save. Roles & permissions access can't be removed from it here.
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-5 px-4 py-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {groups.map(([label, perms]) => {
          const on = perms.filter((p) => readOnly || codes.has(p.code)).length;
          return (
            <fieldset key={label} className="min-w-0">
              <legend className="mb-1.5 flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{label}</span>
                {!readOnly && (
                  <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => toggleGroup(perms, on < perms.length)}>
                    {on < perms.length ? "Select all" : "Clear"}
                  </button>
                )}
              </legend>
              <ul className="space-y-1">
                {perms.map((p) => {
                  const locked = readOnly || (isOwnRole && p.code === MANAGE_ROLES);
                  return (
                    <li key={p.code}>
                      <label className={`flex gap-2.5 rounded-md px-2 py-1.5 text-sm ${locked ? "cursor-default" : "cursor-pointer hover:bg-muted"}`}>
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                          checked={readOnly || codes.has(p.code)}
                          disabled={locked}
                          onChange={(e) => toggle(p.code, e.target.checked)}
                        />
                        <span className="min-w-0">
                          <span className="block text-ink-soft">{p.description}</span>
                          <span className="block font-mono text-[11px] text-ink-faint">{p.code}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line-soft px-4 py-3">
          {save.error && <p className="mr-auto text-sm text-danger">{save.error.message}</p>}
          {dirty && !save.error && <p className="mr-auto text-xs text-ink-muted">{isNew ? "New role — not saved yet" : "Unsaved changes"}</p>}
          <Button
            variant="outline"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setName(role.name);
              setCodes(new Set(role.permissionCodes));
              save.reset();
            }}
          >
            {isNew ? "Clear" : "Discard"}
          </Button>
          <Button disabled={!dirty || !name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            {isNew ? "Create role" : "Save role"}
          </Button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete role?"
          confirmLabel="Delete role"
          loading={remove.isPending}
          error={remove.error?.message}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirmDelete(false)}
        >
          <p>“{role.name}” isn't assigned to anyone, so it can be removed. This can't be undone.</p>
        </ConfirmModal>
      )}
    </Card>
  );
}
