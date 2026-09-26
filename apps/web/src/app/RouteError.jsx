import { useRouteError } from "react-router-dom";
import { Home, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/ui/index.js";
import { useModuleRefresh } from "@/app/ModuleRefresh.jsx";

// Shown instead of a page when rendering it crashed (or a route failed to
// load) — a plain explanation and a way forward, rather than react-router's
// developer error screen. Registered per page inside the shell, so the
// sidebar stays usable, and once at the root as the last resort.
export default function RouteError({ fullScreen = false }) {
  const error = useRouteError();
  // Inside the shell, a crashed page can be retried on its own — the rest
  // of the app (sidebar, session, other modules' data) never went away.
  const moduleRefresh = useModuleRefresh();
  // A new build was deployed while this tab was open, so an old page chunk
  // no longer exists — reloading picks up the new version.
  const staleBuild = /dynamically imported module|importing a module script failed/i.test(error?.message ?? "");

  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-4 text-center ${fullScreen ? "divine-pattern h-screen" : "py-20"}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger">
        <TriangleAlert className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold text-ink">{staleBuild ? "A new version is available" : "Something went wrong on this screen"}</p>
      <p className="max-w-md text-sm text-ink-muted">
        {staleBuild
          ? "Reload to get the latest version of the app."
          : moduleRefresh
            ? "Your data is safe — nothing was saved halfway. Try this screen again, or go back to the start."
            : "Your data is safe — nothing was saved halfway. Reload the page, or go back to the dashboard and try again."}
      </p>
      <div className="mt-1 flex gap-2">
        {moduleRefresh && !staleBuild ? (
          <Button variant="outline" size="sm" onClick={moduleRefresh.refresh} loading={moduleRefresh.refreshing}>
            <RotateCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RotateCw className="h-3.5 w-3.5" />
            Reload
          </Button>
        )}
        {!staleBuild && (
          <Button size="sm" onClick={() => window.location.assign("/")}>
            <Home className="h-3.5 w-3.5" />
            Go to start
          </Button>
        )}
      </div>
      {import.meta.env.DEV && error?.message && <pre className="mt-3 max-w-xl whitespace-pre-wrap text-left text-xs text-ink-faint">{error.message}</pre>}
    </div>
  );
}
