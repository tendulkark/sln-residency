import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Printer, RotateCcw, Undo2 } from "lucide-react";
import { DEFAULT_INVOICE_TEMPLATE, invoiceTemplateSchema } from "@sln/shared-schemas";
import { apiFetch } from "@/lib/api.js";
import { Badge, Button, PageHeader, SegmentedControl } from "@/ui/index.js";
import InvoiceDocument from "@/modules/invoices/components/InvoiceDocument.jsx";
import InvoiceDesignForm from "@/modules/invoices/components/InvoiceDesignForm.jsx";
import { buildInvoicePreviewSample } from "@/modules/invoices/invoicePreviewSample.js";
import { INVOICE_TEMPLATE_QUERY_KEY } from "@/modules/invoices/constants.js";
import { TENANT_QUERY_KEY } from "@/modules/settings/constants.js";

// Roughly A4 width at 96dpi, so the preview wraps text the way paper will.
const PAPER_WIDTH = 760;

const PREVIEW_KINDS = [
  { value: "tax", label: "Tax Invoice" },
  { value: "provisional", label: "Provisional" },
];

const ZOOMS = [
  { value: "fit", label: "Fit" },
  { value: "actual", label: "100%" },
];

const PANES = [
  { value: "edit", label: "Edit" },
  { value: "preview", label: "Preview" },
];

