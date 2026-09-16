// Applies a tenant's brand color (Tenant.primaryColor) to the CSS custom
// property every `ui/*` primitive is built on (--color-brand, see
// index.css). No primaryColor set -> leave the default maroon in place.
// This is the only place a tenant's look is ever touched from JS.
export function applyTenantTheme(tenant) {
  const root = document.documentElement;
  if (tenant?.primaryColor) {
    root.style.setProperty("--color-brand", tenant.primaryColor);
  } else {
    root.style.removeProperty("--color-brand");
  }
}
