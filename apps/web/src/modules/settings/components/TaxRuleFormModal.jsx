import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatDate } from "@/lib/format.js";
import { Button, Input, Modal, Switch } from "@/ui/index.js";
import { TAX_RULES_QUERY_KEY } from "@/modules/settings/constants.js";
import { ROOM_TYPES_QUERY_KEY, ROOMS_QUERY_KEY } from "@/modules/rooms/constants.js";
import { toFormValues, toPayload } from "@/modules/settings/taxRuleUtils.js";

// Add or edit one GST slab. A rule that has billed a finalized invoice
// keeps its rate, slab and start date (the API enforces it too) — its name,
// SAC code, end date and on/off switch stay editable, which is how a rate
// change is made: end this rule, then add the new one from the next day.
export default function TaxRuleFormModal({ rule, onClose }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(() => toFormValues(rule));
  const locked = Boolean(rule?.isLocked);

  const save = useMutation({
    mutationFn: () =>
      rule
        ? apiFetch(`/tax-rules/${rule.id}`, { method: "PATCH", body: JSON.stringify(toPayload(values)) })
        : apiFetch("/tax-rules", { method: "POST", body: JSON.stringify(toPayload(values)) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TAX_RULES_QUERY_KEY] });
      // Rooms Setup shows each room's price with GST — recompute it.
      queryClient.invalidateQueries({ queryKey: [ROOM_TYPES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [ROOMS_QUERY_KEY] });
      onClose();
    },
  });

  const field = (key) => ({ value: values[key], onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })) });
  const fieldErrors = save.error?.details?.fieldErrors ?? {};

  return (
    <Modal title={rule ? "Edit tax rule" : "Add tax rule"} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {save.error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{save.error.message}</div>}

        {locked && (
          <div className="flex gap-2 rounded-md bg-muted px-3 py-2 text-sm text-ink-soft">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            <p>
              This rule has billed {rule.finalizedCount} finalized invoice{rule.finalizedCount === 1 ? "" : "s"}
              {rule.lastFinalizedAt ? ` (latest ${formatDate(rule.lastFinalizedAt)})` : ""}, so its rate, slab and start date are locked. To
              change the rate, give this rule an end date, then add a new rule starting the next day.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input label="Name" required maxLength={60} placeholder="e.g. GST 5% — up to ₹7,500" error={fieldErrors.name?.[0]} {...field("name")} />
          </div>
          <Input label="GST rate %" type="number" min="0" max="100" step="0.01" required disabled={locked} error={fieldErrors.ratePercent?.[0]} {...field("ratePercent")} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-soft">Tariff slab</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Tariff above ₹" type="number" min="0" step="0.01" placeholder="No lower limit" disabled={locked} {...field("appliesAboveAmount")} />
            <Input
              label="Tariff up to ₹"
              type="number"
              min="0"
              step="0.01"
              placeholder="No upper limit"
              disabled={locked}
              error={fieldErrors.appliesBelowAmount?.[0]}
              {...field("appliesBelowAmount")}
            />
          </div>
          <p className="text-xs text-ink-muted">
            The tariff is per room per night, before GST. “Up to” includes the amount itself and “above” means more than it — so a ₹7,500
            room falls in an “up to ₹7,500” slab. Leave both empty for a rate that applies at every tariff.
          </p>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="In force from" type="date" required disabled={locked} {...field("effectiveFrom")} />
          <Input label="Until (optional)" type="date" min={values.effectiveFrom} error={fieldErrors.effectiveTo?.[0]} {...field("effectiveTo")} />
          <Input label="SAC / HSN code" inputMode="numeric" maxLength={8} placeholder="e.g. 996311" error={fieldErrors.hsnSacCode?.[0]} {...field("hsnSacCode")} />
        </div>
        <p className="-mt-2 text-xs text-ink-muted">The SAC code goes on the GSTR-1 export. 996311 is room accommodation.</p>

        <Switch
          label="Active"
          description="An inactive rule is never applied, whatever its dates."
          checked={values.isActive}
          onChange={(isActive) => setValues((v) => ({ ...v, isActive }))}
        />

        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {rule ? "Save changes" : "Add rule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
