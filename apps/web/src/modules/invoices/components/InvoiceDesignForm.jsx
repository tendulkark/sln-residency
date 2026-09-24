import { useRef, useState } from "react";
import { Check, ChevronDown, ImagePlus, Lock, Trash2 } from "lucide-react";
import {
  INVOICE_FONTS,
  INVOICE_FONT_SIZES,
  INVOICE_LAYOUTS,
  INVOICE_LINE_SPACINGS,
  INVOICE_LOGO_PLACEMENTS,
  INVOICE_LOGO_SIZES,
  INVOICE_TEXT_SCALE,
} from "@sln/shared-schemas";
import { Button, Input, SegmentedControl, Select, Slider, Switch, Textarea } from "@/ui/index.js";

const MAX_SIGNATURE_BYTES = 300_000;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ACCENT_PRESETS = [
  { value: "#7a1f3d", label: "Maroon" },
  { value: "#3c7d72", label: "Teal" },
  { value: "#1f4e79", label: "Navy" },
  { value: "#8a6116", label: "Gold" },
  { value: "#5b2a86", label: "Purple" },
  { value: "#2f2a28", label: "Charcoal" },
];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Section({ title, summary, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-line bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
      >
        <span className="min-w-0">
          <span className="block text-xs font-bold uppercase tracking-wider text-brand/75">{title}</span>
          {!open && summary && <span className="mt-0.5 block truncate text-xs text-ink-muted">{summary}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-5 border-t border-line-soft px-4 pb-4 pt-4">{children}</div>}
    </section>
  );
}

function Group({ label, children }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-ink-soft">{label}</span>
      {children}
    </div>
  );
}

