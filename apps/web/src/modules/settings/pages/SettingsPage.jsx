import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImagePlus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { useAuthStore } from "@/app/authStore.js";
import { Button, Input, Textarea, PageHeader, ErrorState, FormSkeleton } from "@/ui/index.js";
import { TENANT_QUERY_KEY } from "@/modules/settings/constants.js";

const MAX_LOGO_BYTES = 1_500_000; // ~1.5MB decoded, well under the shared-schema's cap

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const updateTenant = useAuthStore((s) => s.updateTenant);
  const tenantQuery = useQuery({ queryKey: [TENANT_QUERY_KEY], queryFn: () => apiFetch("/tenant") });
  const tenant = tenantQuery.data;
  const fileInputRef = useRef(null);

  const [form, setForm] = useState(null);
  const [logoError, setLogoError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (tenant && !form) {
      setForm({
        name: tenant.name ?? "",
        address: tenant.address ?? "",
        phone: tenant.phone ?? "",
        email: tenant.email ?? "",
        gstin: tenant.gstin ?? "",
        primaryColor: tenant.primaryColor ?? "#7a1f3d",
        logoUrl: tenant.logoUrl ?? "",
      });
    }
  }, [tenant, form]);

  const save = useMutation({
    mutationFn: (payload) => apiFetch("/tenant", { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: (updated) => {
      queryClient.setQueryData([TENANT_QUERY_KEY], updated);
      updateTenant(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoError(null);
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo is too large — please use an image under 1.5MB.");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setForm((f) => ({ ...f, logoUrl: dataUrl }));
  }

  const header = (
    <PageHeader
      icon={Building2}
      title="Hotel Settings"
      subtitle="This letterhead — name, logo, address, phone, GSTIN — appears on every printed tax invoice."
    />
  );

  if (!form) {
    return (
      <div className="max-w-2xl">
        {header}
        {tenantQuery.isError ? (
          <ErrorState title="Couldn't load hotel settings" error={tenantQuery.error} onRetry={() => tenantQuery.refetch()} />
        ) : (
          <div className="rounded-lg border border-line bg-card p-5">
            <FormSkeleton fields={6} />
          </div>
        )}
      </div>
    );
  }

  function field(key) {
    return { value: form[key], onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })) };
  }

  return (
    <div className="max-w-2xl">
      {header}

      <div className="space-y-5 rounded-lg border border-line bg-card p-5">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-soft">Logo</p>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-line bg-muted">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Hotel logo" className="h-full w-full object-contain" />
              ) : (
                <ImagePlus className="h-5 w-5 text-ink-faint" />
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5" />
              {form.logoUrl ? "Replace logo" : "Upload logo"}
            </Button>
            {form.logoUrl && (
              <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}>
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>
          {logoError && <p className="mt-1 text-xs text-danger">{logoError}</p>}
        </div>

        <Input label="Hotel name" {...field("name")} />
        <Textarea label="Address" rows={3} placeholder="Street, city, state, PIN" {...field("address")} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Phone" {...field("phone")} />
          <Input label="Email" type="email" {...field("email")} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="GSTIN" placeholder="e.g. 33CRTPK9370H1Z7" {...field("gstin")} />
          <div className="space-y-1">
            <label className="text-sm font-medium text-ink-soft">Brand color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                className="h-9 w-12 cursor-pointer rounded-md border border-line-strong"
              />
              <Input className="flex-1" {...field("primaryColor")} />
            </div>
          </div>
        </div>

        {save.error && <p className="text-sm text-danger">{save.error.message}</p>}

        <div className="flex items-center gap-3 border-t border-line-soft pt-4">
          <Button onClick={() => save.mutate(form)} loading={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {saved && <p className="text-sm text-success">Saved.</p>}
        </div>
      </div>
    </div>
  );
}
