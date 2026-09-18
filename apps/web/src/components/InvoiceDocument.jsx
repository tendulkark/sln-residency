import { formatCurrencyPrecise, formatDate, formatDateTime } from "../lib/format.js";
import { ID_PROOF_TYPES } from "@sln/shared-schemas";

// Printable GST tax invoice — the letterhead (name/logo/address/GSTIN) comes
// from Tenant profile fields (Settings screen), the numbers come from the
// tax-snapshotted Invoice row plus the live stay breakdown. Renders inside
// a Dialog's [data-print-area] panel, so @media print in index.css already
// hides everything else on the page.
export default function InvoiceDocument({ invoice, tenant, bookings, charges, payments, summary, provisional = false }) {
  const primary = bookings[0];
  const roomLabel = bookings.map((b) => `${b.room.roomNumber} (${b.room.roomType.name})`).join(", ");
  const totalGuests = bookings.reduce((sum, b) => sum + b.adults + b.children, 0);
  const chargeRows = charges.filter((c) => c.type === "charge");
  const discountRows = charges.filter((c) => c.type === "discount");
  const halfRate = summary.taxRatePercent / 2;

  const lastPayment = payments[payments.length - 1];
  const settlementLabel = summary.balanceDue <= 0 && lastPayment ? lastPayment.method.name : "Pending";

  return (
    <div className="bg-white text-gray-900" style={{ fontSize: "13px" }}>
      <div className="h-1.5 w-full bg-brand" />

      <div className="flex items-start justify-between gap-4 p-6 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold uppercase leading-tight text-brand">{tenant.name}</h1>
          <div className="mt-2 space-y-0.5 text-gray-700">
            {tenant.address && <p>Address: {tenant.address}</p>}
            {tenant.phone && <p>Phone: {tenant.phone}</p>}
            {tenant.email && <p>Email: {tenant.email}</p>}
            {tenant.gstin && <p>GSTIN: {tenant.gstin}</p>}
          </div>
        </div>

        {tenant.logoUrl && (
          <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="h-20 w-20 shrink-0 object-contain" />
        )}

        <div className="shrink-0 text-right">
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">{provisional ? "PROVISIONAL BILL" : "TAX INVOICE"}</h2>
          {!provisional && (
            <p className="mt-2 text-gray-700">
              Invoice No: <span className="font-semibold text-gray-900">{invoice.invoiceNumber}</span>
            </p>
          )}
          <p className={provisional ? "mt-2 text-gray-700" : "text-gray-700"}>
            Date: <span className="font-semibold text-gray-900">{formatDate(invoice.generatedAt)}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-6">
        <div className="rounded-md bg-brand-tint p-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand">Billed To</p>
          <p className="text-sm font-bold uppercase text-gray-900">{primary.guest.name}</p>
          {primary.guest.phone && <p className="text-gray-700">Phone: {primary.guest.phone}</p>}
          {primary.guest.phone2 && <p className="text-gray-700">Alt. Phone: {primary.guest.phone2}</p>}
          {primary.guest.email && <p className="text-gray-700">Email: {primary.guest.email}</p>}
          {primary.guest.address && <p className="whitespace-pre-line text-gray-700">Address: {primary.guest.address}</p>}
          {primary.guest.idProofType && (
            <p className="text-gray-700">
              {ID_PROOF_TYPES.find((t) => t.value === primary.guest.idProofType)?.label ?? primary.guest.idProofType}
              {primary.guest.idProofNumber ? `: ${primary.guest.idProofNumber}` : ""}
            </p>
          )}
          {primary.guest.companyName && (
            <div className="mt-2 border-t border-brand/20 pt-2">
              <p className="text-gray-700">
                <span className="font-semibold text-gray-900">Company:</span> {primary.guest.companyName}
              </p>
              {primary.guest.gstin && <p className="text-gray-700">Company GSTIN: {primary.guest.gstin}</p>}
            </div>
          )}
        </div>
        <div className="rounded-md bg-brand-tint p-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand">Stay Details</p>
          <p className="text-gray-700">
            <span className="font-semibold text-gray-900">Room:</span> {roomLabel}
          </p>
          <p className="text-gray-700">
            <span className="font-semibold text-gray-900">Check-In:</span> {formatDateTime(primary.checkIn)}
          </p>
          <p className="text-gray-700">
            <span className="font-semibold text-gray-900">Check-Out:</span> {formatDateTime(primary.checkOut)}
          </p>
          <p className="text-gray-700">
            <span className="font-semibold text-gray-900">Total Nights:</span> {summary.nights}
          </p>
          <p className="text-gray-700">
            <span className="font-semibold text-gray-900">Guests:</span> {totalGuests} Adult(s)
          </p>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse px-6 text-left">
        <thead>
          <tr className="bg-brand text-white">
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 text-right font-semibold">Qty / Nights</th>
            <th className="px-3 py-2 text-right font-semibold">Rate</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-b border-gray-100">
              <td className="px-3 py-2">
                Room Charges — {b.room.roomType.name} (Room {b.room.roomNumber})
              </td>
              <td className="px-3 py-2 text-right">{summary.nights}</td>
              <td className="px-3 py-2 text-right">{formatCurrencyPrecise(b.ratePerNight)}</td>
              <td className="px-3 py-2 text-right">{formatCurrencyPrecise(b.totalAmount)}</td>
            </tr>
          ))}
          {chargeRows.map((c) => (
            <tr key={c.id} className="border-b border-gray-100">
              <td className="px-3 py-2">{c.description}</td>
              <td className="px-3 py-2 text-right">-</td>
              <td className="px-3 py-2 text-right">-</td>
              <td className="px-3 py-2 text-right">{formatCurrencyPrecise(c.amount)}</td>
            </tr>
          ))}
          {discountRows.map((c) => (
            <tr key={c.id} className="border-b border-gray-100">
              <td className="px-3 py-2">{c.description || "Discount / Concession"}</td>
              <td className="px-3 py-2 text-right">-</td>
              <td className="px-3 py-2 text-right">-</td>
              <td className="px-3 py-2 text-right">- {formatCurrencyPrecise(c.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-6 px-6 py-5">
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand">Payment Terms & Notes</p>
          <p className="text-gray-800">
            Final settlement via: <span className="font-semibold">{settlementLabel}</span>
          </p>
          {payments.map((p) => (
            <p key={p.id} className="text-gray-800">
              Advance via: <span className="font-semibold">{p.method.name}</span> {formatCurrencyPrecise(p.amount)}
            </p>
          ))}
          <p className="mt-3 italic text-gray-500">Thank you for staying with us.</p>
          <p className="italic text-gray-500">We hope to see you again soon.</p>
        </div>

        <div className="rounded-md border border-brand p-3">
          <TotalRow label="Sub Total (Rooms)" value={summary.roomsInclTax} />
          {summary.discountTotal > 0 && <TotalRow label="Less Discount" value={-summary.discountTotal} muted />}
          <TotalRow label="Taxable Value" value={summary.taxableValue} muted />
          <TotalRow label={summary.chargesTaxAmount > 0 ? "CGST incl." : `CGST (${halfRate}%) incl.`} value={summary.cgst} muted />
          <TotalRow label={summary.chargesTaxAmount > 0 ? "SGST incl." : `SGST (${halfRate}%) incl.`} value={summary.sgst} muted />
          {summary.chargesTotal > 0 && (
            <TotalRow
              label={summary.chargesTaxAmount > 0 ? `Other Charges (GST ${formatCurrencyPrecise(summary.chargesTaxAmount)} incl.)` : "Other Charges"}
              value={summary.chargesTotal}
              muted
            />
          )}
          <div className="my-1.5 border-t border-gray-200" />
          <TotalRow label="Grand Total" value={summary.grandTotal} bold />
          <TotalRow label="Less Advance Paid" value={-summary.advancePaid} muted />
          <div className="mt-2 flex items-center justify-between rounded-md bg-brand-tint px-2 py-2">
            <span className="font-bold text-brand">Final Settlement</span>
            <span className="font-bold text-brand">{formatCurrencyPrecise(summary.balanceDue)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3 text-xs text-gray-500">
        <p>{provisional ? "Provisional Bill — Not a Tax Invoice" : "System Generated Invoice"}</p>
        <p>Authorized Signatory</p>
      </div>
    </div>
  );
}

function TotalRow({ label, value, bold, muted }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={muted ? "text-xs text-gray-500" : "text-sm text-gray-800"}>{label}</span>
      <span className={`${bold ? "font-bold text-gray-900" : muted ? "text-xs text-gray-600" : "text-sm text-gray-900"}`}>
        {value < 0 ? "- " : ""}
        {formatCurrencyPrecise(Math.abs(value))}
      </span>
    </div>
  );
}