function ToggleList({ label, children }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-ink-soft">{label}</span>
      <div className="divide-y divide-line-soft rounded-md border border-line-soft bg-muted/50 px-3">
        {children.map((child, i) => (
          <div key={i} className="py-2.5">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

function LockedNote({ children }) {
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-ink-muted">
      <Lock className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const bar = (className, style) => <span className={`block rounded-[1px] ${className}`} style={style} />;

// A tiny sketch of each layout, drawn in the current accent color.
function LayoutThumb({ layout }) {
  const accent = { background: "var(--thumb-accent)" };
  const tint = { background: "color-mix(in srgb, var(--thumb-accent) 14%, white)" };
  const ink = "bg-ink/25";
  if (layout === "modern") {
    return (
      <span className="flex h-full flex-col gap-1">
        <span className="flex items-start justify-between p-1" style={accent}>
          <span className="w-1/2 space-y-0.5">
            {bar("h-1 w-full bg-white/90")}
            {bar("h-0.5 w-3/4 bg-white/60")}
          </span>
          {bar("h-1.5 w-1/4 bg-white/90")}
        </span>
        <span className="grid grid-cols-2 gap-1 px-1">
          <span className="h-3 border-l-2" style={{ ...tint, borderColor: "var(--thumb-accent)" }} />
          <span className="h-3 border-l-2" style={{ ...tint, borderColor: "var(--thumb-accent)" }} />
        </span>
        <span className="mx-1 space-y-0.5">
          {bar("h-1 w-full", tint)}
          {bar(`h-0.5 w-full ${ink}`)}
          {bar(`h-0.5 w-full ${ink}`)}
        </span>
      </span>
    );
  }
  if (layout === "minimal") {
    return (
      <span className="flex h-full flex-col gap-1 p-1">
        <span className="flex items-start justify-between border-b pb-1" style={{ borderColor: "var(--thumb-accent)" }}>
          <span className="w-1/2 space-y-0.5">
            {bar("h-1 w-full bg-ink/60")}
            {bar(`h-0.5 w-3/4 ${ink}`)}
          </span>
          {bar("h-1.5 w-1/4", accent)}
        </span>
        <span className="grid grid-cols-2 gap-1">
          <span className="h-3 border-t border-ink/20" />
          <span className="h-3 border-t border-ink/20" />
        </span>
        <span className="space-y-0.5">
          {bar("h-px w-full", accent)}
          {bar(`h-0.5 w-full ${ink}`)}
          {bar(`h-0.5 w-full ${ink}`)}
        </span>
      </span>
    );
  }
  return (
    <span className="flex h-full flex-col gap-1">
      {bar("h-0.5 w-full", accent)}
      <span className="flex items-start justify-between px-1">
        <span className="w-1/2 space-y-0.5">
          {bar("h-1 w-full", accent)}
          {bar(`h-0.5 w-3/4 ${ink}`)}
        </span>
        {bar("h-1.5 w-1/4 bg-ink/60")}
      </span>
      <span className="grid grid-cols-2 gap-1 px-1">
        <span className="h-3 rounded-[1px]" style={tint} />
        <span className="h-3 rounded-[1px]" style={tint} />
      </span>
      <span className="space-y-0.5">
        {bar("h-1 w-full", accent)}
        <span className="block space-y-0.5 px-1">
          {bar(`h-0.5 w-full ${ink}`)}
          {bar(`h-0.5 w-full ${ink}`)}
        </span>
      </span>
    </span>
  );
}

const labelOf = (options, value) => options.find((o) => o.value === value)?.label ?? value;

// Controls for every InvoiceTemplate option. `value` is the draft design,
// `errors` the shared schema's flattened fieldErrors for it.
export default function InvoiceDesignForm({ value, onChange, errors = {}, tenant }) {
  const signatureInputRef = useRef(null);
  const [signatureError, setSignatureError] = useState(null);

  const set = (key) => (next) => onChange({ ...value, [key]: next });
  const text = (key) => ({
    id: `invoice-design-${key}`,
    value: value[key],
    onChange: (e) => onChange({ ...value, [key]: e.target.value }),
    error: errors[key]?.[0],
  });
  const toggle = (key) => ({ checked: value[key], onChange: set(key) });
  const scale = (key) => ({
    id: `invoice-design-${key}`,
    value: value[key],
    onChange: set(key),
    ...INVOICE_TEXT_SCALE,
    format: (v) => `${v}%`,
    action:
      value[key] !== 100 ? (
        <button type="button" onClick={() => set(key)(100)} className="text-xs font-medium text-brand hover:underline">
          Reset
        </button>
      ) : null,
  });

  const followsBrand = value.accentColor === "";
  const isPreset = ACCENT_PRESETS.some((p) => p.value.toLowerCase() === value.accentColor.toLowerCase());
  const pickerValue = HEX_COLOR.test(value.accentColor) ? value.accentColor : "#7a1f3d";
  const accentCss = HEX_COLOR.test(value.accentColor) ? value.accentColor : "var(--color-brand)";
  const selectedLayout = INVOICE_LAYOUTS.find((l) => l.value === value.layout);

  async function handleSignatureChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSignatureError(null);
    if (!file.type.startsWith("image/")) {
      setSignatureError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      setSignatureError("Image is too large — please use one under 300KB.");
      return;
    }
    set("signatureImageUrl")(await fileToDataUrl(file));
  }

  const swatch = (selected) =>
    `relative h-7 w-7 shrink-0 rounded-full sm:h-8 sm:w-8 ring-offset-2 ring-offset-card transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
      selected ? "ring-2 ring-ink" : "ring-1 ring-black/10 hover:scale-110"
    }`;

  return (
    <div className="space-y-3">
      <Section
        title="Layout & style"
        summary={`${selectedLayout?.label} · ${labelOf(INVOICE_FONTS, value.fontFamily)} · ${labelOf(INVOICE_FONT_SIZES, value.fontSize)}`}
      >
        <Group label="Layout">
          <div className="grid grid-cols-3 gap-2" style={{ "--thumb-accent": accentCss }}>
            {INVOICE_LAYOUTS.map((layout) => {
              const selected = value.layout === layout.value;
              return (
                <button
                  key={layout.value}
                  type="button"
                  aria-pressed={selected}
                  title={layout.description}
                  onClick={() => set("layout")(layout.value)}
                  className={`group rounded-md border p-1.5 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
                    selected ? "border-brand bg-brand-tint ring-1 ring-brand" : "border-line-strong bg-card hover:border-brand/50"
                  }`}
                >
                  <span className="block aspect-[4/3] overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-black/5">
                    <LayoutThumb layout={layout.value} />
                  </span>
                  <span className={`mt-1.5 flex items-center justify-center gap-1 text-xs font-semibold ${selected ? "text-brand" : "text-ink-soft"}`}>
                    {selected && <Check className="h-3 w-3" />}
                    {layout.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-ink-muted">{selectedLayout?.description}</p>
        </Group>

        <Group label="Accent color">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              title="Hotel brand color (from Settings)"
              aria-label="Use hotel brand color"
              aria-pressed={followsBrand}
              onClick={() => set("accentColor")("")}
              className={swatch(followsBrand)}
              style={{ background: "var(--color-brand)" }}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">H</span>
            </button>
            <span className="h-6 w-px bg-line" />
            {ACCENT_PRESETS.map((preset) => {
              const selected = value.accentColor.toLowerCase() === preset.value.toLowerCase();
              return (
                <button
                  key={preset.value}
                  type="button"
                  title={preset.label}
                  aria-label={preset.label}
                  aria-pressed={selected}
                  onClick={() => set("accentColor")(preset.value)}
                  className={swatch(selected)}
                  style={{ background: preset.value }}
                />
              );
            })}
            <label
              title="Custom color"
              className={`${swatch(!followsBrand && !isPreset)} cursor-pointer overflow-hidden`}
              style={{ background: "conic-gradient(#e53e3e, #dd6b20, #d69e2e, #38a169, #3182ce, #805ad5, #d53f8c, #e53e3e)" }}
            >
              <input
                type="color"
                aria-label="Custom accent color"
                value={pickerValue}
                onChange={(e) => set("accentColor")(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
          <Input aria-label="Accent color hex" placeholder="Hotel brand color" {...text("accentColor")} />
          <p className="text-xs text-ink-muted">
            {followsBrand ? "Following the hotel brand color from Settings (H)." : "Type a hex code, or clear it to follow the brand color."}
          </p>
        </Group>

        <Select label="Font" options={INVOICE_FONTS} value={value.fontFamily} onChange={set("fontFamily")} />
        <Group label="Text size">
          <SegmentedControl fullWidth options={INVOICE_FONT_SIZES} value={value.fontSize} onChange={set("fontSize")} />
        </Group>
      </Section>

      <Section title="Header" summary={`Name ${value.hotelNameScale}% · Details ${value.hotelDetailsScale}% · Logo ${labelOf(INVOICE_LOGO_PLACEMENTS, value.logoPlacement)}`}>
        <Slider label="Hotel name size" {...scale("hotelNameScale")} />
        <Slider label="Address, phone, email & GSTIN size" {...scale("hotelDetailsScale")} />
        <Group label="Line spacing">
          <SegmentedControl fullWidth options={INVOICE_LINE_SPACINGS} value={value.hotelDetailsSpacing} onChange={set("hotelDetailsSpacing")} />
        </Group>

        <Group label="Logo position">
          <SegmentedControl fullWidth options={INVOICE_LOGO_PLACEMENTS} value={value.logoPlacement} onChange={set("logoPlacement")} />
          {tenant && !tenant.logoUrl && <p className="text-xs text-ink-muted">No logo uploaded yet — add one in Settings.</p>}
        </Group>
        {value.logoPlacement !== "hidden" && (
          <Group label="Logo size">
            <SegmentedControl fullWidth options={INVOICE_LOGO_SIZES} value={value.logoSize} onChange={set("logoSize")} />
          </Group>
        )}

        <ToggleList label="Show on invoice">
          {[
            <Switch key="a" label="Hotel address" {...toggle("showHotelAddress")} />,
            <Switch key="p" label="Hotel phone" {...toggle("showHotelPhone")} />,
            <Switch key="e" label="Hotel email" {...toggle("showHotelEmail")} />,
          ]}
        </ToggleList>
        <LockedNote>Hotel name, GSTIN, invoice number and date always print — GST rules require them on a tax invoice.</LockedNote>
      </Section>

      <Section title="Guest & stay details" defaultOpen={false} summary="Choose which guest and stay fields print">
        <ToggleList label="Show on invoice">
          {[
            <Switch key="c" label="Guest phone & email" {...toggle("showGuestContact")} />,
            <Switch key="a" label="Guest address" {...toggle("showGuestAddress")} />,
            <Switch key="i" label="Guest ID proof" description="Turn off to keep ID numbers off printed bills" {...toggle("showGuestIdProof")} />,
            <Switch key="g" label="Number of guests" {...toggle("showGuestCount")} />,
            <Switch key="t" label="Check-in / check-out time" description="Off shows the date only" {...toggle("showCheckInOutTime")} />,
          ]}
        </ToggleList>
        <LockedNote>The guest's name, company name and company GSTIN always print when present.</LockedNote>
      </Section>

      <Section title="Payments & notes" defaultOpen={false} summary="Thank-you note, bank details, terms">
        <Switch label="List each advance payment" description="Method and amount of every payment received" {...toggle("showPaymentBreakdown")} />
        <Textarea label="Thank-you note" rows={2} placeholder="Leave empty to hide" {...text("thankYouNote")} />
        <Textarea label="Bank details" rows={3} placeholder={"e.g. Bank: …\nA/c No: …\nIFSC: …"} {...text("bankDetails")} />
        <Textarea
          label="Terms & conditions"
          rows={3}
          placeholder={"e.g. Check-out time is 11 AM.\nSubject to local jurisdiction."}
          {...text("termsAndConditions")}
        />
        <LockedNote>Every line item and the full tax breakdown (taxable value, CGST, SGST, totals) always print.</LockedNote>
      </Section>

      <Section title="Footer & signature" defaultOpen={false} summary={value.signatoryLabel}>
        <Input label="Footer note" placeholder="Leave empty to hide" {...text("footerNote")} />
        <Input label="Signatory label" {...text("signatoryLabel")} />

        <Group label="Signature or stamp image">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-28 items-center justify-center overflow-hidden rounded-md border border-dashed border-line-strong bg-muted">
              {value.signatureImageUrl ? (
                <img src={value.signatureImageUrl} alt="Signature" className="h-full w-full object-contain" />
              ) : (
                <ImagePlus className="h-5 w-5 text-ink-faint" />
              )}
            </div>
            <input ref={signatureInputRef} type="file" accept="image/*" className="hidden" onChange={handleSignatureChange} />
            <Button variant="outline" size="sm" onClick={() => signatureInputRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5" />
              {value.signatureImageUrl ? "Replace" : "Upload"}
            </Button>
            {value.signatureImageUrl && (
              <Button variant="ghost" size="sm" onClick={() => set("signatureImageUrl")("")}>
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>
          {(signatureError || errors.signatureImageUrl?.[0]) && (
            <p className="text-xs text-danger">{signatureError || errors.signatureImageUrl[0]}</p>
          )}
        </Group>
        <LockedNote>A Provisional Bill always says "Provisional Bill — Not a Tax Invoice" in the footer instead of your note.</LockedNote>
      </Section>
    </div>
  );
}
