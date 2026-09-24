// The one place every screen's title/subtitle/actions row is styled —
// the serif "divine" heading treatment and its gold-brand underline live
// here once, so re-theming every page header later is a single edit here
// rather than a hunt-and-replace across routes/*.jsx.
export default function PageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-[28px]">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-brand" />}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        <div className="divine-rule mt-2 w-14 rounded-full" />
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
