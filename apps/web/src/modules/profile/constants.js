// Profile isn't a sidebar item (no NAV_ITEM/permission — every signed-in
// role can reach their own profile), so this only exports the route path,
// used by AdminShell's user-menu link and app/router.jsx's route entry.
export const PROFILE_ROUTE_PATH = "/profile";
