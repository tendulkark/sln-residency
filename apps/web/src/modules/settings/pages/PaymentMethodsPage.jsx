import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Power, Trash2, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { Button, Badge, Input, Modal, ConfirmModal, EmptyState, ErrorState, TableSkeleton, DataTable, Th, Td, Tr } from "@/ui/index.js";
import SettingsSection from "@/modules/settings/components/SettingsSection.jsx";
import { PAYMENT_METHODS_ADMIN_QUERY_KEY } from "@/modules/settings/constants.js";
import { PAYMENT_METHODS_QUERY_KEY } from "@/modules/common/constants.js";

// Invalidating the shared prefix refreshes both this list and every
// record-payment picker (BookingFormModal, ManageStayModal, CheckoutModal).
function useInvalidateMethods() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [PAYMENT_METHODS_QUERY_KEY] });
}

function MethodFormModal({ method, onClose }) {
  const invalidate = useInvalidateMethods();
  const [name, setName] = useState(method?.name ?? "");
  const save = useMutation({
    mutationFn: () =>
      method
        ? apiFetch(`/payment-methods/${method.id}`, { method: "PATCH", body: JSON.stringify({ name }) })
        : apiFetch("/payment-methods", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  return (
    <Modal title={method ? "Rename payment method" : "Add payment method"} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {save.error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{save.error.message}</div>}
        <Input label="Name" required maxLength={40} autoFocus placeholder="e.g. Paytm, Cheque, Company credit" value={name} onChange={(e) => setName(e.target.value)} />
        {method && <p className="text-xs text-ink-muted">Past payments and reports show the new name too.</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()} loading={save.isPending}>
            {method ? "Save" : "Add method"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Settings → Payment methods (paymentmethods.manage): the ways a guest can
// pay at the desk. A method that has been used is switched off rather than
// deleted, so past payments and reports keep their label.
export default function PaymentMethodsPage() {
  const invalidate = useInvalidateMethods();
  const [editing, setEditing] = useState(undefined); // undefined closed, null new, object rename
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState(null);

  const methodsQuery = useQuery({ queryKey: PAYMENT_METHODS_ADMIN_QUERY_KEY, queryFn: () => apiFetch("/payment-methods?all=true") });
  const methods = methodsQuery.data;
  const activeCount = methods?.filter((m) => m.isActive).length ?? 0;

  const toggle = useMutation({
    mutationFn: (m) => apiFetch(`/payment-methods/${m.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !m.isActive }) }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (m) => apiFetch(`/payment-methods/${m.id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
  });

  return (
    <div className="max-w-3xl">
      <SettingsSection
        title="Payment methods"
        subtitle="The ways staff can record a guest paying — offered in New Booking, Manage Stay and Checkout. Switch off a method you no longer take; its past payments keep their name."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" />
            Add method
          </Button>
        }
      />

      {error && <div className="mb-4 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}

      {methods === undefined && !methodsQuery.isError && <TableSkeleton rows={5} columns={4} />}
      {methods === undefined && methodsQuery.isError && (
        <ErrorState title="Couldn't load payment methods" error={methodsQuery.error} onRetry={() => methodsQuery.refetch()} />
      )}
      {methods?.length === 0 && (
        <EmptyState icon={Wallet} title="No payment methods yet" subtitle="Add at least one so staff can record payments." />
      )}

      {methods?.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              <Th pinned>Method</Th>
              <Th>Used</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => {
              const lastActive = m.isActive && activeCount === 1;
              return (
                <Tr key={m.id}>
                  <Td pinned className="whitespace-nowrap">
                    <span className="font-medium text-ink">{m.name}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {m.paymentCount === 0 ? "Not used yet" : `${m.paymentCount} payment${m.paymentCount === 1 ? "" : "s"}`}
                  </Td>
                  <Td>{m.isActive ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                        <Pencil className="h-3 w-3" />
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={lastActive}
                        title={lastActive ? "Keep at least one payment method switched on" : undefined}
                        loading={toggle.isPending && toggle.variables?.id === m.id}
                        onClick={() => toggle.mutate(m)}
                      >
                        <Power className="h-3 w-3" />
                        {m.isActive ? "Switch off" : "Switch on"}
                      </Button>
                      {m.paymentCount === 0 && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={lastActive}
                          title={lastActive ? "Keep at least one payment method switched on" : "Delete — never used"}
                          onClick={() => {
                            remove.reset();
                            setDeleting(m);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {editing !== undefined && <MethodFormModal method={editing} onClose={() => setEditing(undefined)} />}
      {deleting && (
        <ConfirmModal
          title="Delete payment method?"
          confirmLabel="Delete"
          loading={remove.isPending}
          error={remove.error?.message}
          onConfirm={() => remove.mutate(deleting)}
          onClose={() => setDeleting(null)}
        >
          <p>
            “{deleting.name}” has never been used, so it can be removed completely.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
