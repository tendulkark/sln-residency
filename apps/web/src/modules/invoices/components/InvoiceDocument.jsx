import { formatCurrencyPrecise, formatDate, formatDateTime } from "@/lib/format.js";
import { DEFAULT_INVOICE_TEMPLATE, ID_PROOF_TYPES } from "@sln/shared-schemas";

const FONT_STACKS = {
  sans: "var(--font-sans)",
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Courier New", monospace',
};

// Every size inside the document is in em, so this one value scales it all.
const FONT_SIZES = { small: "12px", medium: "13px", large: "14.5px" };

const LOGO_SIZES = { small: "h-14 w-14", medium: "h-20 w-20", large: "h-28 w-28" };

const LINE_SPACINGS = { compact: "space-y-0 leading-snug", normal: "space-y-0.5", relaxed: "space-y-1.5 leading-relaxed" };

// Per-layout class sets. --inv-accent / --inv-tint / --inv-soft are set on
// the document root from the template's accent color.
//
// Alignment rule every layout follows: each block (header, panels, table,
// totals, footer) spans exactly the document's width — no block bleeds
// wider or sits narrower than the rest — and text inside any block starts
// 16px (px-4) in from that shared edge, whether or not the block has a
// fill or border. The page margin around the whole document comes from its
// container (the dialog body, or the design preview's paper), never from
// here, so the two can't stack into uneven gutters.
const LAYOUTS = {
  classic: {
    headerBox: "border-t-4 border-(--inv-accent) px-4 pb-4 pt-5",
    hotelName: "text-(--inv-accent)",
    headerText: "text-ink-soft",
    headerStrong: "text-ink",
    title: "text-ink",
    logo: "",
    panel: "rounded-md bg-(--inv-tint) p-4",
    label: "text-(--inv-accent)",
    tableHead: "bg-(--inv-accent) text-white",
    totals: "rounded-md border border-(--inv-accent) p-4",
    settlement: "rounded-md bg-(--inv-tint) text-(--inv-accent)",
  },
  modern: {
    headerBox: "rounded-lg bg-(--inv-accent) px-4 py-5",
    hotelName: "text-white",
    headerText: "text-white/85",
    headerStrong: "text-white",
    title: "text-white",
    logo: "rounded-md bg-white p-1",
    // 4px rule + 12px padding = the same 16px text inset as every block.
    panel: "rounded-r-md border-l-4 border-(--inv-accent) bg-(--inv-soft) py-4 pl-3 pr-4",
    label: "text-(--inv-accent)",
    tableHead: "bg-(--inv-tint) text-(--inv-accent)",
    totals: "rounded-md bg-(--inv-soft) p-4",
    settlement: "rounded-md bg-(--inv-accent) text-white",
  },
  minimal: {
    headerBox: "border-b-2 border-(--inv-accent) px-4 pb-5 pt-1",
    hotelName: "text-ink",
    headerText: "text-ink-soft",
    headerStrong: "text-ink",
    title: "text-(--inv-accent)",
    logo: "",
    panel: "border-t border-line px-4 py-3",
    label: "text-(--inv-accent)",
    tableHead: "border-b-2 border-(--inv-accent) text-ink",
    totals: "border-t-2 border-(--inv-accent) px-4 pt-3.5",
    settlement: "border-t border-line-soft text-(--inv-accent)",
  },
};