// Renders its child at a fixed paper width, scaled down to fit the column
// ("fit") or at true size with horizontal scroll ("actual"). Scaling is
// dropped in print so "Print sample" comes out full size.
function PaperPreview({ zoom, children }) {
  const frameRef = useRef(null);
  const paperRef = useRef(null);
  const [frameWidth, setFrameWidth] = useState(PAPER_WIDTH);
  const [paperHeight, setPaperHeight] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (!frameRef.current || !paperRef.current) return;
      setFrameWidth(frameRef.current.clientWidth);
      setPaperHeight(paperRef.current.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frameRef.current);
    observer.observe(paperRef.current);
    return () => observer.disconnect();
  }, []);

  const scale = zoom === "actual" ? 1 : Math.min(1, frameWidth / PAPER_WIDTH);

  return (
    <div ref={frameRef} className={`w-full ${zoom === "actual" ? "overflow-x-auto" : "overflow-hidden"} print:overflow-visible`}>
      <div
        className="mx-auto h-(--paper-h) w-(--paper-w) print:h-auto print:w-auto"
        style={{ "--paper-h": `${paperHeight * scale}px`, "--paper-w": `${PAPER_WIDTH * scale}px` }}
      >
        <div
          ref={paperRef}
          data-print-area
          className="origin-top-left scale-(--paper-scale) bg-white p-6 shadow-md ring-1 ring-line print:scale-none print:shadow-none print:ring-0"
          style={{ width: PAPER_WIDTH, "--paper-scale": scale }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Admin-only (invoices.customize) editor for how every printed Tax Invoice
// and Provisional Bill looks. Changes apply to all future prints and
// reprints; invoice figures and numbers are never affected.
export default function InvoiceDesignPage() {
  const queryClient = useQueryClient();
  const templateQuery = useQuery({ queryKey: [INVOICE_TEMPLATE_QUERY_KEY], queryFn: () => apiFetch("/invoice-template") });
  const { data: tenant } = useQuery({ queryKey: [TENANT_QUERY_KEY], queryFn: () => apiFetch("/tenant") });
  const saved = templateQuery.data;

  const [draft, setDraft] = useState(null);
  const [previewKind, setPreviewKind] = useState("tax");
  const [zoom, setZoom] = useState("fit");
  const [pane, setPane] = useState("edit");
  const [justSaved, setJustSaved] = useState(false);
  const sample = useMemo(buildInvoicePreviewSample, []);

  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

  const sentinelRef = useRef(null);
  const [stuck, setStuck] = useState(false);
  const ready = !!draft && !!tenant;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { root: sentinel.closest("main") });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [ready]);

  // Other screens cache the design for printing, so the first render can see
  // an older copy — start editing only from the fresh fetch, or a save would
  // quietly revert whatever changed since.
  const fresh = templateQuery.isFetchedAfterMount;
  useEffect(() => {
    if (saved && fresh && !draft) setDraft(saved);
  }, [saved, fresh, draft]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("You have unsaved invoice design changes. Leave without saving?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: (config) => apiFetch("/invoice-template", { method: "PUT", body: JSON.stringify(config) }),
    onSuccess: (updated) => {
      queryClient.setQueryData([INVOICE_TEMPLATE_QUERY_KEY], updated);
      setDraft(updated);
      setJustSaved(true);
    },
  });

  if (templateQuery.isError) {
    return <p className="text-sm text-danger">Couldn't load the invoice design: {templateQuery.error.message}</p>;
  }
  if (!draft || !tenant) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  const validation = invoiceTemplateSchema.safeParse(draft);
  const errors = validation.success ? {} : validation.error.flatten().fieldErrors;
  const isDefault = JSON.stringify(draft) === JSON.stringify(DEFAULT_INVOICE_TEMPLATE);

  return (
    <div>
      <PageHeader
        icon={Palette}
        title="Invoice Design"
        subtitle="Choose how printed Tax Invoices and Provisional Bills look. Amounts and invoice numbers are never affected."
      />

      <div ref={sentinelRef} aria-hidden="true" />
      {/* <main> scrolls and has p-4/md:p-6, and sticky offsets are measured
          inside a scroll container's padding — so top-0 would pin this 24px
          low with content scrolling past above it. The negative top cancels
          that padding so it pins flush to the edge. */}
      <div
        className={`sticky -top-4 z-20 -mx-4 mb-4 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur transition-shadow md:-top-6 md:-mx-6 md:px-6 print:hidden ${
          stuck ? "shadow-sm" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {stuck && (
              <span className="hidden items-center gap-1.5 font-display text-lg font-bold text-ink xl:flex">
                <Palette className="h-4 w-4 text-brand" />
                Invoice Design
              </span>
            )}
            <div className="xl:hidden">
              <SegmentedControl size="sm" options={PANES} value={pane} onChange={setPane} />
            </div>
            {!validation.success ? (
              <Badge tone="danger">Fix errors to save</Badge>
            ) : dirty ? (
              <Badge tone="warning" className="hidden sm:inline-flex">
                Unsaved changes
              </Badge>
            ) : justSaved ? (
              <Badge tone="success">Saved</Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              title="Reset to defaults"
              onClick={() => setDraft(DEFAULT_INVOICE_TEMPLATE)}
              disabled={isDefault || save.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset to defaults</span>
            </Button>
            <Button variant="outline" size="sm" title="Discard changes" onClick={() => setDraft(saved)} disabled={!dirty || save.isPending}>
              <Undo2 className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Discard</span>
            </Button>
            <Button size="sm" onClick={() => save.mutate(draft)} disabled={!dirty || !validation.success || save.isPending}>
              {save.isPending ? "Saving…" : (
                <>
                  Save<span className="hidden sm:inline">&nbsp;design</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {save.error && <p className="mb-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{save.error.message}</p>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] xl:items-start">
        <div className={`${pane === "edit" ? "" : "hidden"} mx-auto w-full max-w-2xl xl:block xl:max-w-none print:hidden`}>
          <InvoiceDesignForm value={draft} onChange={setDraft} errors={errors} tenant={tenant} />
        </div>

        <div
          className={`${pane === "preview" ? "" : "hidden"} xl:sticky xl:top-11 xl:block xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto print:max-h-none print:overflow-visible`}
        >
          <div className="rounded-lg border border-line bg-muted p-3 sm:p-4 print:border-0 print:bg-transparent print:p-0">
            <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
              <SegmentedControl size="sm" options={PREVIEW_KINDS} value={previewKind} onChange={setPreviewKind} />
              <div className="ml-auto flex items-center gap-2">
                <SegmentedControl size="sm" options={ZOOMS} value={zoom} onChange={setZoom} />
                <Button variant="outline" size="sm" title="Print sample" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Print sample</span>
                </Button>
              </div>
            </div>
            <PaperPreview zoom={zoom}>
              <InvoiceDocument {...sample} tenant={tenant} template={draft} provisional={previewKind === "provisional"} />
            </PaperPreview>
            <p className="mt-2 text-center text-xs text-ink-muted print:hidden">Sample guest and amounts — your real letterhead from Settings.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
