import Input from "@/ui/Input.jsx";

// The only two GST modes that exist anywhere in the app — every caller
// (room pricing, booking charges, Manage Stay charges) imports these
// instead of writing the "include"/"exclude" literals itself.
export const GST_MODE = { INCLUDE: "include", EXCLUDE: "exclude" };

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// Pure GST math, shared by the full calculator card and any compact inline
// use. GST_MODE.EXCLUDE means the entered amount already has GST folded in
// and we back the tax out of it (net = amount / (1 + rate/100));
// GST_MODE.INCLUDE means the entered amount is the pre-tax figure and we
// add GST on top (gross = amount * (1 + rate/100)). Mirrors the server's
// splitTax/splitInclusiveTax in lib/tax.js so a price set here bills
// identically at booking time.
export function computeGst(amount, ratePercent, mode) {
  const amt = Number(amount) || 0;
  const rate = Number(ratePercent) || 0;

  if (mode === GST_MODE.EXCLUDE) {
    const net = round2(amt / (1 + rate / 100));
    const taxAmount = round2(amt - net);
    return { taxAmount, resultAmount: net, resultLabel: "Net amount", exclusiveAmount: net, inclusiveAmount: amt };
  }

  const taxAmount = round2(amt * (rate / 100));
  const gross = round2(amt + taxAmount);
  return { taxAmount, resultAmount: gross, resultLabel: "Total amount", exclusiveAmount: amt, inclusiveAmount: gross };
}

// Amount + GST rate% + Include/Exclude GST toggle, with the GST amount and
// resulting net/total amount computed live. `mode` is "include" (amount is
// pre-tax, GST gets added) or "exclude" (amount already has GST in it, GST
// gets backed out) — the caller owns amount/ratePercent/mode as state and
// reads whichever of exclusiveAmount/inclusiveAmount it needs from the
// result (e.g. Room Type pricing always stores exclusiveAmount; a charge
// meant to be billed to the guest stores inclusiveAmount).
export default function GstCalculator({ amount, ratePercent, mode, onAmountChange, onRateChange, onModeChange, compact = false }) {
  const result = computeGst(amount, ratePercent, mode);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-4"}>
        <Input label="Amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => onAmountChange(e.target.value)} />
        <Input label="GST rate %" type="number" min="0" max="100" step="0.01" value={ratePercent} onChange={(e) => onRateChange(e.target.value)} />
      </div>

      <div className={`grid grid-cols-2 gap-2 ${compact ? "" : "gap-3"}`}>
        <GstModeOption label="Include GST" checked={mode === GST_MODE.INCLUDE} onSelect={() => onModeChange(GST_MODE.INCLUDE)} />
        <GstModeOption label="Exclude GST" checked={mode === GST_MODE.EXCLUDE} onSelect={() => onModeChange(GST_MODE.EXCLUDE)} />
      </div>

      <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
        <span className="text-ink-soft">Amount of GST</span>
        <span className="font-semibold text-ink">₹{result.taxAmount.toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
        <span className="text-ink-soft">{result.resultLabel}</span>
        <span className="font-semibold text-ink">₹{result.resultAmount.toFixed(2)}</span>
      </div>
    </div>
  );
}

function GstModeOption({ label, checked, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${
        checked ? "border-brand bg-brand-tint text-brand" : "border-line-strong text-ink-soft hover:bg-muted"
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${checked ? "border-brand" : "border-line-strong"}`}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      {label}
    </button>
  );
}
