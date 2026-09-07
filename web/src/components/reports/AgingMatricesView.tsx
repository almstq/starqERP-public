import React, { useState, useMemo } from 'react';
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  User,
  Building2,
  DollarSign,
  FileText,
  Calendar,
  AlertTriangle,
  ArrowUpRight
} from 'lucide-react';
import { Surface, Button } from '../ui';
import { Badge } from '../common/Badge';
import { Invoice, PurchaseOrder, Payment } from '../../types/erp';
import { computeARAging, computeAPAging } from '../../lib/aging';

interface AgingMatricesViewProps {
  invoices: Invoice[];
  payments: Payment[];
  purchaseOrders: PurchaseOrder[];
  asOfDate: string;
  formatMVR: (amount: number) => string;
}

export const AgingMatricesView: React.FC<AgingMatricesViewProps> = ({
  invoices,
  payments,
  purchaseOrders,
  asOfDate,
  formatMVR,
}) => {
  const [activeTab, setActiveTab] = useState<'AR' | 'AP'>('AR');
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string>>(new Set());
  const [expandedSupplierIds, setExpandedSupplierIds] = useState<Set<string>>(new Set());

  const arReport = useMemo(() => {
    return computeARAging({ invoices, payments, asOfDate });
  }, [invoices, payments, asOfDate]);

  const apReport = useMemo(() => {
    return computeAPAging({ purchaseOrders, asOfDate });
  }, [purchaseOrders, asOfDate]);

  const toggleCustomer = (id: string) => {
    setExpandedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSupplier = (id: string) => {
    setExpandedSupplierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6" data-testid="aging-matrices-view">
      {/* ─────────────────────────────────────────────────────────────────
         1. AGING SUMMARY KPI METRIC CARDS (Uniform Height & Baseline Alignment)
         ───────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Receivables */}
        <Surface variant="filled" level={1} padding="sm" className="h-[104px] flex flex-col justify-between">
          <div className="flex items-center justify-between h-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] truncate">
              Total Receivables (AR)
            </span>
            <div className="p-1 rounded-md bg-blue-500/15 text-sky-400">
              <DollarSign size={13} />
            </div>
          </div>
          <div className="my-auto leading-none font-mono text-2xl font-bold text-[var(--md-sys-color-on-surface)]">
            {formatMVR(arReport.totalReceivables)}
          </div>
          <div className="h-3.5 leading-none text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)] truncate">
            {arReport.customers.length} debtors · {arReport.overduePercentage}% overdue
          </div>
        </Surface>

        {/* Total Payables */}
        <Surface variant="filled" level={1} padding="sm" className="h-[104px] flex flex-col justify-between">
          <div className="flex items-center justify-between h-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] truncate">
              Total Payables (AP)
            </span>
            <div className="p-1 rounded-md bg-amber-500/15 text-amber-400">
              <Building2 size={13} />
            </div>
          </div>
          <div className="my-auto leading-none font-mono text-2xl font-bold text-amber-300">
            {formatMVR(apReport.totalPayables)}
          </div>
          <div className="h-3.5 leading-none text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)] truncate">
            {apReport.suppliers.length} vendors · {apReport.overduePercentage}% overdue
          </div>
        </Surface>

        {/* Net Working Capital Gap */}
        <Surface variant="filled" level={1} padding="sm" className="h-[104px] flex flex-col justify-between">
          <div className="flex items-center justify-between h-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] truncate">
              Net Working Capital (AR - AP)
            </span>
            <div className="p-1 rounded-md bg-purple-500/15 text-purple-400">
              <ArrowUpRight size={13} />
            </div>
          </div>
          <div className="my-auto leading-none font-mono text-2xl font-bold text-[var(--md-sys-color-primary)]">
            {formatMVR(arReport.totalReceivables - apReport.totalPayables)}
          </div>
          <div className="h-3.5 leading-none text-[11px] font-mono text-emerald-400 truncate">
            Liquidity Positive
          </div>
        </Surface>

        {/* Critical Overdue (90+ Days) */}
        <Surface variant="filled" level={1} padding="sm" className="h-[104px] flex flex-col justify-between">
          <div className="flex items-center justify-between h-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] truncate">
              Critical Overdue (90+ Days)
            </span>
            <div className="p-1 rounded-md bg-rose-500/15 text-rose-400">
              <AlertTriangle size={13} />
            </div>
          </div>
          <div className="my-auto leading-none font-mono text-2xl font-bold text-rose-400">
            {formatMVR(arReport.summary.days90Plus + apReport.summary.days90Plus)}
          </div>
          <div className="h-3.5 leading-none text-[11px] font-mono text-rose-300 truncate">
            Requires executive collection
          </div>
        </Surface>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
         2. SEGMENTED TAB SWITCHER (AR vs AP)
         ───────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex p-1 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
          <button
            onClick={() => setActiveTab('AR')}
            data-testid="ar-tab-btn"
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'AR'
                ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)] shadow-xs border border-[var(--md-sys-color-primary)]'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <User size={14} />
            <span>Accounts Receivable Aging (Debtors)</span>
            <span className="ml-1 px-1.5 py-0.2 rounded font-mono text-[10px] bg-[var(--md-sys-color-surface)]">
              {arReport.customers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('AP')}
            data-testid="ap-tab-btn"
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'AP'
                ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)] shadow-xs border border-[var(--md-sys-color-primary)]'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <Building2 size={14} />
            <span>Accounts Payable Aging (Creditors)</span>
            <span className="ml-1 px-1.5 py-0.2 rounded font-mono text-[10px] bg-[var(--md-sys-color-surface)]">
              {apReport.suppliers.length}
            </span>
          </button>
        </div>

        <div className="text-xs font-mono text-[var(--md-sys-color-on-surface-variant)]">
          Calculated As of: <span className="font-bold text-[var(--md-sys-color-primary)]">{asOfDate}</span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
         3. AGING MATRIX TABLES
         ───────────────────────────────────────────────────────────────── */}
      {activeTab === 'AR' ? (
        /* Accounts Receivable Table */
        <Surface variant="filled" level={1} padding="md" className="space-y-4" data-testid="ar-aging-table">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
                Accounts Receivable Aging Matrix (Customer Debtors)
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Chronological breakdown of outstanding customer invoices by aging period
              </p>
            </div>
            <Badge variant="neutral" size="sm">
              Total Overdue: {formatMVR(arReport.totalReceivables - arReport.summary.current)}
            </Badge>
          </div>

          <div className="erp-scroll-region overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--md-sys-color-outline-variant)] whitespace-nowrap">
                <tr>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-3 text-right">Current</th>
                  <th className="py-2.5 px-3 text-right">1–30 Days</th>
                  <th className="py-2.5 px-3 text-right">31–60 Days</th>
                  <th className="py-2.5 px-3 text-right">61–90 Days</th>
                  <th className="py-2.5 px-3 text-right">90+ Days</th>
                  <th className="py-2.5 px-4 text-right">Total Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                {arReport.customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[var(--md-sys-color-on-surface-variant)]">
                      No outstanding receivables as of {asOfDate}.
                    </td>
                  </tr>
                ) : (
                  arReport.customers.map((cust) => {
                    const isExpanded = expandedCustomerIds.has(cust.customerId);
                    return (
                      <React.Fragment key={cust.customerId}>
                        <tr
                          onClick={() => toggleCustomer(cust.customerId)}
                          className="hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer font-medium"
                        >
                          <td className="py-2.5 px-4 font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                            {isExpanded ? <ChevronDown size={14} className="text-[var(--md-sys-color-primary)]" /> : <ChevronRight size={14} className="text-slate-500" />}
                            <span>{cust.customerName}</span>
                            <span className="text-[10px] font-normal text-slate-500">({cust.invoices.length})</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--md-sys-color-on-surface)]">
                            {cust.current > 0 ? formatMVR(cust.current) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                            {cust.days1_30 > 0 ? formatMVR(cust.days1_30) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-500">
                            {cust.days31_60 > 0 ? formatMVR(cust.days31_60) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-400">
                            {cust.days61_90 > 0 ? formatMVR(cust.days61_90) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-500 font-bold">
                            {cust.days90Plus > 0 ? formatMVR(cust.days90Plus) : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-[var(--md-sys-color-primary)]">
                            {formatMVR(cust.totalBalanceDue)}
                          </td>
                        </tr>

                        {/* Collapsible Invoice Breakdown Sub-Rows */}
                        {isExpanded && (
                          <tr className="bg-[var(--md-sys-color-surface-container-low)]">
                            <td colSpan={7} className="p-3 pl-8">
                              <div className="space-y-1.5 border-l-2 border-[var(--md-sys-color-primary)] pl-3">
                                {cust.invoices.map((inv) => (
                                  <div key={inv.id} className="flex items-center justify-between text-xs font-mono py-1 border-b border-[var(--md-sys-color-outline-variant)]/40 last:border-none">
                                    <div className="flex items-center gap-3">
                                      <span className="font-bold text-[var(--md-sys-color-primary)]">{inv.invoiceNumber}</span>
                                      <span className="text-slate-400 text-[11px]">Due: {inv.dueDate}</span>
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                                        inv.daysOverdue === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                                      }`}>
                                        {inv.daysOverdue === 0 ? 'Current' : `${inv.daysOverdue} days overdue`}
                                      </span>
                                    </div>
                                    <div className="text-right space-x-3">
                                      <span className="text-slate-400 text-[11px]">Total: {formatMVR(inv.totalAmount)}</span>
                                      <span className="font-bold text-[var(--md-sys-color-on-surface)]">Balance: {formatMVR(inv.balanceDue)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-[var(--md-sys-color-surface-container-high)] font-bold border-t-2 border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]">
                <tr>
                  <td className="py-3 px-4 uppercase text-[11px] tracking-wider">
                    Total Receivables
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold">
                    {formatMVR(arReport.summary.current)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-amber-400">
                    {formatMVR(arReport.summary.days1_30)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-amber-500">
                    {formatMVR(arReport.summary.days31_60)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-rose-400">
                    {formatMVR(arReport.summary.days61_90)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-rose-500">
                    {formatMVR(arReport.summary.days90Plus)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-sm text-[var(--md-sys-color-primary)]">
                    {formatMVR(arReport.totalReceivables)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Surface>
      ) : (
        /* Accounts Payable Table */
        <Surface variant="filled" level={1} padding="md" className="space-y-4" data-testid="ap-aging-table">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
                Accounts Payable Aging Matrix (Supplier Creditors)
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Chronological breakdown of outstanding procurement liabilities and vendor bills
              </p>
            </div>
            <Badge variant="warning" size="sm">
              Total Payable: {formatMVR(apReport.totalPayables)}
            </Badge>
          </div>

          <div className="erp-scroll-region overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--md-sys-color-outline-variant)] whitespace-nowrap">
                <tr>
                  <th className="py-2.5 px-4">Supplier / Vendor</th>
                  <th className="py-2.5 px-3 text-right">Current</th>
                  <th className="py-2.5 px-3 text-right">1–30 Days</th>
                  <th className="py-2.5 px-3 text-right">31–60 Days</th>
                  <th className="py-2.5 px-3 text-right">61–90 Days</th>
                  <th className="py-2.5 px-3 text-right">90+ Days</th>
                  <th className="py-2.5 px-4 text-right">Total Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                {apReport.suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[var(--md-sys-color-on-surface-variant)]">
                      No outstanding liabilities as of {asOfDate}.
                    </td>
                  </tr>
                ) : (
                  apReport.suppliers.map((sup) => {
                    const isExpanded = expandedSupplierIds.has(sup.supplierId);
                    return (
                      <React.Fragment key={sup.supplierId}>
                        <tr
                          onClick={() => toggleSupplier(sup.supplierId)}
                          className="hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer font-medium"
                        >
                          <td className="py-2.5 px-4 font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                            {isExpanded ? <ChevronDown size={14} className="text-amber-400" /> : <ChevronRight size={14} className="text-slate-500" />}
                            <span>{sup.supplierName}</span>
                            <span className="text-[10px] font-normal text-slate-500">({sup.orders.length})</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--md-sys-color-on-surface)]">
                            {sup.current > 0 ? formatMVR(sup.current) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                            {sup.days1_30 > 0 ? formatMVR(sup.days1_30) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-500">
                            {sup.days31_60 > 0 ? formatMVR(sup.days31_60) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-400">
                            {sup.days61_90 > 0 ? formatMVR(sup.days61_90) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-500 font-bold">
                            {sup.days90Plus > 0 ? formatMVR(sup.days90Plus) : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-400">
                            {formatMVR(sup.totalBalanceDue)}
                          </td>
                        </tr>

                        {/* Collapsible Order Breakdown */}
                        {isExpanded && (
                          <tr className="bg-[var(--md-sys-color-surface-container-low)]">
                            <td colSpan={7} className="p-3 pl-8">
                              <div className="space-y-1.5 border-l-2 border-amber-400 pl-3">
                                {sup.orders.map((po) => (
                                  <div key={po.id} className="flex items-center justify-between text-xs font-mono py-1 border-b border-[var(--md-sys-color-outline-variant)]/40 last:border-none">
                                    <div className="flex items-center gap-3">
                                      <span className="font-bold text-amber-400">{po.orderNumber}</span>
                                      <span className="text-slate-400 text-[11px]">Due: {po.dueDate}</span>
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                                        po.daysOverdue === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                                      }`}>
                                        {po.daysOverdue === 0 ? 'Current' : `${po.daysOverdue} days overdue`}
                                      </span>
                                    </div>
                                    <div className="text-right space-x-3">
                                      <span className="text-slate-400 text-[11px]">Total: {formatMVR(po.totalAmount)}</span>
                                      <span className="font-bold text-[var(--md-sys-color-on-surface)]">Balance: {formatMVR(po.balanceDue)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-[var(--md-sys-color-surface-container-high)] font-bold border-t-2 border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]">
                <tr>
                  <td className="py-3 px-4 uppercase text-[11px] tracking-wider">
                    Total Payables
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold">
                    {formatMVR(apReport.summary.current)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-amber-400">
                    {formatMVR(apReport.summary.days1_30)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-amber-500">
                    {formatMVR(apReport.summary.days31_60)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-rose-400">
                    {formatMVR(apReport.summary.days61_90)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-rose-500">
                    {formatMVR(apReport.summary.days90Plus)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-sm text-amber-300">
                    {formatMVR(apReport.totalPayables)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
};
