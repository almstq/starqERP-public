import React, { useState } from 'react';
import {
  Building2,
  TrendingUp,
  DollarSign,
  Layers,
  ArrowRightLeft,
  Download,
  Printer,
  ShieldCheck,
  CheckCircle2,
  PieChart,
  Percent,
  FileSpreadsheet
} from 'lucide-react';
import {
  generateConsolidatedReport,
  STARQ_BUSINESS_BRANCHES,
  BranchIncomeStatement,
  ConsolidatedFinancialReport,
} from '../../domain/consolidatedBranches';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const ConsolidatedReportingView: React.FC = () => {
  const { formatMVR, currentTenant } = useERP();

  const [periodName, setPeriodName] = useState<string>('2026-Q3');

  const [branchData] = useState<BranchIncomeStatement[]>([
    {
      branchId: 'br-hq',
      branchCode: 'BR-HQ',
      branchName: 'Corporate Head Office (Male)',
      externalRevenue: 50000,
      internalInterBranchRevenue: 25000,
      totalRevenue: 75000,
      costOfGoodsSold: 10000,
      grossProfit: 65000,
      operatingExpenses: 30000,
      internalInterBranchCharges: 0,
      netIncome: 35000,
    },
    {
      branchId: 'br-mar',
      branchCode: 'BR-MAR',
      branchName: 'Male Marine & Dock Services',
      externalRevenue: 200000,
      internalInterBranchRevenue: 0,
      totalRevenue: 200000,
      costOfGoodsSold: 90000,
      grossProfit: 110000,
      operatingExpenses: 35000,
      internalInterBranchCharges: 15000,
      netIncome: 60000,
    },
    {
      branchId: 'br-hul',
      branchCode: 'BR-HUL',
      branchName: 'Hulhumale Commercial Logistics',
      externalRevenue: 150000,
      internalInterBranchRevenue: 0,
      totalRevenue: 150000,
      costOfGoodsSold: 65000,
      grossProfit: 85000,
      operatingExpenses: 28000,
      internalInterBranchCharges: 5000,
      netIncome: 52000,
    },
    {
      branchId: 'br-thl',
      branchCode: 'BR-THL',
      branchName: 'Thilafushi Heavy Marine Yard',
      externalRevenue: 350000,
      internalInterBranchRevenue: 0,
      totalRevenue: 350000,
      costOfGoodsSold: 160000,
      grossProfit: 190000,
      operatingExpenses: 65000,
      internalInterBranchCharges: 5000,
      netIncome: 120000,
    },
  ]);

  const report: ConsolidatedFinancialReport = generateConsolidatedReport({
    periodName,
    branchData,
  });

  const handleDownloadCsv = () => {
    const rows = [
      ['BRANCH_CODE', 'BRANCH_NAME', 'EXTERNAL_REVENUE', 'INTERNAL_REVENUE', 'COGS', 'GROSS_PROFIT', 'OPEX', 'NET_INCOME'],
      ...report.branches.map((b) => [
        b.branchCode,
        b.branchName,
        b.externalRevenue.toFixed(2),
        b.internalInterBranchRevenue.toFixed(2),
        b.costOfGoodsSold.toFixed(2),
        b.grossProfit.toFixed(2),
        b.operatingExpenses.toFixed(2),
        b.netIncome.toFixed(2),
      ]),
      ['ELIMINATIONS', 'Inter-Company Elimination', `-${report.eliminatedInterBranchRevenue.toFixed(2)}`, `-${report.eliminatedInterBranchCharges.toFixed(2)}`, '0.00', '0.00', '0.00', '0.00'],
      ['CONSOLIDATED', 'Consolidated Total', report.consolidatedRevenue.toFixed(2), '0.00', report.consolidatedCogs.toFixed(2), report.consolidatedGrossProfit.toFixed(2), report.consolidatedOperatingExpenses.toFixed(2), report.consolidatedNetIncome.toFixed(2)],
    ];

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Consolidated_Financials_${periodName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" data-testid="consolidated-reporting-view">
      {/* Header */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Building2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Multi-Branch Consolidated Financial Reporting</h2>
                <Badge variant="positive">Inter-Company Eliminated</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Segmented business unit financial statements with automated internal revenue/charge eliminations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outlined"
              size="sm"
              onClick={handleDownloadCsv}
              icon={<Download size={14} />}
            >
              <span>Export Consolidated CSV</span>
            </Button>
            <Button
              variant="filled"
              size="sm"
              onClick={() => window.print()}
              icon={<Printer size={14} />}
            >
              <span>Print Financials</span>
            </Button>
          </div>
        </div>
      </Surface>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Consolidated External Revenue</span>
          <div className="text-lg font-bold text-white">{formatMVR(report.consolidatedRevenue)}</div>
          <span className="text-[10px] text-slate-500 font-sans">Across {report.branches.length} Business Units</span>
        </Surface>

        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Inter-Company Eliminations</span>
          <div className="text-lg font-bold text-amber-400">-{formatMVR(report.eliminatedInterBranchRevenue)}</div>
          <span className="text-[10px] text-slate-500 font-sans">Internal Cross-Charges Cancelled</span>
        </Surface>

        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Consolidated Gross Profit</span>
          <div className="text-lg font-bold text-teal-400">{formatMVR(report.consolidatedGrossProfit)}</div>
          <span className="text-[10px] text-slate-500 font-sans">
            Margin: {report.consolidatedRevenue > 0 ? ((report.consolidatedGrossProfit / report.consolidatedRevenue) * 100).toFixed(1) : 0}%
          </span>
        </Surface>

        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Consolidated Net Income</span>
          <div className="text-lg font-bold text-emerald-400">{formatMVR(report.consolidatedNetIncome)}</div>
          <span className="text-[10px] text-slate-500 font-sans">Net Margin: {report.consolidatedNetMarginPct}%</span>
        </Surface>
      </div>

      {/* Segmented Branch Matrix Table */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PieChart size={16} className="text-teal-400" />
            <span>Branch Income Statements Matrix ({periodName})</span>
          </h3>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-mono text-slate-400 uppercase">
                <th className="py-2.5 px-3">Branch / Unit</th>
                <th className="py-2.5 px-3 text-right">Ext. Revenue</th>
                <th className="py-2.5 px-3 text-right">Internal Rev.</th>
                <th className="py-2.5 px-3 text-right">COGS</th>
                <th className="py-2.5 px-3 text-right">Gross Profit</th>
                <th className="py-2.5 px-3 text-right">Opex</th>
                <th className="py-2.5 px-3 text-right">Net Income</th>
                <th className="py-2.5 px-3 text-right">Net Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {report.branches.map((b) => {
                const margin = b.totalRevenue > 0 ? ((b.netIncome / b.totalRevenue) * 100).toFixed(1) : 0;
                return (
                  <tr key={b.branchId} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-white font-sans">{b.branchName}</span>
                      <span className="block text-[10px] text-slate-500 font-mono">{b.branchCode}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">{formatMVR(b.externalRevenue)}</td>
                    <td className="py-2.5 px-3 text-right text-amber-300">
                      {b.internalInterBranchRevenue > 0 ? `+${formatMVR(b.internalInterBranchRevenue)}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{formatMVR(b.costOfGoodsSold)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-teal-300">{formatMVR(b.grossProfit)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{formatMVR(b.operatingExpenses)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{formatMVR(b.netIncome)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{margin}%</td>
                  </tr>
                );
              })}

              {/* Inter-Company Elimination Row */}
              <tr className="bg-amber-950/20 text-amber-300 font-bold border-t border-amber-500/30">
                <td className="py-2.5 px-3">
                  <span>Less: Inter-Company Eliminations</span>
                  <span className="block text-[10px] text-amber-400/70 font-mono">Consolidation Adjustment</span>
                </td>
                <td className="py-2.5 px-3 text-right">-</td>
                <td className="py-2.5 px-3 text-right">-{formatMVR(report.eliminatedInterBranchRevenue)}</td>
                <td className="py-2.5 px-3 text-right">-</td>
                <td className="py-2.5 px-3 text-right">-</td>
                <td className="py-2.5 px-3 text-right">-</td>
                <td className="py-2.5 px-3 text-right">MVR 0.00</td>
                <td className="py-2.5 px-3 text-right">-</td>
              </tr>

              {/* Final Consolidated Total */}
              <tr className="bg-slate-900/90 text-white font-bold text-xs border-t-2 border-slate-700">
                <td className="py-3 px-3 uppercase tracking-wider text-teal-400 font-mono">
                  Consolidated Total
                </td>
                <td className="py-3 px-3 text-right">{formatMVR(report.consolidatedRevenue)}</td>
                <td className="py-3 px-3 text-right text-slate-500">MVR 0.00</td>
                <td className="py-3 px-3 text-right">{formatMVR(report.consolidatedCogs)}</td>
                <td className="py-3 px-3 text-right text-teal-400">{formatMVR(report.consolidatedGrossProfit)}</td>
                <td className="py-3 px-3 text-right">{formatMVR(report.consolidatedOperatingExpenses)}</td>
                <td className="py-3 px-3 text-right text-emerald-400 text-sm">{formatMVR(report.consolidatedNetIncome)}</td>
                <td className="py-3 px-3 text-right text-emerald-300">{report.consolidatedNetMarginPct}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
};
