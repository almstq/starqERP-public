import React from 'react';
import { useERP } from '../../context/ERPContext';
import {
  Building2,
  Layers,
  Clock,
  Activity,
  Plus,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface Props {
  onNavigateTab: (tab: string) => void;
}

export const StarqHQOverview: React.FC<Props> = ({ onNavigateTab }) => {
  const { tenants, pendingApplications, setIsRegisterOrgModalOpen } = useERP();

  const pendingCount = pendingApplications.filter((a) => a.status === 'pending_approval').length;
  const totalBooksCount = tenants.reduce((acc, t) => acc + (t.books?.length || 1), 0);

  return (
    <div className="space-y-6">
      {/* Platform Telemetry KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            <span>Customer Organisations</span>
            <Building2 size={16} className="text-[var(--md-sys-color-primary)]" />
          </div>
          <div className="text-2xl font-black mono-num text-[var(--md-sys-color-on-surface)] mt-2">
            {tenants.length}
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            <span>Active Pilot Tenants</span>
          </div>
        </div>

        <div
          className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            <span>Operating Books Active</span>
            <Layers size={16} className="text-indigo-500" />
          </div>
          <div className="text-2xl font-black mono-num text-[var(--md-sys-color-on-surface)] mt-2">
            {totalBooksCount}
          </div>
          <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
            Segmented general ledgers
          </div>
        </div>

        <div
          className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            <span>Pending Applications</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black mono-num text-[var(--md-sys-color-on-surface)] mt-2">
            {pendingCount}
          </div>
          <div className="text-[10px] text-amber-600 font-semibold mt-1">
            {pendingCount > 0 ? 'Requires Operator Review' : 'All Clear'}
          </div>
        </div>

        <div
          className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            <span>Platform Telemetry</span>
            <Activity size={16} className="text-amber-500" />
          </div>
          <div className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mt-2">
            Not Connected Yet
          </div>
          <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
            Telemetry daemon pending deployment
          </div>
        </div>
      </div>

      {/* Operator Action Banners & Quick Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pending Intake Applications Spotlight */}
        <div
          className="p-5 rounded-[var(--md-sys-shape-corner-medium)] border space-y-4"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-amber-500" />
              <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                Incoming Business Applications
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab('applications')}
              className="text-xs font-semibold text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-1"
            >
              <span>View All ({pendingApplications.length})</span>
              <ArrowRight size={12} />
            </button>
          </div>

          {pendingApplications.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-2">
              <CheckCircle2 size={24} className="mx-auto text-emerald-500" />
              <p>No pending applications in queue.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingApplications.slice(0, 3).map((app) => (
                <div
                  key={app.id}
                  className="p-3 rounded-[var(--md-sys-shape-corner-small)] border flex items-center justify-between gap-3 text-xs bg-[var(--md-sys-color-surface)]"
                  style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                      {app.name}
                    </div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                      {app.archetypeName} · {app.island} · Applied by {app.applicantName}
                    </div>
                  </div>
                  <Badge variant={app.status === 'pending_approval' ? 'warning' : 'accent'} size="sm">
                    {app.status === 'pending_approval' ? 'Pending Review' : app.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Platform Control Architecture Notice */}
        <div
          className="p-5 rounded-[var(--md-sys-shape-corner-medium)] border space-y-3"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center gap-2 font-bold text-sm text-[var(--md-sys-color-on-surface)]">
            <ShieldCheck size={18} className="text-[var(--md-sys-color-primary)]" />
            <span>Two-Plane Architecture Invariant</span>
          </div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-2 leading-relaxed">
            <p>
              <strong>Starq HQ Control Plane</strong> operates the SaaS business (intake, customer portfolio, subscriptions, plan limits, billing receivables, and security logs).
            </p>
            <p>
              <strong>Tenant Execution Plane</strong> operates customer commercial businesses. Starq Technologies Pvt Ltd (Tenant #0) and Club Ignition Pvt Ltd (Tenant #1) maintain their separate operational books and ledgers without ambient exposure to platform operator consoles.
            </p>
          </div>
          <div className="pt-2 flex items-center gap-2">
            <button
              onClick={() => onNavigateTab('tenants')}
              className="px-3 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-semibold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]"
            >
              Browse Customer Portfolio
            </button>
            <button
              onClick={() => onNavigateTab('subscriptions')}
              className="px-3 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-semibold text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]/20"
            >
              Configure Plans & Limits
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
