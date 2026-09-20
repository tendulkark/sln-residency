import { Navigate, Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useAuthStore } from "@/app/authStore.js";
import { firstAllowedNavItem } from "@/app/navigation.js";
import { EmptyState, buttonVariants } from "@/ui/index.js";

// Page-level gate: renders its children only if the signed-in user's role
// holds `permission`, otherwise a friendly "no access" screen inside the
// shell (not a redirect loop — a Manager typing /settings should learn why
// it's blank, not bounce around). Like the sidebar filtering this is a UX
// nicety only; the API 403s every request the role isn't allowed
// regardless (AI_RULES.md #3).
export default function RequirePermission({ permission, children }) {
  const permissions = useAuthStore((s) => s.permissions);
  const user = useAuthStore((s) => s.user);
  if (permissions.has(permission)) return children;

  const home = firstAllowedNavItem(permissions);
  return (
    <EmptyState
      icon={ShieldOff}
      title="You don't have access to this page"
      subtitle={`Signed in as ${user?.name ?? "—"} (${user?.roleName ?? "no role"}). Ask an Admin if you need this.`}
      action={
        home && (
          <Link to={home.to} className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-2`}>
            Go to {home.label}
          </Link>
        )
      }
    />
  );
}

// Where a bare "/" lands: the first page this role may see, rather than a
// hardcoded Dashboard that a role without rooms.view would be denied.
export function HomeRedirect() {
  const permissions = useAuthStore((s) => s.permissions);
  const home = firstAllowedNavItem(permissions);
  if (!home) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Your role has no pages enabled"
        subtitle="Ask an Admin to grant your role at least one permission."
      />
    );
  }
  return <Navigate to={home.to} replace />;
}
