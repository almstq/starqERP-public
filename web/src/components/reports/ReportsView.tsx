import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  PieChart,
  FileSpreadsheet,
  Download,
  Calendar,
  ShieldCheck,
  Wrench,
  Layers,
  ArrowUpRight,
  Printer,
  CheckCircle2,
  Scale,
  BookOpen,
  Building2,
  FileText,
  ExternalLink,
  ChevronRight,
  Clock,
  Search,
  Palmtree
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { useERP } from '../../context/ERPContext';
import { Badge } from '../common/Badge';
import { Surface, Button } from '../ui';
import { buildMonthlyPerformance, buildServiceMix } from '../../domain/dashboardSeries';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../data/defaultChartOfAccounts';
import { AccountRecord } from '../../domain/accounts';
import {
  JournalEntry,
  deriveOperationalJournals,
} from '../../domain/journals';
import {
  computeTrialBalanceFromLedger,
  computeAuthoritativeProfitAndLoss,
  computeAuthoritativeBalanceSheet,
} from '../../lib/bookkeeping';
import { DrilldownDrawer, DrilldownAccountDetails } from './DrilldownDrawer';
import { AgingMatricesView } from './AgingMatricesView';
import { MiraGst201View } from '../tax/MiraGst201View';
import { MiraTgstView } from '../tax/MiraTgstView';
import { CashFlowStatementView } from './CashFlowStatementView';

export type ReportSection = 'statements' | 'aging' | 'analytics' | 'mira_gst_201' | 'mira_tgst_16' | 'cash_flow';

export const REPORT_TAB_HEADERS: Record<ReportSection, { title: string; subtitle: string }> = {
  statements: {
    title: 'Reports & Financial Statements',
    subtitle: 'Standard 2-column Trial Balance, authoritative Balance Sheet, P&L with drilldowns, and AR/AP aging',
  },
  aging: {
    title: 'AR & AP Aging Analysis',
    subtitle: 'Accounts receivable and payable aging matrices, credit exposure, and counterparty settlement horizons',
  },
  analytics: {
    title: 'Operational Analytics',
    subtitle: 'Revenue vs expense trends, service margin mix, and workload metrics from operational transactions',
  },
  mira_gst_201: {
    title: 'MIRA GST-201 Tax Return',
    subtitle: 'Authoritative Maldives Inland Revenue Authority GST-201 tax return working papers and reconciliations',
  },
  mira_tgst_16: {
    title: '16% TGST & Green Tax',
    subtitle: 'Tourism goods and services tax (TGST) ledger tracking, green tax obligations, and statutory filings',
  },
  cash_flow: {
    title: 'Statement of Cash Flows',
    subtitle: 'Operating, investing, and financing cash flow analysis derived directly from general ledger journals',
  },
};

