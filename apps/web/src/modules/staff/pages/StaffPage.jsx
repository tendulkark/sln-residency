import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users, KeyRound, Pencil, Power } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatDate } from "@/lib/format.js";
import { useAuthStore } from "@/app/authStore.js";
import { Button, Badge, PageHeader, EmptyState, ErrorState, TableSkeleton, DataTable, Th, Td, Tr } from "@/ui/index.js";
import UserFormModal from "@/modules/staff/components/UserFormModal.jsx";
import ResetPasswordModal from "@/modules/staff/components/ResetPasswordModal.jsx";
import { USERS_QUERY_KEY } from "@/modules/staff/constants.js";

// Admin-only (gated by users.manage at the route level, see app/router.jsx)
// screen to create logins for hotel staff and control what each one can
// reach — "what it can reach" being entirely a matter of which Role it's
// assigned, never anything toggled per-user here (AI_RULES.md #1).
export default function StaffPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [formUser, setFormUser] = useState(undefined); // undefined = closed, null = create, object = edit
  const [resetUser, setResetUser] = useState(null);
  const [error, setError] = useState(null);

  const usersQuery = useQuery({ queryKey: [USERS_QUERY_KEY], queryFn: () => apiFetch("/users") });
  const users = usersQuery.data;

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }) => apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [USERS_QUERY_KEY] }),
    onError: (err) => setError(err.message),
  });

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Staff"
        subtitle="Create logins for the people working the desk, and control what each one can reach"
        actions={
          <Button onClick={() => setFormUser(null)}>
            <UserPlus className="h-4 w-4" />
            Add Staff
          </Button>
        }
      />

      {error && <div className="mb-4 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}

      {users === undefined && !usersQuery.isError && <TableSkeleton rows={4} columns={6} />}

      {users === undefined && usersQuery.isError && (
        <ErrorState title="Couldn't load staff accounts" error={usersQuery.error} onRetry={() => usersQuery.refetch()} />
      )}

      {users && users.length === 0 && (
        <EmptyState
          icon={Users}
          title="No staff accounts yet"
          subtitle="Add one to give a worker their own login."
          action={
            <Button size="sm" className="mt-2" onClick={() => setFormUser(null)}>
              <UserPlus className="h-4 w-4" />
              Add Staff
            </Button>
          }
        />
      )}

      {users && users.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              <Th pinned>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Added</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              return (
                <Tr key={u.id}>
                  <Td pinned className="whitespace-nowrap font-medium text-ink">
                    {u.name}
                    {isSelf && <span className="ml-1.5 text-xs font-normal text-ink-muted">(you)</span>}
                  </Td>
                  <Td className="whitespace-nowrap">{u.email}</Td>
                  <Td>
                    <Badge tone="brand">{u.roleName}</Badge>
                  </Td>
                  <Td>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">{formatDate(u.createdAt)}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setFormUser(u)}>
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setResetUser(u)}>
                        <KeyRound className="h-3 w-3" />
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        variant={u.isActive ? "danger" : "outline"}
                        disabled={isSelf && u.isActive}
                        title={isSelf && u.isActive ? "You can't deactivate your own account" : undefined}
                        onClick={() => toggleActiveMutation.mutate({ id: u.id, isActive: !u.isActive })}
                        loading={toggleActiveMutation.isPending && toggleActiveMutation.variables?.id === u.id}
                      >
                        <Power className="h-3 w-3" />
                        {u.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {formUser !== undefined && <UserFormModal user={formUser} onClose={() => setFormUser(undefined)} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  );
}
