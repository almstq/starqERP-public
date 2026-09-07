import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Search, ShieldCheck } from 'lucide-react';
import { Badge } from '../common/Badge';
import { getPlatformTenants, PlatformTenantRecord, setPlatformTenantStatus } from '../../services/apiGateway';

export const StarqHQTenants: React.FC = () => {
  const [tenants, setTenants] = useState<PlatformTenantRecord[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>('loading');

  const load = useCallback(async () => {
    setBusy('loading');
    setError(null);
    try {
      setTenants((await getPlatformTenants()).tenants);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tenant directory unavailable');
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tenants.filter((tenant) => !query || [tenant.legal_name, tenant.slug, tenant.archetype_id]
      .some((value) => value.toLowerCase().includes(query)));
  }, [search, tenants]);

  const changeStatus = async (tenant: PlatformTenantRecord) => {
    const action = tenant.organisation_status === 'active' ? 'suspend' : 'reactivate';
    if (!window.confirm(`${action === 'suspend' ? 'Suspend' : 'Reactivate'} ${tenant.legal_name}?`)) return;
    setBusy(tenant.organisation_id);
    setError(null);
    try {
      await setPlatformTenantStatus(tenant.organisation_id, action, `Starq HQ operator ${action}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Status change failed');
      setBusy(null);
    }
  };

  return <div className="space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
      <div><div className="flex items-center gap-2"><h2 className="text-base font-bold">Customer Organisations Directory</h2><Badge variant="accent" size="sm">{tenants.length} registered</Badge></div>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Authoritative platform metadata. Tenant ledgers are not queried by this view.</p></div>
      <div className="relative"><Search size={14} className="absolute left-3 top-2.5" /><input aria-label="Search tenants" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants..." className="pl-8 pr-3 py-1.5 text-xs rounded border bg-transparent w-64" /></div>
    </div>
    <div className="p-3 rounded border flex items-start gap-2.5 text-xs bg-[var(--md-sys-color-surface-container)]"><ShieldCheck size={16} className="text-[var(--md-sys-color-primary)] shrink-0" /><span><strong>Platform metadata only:</strong> suspension changes the tenant authority boundary; it does not expose invoices, payroll, journals, or other financial rows.</span></div>
    {error && <div role="alert" className="p-3 rounded border border-[var(--md-sys-color-error)] text-xs text-[var(--md-sys-color-error)]">{error}</div>}
    {busy === 'loading' && <div className="p-6 text-center text-xs">Loading authoritative tenant registry…</div>}
    {busy !== 'loading' && <div className="rounded border overflow-x-auto bg-[var(--md-sys-color-surface-container)]">
      <table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="p-3">Organisation</th><th className="p-3">Archetype</th><th className="p-3">Books</th><th className="p-3">Subscription</th><th className="p-3">Seats</th><th className="p-3">Status</th><th className="p-3">Control</th></tr></thead>
        <tbody>{filtered.map((tenant) => <tr key={tenant.organisation_id} className="border-b"><td className="p-3"><span className="flex items-center gap-2 font-semibold"><Building2 size={14} />{tenant.legal_name}</span><span className="font-mono text-[10px] opacity-70">{tenant.slug}</span></td><td className="p-3">{tenant.archetype_id.replaceAll('_', ' ')}</td><td className="p-3">{tenant.books.map((book) => book.code).join(', ') || 'None'}</td><td className="p-3">{tenant.plan_code} · {tenant.subscription_status}</td><td className="p-3">{tenant.active_seats}</td><td className="p-3"><Badge variant={tenant.organisation_status === 'active' ? 'positive' : 'warning'} size="sm">{tenant.organisation_status}</Badge></td><td className="p-3"><button disabled={busy === tenant.organisation_id || tenant.organisation_status === 'closed'} onClick={() => void changeStatus(tenant)} className="px-2 py-1 rounded border disabled:opacity-50">{tenant.organisation_status === 'active' ? 'Suspend' : 'Reactivate'}</button></td></tr>)}</tbody>
      </table>{!filtered.length && <div className="p-6 text-center text-xs">No registered tenants match this search.</div>}
    </div>}
  </div>;
};
