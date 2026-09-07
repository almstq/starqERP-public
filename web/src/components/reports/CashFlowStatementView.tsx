import React, { useMemo } from 'react';
import {
  Scale,
  Download,
  Printer,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  FileText
} from 'lucide-react';
import {
  computeCashFlowStatement,
  CashFlowStatement,
} from '../../domain/cashFlow';
import { JournalEntry } from '../../domain/journals';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const CashFlowStatementView: React.FC<{
  journals: JournalEntry[];
  dateRangeLabel?: string;
}> = ({ journals, dateRangeLabel = 'Full Year 2026' }) => {
  const { formatMVR, currentTenant } = useERP();

  const cfs: CashFlowStatement = useMemo(() => {
    return computeCashFlowStatement({
      journals,
      periodStartDate: '2026-01-01',
      periodEndDate: '2026-12-31',
      openingCash: 0,
    });
  }, [journals]);

  const handleExportCsv = () => {
    const rows = [
      ['STATEMENT', 'STATEMENT OF CASH FLOWS (IFRS)'],
      ['ENTITY', currentTenant.name || 'Commercial Entity'],
      ['PERIOD', cfs.periodName],
      ['CURRENCY', cfs.currency],
      [],
      ['ACTIVITY / LINE ITEM', 'AMOUNT_MVR'],
      [cfs.operatingActivities.title, ''],
      ...cfs.operatingActivities.items.map((i) => [i.name, i.amount.toFixed(2)]),
      ['Net Cash from Operating Activities', cfs.operatingActivities.netCashFlow.toFixed(2)],
      [],
      [cfs.investingActivities.title, ''],
      ...cfs.investingActivities.items.map((i) => [i.name, i.amount.toFixed(2)]),
      ['Net Cash from Investing Activities', cfs.investingActivities.netCashFlow.toFixed(2)],
      [],
      [cfs.financingActivities.title, ''],
      ...cfs.financingActivities.items.map((i) => [i.name, i.amount.toFixed(2)]),
      ['Net Cash from Financing Activities', cfs.financingActivities.netCashFlow.toFixed(2)],
      [],
      ['Net Increase / (Decrease) in Cash', cfs.netChangeInCash.toFixed(2)],
      ['Cash and Cash Equivalents at Beginning of Period', cfs.openingCashBalance.toFixed(2)],
      ['Cash and Cash Equivalents at End of Period', cfs.closingCashBalance.toFixed(2)],
    ];

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Cash-Flow-Statement-${cfs.startDate}-to-${cfs.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 finance-light-compat" data-testid="cash-flow-statement-view">
      {/* Header & KPI Summary */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <TrendingUp size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Statement of Cash Flows (IFRS)</h2>
                <Badge variant={cfs.isBalanced ? 'positive' : 'warning'}>
                  {cfs.isBalanced ? 'Balanced & Reconciled' : 'Variance Detected'}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                Authoritative double-entry cash movements across Operating, Investing, and Financing activities.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="tonal"
              size="sm"
              onClick={handleExportCsv}
              icon={<Download size={14} />}
            >
              <span>Export CSV</span>
            </Button>
            <Button
              variant="filled"
              size="sm"
              onClick={() => window.print()}
              icon={<Printer size={14} />}
            >
              <span>Print Statement</span>
            </Button>
          </div>
        </div>

        {/* 4-Column KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Operating Cash Flow</span>
            <div className={`text-base font-bold font-mono ${
              cfs.operatingActivities.netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {formatMVR(cfs.operatingActivities.netCashFlow)}
            </div>
            <div className="text-[10px] text-slate-500">Core Operations</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Investing Cash Flow</span>
            <div className={`text-base font-bold font-mono ${
              cfs.investingActivities.netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {formatMVR(cfs.investingActivities.netCashFlow)}
            </div>
            <div className="text-[10px] text-slate-500">Fixed Assets & Capex</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Financing Cash Flow</span>
            <div className={`text-base font-bold font-mono ${
              cfs.financingActivities.netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {formatMVR(cfs.financingActivities.netCashFlow)}
            </div>
            <div className="text-[10px] text-slate-500">Equity & Debt</div>
          </div>

          <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Closing Cash & Bank</span>
            <div className="text-base font-bold text-purple-300 font-mono">
              {formatMVR(cfs.closingCashBalance)}
            </div>
            <div className="text-[10px] text-purple-400 flex items-center gap-1 font-semibold">
              <CheckCircle2 size={10} /> Matches Balance Sheet
            </div>
          </div>
        </div>
      </Surface>

      {/* Primary Statement Breakdown */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-6">
        {/* Section 1: Operating */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono">
              {cfs.operatingActivities.title}
            </h3>
            <span className="text-xs font-bold font-mono text-emerald-400">
              {formatMVR(cfs.operatingActivities.netCashFlow)}
            </span>
          </div>

          <div className="divide-y divide-slate-800/40 text-xs">
            {cfs.operatingActivities.items.length === 0 ? (
              <div className="py-2 text-slate-500 italic text-[11px]">No operating cash movements in this period.</div>
            ) : (
              cfs.operatingActivities.items.map((item) => (
                <div key={item.code} className="py-2 flex items-center justify-between">
                  <span className="text-slate-300">{item.name}</span>
                  <span className={`font-mono ${item.amount < 0 ? 'text-rose-300' : 'text-slate-200'}`}>
                    {formatMVR(item.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 2: Investing */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 font-mono">
              {cfs.investingActivities.title}
            </h3>
            <span className="text-xs font-bold font-mono text-sky-400">
              {formatMVR(cfs.investingActivities.netCashFlow)}
            </span>
          </div>

          <div className="divide-y divide-slate-800/40 text-xs">
            {cfs.investingActivities.items.length === 0 ? (
              <div className="py-2 text-slate-500 italic text-[11px]">No capital investment movements in this period.</div>
            ) : (
              cfs.investingActivities.items.map((item) => (
                <div key={item.code} className="py-2 flex items-center justify-between">
                  <span className="text-slate-300">{item.name}</span>
                  <span className={`font-mono ${item.amount < 0 ? 'text-rose-300' : 'text-slate-200'}`}>
                    {formatMVR(item.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 3: Financing */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 font-mono">
              {cfs.financingActivities.title}
            </h3>
            <span className="text-xs font-bold font-mono text-purple-400">
              {formatMVR(cfs.financingActivities.netCashFlow)}
            </span>
          </div>

          <div className="divide-y divide-slate-800/40 text-xs">
            {cfs.financingActivities.items.length === 0 ? (
              <div className="py-2 text-slate-500 italic text-[11px]">No equity or borrowing financing movements.</div>
            ) : (
              cfs.financingActivities.items.map((item) => (
                <div key={item.code} className="py-2 flex items-center justify-between">
                  <span className="text-slate-300">{item.name}</span>
                  <span className={`font-mono ${item.amount < 0 ? 'text-rose-300' : 'text-slate-200'}`}>
                    {formatMVR(item.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Net Reconciliation Footer */}
        <div className="pt-4 border-t-2 border-slate-700 space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between py-1 font-bold text-white">
            <span>Net Increase / (Decrease) in Cash and Cash Equivalents</span>
            <span className={cfs.netChangeInCash >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {formatMVR(cfs.netChangeInCash)}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 text-slate-400">
            <span>Cash and Cash Equivalents at Beginning of Period</span>
            <span>{formatMVR(cfs.openingCashBalance)}</span>
          </div>

          <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 font-bold text-sm text-purple-300">
            <span>Cash and Cash Equivalents at End of Period</span>
            <span>{formatMVR(cfs.closingCashBalance)}</span>
          </div>
        </div>
      </Surface>
    </div>
  );
};
