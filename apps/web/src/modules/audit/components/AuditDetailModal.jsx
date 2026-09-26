import { Modal } from "@/ui/index.js";
import { formatDateTime } from "@/lib/format.js";
import { actionLabel, entityTypeLabel, displayValue, fieldLabel } from "@/modules/audit/auditFormat.js";

function Values({ value }) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (
      <dl className="space-y-1">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(7rem,35%)_1fr] gap-2">
            <dt className="text-ink-muted">{fieldLabel(k)}</dt>
            <dd className="min-w-0 break-words text-ink">
              <Values value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  if (Array.isArray(value) && value.some((v) => v && typeof v === "object")) {
    return (
      <ul className="space-y-2">
        {value.map((v, i) => (
          <li key={i} className="rounded-md border border-line-soft p-2">
            <Values value={v} />
          </li>
        ))}
      </ul>
    );
  }
  return <>{displayValue(value)}</>;
}

// Before → after, one row per field that was sent in the change.
function BeforeAfter({ before, after }) {
  // A reorder records the whole list both ways — compare it as one field.
  if (Array.isArray(after)) return <BeforeAfter before={{ order: before }} after={{ order: after }} />;
  const keys = Object.keys(after);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-muted">
          <th className="pb-1 font-medium">Field</th>
          <th className="pb-1 font-medium">Before</th>
          <th className="pb-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line-soft">
        {keys.map((k) => {
          const changed = JSON.stringify(before?.[k]) !== JSON.stringify(after[k]);
          return (
            <tr key={k} className={changed ? "" : "text-ink-faint"}>
              <td className="py-1 pr-2 text-ink-muted">{fieldLabel(k)}</td>
              <td className="py-1 pr-2 break-words">
                <Values value={before?.[k]} />
              </td>
              <td className={`py-1 break-words ${changed ? "font-medium text-ink" : ""}`}>
                <Values value={after[k]} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function AuditDetailModal({ row, onClose }) {
  const { before, after, ...rest } = row.metadata ?? {};
  const hasDiff = after && typeof after === "object";
  const restKeys = Object.keys(hasDiff ? rest : row.metadata ?? {});

  return (
    <Modal title={actionLabel(row.action)} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
          <dt className="text-ink-muted">When</dt>
          <dd className="text-ink">{formatDateTime(row.createdAt)}</dd>
          <dt className="text-ink-muted">Who</dt>
          <dd className="text-ink">{row.user?.name ?? "System"}</dd>
          <dt className="text-ink-muted">Record</dt>
          <dd className="text-ink">
            {entityTypeLabel(row.entityType)} · {row.entityLabel ?? <span className="font-mono text-xs text-ink-muted">{row.entityId}</span>}
          </dd>
        </dl>

        {hasDiff && (
          <div>
            <p className="mb-1.5 font-semibold text-ink">What changed</p>
            <BeforeAfter before={before} after={after} />
          </div>
        )}

        {restKeys.length > 0 && (
          <div>
            <p className="mb-1.5 font-semibold text-ink">{hasDiff ? "Also recorded" : "Details"}</p>
            <Values value={hasDiff ? rest : row.metadata} />
          </div>
        )}

        {!hasDiff && restKeys.length === 0 && <p className="text-ink-muted">No further details were recorded for this action.</p>}
      </div>
    </Modal>
  );
}
