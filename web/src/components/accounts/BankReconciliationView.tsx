import React, { useState, useMemo } from 'react';
import {
  Landmark,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Search,
  Sparkles,
  FileText,
  Plus,
  RefreshCw,
  X,
  Layers,
  Scale,
  DollarSign
} from 'lucide-react';
import {
  BankStatement,
  BankStatementLine,
  ERPReconciliationCandidate,
  parseBmlCsv,
  parseMibCsv,
  autoMatchStatementLines,
  createBankAdjustmentEntry,
  calculateReconciliationSummary,
} from '../../domain/bankReconciliation';
import { JournalEntry } from '../../domain/journals';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

interface BankAccountOption {
  code: string;
  name: string;
  bank: 'BML' | 'MIB' | 'CASH';
  accountNumber: string;
  currency: 'MVR' | 'USD';
}

const BANK_ACCOUNTS: BankAccountOption[] = [
  { code: '1010', name: 'Bank of Maldives (BML MVR)', bank: 'BML', accountNumber: '7730000148201', currency: 'MVR' },
  { code: '1020', name: 'Bank of Maldives (BML USD)', bank: 'BML', accountNumber: '7730000148202', currency: 'USD' },
  { code: '1030', name: 'Maldives Islamic Bank (MIB MVR)', bank: 'MIB', accountNumber: '9901000293810', currency: 'MVR' },
  { code: '1000', name: 'Main Operating Cash / Vault', bank: 'CASH', accountNumber: 'VAULT-01', currency: 'MVR' },
];

