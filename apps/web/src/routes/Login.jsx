import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hotel } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import { useAuthStore } from "../store/authStore.js";
import { Button, Input } from "../ui/index.js";

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
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Hotel className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Staff Sign In</h1>
          <p className="text-sm text-gray-500">SLN Residency staff console</p>
        </div>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <Input id="email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input id="password" label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
