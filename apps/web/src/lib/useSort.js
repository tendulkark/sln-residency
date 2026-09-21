import { useState } from "react";

// Shared 3-state column sort for any table that pushes sorting to the
// server via sortBy/sortDir query params (Invoices, Reports > Bookings).
// Clicking a column cycles asc -> desc -> off (back to the server's default
// order); clicking a different column starts that one fresh at asc. Kept
// as a hook rather than duplicated useState+toggle logic in every page so
// the click-cycle behavior can't drift between tables.
export function useSort() {
  const [sort, setSort] = useState({ sortBy: null, sortDir: null });

  function toggle(key) {
    setSort((prev) => {
      if (prev.sortBy !== key) return { sortBy: key, sortDir: "asc" };
      if (prev.sortDir === "asc") return { sortBy: key, sortDir: "desc" };
      return { sortBy: null, sortDir: null };
    });
  }

  // For a Th: `<Th {...sort.headerProps("guest")}>Guest</Th>`.
  function headerProps(key) {
    return { sortDir: sort.sortBy === key ? sort.sortDir : undefined, onSort: () => toggle(key) };
  }

  return { sortBy: sort.sortBy, sortDir: sort.sortDir, toggle, headerProps };
}
