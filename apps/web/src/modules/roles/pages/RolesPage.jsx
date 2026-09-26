import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Lock, Plus, ShieldCheck, Users } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { useAuthStore } from "@/app/authStore.js";
import { Button, PageHeader, ErrorState, ListSkeleton, CardSkeleton, buttonVariants } from "@/ui/index.js";
import RoleEditor from "@/modules/roles/components/RoleEditor.jsx";
import { ROLES_QUERY_KEY, PERMISSIONS_QUERY_KEY } from "@/modules/roles/constants.js";
import { STAFF_ROUTE_PATH } from "@/modules/staff/constants.js";

const NEW_ROLE = "new";

// Roles & Permissions (roles.manage). What each login can do is entirely
// its role (AI_RULES.md #1/#3) — this is where a hotel shapes those roles.
// Which staff hold which role is set on the Staff screen.
export default function RolesPage() {
  const currentUser = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const rolesQuery = useQuery({ queryKey: [ROLES_QUERY_KEY], queryFn: () => apiFetch("/roles") });
  const catalogQuery = useQuery({ queryKey: [PERMISSIONS_QUERY_KEY], queryFn: () => apiFetch("/permissions"), staleTime: Infinity });
  const roles = rolesQuery.data;
  const catalog = catalogQuery.data;

  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null); // an unsaved new role
  // Remounts the editor whenever the thing being edited changes, so its
  // form state always starts from the role on screen.
  const [editorKey, setEditorKey] = useState(0);

  const selected = selectedId === NEW_ROLE ? draft : roles?.find((r) => r.id === selectedId) ?? roles?.[0] ?? null;

  function select(id) {
    setSelectedId(id);
    setEditorKey((k) => k + 1);
  }
  function startNew(from) {
    setDraft({
      id: null,
      name: from ? `${from.name} (copy)` : "",
      isSystemRole: false,
      permissionCodes: from ? from.permissionCodes : [],
      userCount: 0,
    });
    select(NEW_ROLE);
  }

  const loadError = rolesQuery.isError ? rolesQuery.error : catalogQuery.isError ? catalogQuery.error : null;

  return (
    <div>
      <PageHeader
        icon={ShieldCheck}
        title="Roles & Permissions"
        subtitle="Decide what each kind of staff login can see and do. Assign roles to people on the Staff screen."
        actions={
          <>
            {permissions.has("users.manage") && (
              <Link to={STAFF_ROUTE_PATH} className={buttonVariants({ variant: "outline" })}>
                <Users className="h-4 w-4" />
                Staff
              </Link>
            )}
            <Button onClick={() => startNew(null)} disabled={!roles}>
              <Plus className="h-4 w-4" />
              New role
            </Button>
          </>
        }
      />

      {loadError && (
        <ErrorState
          title="Couldn't load roles"
          error={loadError}
          onRetry={() => {
            rolesQuery.refetch();
            catalogQuery.refetch();
          }}
        />
      )}

      {!loadError && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Roles" className="space-y-1.5">
            {!roles && <ListSkeleton rows={3} />}
            {roles?.map((r) => {
              const active = selected?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => select(r.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
                    active ? "border-brand bg-brand-tint" : "border-line bg-card hover:bg-muted"
                  }`}
                >
                  <span className={`flex items-center gap-1.5 text-sm font-semibold ${active ? "text-brand" : "text-ink"}`}>
                    {r.name}
                    {r.isSystemRole && <Lock className="h-3 w-3 text-ink-muted" />}
                    {r.id === currentUser?.roleId && <span className="text-xs font-normal text-ink-muted">(yours)</span>}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {r.isSystemRole ? "Full access" : `${r.permissionCodes.length} permission${r.permissionCodes.length === 1 ? "" : "s"}`} ·{" "}
                    {r.activeUserCount} active staff
                  </span>
                </button>
              );
            })}
            {selectedId === NEW_ROLE && draft && (
              <div className="w-full rounded-lg border border-dashed border-brand bg-brand-tint px-3 py-2.5 text-sm font-semibold text-brand">
                {draft.name.trim() || "New role"}
                <span className="block text-xs font-normal text-ink-muted">Not saved yet</span>
              </div>
            )}
          </nav>

          <div className="min-w-0">
            {(!roles || !catalog) && <CardSkeleton count={1} />}
            {roles && catalog && selected && (
              <RoleEditor
                key={editorKey}
                role={selected}
                catalog={catalog}
                isOwnRole={selected.id != null && selected.id === currentUser?.roleId}
                onSaved={(saved) => {
                  setDraft(null);
                  select(saved.id);
                }}
                onDeleted={() => select(null)}
                onDuplicate={(from) => startNew(from)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