export const ReportsView: React.FC = () => {
  const navigate = useNavigate();
  const { formatMVR, invoices, payments, expenses, purchaseOrders, jobs, staff, currentTenant, currentBook } = useERP();

  // SERP-288 — both analytics charts were fed by hard-coded arrays in mockData.
  // They are now the tenant's own records, and empty when the tenant is empty.
  const monthlyPerformance = React.useMemo(
    () => buildMonthlyPerformance(invoices, expenses),
    [invoices, expenses],
  );
  const serviceMix = React.useMemo(() => buildServiceMix(jobs), [jobs]);
  const hasTrading = monthlyPerformance.some((p) => p.revenue !== 0 || p.expenses !== 0);


  const [dateRange, setDateRange] = useState('This Year (2026)');
  const [selectedBookFilter, setSelectedBookFilter] = useState<'CONSOLIDATED' | 'CURRENT_BOOK'>('CONSOLIDATED');
  const [searchParams] = useSearchParams();
  const requestedSection = searchParams.get('tab') as ReportSection | null;
  const activeReportTab: ReportSection = ['statements', 'aging', 'analytics', 'mira_gst_201', 'mira_tgst_16', 'cash_flow'].includes(requestedSection || '')
    ? requestedSection as ReportSection
    : 'statements';
  const [drilldownAccount, setDrilldownAccount] = useState<DrilldownAccountDetails | null>(null);

  const isGstRegistered = currentTenant.gstStatus === 'registered';

  // Load Chart of Accounts from storage or fallback
  const accounts: AccountRecord[] = useMemo(() => {
    const saved = localStorage.getItem('starq:chart_of_accounts:v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_CHART_OF_ACCOUNTS;
      }
    }
    return DEFAULT_CHART_OF_ACCOUNTS;
  }, []);

  // Load Manual Journals from storage
  const manualJournals: JournalEntry[] = useMemo(() => {
    const saved = localStorage.getItem('starq:manual_journals:v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  }, []);

  // Compile all posted journals
  const allJournals = useMemo(() => {
    const operational = deriveOperationalJournals({
      invoices,
      payments,
      expenses,
      purchaseOrders,
      accounts,
      isGstRegistered: isGstRegistered || true,
      tenantId: currentTenant.id,
    });
    return [...operational, ...manualJournals];
  }, [invoices, payments, expenses, purchaseOrders, accounts, isGstRegistered, currentTenant, manualJournals]);

  // Compute authoritative financial statements from live ledger
  const trialBalance = useMemo(() => {
    return computeTrialBalanceFromLedger({
      journals: allJournals,
      accounts,
    });
  }, [allJournals, accounts]);

  const profitAndLoss = useMemo(() => {
    return computeAuthoritativeProfitAndLoss({
      journals: allJournals,
      accounts,
    });
  }, [allJournals, accounts]);

  const balanceSheet = useMemo(() => {
    return computeAuthoritativeBalanceSheet({
      journals: allJournals,
      accounts,
    });
  }, [allJournals, accounts]);

  const companyLegalName = currentTenant.legalName || currentTenant.name || 'Starq Technologies Private Limited';
  const orgCode = currentBook?.code || (currentTenant.name ? currentTenant.name.slice(0, 3).toUpperCase() : 'STQ');
  const currencyCode = currentTenant.currency || 'MVR';

  const handleDrilldownAccount = (code: string, name: string, accountClass: string, amount: number) => {
    setDrilldownAccount({
      code,
      name,
      accountClass,
      totalAmount: amount,
    });
  };

  return (
    <div className="space-y-6 pb-12 w-full min-w-0" data-testid="reports-view">
      {/* ─────────────────────────────────────────────────────────────────────
         FORMAL EXECUTIVE DOCUMENT MASTHEAD (Visible ONLY when printing / PDF export)
         ───────────────────────────────────────────────────────────────────── */}
      <div className="hidden print:block mb-6 pb-4 border-b-2 border-slate-900">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xl font-black uppercase tracking-tight text-slate-900">
              {companyLegalName}
            </div>
            <div className="text-xs font-semibold text-slate-700 tracking-wide mt-0.5">
              AUTHORITATIVE FINANCIAL STATEMENTS & TRIAL BALANCE REPORT
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1 space-x-2">
              <span>ORG: {orgCode}</span>
              <span>•</span>
              <span>TIN: {currentTenant.tinNumber || 'NON-REGISTERED'}</span>
              <span>•</span>
              <span>CURRENCY: {currencyCode}</span>
              <span>•</span>
              <span>PERIOD: {dateRange}</span>
              <span>•</span>
              <span>VIEW: {selectedBookFilter === 'CONSOLIDATED' ? 'CONSOLIDATED LEGAL ENTITY' : `BOOK ${currentBook?.name || orgCode}`}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block border border-slate-900 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase rounded">
              {trialBalance.isBalanced ? '✔ ZERO_VARIANCE_PASS' : '⚠ VARIANCE_DETECTED'}
            </div>
            <div className="text-[9px] text-slate-500 font-mono mt-1">
              GENERATED: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
         INTERACTIVE SCREEN HEADER (Hidden in Print Mode)
         ───────────────────────────────────────────────────────────────────── */}
      {/*
        Header stacks rather than sitting beside the toolbar. The toolbar holds a
        ~900px report tab-group plus two selects and an export button — about
        1430px of controls. Asking that to share a justify-between row with the
        heading meant the heading (the only shrinkable item) was squeezed to 0px
        wide and its text wrapped one character per line.
      */}
      <div className="flex flex-col gap-4 print:hidden min-w-0">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
              {REPORT_TAB_HEADERS[activeReportTab].title}
            </h1>
            <Badge variant="neutral" size="sm">
              {currentTenant.name}
            </Badge>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {REPORT_TAB_HEADERS[activeReportTab].subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 min-w-0">

          {/* Operating Book / Entity Selector */}
          <select
            value={selectedBookFilter}
            onChange={(e) => setSelectedBookFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] shadow-xs cursor-pointer"
          >
            <option value="CONSOLIDATED">Consolidated Legal Entity</option>
            <option value="CURRENT_BOOK">Book: {currentBook?.name || 'Main Operational Book'}</option>
          </select>

          {/* Date Period Selector */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] shadow-xs cursor-pointer"
          >
            <option value="Today">As of Today (Latest)</option>
            <option value="This Month">As of End of Month (August 2026)</option>
            <option value="Last Quarter">Q1 2026</option>
            <option value="This Year (2026)">Full Year 2026</option>
          </select>

          <Button
            variant="tonal"
            size="sm"
            onClick={() => window.print()}
            icon={<Printer size={14} />}
          >
            <span>Export PDF</span>
          </Button>
        </div>
      </div>

      {activeReportTab === 'statements' ? (
        <div className="space-y-6">
          {/* Trial Balance Health Banner (Screen Only) */}
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden ${
            trialBalance.isBalanced
              ? 'bg-[rgba(34,197,94,0.1)] border-[rgba(34,197,94,0.3)] text-[#4ade80]'
              : 'bg-[rgba(245,158,11,0.1)] border-[rgba(245,158,11,0.3)] text-[#fbbf24]'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${trialBalance.isBalanced ? 'bg-[rgba(34,197,94,0.2)] text-[#34d399]' : 'bg-[rgba(245,158,11,0.2)] text-[#f59e0b]'}`}>
                {trialBalance.isBalanced ? <CheckCircle2 className="w-5 h-5" /> : <Scale className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                  {trialBalance.isBalanced ? 'Trial Balance Verified & In Balance' : 'Trial Balance Variance Detected'}
                </h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  Total Debits ({formatMVR(trialBalance.totalDebits)}) = Total Credits ({formatMVR(trialBalance.totalCredits)}) • Variance: {formatMVR(trialBalance.variance)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={trialBalance.isBalanced ? 'positive' : 'warning'} size="sm">
                {trialBalance.isBalanced ? '0.00 Variance (DEC-043 / SERP-292)' : 'Out of Balance'}
              </Badge>
              <Badge variant={isGstRegistered ? 'info' : 'neutral'} size="sm">
                {isGstRegistered ? `GST Registered (${currentTenant.gstRate || 8}%)` : 'Non-Registered (0% GST)'}
              </Badge>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
             1. STANDARD 2-COLUMN TRIAL BALANCE (Debit = Credit)
             ───────────────────────────────────────────────────────────────── */}
          <div className="statement-section" data-testid="trial-balance-section">
            <Surface variant="filled" level={1} padding="md" className="space-y-4 print:p-0 print:border-none print:bg-transparent">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider print:text-black print:text-xs">
                    Standard General Ledger Trial Balance
                  </h2>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] print:text-gray-600 print:text-[10px]">
                    Authoritative double-entry account balances as of {trialBalance.asOfDate}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[var(--md-sys-color-primary)] print:text-black print:text-[10px]">
                    ISO Currency: {currencyCode}
                  </span>
                </div>
              </div>

              <div className="erp-scroll-region overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)] print:border-none">
                <table className="w-full text-left text-xs min-w-[720px] print:min-w-0 print-doc-table">
                  <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--md-sys-color-outline-variant)] whitespace-nowrap">
                    <tr>
                      <th className="py-2.5 px-4 w-24">Code</th>
                      <th className="py-2.5 px-4">Account Title</th>
                      <th className="py-2.5 px-4 w-28">Class</th>
                      <th className="py-2.5 px-4 text-right w-40">Debit ({currencyCode})</th>
                      <th className="py-2.5 px-4 text-right w-40">Credit ({currencyCode})</th>
                      <th className="py-2.5 px-2 w-10 text-center print:hidden"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                    {trialBalance.accounts.map((acc) => (
                      <tr
                        key={acc.code}
                        onClick={() => navigate('/accounts')}
                        className="hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer group"
                      >
                        <td className="py-2 px-4 font-mono font-bold text-[var(--md-sys-color-primary)] print:text-black">
                          {acc.code}
                        </td>
                        <td className="py-2 px-4 font-semibold text-[var(--md-sys-color-on-surface)] print:text-black">
                          {acc.name}
                        </td>
                        <td className="py-2 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase print:border print:border-gray-400 print:text-black ${
                            acc.accountClass === 'ASSET' ? 'bg-blue-500/15 text-sky-400 border border-blue-500/30' :
                            acc.accountClass === 'LIABILITY' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                            acc.accountClass === 'EQUITY' ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30' :
                            acc.accountClass === 'REVENUE' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                            'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}>
                            {acc.accountClass}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-medium text-[var(--md-sys-color-on-surface)] print:text-black">
                          {acc.debit > 0 ? formatMVR(acc.debit) : '—'}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-medium text-[var(--md-sys-color-on-surface)] print:text-black">
                          {acc.credit > 0 ? formatMVR(acc.credit) : '—'}
                        </td>
                        <td className="py-2 px-2 text-center print:hidden">
                          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-[var(--md-sys-color-primary)] transition" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[var(--md-sys-color-surface-container-high)] font-bold border-t-2 border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]">
                    <tr>
                      <td colSpan={3} className="py-2.5 px-4 text-right uppercase tracking-wider text-[11px] print:text-black">
                        Totals (Σ Debits = Σ Credits)
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-extrabold text-[var(--md-sys-color-primary)] text-sm print:text-black">
                        {formatMVR(trialBalance.totalDebits)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-extrabold text-[var(--md-sys-color-primary)] text-sm print:text-black">
                        {formatMVR(trialBalance.totalCredits)}
                      </td>
                      <td className="print:hidden"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Surface>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
             2. AUTHORITATIVE BALANCE SHEET & STATEMENT OF PROFIT & LOSS
             ───────────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start print:grid-cols-2 print:gap-4">
            
            {/* Authoritative Balance Sheet */}
            <div className="statement-section print-avoid-break" data-testid="balance-sheet-section">
              <Surface variant="filled" level={1} padding="md" className="space-y-4 print:p-0 print:border-none print:bg-transparent">
                <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] pb-3 print:border-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-500/15 text-sky-400 border border-blue-500/30 print:hidden">
                      <Scale className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] print:text-black print:text-xs uppercase tracking-wider">
                        Authoritative Balance Sheet
                      </h2>
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] print:text-gray-600 print:text-[10px]">
                        Assets ≡ Liabilities + Equity (As of {balanceSheet.asOfDate})
                      </p>
                    </div>
                  </div>
                  <Badge variant={balanceSheet.isBalanced ? 'positive' : 'destructive'} size="sm">
                    {balanceSheet.isBalanced ? 'Balanced (Δ MVR 0.00)' : 'Unbalanced'}
                  </Badge>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Current Assets */}
                  <div className="space-y-1">
                    <div className="flex justify-between font-bold uppercase text-[10px] tracking-wider text-[var(--md-sys-color-primary)] print:text-black">
                      <span>{balanceSheet.currentAssets.title}</span>
                      <span className="font-mono">{formatMVR(balanceSheet.currentAssets.subtotal)}</span>
                    </div>
                    {balanceSheet.currentAssets.accounts.map((acc) => (
                      <div key={acc.code} className="flex justify-between py-0.5 text-[var(--md-sys-color-on-surface-variant)] pl-2 print:text-gray-700">
                        <span>{acc.code} - {acc.name}</span>
                        <span className="font-mono font-medium text-[var(--md-sys-color-on-surface)] print:text-black">{formatMVR(acc.amount)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Non-Current Assets */}
                  {balanceSheet.nonCurrentAssets.accounts.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between font-bold uppercase text-[10px] tracking-wider text-[var(--md-sys-color-primary)] print:text-black">
                        <span>{balanceSheet.nonCurrentAssets.title}</span>
                        <span className="font-mono">{formatMVR(balanceSheet.nonCurrentAssets.subtotal)}</span>
                      </div>
                      {balanceSheet.nonCurrentAssets.accounts.map((acc) => (
                        <div key={acc.code} className="flex justify-between py-0.5 text-[var(--md-sys-color-on-surface-variant)] pl-2 print:text-gray-700">
                          <span>{acc.code} - {acc.name}</span>
                          <span className="font-mono font-medium text-[var(--md-sys-color-on-surface)] print:text-black">{formatMVR(acc.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Total Assets Summary */}
                  <div className="flex justify-between py-1.5 bg-blue-500/10 border-t border-b border-blue-500/30 px-2 rounded-lg font-bold text-[var(--md-sys-color-on-surface)] print:bg-gray-100 print:text-black">
                    <span className="uppercase text-[11px]">Total Assets</span>
                    <span className="font-mono text-sky-400 print:text-blue-800">{formatMVR(balanceSheet.totalAssets)}</span>
                  </div>

                  {/* Current Liabilities */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between font-bold uppercase text-[10px] tracking-wider text-amber-400 print:text-black">
                      <span>{balanceSheet.currentLiabilities.title}</span>
                      <span className="font-mono">{formatMVR(balanceSheet.currentLiabilities.subtotal)}</span>
                    </div>
                    {balanceSheet.currentLiabilities.accounts.map((acc) => (
                      <div key={acc.code} className="flex justify-between py-0.5 text-[var(--md-sys-color-on-surface-variant)] pl-2 print:text-gray-700">
                        <span>{acc.code} - {acc.name}</span>
                        <span className="font-mono font-medium text-[var(--md-sys-color-on-surface)] print:text-black">{formatMVR(acc.amount)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Total Liabilities */}
                  <div className="flex justify-between py-1 bg-[var(--md-sys-color-surface-container-high)] px-2 rounded font-semibold text-[var(--md-sys-color-on-surface)] print:text-black">
                    <span>Total Liabilities</span>
                    <span className="font-mono text-amber-400 print:text-amber-800">{formatMVR(balanceSheet.totalLiabilities)}</span>
                  </div>

                  {/* Equity */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between font-bold uppercase text-[10px] tracking-wider text-purple-400 print:text-black">
                      <span>Partner & Owner Equity</span>
                      <span className="font-mono">{formatMVR(balanceSheet.equity.totalEquity)}</span>
                    </div>
                    {balanceSheet.equity.capitalAccounts.map((acc) => (
                      <div key={acc.code} className="flex justify-between py-0.5 text-[var(--md-sys-color-on-surface-variant)] pl-2 print:text-gray-700">
                        <span>{acc.code} - {acc.name}</span>
                        <span className="font-mono font-medium text-[var(--md-sys-color-on-surface)] print:text-black">{formatMVR(acc.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-0.5 text-emerald-400 font-semibold pl-2 print:text-emerald-700">
                      <span>Current Period Net Income (Reconciled from P&L)</span>
                      <span className="font-mono font-bold">{formatMVR(balanceSheet.equity.currentPeriodNetIncome)}</span>
                    </div>
                  </div>

                  {/* Total Liabilities & Equity (Double Underline Standard) */}
                  <div className="flex justify-between py-2 bg-[var(--md-sys-color-surface-container-high)] border-t-2 border-b-4 border-double border-[var(--md-sys-color-primary)] px-3 rounded-xl font-extrabold text-sm text-[var(--md-sys-color-on-surface)] print:bg-gray-100 print:border-black print:text-black">
                    <span>Total Liabilities & Equity</span>
                    <span className="font-mono text-[var(--md-sys-color-primary)] print:text-black">{formatMVR(balanceSheet.totalLiabilitiesAndEquity)}</span>
                  </div>
                </div>
              </Surface>
            </div>

            {/* Statement of Profit & Loss with Drilldown Trigger */}
            <div className="statement-section print-avoid-break" data-testid="profit-and-loss-section">
              <Surface variant="filled" level={1} padding="md" className="space-y-4 print:p-0 print:border-none print:bg-transparent">
                <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] pb-3 print:border-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 print:hidden">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] print:text-black print:text-xs uppercase tracking-wider">
                        Statement of Profit & Loss (P&L)
                      </h2>
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] print:text-gray-600 print:text-[10px]">
                        Period: {dateRange} (Click line item to inspect contributing journal lines)
                      </p>
                    </div>
                  </div>
                  <Badge variant={profitAndLoss.netOperatingIncome >= 0 ? 'positive' : 'destructive'} size="sm">
                    Margin: {profitAndLoss.operatingMarginPct}%
                  </Badge>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* Operating Revenue Item */}
                  <div
                    onClick={() => handleDrilldownAccount('4000', 'Operating & Service Revenue', 'REVENUE', profitAndLoss.totalRevenue)}
                    className="flex justify-between py-1.5 border-b border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] px-1 rounded cursor-pointer group transition print:border-gray-200"
                    data-testid="pnl-line-revenue"
                  >
                    <span className="font-semibold text-[var(--md-sys-color-on-surface)] flex items-center gap-1 print:text-black">
                      <span>Operating Revenue</span>
                      <Search size={11} className="opacity-0 group-hover:opacity-100 text-[var(--md-sys-color-primary)] transition" />
                    </span>
                    <span className="font-mono font-bold text-[var(--md-sys-color-on-surface)] print:text-black">{formatMVR(profitAndLoss.totalRevenue)}</span>
                  </div>

                  {/* Cost of Goods Sold Item */}
                  <div
                    onClick={() => handleDrilldownAccount('5000', 'Cost of Goods Sold (Parts & Direct Costs)', 'EXPENSE', profitAndLoss.totalCOGS)}
                    className="flex justify-between py-1.5 border-b border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] px-1 rounded cursor-pointer group transition print:text-gray-700 print:border-gray-200"
                    data-testid="pnl-line-cogs"
                  >
                    <span className="flex items-center gap-1">
                      <span>Less: Cost of Goods Sold (COGS)</span>
                      <Search size={11} className="opacity-0 group-hover:opacity-100 text-[var(--md-sys-color-primary)] transition" />
                    </span>
                    <span className="font-mono font-medium text-rose-400 print:text-red-700">({formatMVR(profitAndLoss.totalCOGS)})</span>
                  </div>

                  {/* Gross Profit */}
                  <div className="flex justify-between py-1.5 bg-[var(--md-sys-color-surface-container-high)] px-2 rounded-lg font-bold text-[var(--md-sys-color-on-surface)] print:bg-gray-100 print:text-black">
                    <span>Gross Operating Profit</span>
                    <span className="font-mono text-emerald-400 print:text-emerald-800">{formatMVR(profitAndLoss.grossProfit)}</span>
                  </div>

                  {/* Operating Expenses Item */}
                  <div
                    onClick={() => handleDrilldownAccount('6000', 'Operating & Administrative Expenses', 'EXPENSE', profitAndLoss.totalOperatingExpenses)}
                    className="flex justify-between py-1.5 border-b border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] px-1 rounded cursor-pointer group transition print:text-gray-700 print:border-gray-200"
                    data-testid="pnl-line-opex"
                  >
                    <span className="flex items-center gap-1">
                      <span>Less: Operating & Administrative Expenses</span>
                      <Search size={11} className="opacity-0 group-hover:opacity-100 text-[var(--md-sys-color-primary)] transition" />
                    </span>
                    <span className="font-mono font-medium text-rose-400 print:text-red-700">({formatMVR(profitAndLoss.totalOperatingExpenses)})</span>
                  </div>

                  {/* Net Operating Income */}
                  <div className="flex justify-between py-2 bg-emerald-500/15 border-t-2 border-b-4 border-double border-emerald-500/50 px-3 rounded-xl font-extrabold text-sm text-emerald-300 print:bg-gray-100 print:border-black print:text-black">
                    <span>Net Operating Income</span>
                    <span className="font-mono">{formatMVR(profitAndLoss.netOperatingIncome)}</span>
                  </div>
                </div>
              </Surface>
            </div>
          </div>
        </div>
      ) : activeReportTab === 'aging' ? (
        /* AR & AP Aging Matrices Tab */
        <AgingMatricesView
          invoices={invoices}
          payments={payments}
          purchaseOrders={purchaseOrders}
          asOfDate={new Date().toISOString().split('T')[0]}
          formatMVR={formatMVR}
        />
      ) : activeReportTab === 'analytics' ? (
        /* Operational Analytics Tab */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Surface variant="filled" level={1} padding="md" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                  Monthly Revenue vs Expenses (MVR)
                </h3>
                <Badge variant="neutral" size="sm">Last 6 months</Badge>
              </div>
              <div className="h-64 w-full">
                {!hasTrading ? (
                  <div className="h-full flex items-center justify-center text-center text-xs text-[var(--md-sys-color-on-surface-variant)] px-6">
                    No revenue or expenses recorded in the last six months. This chart is built
                    from issued invoices and recorded expenses — it stays empty until there are some.
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" opacity={0.3} />
                    <XAxis dataKey="month" stroke="var(--md-sys-color-outline)" fontSize={11} />
                    <YAxis stroke="var(--md-sys-color-outline)" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface-container)', borderColor: 'var(--md-sys-color-outline-variant)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" name="Revenue (excl. GST)" fill="var(--md-sys-color-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Operating Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </Surface>

            <Surface variant="filled" level={1} padding="md" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                  Labor & Service Value Breakdown
                </h3>
                <Badge variant="neutral" size="sm">By value</Badge>
              </div>
              <div className="h-64 w-full">
                {serviceMix.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center text-xs text-[var(--md-sys-color-on-surface-variant)] px-6">
                    No service value recorded yet. This breakdown is built from approved job
                    orders, weighted by value.
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serviceMix} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" opacity={0.3} />
                    <XAxis type="number" stroke="var(--md-sys-color-outline)" fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke="var(--md-sys-color-outline)" fontSize={10} width={90} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface-container)', borderColor: 'var(--md-sys-color-outline-variant)' }} />
                    <Bar dataKey="amount" name="Service Value (MVR)" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </Surface>
          </div>
        </div>
      ) : activeReportTab === 'mira_gst_201' ? (
        <MiraGst201View />
      ) : activeReportTab === 'mira_tgst_16' ? (
        <MiraTgstView
          onAddJournalEntry={(je) => {
            // manualJournals above is a useMemo over localStorage, not state, so
            // there is no setter. Write back to the same key it reads from.
            try {
              const saved = localStorage.getItem('starq:manual_journals:v1');
              const existing: JournalEntry[] = saved ? JSON.parse(saved) : [];
              localStorage.setItem('starq:manual_journals:v1', JSON.stringify([je, ...existing]));
            } catch {
              /* storage unavailable; the entry is not persisted */
            }
          }}
        />
      ) : activeReportTab === 'cash_flow' ? (
        <CashFlowStatementView journals={allJournals} />
      ) : null}

      {/* Interactive P&L Drilldown Drawer */}
      <DrilldownDrawer
        isOpen={Boolean(drilldownAccount)}
        onClose={() => setDrilldownAccount(null)}
        account={drilldownAccount}
        journals={allJournals}
        formatMVR={formatMVR}
      />
    </div>
  );
};
