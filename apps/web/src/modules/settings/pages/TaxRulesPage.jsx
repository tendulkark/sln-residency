import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock, Pencil, Percent, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatCurrencyExact, formatDate } from "@/lib/format.js";
import { toISODate } from "@/lib/dateRange.js";
import { Button, Badge, Card, ConfirmModal, EmptyState, ErrorState, TableSkeleton, DataTable, Th, Td, Tr } from "@/ui/index.js";
import SettingsSection from "@/modules/settings/components/SettingsSection.jsx";
import TaxRuleFormModal from "@/modules/settings/components/TaxRuleFormModal.jsx";
import { TAX_RULES_QUERY_KEY } from "@/modules/settings/constants.js";
import { slabLabel, ruleState, slabLadder } from "@/modules/settings/taxRuleUtils.js";

const STATE_BADGE = {
  inForce: { tone: "success", label: "In force" },
  scheduled: { tone: "warning", label: "Scheduled" },
  ended: { tone: "neutral", label: "Ended" },
  off: { tone: "neutral", label: "Off" },
};

function gapLabel(step) {
  if (step.above == null) return `Up to ${formatCurrencyExact(step.upTo)}`;
  if (step.upTo == null) return `Above ${formatCurrencyExact(step.above)}`;
  return `Above ${formatCurrencyExact(step.above)}, up to ${formatCurrencyExact(step.upTo)}`;
}

// What a stay checked out today would be charged, slab by slab, with any
// tariff range no rule covers flagged — a room priced there gets no GST.
function TodaysSlabs({ rules, today }) {
  const ladder = slabLadder(rules, today);
  const hasGap = ladder.some((s) => s.gap);

  return (
    <Card className="mb-5">
      <p className="mb-3 text-sm font-semibold text-ink">GST in force today</p>
      {ladder.length === 0 ? (
        <div className="flex gap-2 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          No active rule covers today — stays checked out now would be billed with no GST.
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {ladder.map((step, i) =>
            step.gap ? (
              <li key={`gap-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm text-danger">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {gapLabel(step)}
                </span>
                <span className="font-medium">No rule — no GST</span>
              </li>
            ) : (
              <li key={step.rule.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink-soft">{slabLabel(step.rule)}</span>
                <span className="font-semibold text-ink">{step.rule.ratePercent}% GST</span>
              </li>
            )
          )}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Tariff per room per night, before GST.
        {hasGap && " Add a rule for the uncovered range, or widen a neighbouring slab."}
      </p>
    </Card>
  );
}

// Settings → Tax rules (taxrules.manage): GST slabs for the room tariff.
// The API refuses overlapping slabs and locks the rate of any rule that has
// billed a finalized invoice; the page explains both rather than hiding them.
export default function TaxRulesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(undefined); // undefined closed, null new, object edit
  const [deleting, setDeleting] = useState(null);
  const today = toISODate(new Date());

  const rulesQuery = useQuery({ queryKey: [TAX_RULES_QUERY_KEY], queryFn: () => apiFetch("/tax-rules") });
  const rules = rulesQuery.data;

  const remove = useMutation({
    mutationFn: (rule) => apiFetch(`/tax-rules/${rule.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TAX_RULES_QUERY_KEY] });
      setDeleting(null);
    },
  });

  return (
    <div className="max-w-5xl">
      <SettingsSection
        title="Tax rules"
        subtitle="GST on the room tariff. At checkout each stay is billed at the rule in force that day for its tariff; a finalized invoice keeps the rate it was issued with even if a rule changes later."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" />
            Add rule
          </Button>
        }
      />

      {rules === undefined && !rulesQuery.isError && <TableSkeleton rows={3} columns={7} />}
      {rules === undefined && rulesQuery.isError && <ErrorState title="Couldn't load tax rules" error={rulesQuery.error} onRetry={() => rulesQuery.refetch()} />}
      {rules?.length === 0 && (
        <EmptyState
          icon={Percent}
          title="No tax rules yet"
          subtitle="Without one, rooms are priced and billed with no GST."
          action={
            <Button size="sm" className="mt-2" onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" />
              Add rule
            </Button>
          }
        />
      )}

      {rules?.length > 0 && (
        <>
          <TodaysSlabs rules={rules} today={today} />
          <DataTable>
            <thead>
              <tr>
                <Th pinned>Rule</Th>
                <Th align="right">Rate</Th>
                <Th>Tariff slab</Th>
                <Th>In force</Th>
                <Th>SAC</Th>
                <Th>Status</Th>
                <Th>Used on</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const state = STATE_BADGE[ruleState(rule, today)];
                return (
                  <Tr key={rule.id}>
                    <Td pinned className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                        {rule.name}
                        {rule.isLocked && (
                          <span title="Rate, slab and start date locked — it has billed finalized invoices">
                            <Lock className="h-3.5 w-3.5 text-ink-muted" aria-label="Rate locked" />
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td align="right" className="whitespace-nowrap font-semibold text-ink">
                      {rule.ratePercent}%
                    </Td>
                    <Td className="whitespace-nowrap">{slabLabel(rule)}</Td>
                    <Td className="whitespace-nowrap text-ink-soft">
                      {formatDate(rule.effectiveFrom)} → {rule.effectiveTo ? formatDate(rule.effectiveTo) : "no end"}
                    </Td>
                    <Td className="whitespace-nowrap">{rule.hsnSacCode ?? <span className="text-ink-faint">—</span>}</Td>
                    <Td>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {rule.finalizedCount > 0 ? `${rule.finalizedCount} invoice${rule.finalizedCount === 1 ? "" : "s"}` : "Not yet"}
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditing(rule)}>
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                        {rule.invoiceCount === 0 && (
                          <Button
                            size="sm"
                            variant="danger"
                            title="Delete — no invoice uses it"
                            onClick={() => {
                              remove.reset();
                              setDeleting(rule);
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
        </>
      )}

      {editing !== undefined && <TaxRuleFormModal rule={editing} onClose={() => setEditing(undefined)} />}
      {deleting && (
        <ConfirmModal
          title="Delete tax rule?"
          confirmLabel="Delete"
          loading={remove.isPending}
          error={remove.error?.message}
          onConfirm={() => remove.mutate(deleting)}
          onClose={() => setDeleting(null)}
        >
          <p>“{deleting.name}” isn't on any invoice yet, so it can be removed completely.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
