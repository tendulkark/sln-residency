import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hotel } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { useAuthStore } from "@/modules/auth/authStore.js";
import { Button, Input } from "@/ui/index.js";
import { DASHBOARD_ROUTE_PATH } from "@/modules/dashboard/constants.js";

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(data);
      navigate(DASHBOARD_ROUTE_PATH, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="divine-pattern flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-card shadow-lg">
        <div className="divine-rule" />
        <div className="space-y-4 p-8">
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand ring-2 ring-gold-tint">
              <Hotel className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-ink">Staff Sign In</h1>
            <p className="text-sm text-ink-muted">Sign in to your hotel's staff console</p>
          </div>

          {error && <div role="alert" className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}

          <Input id="email" label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input id="password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
  );
}
