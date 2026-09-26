import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, LogOut, MonitorSmartphone, Smartphone } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { Badge, Button, Card, ErrorState, ListSkeleton } from "@/ui/index.js";
import { MY_SESSIONS_QUERY_KEY } from "@/modules/profile/constants.js";

// "Chrome on macOS"-style label from a stored User-Agent — good enough to
// tell the front-desk PC from a phone; never used for anything but display.
function describeDevice(userAgent = "") {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const mobile = /iPhone|Android.*Mobile|Mobile Safari/.test(ua);
  return { label: os ? `${browser} on ${os}` : browser, mobile };
}

// Every browser/app this account is signed in on — a staff member can use
// the front-desk PC and their phone at once, and sign out one they no
// longer have (a lost phone, a shared computer) without touching the rest.
export default function SignedInDevicesCard() {
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: [MY_SESSIONS_QUERY_KEY],
    queryFn: () => apiFetch("/auth/sessions"),
  });

  const onDone = () => queryClient.invalidateQueries({ queryKey: [MY_SESSIONS_QUERY_KEY] });
  const revokeMutation = useMutation({
    mutationFn: (id) => apiFetch(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSettled: onDone,
  });
  const revokeOthersMutation = useMutation({
    mutationFn: () => apiFetch("/auth/sessions/revoke-others", { method: "POST" }),
    onSettled: onDone,
  });

  const sessions = sessionsQuery.data ?? [];
  const others = sessions.filter((s) => !s.isCurrent);
  const actionError = revokeMutation.error ?? revokeOthersMutation.error;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <MonitorSmartphone className="h-4 w-4 text-brand" />
          Signed-in devices
        </p>
        {others.length > 0 && (
          <Button variant="danger" size="sm" onClick={() => revokeOthersMutation.mutate()} loading={revokeOthersMutation.isPending}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out all other devices
          </Button>
        )}
      </div>

      {actionError && <div className="mb-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{actionError.message}</div>}

      {sessionsQuery.isPending ? (
        <ListSkeleton rows={2} />
      ) : sessionsQuery.isError ? (
        <ErrorState compact title="Couldn't load your devices" error={sessionsQuery.error} onRetry={() => sessionsQuery.refetch()} />
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((s) => {
            const device = describeDevice(s.userAgent);
            const Icon = device.mobile ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <Icon className="h-5 w-5 shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                    {device.label}
                    {s.isCurrent && <Badge tone="success">This device</Badge>}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    Last active {formatDateTime(s.lastUsedAt)} · signed in {formatDateTime(s.createdAt)}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                  </p>
                </div>
                {!s.isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => revokeMutation.mutate(s.id)}
                    loading={revokeMutation.isPending && revokeMutation.variables === s.id}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Signing a device out takes effect on its very next action. Changing your password doesn't sign other devices out — use the button above if
        you think someone else knows it.
      </p>
    </Card>
  );
}
