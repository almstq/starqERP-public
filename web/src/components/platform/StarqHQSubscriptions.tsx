import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  Users,
  Layers,
  ShieldCheck,
  Building2
} from 'lucide-react';
import { Badge } from '../common/Badge';

export const StarqHQSubscriptions: React.FC = () => {
  const plans = [
    {
      id: 'starter',
      name: 'Starter Plan',
      priceMVR: '4,500',
      period: 'per month',
      description: 'Designed for single-location Maldivian workshops, retail shops, and standalone clinics.',
      seatsLimit: 3,
      booksLimit: 1,
      outletsLimit: 1,
      features: [
        'Single Operating Book & General Ledger',
        'Standard BML Payment Gateway Support',
        'Invoicing & MIRA 8% BPT/GST Compliance',
        'Job Tracking & Work Orders',
        'Basic Inventory & Stock Management',
        'Daily Cloud Backups',
      ],
      isPopular: false,
    },
    {
      id: 'professional',
      name: 'Professional Plan',
      priceMVR: '12,500',
      period: 'per month',
      description: 'For growing businesses with multiple activities, secondary brands, and workshop bays.',
      seatsLimit: 10,
      booksLimit: 3,
      outletsLimit: 3,
      features: [
        'Up to 3 Segmented Operating Books',
        'Multi-Outlet & Multi-Island Support',
        'Full Double-Entry Accounting & P&L',
        'Purchase Orders & Supplier Invoicing',
        'Role-Based Access Control (RBAC)',
        'MIRA Tax Return PDF Generation',
        'Priority Phone & WhatsApp Support',
      ],
      isPopular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise Plan',
      priceMVR: '25,000',
      period: 'per month',
      description: 'For large conglomerates, corporate groups, resorts, and multi-entity holding companies.',
      seatsLimit: 50,
      booksLimit: 10,
      outletsLimit: 10,
      features: [
        'Up to 10 Operating Books & Entities',
        'Full Inter-Company Reconciliation',
        'Custom Chart of Accounts & Sequences',
        'Dedicated Cloud Compute Slice',
        'Custom Workflow Automation Triggers',
        '24/7 Dedicated Account Manager',
        'Custom SLA & On-Premise Backup Sync',
      ],
      isPopular: false,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-3 border-b space-y-2" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
            SaaS Subscription Tiers & Feature Matrix
          </h2>
          <Badge variant="warning" size="sm">
            Draft Plan Configuration · Pricing Not Finalized
          </Badge>
        </div>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
          Indicative plan model for starqERP tenant quotas. Commercial pricing requires formal founder approval.
        </p>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`p-5 rounded-[var(--md-sys-shape-corner-medium)] border flex flex-col justify-between space-y-4 relative ${
              plan.isPopular ? 'ring-2 ring-[var(--md-sys-color-primary)]' : ''
            }`}
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            {plan.isPopular && (
              <div
                className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary)',
                  color: 'var(--md-sys-color-on-primary)',
                }}
              >
                RECOMMENDED
              </div>
            )}

            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-sm text-[var(--md-sys-color-on-surface)]">
                  {plan.name}
                </h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                  {plan.description}
                </p>
              </div>

              <div className="pt-2">
                <div className="text-2xl font-black mono-num text-[var(--md-sys-color-on-surface)]">
                  MVR {plan.priceMVR}
                </div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  {plan.period}
                </div>
              </div>

              {/* Limits Box */}
              <div className="p-3 rounded bg-black/5 dark:bg-white/5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Staff Seats Quota:</span>
                  <span className="font-bold font-mono text-[var(--md-sys-color-on-surface)]">{plan.seatsLimit} users</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Operating Books:</span>
                  <span className="font-bold font-mono text-[var(--md-sys-color-on-surface)]">{plan.booksLimit} books</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Outlets / Locations:</span>
                  <span className="font-bold font-mono text-[var(--md-sys-color-on-surface)]">{plan.outletsLimit} outlets</span>
                </div>
              </div>

              {/* Feature Checklist */}
              <div className="space-y-2 pt-2 text-xs">
                <div className="font-semibold text-[11px] uppercase tracking-wider text-[var(--md-sys-color-primary)]">
                  Included Capabilities
                </div>
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-[var(--md-sys-color-on-surface)]">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
              <button
                className="w-full py-2 rounded-[var(--md-sys-shape-corner-small)] text-xs font-bold text-center bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)] border border-[var(--md-sys-color-outline-variant)]"
              >
                Manage Tier Policy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
