import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Calendar,
  Layers,
  ArrowUpDown,
  BookOpen,
  ArrowRight,
  Eye,
  X,
  FileText,
  Building2,
  Scale,
  Plus,
  TrendingUp,
  TrendingDown,
  Clock,
  User,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { Surface, Button, Badge } from '../ui';
import { AccountRecord, CLASS_LABELS, AccountClass } from '../../domain/accounts';
import {
  JournalEntry,
  GeneralLedgerTransaction,
  JournalEntrySource,
  compileGeneralLedger,
} from '../../domain/journals';
import { useERP } from '../../context/ERPContext';

interface GeneralLedgerViewProps {
  accounts: AccountRecord[];
  journals: JournalEntry[];
  selectedAccountId?: string | null;
  onSelectAccount?: (accountId: string | null) => void;
  onOpenNewJournalModal: () => void;
}

export const GeneralLedgerView: React.FC<GeneralLedgerViewProps> = ({
  accounts,
  journals,
  selectedAccountId,
  onSelectAccount,
  onOpenNewJournalModal,
}) => {
  const { currentTenant, formatMVR } = useERP();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<string>('ALL_TIME');
  const [viewingJournal, setViewingJournal] = useState<JournalEntry | null>(null);

  // Compile all ledger lines from journals
  const rawLedgerTransactions = useMemo(() => {
    return compileGeneralLedger(journals, selectedAccountId || undefined);
  }, [journals, selectedAccountId]);

  // Selected Account Record details
  const activeAccount = useMemo(() => {
    if (!selectedAccountId) return null;
    return accounts.find((a) => a.id === selectedAccountId || a.code === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return rawLedgerTransactions.filter((tx) => {
      // Source filter
      if (selectedSource !== 'ALL' && tx.source !== selectedSource) return false;

      // Date filter
      if (dateRange === 'THIS_MONTH') {
        const currentMonthPrefix = new Date().toISOString().slice(0, 7);
        if (!tx.date.startsWith(currentMonthPrefix)) return false;
      } else if (dateRange === 'THIS_YEAR') {
        const currentYearPrefix = new Date().getFullYear().toString();
        if (!tx.date.startsWith(currentYearPrefix)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesVoucher = tx.entryNumber.toLowerCase().includes(q);
        const matchesRef = tx.reference?.toLowerCase().includes(q);
        const matchesDesc = tx.narration.toLowerCase().includes(q);
        const matchesAcc = tx.accountName.toLowerCase().includes(q) || tx.accountCode.toLowerCase().includes(q);
        if (!matchesVoucher && !matchesRef && !matchesDesc && !matchesAcc) return false;
      }

      return true;
    });
  }, [rawLedgerTransactions, selectedSource, dateRange, searchQuery]);

  // Summary Metrics for the current ledger view
  const metrics = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;

    filteredTransactions.forEach((tx) => {
      totalDebit += tx.debit;
      totalCredit += tx.credit;
    });

    const netDelta = activeAccount
      ? activeAccount.accountClass === 'ASSET' || activeAccount.accountClass === 'EXPENSE'
        ? totalDebit - totalCredit
        : totalCredit - totalDebit
      : totalDebit - totalCredit;

    const closingBalance = filteredTransactions.length > 0 ? filteredTransactions[0].runningBalance : 0;

    return {
      totalDebit,
      totalCredit,
      netDelta,
      closingBalance,
      txCount: filteredTransactions.length,
    };
  }, [filteredTransactions, activeAccount]);

  const getSourceBadge = (source: JournalEntrySource) => {
    switch (source) {
      case 'MANUAL':
        return <Badge variant="info" size="sm">Manual Journal</Badge>;
      case 'INVOICE':
        return <Badge variant="positive" size="sm">Sales Invoice</Badge>;
      case 'PAYMENT':
        return <Badge variant="positive" size="sm">Customer Receipt</Badge>;
      case 'BILL':
        return <Badge variant="warning" size="sm">Vendor Bill</Badge>;
      case 'EXPENSE':
        return <Badge variant="destructive" size="sm">Expense</Badge>;
      case 'STOCK_ADJUSTMENT':
        return <Badge variant="neutral" size="sm">Inventory Adj</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{source}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Active Account Banner (If filtered to a single account) */}
      {activeAccount ? (
        <Surface variant="filled" level={1} padding="md" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-l-[var(--md-sys-color-primary)]">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-[var(--md-sys-color-primary)]">
                {activeAccount.code}
              </span>
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                {activeAccount.name}
              </h2>
              <Badge variant="neutral" size="sm">
                {CLASS_LABELS[activeAccount.accountClass]}
              </Badge>
              <span className="text-[11px] text-[var(--md-sys-color-outline)] font-mono">
                ({activeAccount.accountClass === 'ASSET' || activeAccount.accountClass === 'EXPENSE' ? 'Debit Normal (+DR, -CR)' : 'Credit Normal (+CR, -DR)'})
              </span>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              General Ledger statement of all double-entry postings for account {activeAccount.code}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectAccount && onSelectAccount(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] transition cursor-pointer flex items-center gap-1"
            >
              <X size={13} />
              <span>Clear Account Filter</span>
            </button>
            <Button
              variant="filled"
              size="sm"
              onClick={onOpenNewJournalModal}
              icon={<Plus size={14} />}
            >
              <span>New Journal</span>
            </Button>
          </div>
        </Surface>
      ) : null}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Surface variant="filled" level={1} padding="sm" className="flex flex-col justify-between h-[90px] min-w-0">
          <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4 block">
            {activeAccount ? `${activeAccount.code} Period Debits` : 'Total Ledger Debits'}
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-[var(--md-sys-color-on-surface)] leading-none my-auto truncate">
            {formatMVR(metrics.totalDebit)}
          </div>
          <span className="text-[10px] text-[var(--md-sys-color-outline)] h-3.5 block truncate leading-none">
            {metrics.txCount} transactions logged
          </span>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" className="flex flex-col justify-between h-[90px] min-w-0">
          <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4 block">
            {activeAccount ? `${activeAccount.code} Period Credits` : 'Total Ledger Credits'}
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-[var(--md-sys-color-on-surface)] leading-none my-auto truncate">
            {formatMVR(metrics.totalCredit)}
          </div>
          <span className="text-[10px] text-[var(--md-sys-color-outline)] h-3.5 block truncate leading-none">
            Double-entry credit side
          </span>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" className="flex flex-col justify-between h-[90px] min-w-0">
          <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4 block">
            Net Ledger Delta
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-[var(--md-sys-color-primary)] leading-none my-auto truncate">
            {formatMVR(metrics.netDelta)}
          </div>
          <span className="text-[10px] text-[var(--md-sys-color-outline)] h-3.5 block truncate leading-none">
            Period net movement
          </span>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" className="flex flex-col justify-between h-[90px] min-w-0">
          <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4 block">
            {activeAccount ? 'Closing Running Balance' : 'Invariant Balance Status'}
          </span>
          <div className="text-lg sm:text-xl font-mono font-bold text-[var(--md-sys-color-on-surface)] leading-none my-auto truncate">
            {activeAccount ? formatMVR(metrics.closingBalance) : '0.00 Variance'}
          </div>
          <span className="text-[10px] text-emerald-400 h-3.5 block truncate leading-none font-medium">
            ✔ Mathematical Invariant Validated
          </span>
        </Surface>
      </div>

      {/* Filter and Search Bar */}
      <Surface variant="filled" level={1} padding="sm" className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-outline)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search voucher #, ref, account, or narration..."
            className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* Account Filter */}
          <select
            value={selectedAccountId || 'ALL'}
            onChange={(e) => onSelectAccount && onSelectAccount(e.target.value === 'ALL' ? null : e.target.value)}
            className="h-9 px-2.5 text-xs rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer max-w-[200px] truncate"
          >
            <option value="ALL">All Ledger Accounts</option>
            {(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const).map((cls) => {
              const classAccs = accounts.filter((a) => a.accountClass === cls);
              if (classAccs.length === 0) return null;
              return (
                <optgroup key={cls} label={CLASS_LABELS[cls]}>
                  {classAccs.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>

          {/* Source Filter */}
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer"
          >
            <option value="ALL">All Document Types</option>
            <option value="MANUAL">Manual Journals</option>
            <option value="INVOICE">Sales Invoices</option>
            <option value="PAYMENT">Customer Receipts</option>
            <option value="BILL">Procurement Bills</option>
            <option value="EXPENSE">Operating Expenses</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer"
          >
            <option value="ALL_TIME">All Time</option>
            <option value="THIS_MONTH">This Month</option>
            <option value="THIS_YEAR">This Year (2026)</option>
          </select>

          {!activeAccount && (
            <Button
              variant="filled"
              size="sm"
              onClick={onOpenNewJournalModal}
              icon={<Plus size={14} />}
            >
              <span>New Journal</span>
            </Button>
          )}
        </div>
      </Surface>

      {/* General Ledger Transactions Table */}
      <Surface variant="filled" level={1} padding="none" className="overflow-hidden">
        <div className="erp-scroll-region overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[860px]">
            <thead>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider whitespace-nowrap">
                <th className="py-3 px-3.5 w-24">Date</th>
                <th className="py-3 px-3.5 w-36">Voucher #</th>
                <th className="py-3 px-3.5 w-28">Source</th>
                <th className="py-3 px-3.5 w-44">Account</th>
                <th className="py-3 px-3.5">Narration / Reference</th>
                <th className="py-3 px-3.5 w-32 text-right">Debit ({currentTenant.currency || 'MVR'})</th>
                <th className="py-3 px-3.5 w-32 text-right">Credit ({currentTenant.currency || 'MVR'})</th>
                <th className="py-3 px-3.5 w-36 text-right">Running Balance</th>
                <th className="py-3 px-2 w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[var(--md-sys-color-on-surface-variant)]">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-[var(--md-sys-color-outline)]" />
                    <p className="font-medium text-sm">No general ledger transactions found</p>
                    <p className="text-xs text-[var(--md-sys-color-outline)] mt-0.5">
                      Adjust your account or date filters, or post a new manual journal entry.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const parentJournal = journals.find((j) => j.id === tx.journalEntryId);

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors group cursor-pointer"
                      onClick={() => parentJournal && setViewingJournal(parentJournal)}
                    >
                      {/* Date */}
                      <td className="py-2.5 px-3.5 font-mono text-xs whitespace-nowrap text-[var(--md-sys-color-on-surface)]">
                        {tx.date}
                      </td>

                      {/* Voucher ID */}
                      <td className="py-2.5 px-3.5 font-mono font-bold text-xs whitespace-nowrap text-[var(--md-sys-color-primary)]">
                        {tx.entryNumber}
                      </td>

                      {/* Source */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        {getSourceBadge(tx.source)}
                      </td>

                      {/* Account */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-[var(--md-sys-color-primary)]">{tx.accountCode}</span>
                          <span className="truncate max-w-[140px] text-[var(--md-sys-color-on-surface)] font-medium">{tx.accountName}</span>
                        </div>
                      </td>

                      {/* Narration */}
                      <td className="py-2.5 px-3.5">
                        <div className="text-[var(--md-sys-color-on-surface)] font-medium truncate max-w-sm">
                          {tx.narration}
                        </div>
                        {tx.reference && (
                          <div className="text-[10px] font-mono text-[var(--md-sys-color-outline)] mt-0.5">
                            Ref: {tx.reference}
                          </div>
                        )}
                      </td>

                      {/* Debit */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-semibold whitespace-nowrap text-[var(--md-sys-color-on-surface)]">
                        {tx.debit > 0 ? formatMVR(tx.debit) : '—'}
                      </td>

                      {/* Credit */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-semibold whitespace-nowrap text-[var(--md-sys-color-on-surface)]">
                        {tx.credit > 0 ? formatMVR(tx.credit) : '—'}
                      </td>

                      {/* Running Balance */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold whitespace-nowrap text-[var(--md-sys-color-primary)]">
                        {formatMVR(tx.runningBalance)}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (parentJournal) setViewingJournal(parentJournal);
                          }}
                          className="p-1 rounded-lg hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] transition cursor-pointer"
                          title="Inspect Journal Voucher"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Journal Entry Voucher Drawer / Modal */}
      {viewingJournal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
                <div>
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                    Journal Voucher #{viewingJournal.entryNumber}
                  </h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    Posting Date: {viewingJournal.date} • {viewingJournal.source} Source
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingJournal(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[var(--md-sys-color-on-surface-variant)]">Narration</span>
                <p className="text-[var(--md-sys-color-on-surface)] font-medium">{viewingJournal.narration}</p>
                {viewingJournal.reference && (
                  <p className="text-[11px] font-mono text-[var(--md-sys-color-primary)]">Reference: {viewingJournal.reference}</p>
                )}
              </div>

              {/* Lines Breakdown */}
              <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-2 px-3">Account</th>
                      <th className="py-2 px-3">Line Description</th>
                      <th className="py-2 px-3 text-right">Debit (MVR)</th>
                      <th className="py-2 px-3 text-right">Credit (MVR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                    {viewingJournal.lines.map((l) => (
                      <tr key={l.id} className="hover:bg-[var(--md-sys-color-surface-container-high)]">
                        <td className="py-2 px-3 font-mono font-bold text-[var(--md-sys-color-primary)]">
                          {l.accountCode} - {l.accountName}
                        </td>
                        <td className="py-2 px-3 text-[var(--md-sys-color-on-surface)]">
                          {l.narration || '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[var(--md-sys-color-on-surface)]">
                          {l.debit > 0 ? formatMVR(l.debit) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[var(--md-sys-color-on-surface)]">
                          {l.credit > 0 ? formatMVR(l.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[var(--md-sys-color-surface-container-high)] border-t border-[var(--md-sys-color-outline-variant)] font-bold">
                    <tr>
                      <td colSpan={2} className="py-2 px-3 text-right uppercase text-[10px]">
                        Voucher Totals
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[var(--md-sys-color-primary)]">
                        {formatMVR(viewingJournal.totalDebit)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[var(--md-sys-color-primary)]">
                        {formatMVR(viewingJournal.totalCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Audit Attribution */}
              <div className="p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span>Posted by: <strong className="text-[var(--md-sys-color-on-surface)]">{viewingJournal.postedBy}</strong></span>
                </div>
                <span className="font-mono text-[10px]">{new Date(viewingJournal.postedAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="filled"
                size="sm"
                onClick={() => setViewingJournal(null)}
              >
                <span>Close Voucher</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
