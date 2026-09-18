import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// The app's own name/branding is tenant data (Tenant.name, Tenant.logoUrl —
// see Settings), so the installable-app identity below is deliberately
// generic ("Hotel Staff Console"), never a specific hotel's name, per
// AI_RULES.md: this codebase runs for tenant #2 and #50, not just #1.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiOrigin = env.VITE_API_URL ?? "http://localhost:4000";

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon-16.png", "favicon-32.png", "apple-touch-icon.png"],
        manifest: {
          name: "Hotel Staff Console",
          short_name: "Hotel Desk",
          description: "Multi-tenant hotel staff console — rooms, bookings, housekeeping, reservations & reports.",
          theme_color: "#7a1f3d",
          background_color: "#fbf6ea",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // The app shell (JS/CSS/HTML) is precached automatically. API
          // responses are never precached and always tried on the network
          // first — a flaky connection should time out and fall back to a
          // cached copy, never silently show a stale room board as if it
          // were live.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === apiOrigin,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-cache",
                networkTimeoutSeconds: 8,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        // Only active in production builds — the dev server keeps its
        // normal HMR workflow with no service worker in the way.
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        // Every import in the app is written as "@/..." from src, never a
        // relative "./"/"../" chain — one alias here is the only place that
        // ever needs to change if src ever moves.
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
    },
  };
});
