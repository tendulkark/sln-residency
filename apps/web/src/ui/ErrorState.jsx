import { AlertTriangle, RotateCw, WifiOff } from "lucide-react";
import Button from "@/ui/Button.jsx";

// Turns whatever a failed request threw into something a front-desk user
// can act on — a dropped connection reads very differently from a server
// refusing the request.
export function describeError(error) {
  const message = error?.message ?? "";
  if (/can't reach the server|failed to fetch|load failed|networkerror|network request failed/i.test(message)) {
    return { offline: true, text: "Can't reach the server. Check the internet connection and try again." };
  }
  if (/request failed: 5\d\d/i.test(message)) {
    return { offline: false, text: "The server ran into a problem. Please try again in a moment." };
  }
  return { offline: false, text: message || "Something went wrong." };
}

// What a screen (or a panel inside one) shows when its data couldn't be
// loaded — never a blank area or a "Loading…" that never ends. `compact`
// is for modals and small panels.
export default function ErrorState({ title = "Couldn't load this", error, message, onRetry, compact = false }) {
  const described = describeError(error);
  const Icon = described.offline ? WifiOff : AlertTriangle;
  return (
    <div role="alert" className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? "py-6" : "py-16"}`}>
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-ink-soft">{described.offline ? "You're offline" : title}</p>
      <p className="max-w-sm text-sm text-ink-muted">{message ?? described.text}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}