// Printable GST tax invoice / provisional bill. The letterhead comes from
// Tenant profile fields (Settings), the figures from the tax-snapshotted
// Invoice row plus the live stay breakdown, and the look from the tenant's
// invoice design (`template`, Invoice Design screen). Fields GST law
// requires — title, hotel GSTIN, number/date, recipient company GSTIN, the
// tax breakdown, signatory — render regardless of the design. Renders
// inside a [data-print-area], so @media print in index.css hides the rest.
export default function InvoiceDocument({
  invoice,
  tenant,
  bookings,
  charges,
  payments,
  summary,
  provisional = false,
  template = DEFAULT_INVOICE_TEMPLATE,
}) {
  const t = template;
  const L = LAYOUTS[t.layout] ?? LAYOUTS.classic;
  const accent = t.accentColor || "var(--color-brand)";

  const primary = bookings[0];
  const roomLabel = bookings.map((b) => `${b.room.roomNumber} (${b.room.roomType.name})`).join(", ");
  const adults = bookings.reduce((sum, b) => sum + b.adults, 0);
  const children = bookings.reduce((sum, b) => sum + b.children, 0);
  const chargeRows = charges.filter((c) => c.type === "charge");
  const discountRows = charges.filter((c) => c.type === "discount");
  const halfRate = summary.taxRatePercent / 2;
  const formatStayDate = t.showCheckInOutTime ? formatDateTime : formatDate;

  const lastPayment = payments[payments.length - 1];
  const settlementLabel = summary.balanceDue <= 0 && lastPayment ? lastPayment.method.name : "Pending";

  const logo =
    tenant.logoUrl && t.logoPlacement !== "hidden" ? (
      <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className={`${LOGO_SIZES[t.logoSize]} shrink-0 object-contain ${L.logo}`} />
    ) : null;

  const sectionLabel = `mb-1.5 text-[0.85em] font-bold uppercase tracking-wide ${L.label}`;

  return (
    <div
      className="bg-white text-ink"
      style={{
        "--inv-accent": accent,
        "--inv-tint": `color-mix(in srgb, ${accent} 10%, white)`,
        "--inv-soft": `color-mix(in srgb, ${accent} 5%, white)`,
        fontFamily: FONT_STACKS[t.fontFamily],
        fontSize: FONT_SIZES[t.fontSize],
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div className={`flex items-start justify-between gap-4 ${L.headerBox}`}>
        <div className="flex min-w-0 items-start gap-3">
          {t.logoPlacement === "left" && logo}
          <div className="min-w-0">
            <h1
              className={`font-extrabold uppercase leading-tight ${L.hotelName}`}
              style={{ fontSize: `${(1.55 * t.hotelNameScale) / 100}em` }}
            >
              {tenant.name}
            </h1>
            <div
              className={`mt-2 ${LINE_SPACINGS[t.hotelDetailsSpacing]} ${L.headerText}`}
              style={{ fontSize: `${t.hotelDetailsScale / 100}em` }}
            >
              {t.showHotelAddress && tenant.address && <p className="whitespace-pre-line">Address: {tenant.address}</p>}
              {t.showHotelPhone && tenant.phone && <p>Phone: {tenant.phone}</p>}
              {t.showHotelEmail && tenant.email && <p>Email: {tenant.email}</p>}
              {tenant.gstin && <p>GSTIN: {tenant.gstin}</p>}
            </div>
          </div>
        </div>

        {t.logoPlacement === "center" && logo}

        <div className="shrink-0 text-right">
          <h2 className={`text-[1.85em] font-extrabold leading-tight tracking-tight ${L.title}`}>
            {provisional ? "PROVISIONAL BILL" : "TAX INVOICE"}
          </h2>
          {invoice.invoiceNumber && (
            <p className={`mt-2 ${L.headerText}`}>
              Invoice No: <span className={`font-semibold ${L.headerStrong}`}>{invoice.invoiceNumber}</span>
              {provisional && <span className="ml-1 text-[0.85em] opacity-75">(reserved — finalized at checkout)</span>}
            </p>
          )}
          <p className={`${invoice.invoiceNumber ? "" : "mt-2"} ${L.headerText}`}>
            Date: <span className={`font-semibold ${L.headerStrong}`}>{formatDate(invoice.generatedAt)}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className={L.panel}>
          <p className={sectionLabel}>Billed To</p>
          <p className="text-[1.08em] font-bold uppercase text-ink">{primary.guest.name}</p>
          {t.showGuestContact && (
            <>
              {primary.guest.phone && <p className="text-ink-soft">Phone: {primary.guest.phone}</p>}
              {primary.guest.phone2 && <p className="text-ink-soft">Alt. Phone: {primary.guest.phone2}</p>}
              {primary.guest.email && <p className="text-ink-soft">Email: {primary.guest.email}</p>}
            </>
          )}
          {t.showGuestAddress && primary.guest.address && (
            <p className="whitespace-pre-line text-ink-soft">Address: {primary.guest.address}</p>
          )}
          {t.showGuestIdProof && primary.guest.idProofType && (
            <p className="text-ink-soft">
              {ID_PROOF_TYPES.find((type) => type.value === primary.guest.idProofType)?.label ?? primary.guest.idProofType}
              {primary.guest.idProofNumber ? `: ${primary.guest.idProofNumber}` : ""}
            </p>
          )}
          {primary.guest.companyName && (
            <div className="mt-2 border-t border-(--inv-accent)/20 pt-2">
              <p className="text-ink-soft">
                <span className="font-semibold text-ink">Company:</span> {primary.guest.companyName}
              </p>
              {primary.guest.gstin && <p className="text-ink-soft">Company GSTIN: {primary.guest.gstin}</p>}
            </div>
          )}
        </div>
        <div className={L.panel}>
          <p className={sectionLabel}>Stay Details</p>
          <DetailRow label="Room" value={roomLabel} />
          <DetailRow label="Check-In" value={formatStayDate(primary.checkIn)} />
          <DetailRow label="Check-Out" value={formatStayDate(primary.checkOut)} />
          <DetailRow label="Total Nights" value={summary.nights} />
          {t.showGuestCount && (
            <DetailRow label="Guests" value={`${adults} Adult(s)${children > 0 ? `, ${children} Child(ren)` : ""}`} />
          )}
        </div>
      </div>

      <div className="mt-4">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={L.tableHead}>
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="px-4 py-2 text-right font-semibold">Qty / Nights</th>
              <th className="px-4 py-2 text-right font-semibold">Rate</th>
              <th className="px-4 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-line-soft">
                <td className="px-4 py-2">
                  Room Charges — {b.room.roomType.name} (Room {b.room.roomNumber})
                </td>
                <td className="px-4 py-2 text-right">{summary.nights}</td>
                <td className="px-4 py-2 text-right">{formatCurrencyPrecise(b.ratePerNight)}</td>
                <td className="px-4 py-2 text-right">{formatCurrencyPrecise(b.totalAmount)}</td>
              </tr>
            ))}
            {chargeRows.map((c) => (
              <tr key={c.id} className="border-b border-line-soft">
                <td className="px-4 py-2">{c.description}</td>
                <td className="px-4 py-2 text-right">-</td>
                <td className="px-4 py-2 text-right">-</td>
                <td className="px-4 py-2 text-right">{formatCurrencyPrecise(c.amount)}</td>
              </tr>
            ))}
            {discountRows.map((c) => (
              <tr key={c.id} className="border-b border-line-soft">
                <td className="px-4 py-2">{c.description || "Discount / Concession"}</td>
                <td className="px-4 py-2 text-right">-</td>
                <td className="px-4 py-2 text-right">-</td>
                <td className="px-4 py-2 text-right">- {formatCurrencyPrecise(c.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="px-4 pt-4">
          <p className={sectionLabel}>Payment Terms &amp; Notes</p>
          <p className="text-ink">
            Final settlement via: <span className="font-semibold">{settlementLabel}</span>
          </p>
          {t.showPaymentBreakdown &&
            payments.map((p) => (
              <p key={p.id} className="text-ink">
                Advance via: <span className="font-semibold">{p.method.name}</span> {formatCurrencyPrecise(p.amount)}
              </p>
            ))}
          {t.thankYouNote && <p className="mt-3 whitespace-pre-line italic text-ink-muted">{t.thankYouNote}</p>}
          {t.bankDetails && (
            <div className="mt-3">
              <p className={sectionLabel}>Bank Details</p>
              <p className="whitespace-pre-line text-ink-soft">{t.bankDetails}</p>
            </div>
          )}
        </div>

        <div className={L.totals}>
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
          <div className="my-1.5 border-t border-line-soft" />
          <TotalRow label="Grand Total" value={summary.grandTotal} bold />
          <TotalRow label="Less Advance Paid" value={-summary.advancePaid} muted />
          <div className={`-mx-2 mt-2 flex items-center justify-between px-2 py-2 font-bold ${L.settlement}`}>
            <span>Final Settlement</span>
            <span>{formatCurrencyPrecise(summary.balanceDue)}</span>
          </div>
        </div>
      </div>

      {t.termsAndConditions && (
        <div className="mt-5 px-4">
          <p className={sectionLabel}>Terms &amp; Conditions</p>
          <p className="whitespace-pre-line text-[0.92em] text-ink-soft">{t.termsAndConditions}</p>
        </div>
      )}

      <div className="flex items-end justify-between gap-4 mt-5 border-t border-line-soft px-4 pb-1 pt-3 text-[0.92em] text-ink-muted">
        <p>{provisional ? "Provisional Bill — Not a Tax Invoice" : t.footerNote}</p>
        <div className="shrink-0 text-right">
          {t.signatureImageUrl && <img src={t.signatureImageUrl} alt="Signature" className="mb-1 ml-auto h-12 max-w-40 object-contain" />}
          <p>{t.signatoryLabel}</p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <p className="text-ink-soft">
      <span className="font-semibold text-ink">{label}:</span> {value}
    </p>
  );
}

function TotalRow({ label, value, bold, muted }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={muted ? "text-[0.92em] text-ink-muted" : "text-[1.08em] text-ink"}>{label}</span>
      <span className={bold ? "font-bold text-ink" : muted ? "text-[0.92em] text-ink-soft" : "text-[1.08em] text-ink"}>
        {value < 0 ? "- " : ""}
        {formatCurrencyPrecise(Math.abs(value))}
      </span>
    </div>
  );
}
