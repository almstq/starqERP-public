import React from 'react';
import { PLATFORM_CLIENTS_REGISTRY } from '../../data/demoFixtures';
import {
  CreditCard,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  DollarSign
} from 'lucide-react';
import { Badge } from '../common/Badge';

export const StarqHQBilling: React.FC = () => {

  // SaaS Receivables & Subscriptions
  const subscriptionInvoices = [
    {
      id: 'sub-inv-2026-001',
      tenantId: 'tenant-starq',
      tenantName: 'Starq Technologies Pvt Ltd',
      plan: 'Enterprise Tier',
      billingPeriod: 'August 2026',
      amountMVR: '25,000.00',
      dueDate: '2026-08-31',
      status: 'Paid',
      paymentMethod: 'Direct Debit (BML)',
    },
    {
      id: 'sub-inv-2026-002',
      tenantId: 'tenant-ignition',
      tenantName: 'Club Ignition Pvt Ltd',
      plan: 'Professional Tier',
      billingPeriod: 'August 2026',
      amountMVR: '12,500.00',
      dueDate: '2026-09-05',
      status: 'Pending',
      paymentMethod: 'BML Transfer',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <div>
          <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
            SaaS Receivables & Subscription Billing
          </h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            Starq Technologies platform subscription invoicing to tenant clients. Distinct from customer ERP ledgers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="accent" size="sm">
            BML Direct Settlement
          </Badge>
        </div>
      </div>

      {/* Subscription Invoices Table */}
      <div
        className="rounded-[var(--md-sys-shape-corner-medium)] border overflow-hidden"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr
                className="border-b font-bold text-[var(--md-sys-color-on-surface-variant)] bg-black/5 dark:bg-white/5"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <th className="p-3">SaaS Invoice #</th>
                <th className="p-3">Client Tenant</th>
                <th className="p-3">Plan Tier</th>
                <th className="p-3">Billing Period</th>
                <th className="p-3">Due Date</th>
                <th className="p-3 text-right">Amount (MVR)</th>
                <th className="p-3">Payment Channel</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
              {subscriptionInvoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <td className="p-3 font-mono font-bold text-[var(--md-sys-color-primary)]">
                    {inv.id}
                  </td>
                  <td className="p-3 font-semibold text-[var(--md-sys-color-on-surface)]">
                    {inv.tenantName}
                  </td>
                  <td className="p-3 text-[var(--md-sys-color-on-surface)]">
                    {inv.plan}
                  </td>
                  <td className="p-3 text-[var(--md-sys-color-on-surface-variant)]">
                    {inv.billingPeriod}
                  </td>
                  <td className="p-3 text-[var(--md-sys-color-on-surface-variant)] font-mono text-[11px]">
                    {inv.dueDate}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-[var(--md-sys-color-on-surface)]">
                    {inv.amountMVR}
                  </td>
                  <td className="p-3 text-[var(--md-sys-color-on-surface-variant)]">
                    {inv.paymentMethod}
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant={inv.status === 'Paid' ? 'positive' : 'warning'} size="sm">
                      {inv.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
