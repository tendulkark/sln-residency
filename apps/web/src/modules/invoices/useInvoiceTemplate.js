import { useQuery } from "@tanstack/react-query";
import { DEFAULT_INVOICE_TEMPLATE } from "@sln/shared-schemas";
import { apiFetch } from "@/lib/api.js";
import { INVOICE_TEMPLATE_QUERY_KEY } from "@/modules/invoices/constants.js";

// The tenant's saved invoice design. Null while loading so callers don't
// flash the default look; falls back to defaults if the fetch fails, since
// a bill must stay printable either way.
export function useInvoiceTemplate() {
  const { data, isError } = useQuery({
    queryKey: [INVOICE_TEMPLATE_QUERY_KEY],
    queryFn: () => apiFetch("/invoice-template"),
    staleTime: 5 * 60_000,
  });
  return data ?? (isError ? DEFAULT_INVOICE_TEMPLATE : null);
}
