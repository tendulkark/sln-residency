import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserCircle, KeyRound, ShieldCheck, CheckCircle2 } from "lucide-react";
import { PERMISSIONS } from "@sln/shared-schemas";
import { apiFetch } from "@/lib/api.js";
import { useAuthStore } from "@/app/authStore.js";
import { Button, Input, Badge, Card, PageHeader } from "@/ui/index.js";

const EMPTY_PASSWORD_FORM = { currentPassword: "", newPassword: "", confirmPassword: "" };

// Every signed-in role's own account screen — who they are, which role
// they're on, what that role lets them do (read from the same permission
// catalog the API enforces, so this list can never drift from reality),
// and a self-service password change. Reachable from the sidebar's user
// block regardless of permission — this is about *their own* account, not
// staff.manage.
export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const permissions = useAuthStore((s) => s.permissions);

  const [form, setForm] = useState(EMPTY_PASSWORD_FORM);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      }),
    onSuccess: () => {
      setForm(EMPTY_PASSWORD_FORM);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => setError(err.message),
  });

  function submitPasswordChange(e) {
    e.preventDefault();
    setError(null);
    if (form.newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords don't match");
      return;
    }
    changePasswordMutation.mutate();
  }

  const grantedPermissions = PERMISSIONS.filter((p) => permissions.has(p.code));

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader icon={UserCircle} title="My Profile" subtitle="Your account, role, and access" />

      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-semibold text-white ring-2 ring-gold-tint">
            {(user?.name ?? "?").trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">{user?.name}</p>
            <p className="truncate text-sm text-ink-muted">{user?.email}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand/75">Role</p>
            <Badge tone="brand" className="mt-1">
              {user?.roleName}
            </Badge>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand/75">Hotel</p>
            <p className="mt-1 text-ink">{tenant?.name}</p>
          </div>
        </div>
      </Card>

      <Card>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-brand" />
          What your role lets you do
        </p>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {grantedPermissions.map((p) => (
            <li key={p.code} className="flex items-start gap-1.5 text-xs text-ink-soft">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              {p.description}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">Ask an Admin if you need access to something not listed here.</p>
      </Card>

      <Card>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <KeyRound className="h-4 w-4 text-brand" />
          Change password
        </p>
        {error && <div className="mb-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}
        {success && <div className="mb-3 rounded-md bg-success-tint px-3 py-2 text-sm text-success">Password updated.</div>}
        <form onSubmit={submitPasswordChange} className="space-y-3">
          <Input
            label="Current password"
            type="password"
            required
            value={form.currentPassword}
            onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
          />
          <Input
            label="New password"
            type="password"
            required
            minLength={8}
            value={form.newPassword}
            onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            minLength={8}
            value={form.confirmPassword}
            onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
          />
          <div className="flex justify-end pt-1">
            <Button type="submit" loading={changePasswordMutation.isPending}>
              Update password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
