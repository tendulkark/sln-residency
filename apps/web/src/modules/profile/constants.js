// Profile isn't a sidebar item (no NAV_ITEM/permission — every signed-in
// role can reach their own profile), so this only exports the route path,
// used by AdminShell's user-menu link and app/router.jsx's route entry.
export const PROFILE_ROUTE_PATH = "/profile";

// The signed-in user's own devices (GET /auth/sessions) — the "Signed-in
// devices" card.
export const MY_SESSIONS_QUERY_KEY = "my-sessions";
