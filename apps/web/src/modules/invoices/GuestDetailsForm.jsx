import { Building2, User } from "lucide-react";
import { ID_PROOF_TYPES } from "@sln/shared-schemas";
import { Input, Select, Textarea } from "@/ui/index.js";

const ID_PROOF_OPTIONS = ID_PROOF_TYPES.map((t) => ({ value: t.value, label: t.label }));

// The same guest fields BookingFormModal collects at booking time, reused
// here so InvoiceModal's admin-only correction panel (guests.correct) looks
// and behaves the same way — just editing an existing Guest row instead of
// drafting a new one.
export default function GuestDetailsForm({ value, onChange }) {
  function set(field) {
    return (v) => onChange({ ...value, [field]: v });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-md border border-line-strong bg-muted p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand/75">
          <User className="h-3.5 w-3.5" />
          Guest info
        </p>
        <Input label="Guest name" value={value.name ?? ""} onChange={(e) => set("name")(e.target.value)} required />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Mobile number" value={value.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} />
          <Input label="Alternate mobile number (optional)" value={value.phone2 ?? ""} onChange={(e) => set("phone2")(e.target.value)} />
        </div>
        <Input label="Email (optional)" type="email" value={value.email ?? ""} onChange={(e) => set("email")(e.target.value)} />
        <Textarea label="Address (optional)" value={value.address ?? ""} onChange={(e) => set("address")(e.target.value)} rows={2} />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Government ID proof (optional)"
            options={ID_PROOF_OPTIONS}
            value={value.idProofType ?? ""}
            onChange={set("idProofType")}
            placeholder="Select ID type"
          />
          {value.idProofType && <Input label="ID number" value={value.idProofNumber ?? ""} onChange={(e) => set("idProofNumber")(e.target.value)} />}
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-line-strong bg-gold-tint p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gold-dark">
          <Building2 className="h-3.5 w-3.5" />
          Company info (optional, for GST claim)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Company name" value={value.companyName ?? ""} onChange={(e) => set("companyName")(e.target.value)} />
          <Input label="Company GSTIN" value={value.gstin ?? ""} onChange={(e) => set("gstin")(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
