import React, { FormEvent, useState } from 'react';
import { Database, ShieldCheck } from 'lucide-react';
import { provisionPlatformTenant, ProvisionPlatformTenantPayload } from '../../services/apiGateway';

const initial: ProvisionPlatformTenantPayload = {
  slug: '', legal_name: '', archetype_id: 'general_business', book_code: 'MAIN',
  book_name: 'Main Book', owner_email: '', owner_name: '', plan_code: 'trial',
};

export const StarqHQProvisioning: React.FC = () => {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const update = (field: keyof ProvisionPlatformTenantPayload, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const { result } = await provisionPlatformTenant(form);
      setMessage(`Tenant ready. Owner invitation ${result.owner_invitation_id} is pending acceptance.`);
      setForm(initial);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Provisioning failed');
    } finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <div className="pb-3 border-b"><h2 className="text-base font-bold">Authoritative Tenant Provisioning</h2><p className="text-xs opacity-70">Creates the tenant, selected archetype, primary book and a pending owner invitation atomically.</p></div>
    <div className="p-3 rounded border flex gap-2 text-xs bg-[var(--md-sys-color-surface-container)]"><ShieldCheck size={16} className="text-indigo-500 shrink-0" /><span>Platform-admin only. Provisioning creates no owner membership and no ledger rows; authority begins only after the invited identity accepts.</span></div>
    <form onSubmit={(event) => void submit(event)} className="p-5 rounded border bg-[var(--md-sys-color-surface-container)] space-y-4">
      <div className="flex items-center gap-2 font-bold text-sm"><Database size={17} />Tenant skeleton</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Legal name" value={form.legal_name} onChange={(v) => update('legal_name', v)} />
        <Field label="Slug" value={form.slug} onChange={(v) => update('slug', v)} pattern="[a-z0-9][a-z0-9-]{1,62}" />
        <label className="text-xs space-y-1"><span>Industry archetype</span><select value={form.archetype_id} onChange={(e) => update('archetype_id', e.target.value)} className="w-full p-2 rounded border bg-transparent"><option value="general_business">General business</option><option value="automotive_workshop">Automotive workshop</option><option value="wholesale_trading">Wholesale trading</option><option value="marine_service">Marine service</option><option value="construction_contracting">Construction</option><option value="retail">Retail</option></select></label>
        <Field label="Book code" value={form.book_code} onChange={(v) => update('book_code', v.toUpperCase())} pattern="[A-Z0-9]{2,8}" />
        <Field label="Book name" value={form.book_name} onChange={(v) => update('book_name', v)} />
        <Field label="Owner name" value={form.owner_name} onChange={(v) => update('owner_name', v)} />
        <Field label="Owner email" value={form.owner_email} onChange={(v) => update('owner_email', v)} type="email" />
      </div>
      {message && <div role="status" className="text-xs p-2 rounded border">{message}</div>}
      <button disabled={busy} className="px-4 py-2 rounded bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] disabled:opacity-50">{busy ? 'Provisioning…' : 'Provision tenant & invite owner'}</button>
    </form>
  </div>;
};

const Field = ({ label, value, onChange, type = 'text', pattern }: { label: string; value: string; onChange: (value: string) => void; type?: string; pattern?: string }) => <label className="text-xs space-y-1"><span>{label}</span><input required type={type} pattern={pattern} value={value} onChange={(event) => onChange(event.target.value)} className="w-full p-2 rounded border bg-transparent" /></label>;
