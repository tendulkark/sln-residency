import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dices } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { Button, Input, Select, Modal } from "@/ui/index.js";
import { USERS_QUERY_KEY, ROLES_QUERY_KEY } from "@/modules/staff/constants.js";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword() {
  return Array.from({ length: 12 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

// Create-or-edit a staff login. Editing never touches the password — a
// separate, dedicated "Reset password" action on the row handles that, so
// it can carry its own confirmation and force-logout-elsewhere behavior
// rather than being buried as a field here.
export default function UserFormModal({ user, onClose }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(user);
  const { data: roles } = useQuery({ queryKey: [ROLES_QUERY_KEY], queryFn: () => apiFetch("/roles") });
  const roleOptions = (roles ?? []).map((r) => ({ value: r.id, label: r.name }));

  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    roleId: user?.roleId ?? "",
    password: isEdit ? "" : generatePassword(),
  });
  const [error, setError] = useState(null);

  function field(key) {
    return { value: form[key], onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })) };
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      isEdit
        ? apiFetch(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ name: form.name, email: form.email, roleId: form.roleId }) })
        : apiFetch("/users", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function submit(e) {
    e.preventDefault();
    setError(null);
    saveMutation.mutate();
  }

  return (
    <Modal title={isEdit ? "Edit staff account" : "Add staff account"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}

        <Input label="Name" required {...field("name")} />
        <Input label="Email" type="email" required {...field("email")} />
        <Select label="Role" options={roleOptions} loading={!roles} value={form.roleId} onChange={(v) => setForm((f) => ({ ...f, roleId: v }))} />

        {!isEdit && (
          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input label="Password" required minLength={8} {...field("password")} />
              </div>
              <Button type="button" variant="outline" size="md" onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}>
                <Dices className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 text-xs text-ink-muted">Share this with them directly — it won't be shown again after you save.</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!form.roleId} loading={saveMutation.isPending}>
            {isEdit ? "Save changes" : "Create account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
