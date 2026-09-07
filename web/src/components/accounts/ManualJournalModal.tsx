import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Scale, AlertCircle, CheckCircle2, FileText, Info, Sparkles } from 'lucide-react';
import { postingControlFor } from '../../domain/postingControl';
import { Modal } from '../common/Modal';
import { Button, Badge, Surface } from '../ui';
import { AccountRecord, CLASS_LABELS } from '../../domain/accounts';
import { JournalLine, JournalEntry, validateJournalEntry } from '../../domain/journals';
import { useERP } from '../../context/ERPContext';
import { useAuth } from '../../context/AuthContext';

interface ManualJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountRecord[];
  onSave: (entry: JournalEntry) => void;
}

interface DraftLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: any;
  narration: string;
  debit: string;
  credit: string;
}

export const ManualJournalModal: React.FC<ManualJournalModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onSave,
}) => {
  const { currentTenant, currentBook, formatMVR } = useERP();
  const { session } = useAuth();

  const activeAccounts = useMemo(() => {
    return accounts.filter((a) => a.status === 'ACTIVE');
  }, [accounts]);

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');

  // SERP-345: default to accounts a user may actually POST to. This modal used to
  // default to activeAccounts[0] and [1], which are the class root (1000 Assets)
  // and a grouping (1100 Current Assets) — both headers that hold no balance.
  // The posting gate now rejects those, and it was right to: the default itself
  // was the defect.
  const postableAccounts = useMemo(
    () => activeAccounts.filter((a) => postingControlFor(a, accounts) === 'postable'),
    [activeAccounts, accounts],
  );

  const [lines, setLines] = useState<DraftLine[]>([
    {
      id: 'line-1',
      accountId: postableAccounts[0]?.id || '',
      accountCode: postableAccounts[0]?.code || '',
      accountName: postableAccounts[0]?.name || '',
      accountClass: postableAccounts[0]?.accountClass || 'ASSET',
      narration: '',
      debit: '',
      credit: '',
    },
    {
      id: 'line-2',
      accountId: postableAccounts[1]?.id || '',
      accountCode: postableAccounts[1]?.code || '',
      accountName: postableAccounts[1]?.name || '',
      accountClass: postableAccounts[1]?.accountClass || 'REVENUE',
      narration: '',
      debit: '',
      credit: '',
    },
  ]);

  const validation = useMemo(() => {
    return validateJournalEntry(
      lines.map((l) => ({
        accountId: l.accountId,
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        narration: l.narration,
      }))
    );
  }, [lines]);

  const handleAccountChange = (index: number, accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    setLines((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        accountClass: acc.accountClass,
      };
      return next;
    });
  };

  const handleAmountChange = (index: number, field: 'debit' | 'credit', value: string) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: value,
        // If user types in debit, clear credit on the same line to avoid invalid double inputs
        ...(field === 'debit' && value ? { credit: '' } : {}),
        ...(field === 'credit' && value ? { debit: '' } : {}),
      };
      return next;
    });
  };

  const handleNarrationChange = (index: number, value: string) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], narration: value };
      return next;
    });
  };

  const handleAddLine = () => {
    const defaultAcc = activeAccounts[0];
    setLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}`,
        accountId: defaultAcc?.id || '',
        accountCode: defaultAcc?.code || '',
        accountName: defaultAcc?.name || '',
        accountClass: defaultAcc?.accountClass || 'ASSET',
        narration: '',
        debit: '',
        credit: '',
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAutoBalance = () => {
    const totalD = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const totalC = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    const diff = totalD - totalC;

    if (Math.abs(diff) < 0.01) return;

    if (diff > 0) {
      // Need more credits on the last line
      setLines((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        next[lastIdx] = {
          ...next[lastIdx],
          credit: (parseFloat(next[lastIdx].credit || '0') + diff).toFixed(2),
          debit: '',
        };
        return next;
      });
    } else {
      // Need more debits on the last line
      const neededDebit = Math.abs(diff);
      setLines((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        next[lastIdx] = {
          ...next[lastIdx],
          debit: (parseFloat(next[lastIdx].debit || '0') + neededDebit).toFixed(2),
          credit: '',
        };
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.isValid) return;

    const actorName = session?.name || session?.name || 'Authorized Finance Officer';

    const journalLines: JournalLine[] = lines.map((l, idx) => ({
      id: `jl-${Date.now()}-${idx}`,
      accountId: l.accountId,
      accountCode: l.accountCode,
      accountName: l.accountName,
      accountClass: l.accountClass,
      narration: l.narration.trim() || narration.trim(),
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
    }));

    const entryNumber = `JE-MAN-${Date.now().toString().slice(-6)}`;

    const newJournal: JournalEntry = {
      id: `je-${Date.now()}`,
      entryNumber,
      date,
      source: 'MANUAL',
      reference: reference.trim() || undefined,
      narration: narration.trim() || 'Manual General Ledger Adjustment',
      lines: journalLines,
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      isBalanced: true,
      postedBy: actorName,
      postedAt: new Date().toISOString(),
      tenantId: currentTenant.id,
      bookId: currentBook?.id,
      status: 'POSTED',
    };

    onSave(newJournal);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Post General Ledger Journal Entry"
      subtitle="Authoritative double-entry adjustment with Σ Debits = Σ Credits validation"
      maxWidth="4xl"
      actions={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-xs">
            {validation.isValid ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 size={15} />
                <span>Zero Variance Pass (MVR 0.00)</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <AlertCircle size={15} />
                <span>Unbalanced (Δ {formatMVR(validation.variance)})</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] transition cursor-pointer"
            >
              Cancel
            </button>
            <Button
              variant="filled"
              size="sm"
              data-testid="post-journal-btn"
              disabled={!validation.isValid}
              onClick={handleSubmit}
              icon={<Scale size={14} />}
            >
              <span>Post Journal Entry</span>
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header Metadata Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
              Posting Date *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
              Reference / Voucher # (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. JV-2026-0042, Audit-Adj"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
              General Narration *
            </label>
            <input
              type="text"
              required
              data-testid="journal-narration-input"
              placeholder="Purpose of this adjustment..."
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
            />
          </div>
        </div>

        {/* Multi-Line Entry Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
              Journal Lines (Minimum 2 Lines)
            </span>
            <div className="flex items-center gap-2">
              {validation.variance > 0 && (
                <button
                  type="button"
                  data-testid="auto-balance-btn"
                  onClick={handleAutoBalance}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)] border border-[var(--md-sys-color-primary)] hover:opacity-90 transition cursor-pointer"
                >
                  <Sparkles size={12} />
                  <span>Auto-Balance ({formatMVR(validation.variance)})</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleAddLine}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] transition cursor-pointer"
              >
                <Plus size={12} />
                <span>Add Line</span>
              </button>
            </div>
          </div>

          <div className="erp-scroll-region overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider whitespace-nowrap">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 w-72">Account (Code & Name)</th>
                  <th className="py-2.5 px-3">Line Description</th>
                  <th className="py-2.5 px-3 w-32 text-right">Debit ({currentTenant.currency || 'MVR'})</th>
                  <th className="py-2.5 px-3 w-32 text-right">Credit ({currentTenant.currency || 'MVR'})</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                {lines.map((line, idx) => (
                  <tr key={line.id} className="hover:bg-[var(--md-sys-color-surface-container)] transition-colors">
                    <td className="py-2 px-3 text-center text-xs font-mono text-[var(--md-sys-color-outline)]">
                      {idx + 1}
                    </td>

                    {/* Account Selector */}
                    <td className="py-2 px-3">
                      <select
                        value={line.accountId}
                        onChange={(e) => handleAccountChange(idx, e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg text-xs bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer"
                      >
                        {(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const).map((cls) => {
                          const classAccs = activeAccounts.filter((a) => a.accountClass === cls);
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
                    </td>

                    {/* Line Narration */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        placeholder="Line detail (optional)"
                        value={line.narration}
                        onChange={(e) => handleNarrationChange(idx, e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg text-xs bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                      />
                    </td>

                    {/* Debit Input */}
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        data-testid={`line-debit-${idx}`}
                        placeholder="0.00"
                        value={line.debit}
                        onChange={(e) => handleAmountChange(idx, 'debit', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg text-xs font-mono font-bold text-right bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                      />
                    </td>

                    {/* Credit Input */}
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        data-testid={`line-credit-${idx}`}
                        placeholder="0.00"
                        value={line.credit}
                        onChange={(e) => handleAmountChange(idx, 'credit', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg text-xs font-mono font-bold text-right bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                      />
                    </td>

                    {/* Remove Action */}
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        disabled={lines.length <= 2}
                        onClick={() => handleRemoveLine(idx)}
                        className={`p-1 rounded-lg transition ${
                          lines.length <= 2
                            ? 'text-[var(--md-sys-color-outline)] opacity-30 cursor-not-allowed'
                            : 'text-rose-400 hover:bg-rose-500/10 cursor-pointer'
                        }`}
                        title={lines.length <= 2 ? 'Minimum 2 lines required' : 'Remove Line'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Total Footer Row */}
              <tfoot className="bg-[var(--md-sys-color-surface-container-high)] border-t-2 border-[var(--md-sys-color-outline-variant)] font-bold">
                <tr>
                  <td colSpan={3} className="py-2.5 px-3 text-right uppercase tracking-wider text-[11px] text-[var(--md-sys-color-on-surface)]">
                    Totals & Balance Check
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-sm text-[var(--md-sys-color-primary)] font-bold">
                    {formatMVR(validation.totalDebit)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-sm text-[var(--md-sys-color-primary)] font-bold">
                    {formatMVR(validation.totalCredit)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Validation Errors Box */}
        {validation.errors.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertCircle size={14} />
              <span>Please resolve the following before posting:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1 opacity-90">
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Audit Attribution Footer Note */}
        <div className="p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          <div className="flex items-center gap-1.5">
            <Info size={13} className="text-[var(--md-sys-color-primary)]" />
            <span>
              Audit Attribution: Posted by <strong className="text-[var(--md-sys-color-on-surface)]">{session?.name || session?.name || 'Authorized Officer'}</strong>
            </span>
          </div>
          <span className="font-mono text-[10px]">Contract: Immutable Double-Entry Ledger</span>
        </div>
      </form>
    </Modal>
  );
};