export const BankReconciliationView: React.FC<{
  journals: JournalEntry[];
  candidateTransactions?: ERPReconciliationCandidate[];
  onAddAdjustmentJournal?: (entry: JournalEntry) => void;
}> = ({ journals, candidateTransactions, onAddAdjustmentJournal }) => {
  const { invoices, payments, expenses, formatMVR, currentTenant } = useERP();

  const [selectedAccount, setSelectedAccount] = useState<BankAccountOption>(BANK_ACCOUNTS[0]);
  const [statement, setStatement] = useState<BankStatement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'unreconciled' | 'matched'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Adjustment modal state
  const [selectedLineForAdjustment, setSelectedLineForAdjustment] = useState<BankStatementLine | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'bank_fee' | 'interest_income'>('bank_fee');
  const [adjustmentNarration, setAdjustmentNarration] = useState('');

  // Transform ERP transactions into candidate reconciliation items
  const erpCandidates: ERPReconciliationCandidate[] = useMemo(() => {
    if (candidateTransactions && candidateTransactions.length > 0) {
      return candidateTransactions;
    }
    const list: ERPReconciliationCandidate[] = [];

    // Payments received from customers (Bank Debits in Accounting = Inflow)
    for (const p of payments) {
      list.push({
        id: `erp-pay-${p.id}`,
        type: 'payment_receipt',
        date: p.paymentDate || p.paymentDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        reference: p.paymentNumber || p.id.slice(-6).toUpperCase(),
        narration: `Payment from ${p.customerName || 'Customer'}`,
        amount: p.amount,
        isDebit: false, // Bank Statement Credit (Inflow)
        reconciled: false,
      });
    }

    // Operational expenses (Bank Credits in Accounting = Outflow)
    for (const exp of expenses) {
      list.push({
        id: `erp-exp-${exp.id}`,
        type: 'expense',
        date: exp.date || new Date().toISOString().slice(0, 10),
        reference: exp.receiptRef || exp.category || 'EXPENSE',
        narration: exp.description || exp.category,
        amount: exp.amount,
        isDebit: true, // Bank Statement Debit (Outflow)
        reconciled: false,
      });
    }

    return list;
  }, [payments, expenses]);

  // Calculate ERP Ledger Balance for the selected bank account from Journals
  const erpLedgerBalance = useMemo(() => {
    let balance = 0;
    for (const j of journals) {
      for (const line of j.lines) {
        if (line.accountCode === selectedAccount.code) {
          balance += (line.debit || 0) - (line.credit || 0);
        }
      }
    }
    return balance;
  }, [journals, selectedAccount]);

  // Calculate Summary & Variance
  const summary = useMemo(() => {
    if (!statement) return null;
    return calculateReconciliationSummary(statement, erpLedgerBalance, 0, 0);
  }, [statement, erpLedgerBalance]);

  // Handle CSV file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let parsed: BankStatement;
        if (selectedAccount.bank === 'MIB') {
          parsed = parseMibCsv(text, selectedAccount.code);
        } else {
          parsed = parseBmlCsv(text, selectedAccount.code);
        }
        setStatement(parsed);
      } catch (err: any) {
        setUploadError(err.message || 'Failed to parse bank statement CSV');
      }
    };
    reader.readAsText(file);
  };

  // Load sample demo statement
  const handleLoadSampleStatement = () => {
    const sampleBml = `
Date,Description,Debit,Credit,Balance,Reference
2026-08-01,Opening Balance,0,0,150000.00,OPENING
2026-08-05,BML Transfer IN - Client Settlement,0,25000.00,175000.00,BML-TXN-99120
2026-08-10,Supplier Wire - Paint Supplies,12000.00,0,163000.00,WIRE-SUP-001
2026-08-15,Monthly Account Fee,150.00,0,162850.00,FEE-AUG-2026
2026-08-25,Deposit Account Profit,0,450.00,163300.00,INT-AUG-2026
`.trim();

    try {
      const parsed = parseBmlCsv(sampleBml, selectedAccount.code);
      setStatement(parsed);
      setUploadError(null);
    } catch (err: any) {
      setUploadError(err.message);
    }
  };

  // Run Auto-Match
  const handleRunAutoMatch = () => {
    if (!statement) return;
    const { matchedPairs } = autoMatchStatementLines(statement.lines, erpCandidates);
    if (matchedPairs.length === 0) return;

    const updatedLines = statement.lines.map((line) => {
      const match = matchedPairs.find((m) => m.statementLineId === line.id);
      if (match) {
        return {
          ...line,
          status: 'matched' as const,
          matchedTransactionId: match.candidateId,
          confidenceScore: match.confidence,
        };
      }
      return line;
    });

    setStatement({
      ...statement,
      lines: updatedLines,
    });
  };

  // Manual Toggle Clear
  const handleToggleClear = (lineId: string) => {
    if (!statement) return;
    const updated = statement.lines.map((l) => {
      if (l.id === lineId) {
        return {
          ...l,
          status: (l.status === 'unreconciled' ? 'manual_cleared' : 'unreconciled') as any,
        };
      }
      return l;
    });
    setStatement({ ...statement, lines: updated });
  };

  // Create & post direct adjustment
  const handlePostAdjustment = () => {
    if (!selectedLineForAdjustment || !statement) return;

    const entry = createBankAdjustmentEntry({
      statementLine: selectedLineForAdjustment,
      bankAccountCode: selectedAccount.code,
      adjustmentType,
      narration: adjustmentNarration,
      tenantId: currentTenant?.id || 'tenant-starq',
    });

    if (onAddAdjustmentJournal) {
      onAddAdjustmentJournal(entry);
    }

    // Mark line as booked
    const updatedLines = statement.lines.map((l) => {
      if (l.id === selectedLineForAdjustment.id) {
        return {
          ...l,
          status: 'booked_adjustment' as const,
          adjustmentJournalId: entry.id,
        };
      }
      return l;
    });

    setStatement({ ...statement, lines: updatedLines });
    setSelectedLineForAdjustment(null);
    setAdjustmentNarration('');
  };

  const filteredLines = useMemo(() => {
    if (!statement) return [];
    return statement.lines.filter((l) => {
      if (filterMode === 'unreconciled' && l.status !== 'unreconciled') return false;
      if (filterMode === 'matched' && l.status === 'unreconciled') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          l.description.toLowerCase().includes(q) ||
          l.reference.toLowerCase().includes(q) ||
          l.date.includes(q)
        );
      }
      return true;
    });
  }, [statement, filterMode, searchQuery]);

  return (
    <div className="space-y-6 finance-light-compat">
      {/* 1. Header & Bank Account Selector */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Landmark size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Bank & Cash Ledger Reconciliation
                <Badge variant="neutral">BML / MIB Automated Engine</Badge>
              </h2>
              <p className="text-xs text-slate-400">
                Upload official bank statement CSVs, auto-match payments & expenses, and book direct adjusting journals.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedAccount.code}
              onChange={(e) => {
                const found = BANK_ACCOUNTS.find((a) => a.code === e.target.value);
                if (found) setSelectedAccount(found);
              }}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-medium focus:outline-none focus:border-sky-500"
            >
              {BANK_ACCOUNTS.map((acc) => (
                <option key={acc.code} value={acc.code}>
                  {acc.code} · {acc.name} ({acc.accountNumber})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* KPI Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Statement Ending Balance</span>
            <div className="text-base font-bold text-white font-mono">
              {statement ? formatMVR(statement.closingBalance) : 'Rf 0.00'}
            </div>
            <div className="text-[10px] text-slate-500">From uploaded bank CSV</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">General Ledger Balance</span>
            <div className="text-base font-bold text-sky-300 font-mono">
              {formatMVR(erpLedgerBalance)}
            </div>
            <div className="text-[10px] text-slate-500">Account #{selectedAccount.code}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Adjusted Bank Balance</span>
            <div className="text-base font-bold text-purple-300 font-mono">
              {summary ? formatMVR(summary.adjustedBankBalance) : formatMVR(erpLedgerBalance)}
            </div>
            <div className="text-[10px] text-slate-500">Statement + Deposits - Cheques</div>
          </div>

          <div className={`p-3.5 rounded-xl border space-y-1 ${
            summary?.isBalanced
              ? 'bg-emerald-950/20 border-emerald-500/30'
              : 'bg-amber-950/20 border-amber-500/30'
          }`}>
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Reconciliation Variance</span>
            <div className={`text-base font-bold font-mono ${
              summary?.isBalanced ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {summary ? formatMVR(summary.variance) : 'Rf 0.00'}
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              {summary?.isBalanced ? (
                <>
                  <CheckCircle2 size={11} className="text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">100% Balanced</span>
                </>
              ) : (
                <>
                  <AlertCircle size={11} className="text-amber-400" />
                  <span>Unreconciled Difference</span>
                </>
              )}
            </div>
          </div>
        </div>
      </Surface>

      {/* 2. Upload / Demo Statement Strip */}
      {!statement ? (
        <Surface className="p-10 rounded-2xl border-2 border-dashed border-slate-800 bg-[#0a0f1d] text-center space-y-4">
          <div className="inline-flex p-4 rounded-full bg-sky-500/10 text-sky-400">
            <Upload size={28} />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-bold text-white">Upload Bank Statement CSV</h3>
            <p className="text-xs text-slate-400">
              Upload standard {selectedAccount.bank} CSV exports (Date, Description, Debit, Credit, Balance, Reference).
            </p>
          </div>

          {uploadError && (
            <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-300 text-xs max-w-md mx-auto">
              {uploadError}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <label className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs cursor-pointer shadow-md transition inline-flex items-center gap-2">
              <Upload size={14} />
              <span>Select CSV File</span>
              <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
            </label>

            <button
              type="button"
              onClick={handleLoadSampleStatement}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition inline-flex items-center gap-2 cursor-pointer"
            >
              <Sparkles size={14} className="text-amber-400" />
              <span>Load Sample BML Statement</span>
            </button>
          </div>
        </Surface>
      ) : (
        /* 3. Side-by-Side Reconciliation Workspace */
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunAutoMatch}
                className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={13} className="text-amber-300" />
                <span>Auto-Match High Confidence</span>
              </button>

              <div className="flex p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    filterMode === 'all' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Lines ({statement.lines.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('unreconciled')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    filterMode === 'unreconciled' ? 'bg-slate-800 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Unreconciled ({summary?.unreconciledLinesCount || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('matched')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    filterMode === 'matched' ? 'bg-slate-800 text-emerald-300 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Matched ({summary?.reconciledLinesCount || 0})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter statement lines..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500 w-52"
                />
              </div>

              <button
                type="button"
                onClick={() => setStatement(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition cursor-pointer"
              >
                Clear Statement
              </button>
            </div>
          </div>

          {/* Statement Lines Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0a0f1d]">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-mono text-slate-400 uppercase">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Description & Reference</th>
                  <th className="py-2.5 px-3 text-right">Debit (Out)</th>
                  <th className="py-2.5 px-3 text-right">Credit (In)</th>
                  <th className="py-2.5 px-3 text-right">Balance</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredLines.map((line) => {
                  const isMatched = line.status === 'matched';
                  const isAdjusted = line.status === 'booked_adjustment';
                  const isCleared = line.status === 'manual_cleared';

                  return (
                    <tr key={line.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">{line.date}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-white">{line.description}</div>
                        <div className="font-mono text-[10px] text-slate-500">Ref: {line.reference}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-300">
                        {line.debit > 0 ? formatMVR(line.debit) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-300">
                        {line.credit > 0 ? formatMVR(line.credit) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                        {formatMVR(line.balance)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isMatched ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                            <CheckCircle2 size={10} /> Auto-Matched
                          </span>
                        ) : isAdjusted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 text-[10px] font-bold border border-purple-500/30">
                            <FileText size={10} /> Adjustment Booked
                          </span>
                        ) : isCleared ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 text-[10px] font-bold border border-sky-500/30">
                            <CheckCircle2 size={10} /> Manually Cleared
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                            <Clock size={10} /> Unreconciled
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleClear(line.id)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold border border-slate-700 transition cursor-pointer"
                          >
                            {isCleared ? 'Unclear' : 'Clear'}
                          </button>

                          {line.status === 'unreconciled' && (line.debit > 0 || line.credit > 0) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLineForAdjustment(line);
                                setAdjustmentType(line.debit > 0 ? 'bank_fee' : 'interest_income');
                              }}
                              className="px-2 py-1 rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-[10px] font-semibold border border-purple-500/40 transition cursor-pointer"
                            >
                              Book Adj
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Direct Adjustment Booking Modal */}
      {selectedLineForAdjustment && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedLineForAdjustment(null)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-purple-400" />
                <h3 className="font-bold text-sm text-white">Book Bank Adjustment Journal</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLineForAdjustment(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Statement Line:</span>
                <div className="text-white font-medium">{selectedLineForAdjustment.description}</div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-1">
                  <span>Date: {selectedLineForAdjustment.date}</span>
                  <span className="font-bold text-white">
                    Amount: {formatMVR(selectedLineForAdjustment.debit || selectedLineForAdjustment.credit)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Adjustment Type</label>
                <select
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="bank_fee">Bank Fee / Service Charge (Account #6300)</option>
                  <option value="interest_income">Interest / Profit Income (Account #8000)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Narration / Note</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly BML Account Maintenance Fee"
                  value={adjustmentNarration}
                  onChange={(e) => setAdjustmentNarration(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-400">
                • Debit: <strong>{adjustmentType === 'bank_fee' ? '6300 Bank Fees' : `${selectedAccount.code} Bank`}</strong> ({formatMVR(selectedLineForAdjustment.debit || selectedLineForAdjustment.credit)})<br />
                • Credit: <strong>{adjustmentType === 'bank_fee' ? `${selectedAccount.code} Bank` : '8000 Interest Income'}</strong> ({formatMVR(selectedLineForAdjustment.debit || selectedLineForAdjustment.credit)})
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedLineForAdjustment(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePostAdjustment}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition cursor-pointer shadow-md"
              >
                Post Balanced Journal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
