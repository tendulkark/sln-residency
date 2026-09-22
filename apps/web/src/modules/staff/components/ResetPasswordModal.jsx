import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dices } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { Button, Input, Modal } from "@/ui/index.js";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword() {
  return Array.from({ length: 12 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

// An Admin setting a new password for someone else's account. Signs that
// account out of every device it was on (apps/api/users.routes.js) — the
// point of a reset is usually "this login may be compromised or they're
// locked out", so every existing session should need the new password too.
export default function ResetPasswordModal({ user, onClose }) {
  const [password, setPassword] = useState(generatePassword());
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => apiFetch(`/users/${user.id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: () => setDone(true),
    onError: (err) => setError(err.message),
  });

  return (
    <Modal title={`Reset password — ${user.name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            New password for <span className="font-semibold">{user.email}</span>:
          </p>
          <p className="rounded-md border border-line bg-muted px-3 py-2 font-mono text-sm text-ink">{password}</p>
          <p className="text-xs text-ink-muted">
            They've been signed out everywhere and will need this to sign in again. Share it with them directly — it won't be shown again.
          </p>
          <div className="flex justify-end pt-2">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}
          <p className="text-sm text-ink-muted">
            This immediately signs <span className="font-medium text-ink">{user.name}</span> out of every device — they'll need the new
            password to sign back in.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input label="New password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
              <Dices className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending || password.length < 8}>
              Reset password
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
