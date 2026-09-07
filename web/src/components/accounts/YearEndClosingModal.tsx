import React, { useState, useMemo } from 'react';
import { X, Sparkles, Scale, AlertCircle, ArrowRight, CheckCircle2, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { Surface, Button } from '../ui';
import { JournalEntry } from '../../domain/journals';
import { AccountRecord } from '../../domain/accounts';
import { AccountingPeriod } from '../../domain/periods';
import { previewYearEndClose, executeYearEndClose } from '../../lib/periodClosing';

interface YearEndClosingModalProps {
  isOpen: boolean;
  onClose: () => void;
  fiscalYear: number;
  journals: JournalEntry[];
  accounts: AccountRecord[];
  periods: AccountingPeriod[];
  onClosingExecuted: (result: {
    closingJournal: JournalEntry;
    updatedPeriods: AccountingPeriod[];
    netIncome: number;
  }) => void;
  formatMVR: (amount: number) => string;
}

export const YearEndClosingModal: React.FC<YearEndClosingModalProps> = ({
  isOpen,
  onClose,
  fiscalYear,
  journals,
  accounts,
  periods,
  onClosingExecuted,
  formatMVR,
}) => {
  if (!isOpen) return null;

  const [selectedYear, setSelectedYear] = useState<number>(fiscalYear);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    try {
      return previewYearEndClose({
        fiscalYear: selectedYear,
        journals,
        accounts,
      });
    } catch {
      return null;
    }
  }, [selectedYear, journals, accounts]);

  const handleExecute = () => {
    setError(null);
    try {
      const result = executeYearEndClose({
        fiscalYear: selectedYear,
        journals,
        accounts,
        periods,
        closedBy: 'Financial Controller',
      });

      onClosingExecuted(result);
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      data-testid="year-end-closing-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                Fiscal Year-End Closing Wizard (FY{selectedYear})
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Zeroes temporary revenue & expense accounts and rolls net balance to Retained Earnings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Wizard Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 erp-scroll-region text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* KPI Roll-Forward Summary Banner */}
          {preview && (
            <div className="grid grid-cols-3 gap-3 p-4 bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-[var(--md-sys-color-on-surface-variant)]">Total Operating Revenue</span>
                <div className="font-mono text-sm font-bold text-emerald-400">{formatMVR(preview.totalRevenue)}</div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-[var(--md-sys-color-on-surface-variant)]">Total COGS & Opex</span>
                <div className="font-mono text-sm font-bold text-rose-400">{formatMVR(preview.totalExpenses)}</div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-[var(--md-sys-color-on-surface-variant)]">Net Fiscal Year Income</span>
                <div className="font-mono text-sm font-bold text-[var(--md-sys-color-primary)]">{formatMVR(preview.netIncome)}</div>
              </div>
            </div>
          )}

          {/* Roll Forward Accounting Explanation */}
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 space-y-2">
            <div className="font-bold flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-purple-400">
              <Scale size={14} /> Double-Entry Year-End Closing Mechanism
            </div>
            <p className="text-[11px] leading-relaxed text-purple-200/90">
              Executing this wizard posts formal journal voucher <span className="font-mono font-bold text-white">JE-CLOSE-{selectedYear}</span> as of <span className="font-mono font-bold text-white">{selectedYear}-12-31</span>. It debits all revenue accounts, credits all expense accounts, and transfers the net balance ({preview ? formatMVR(preview.netIncome) : '0.00'}) into equity account <span className="font-mono font-bold text-white">3200 - Retained Earnings</span>. All 12 monthly periods for FY{selectedYear} will be marked as permanently <span className="font-mono font-bold text-white">CLOSED</span>.
            </p>
          </div>

          {/* Closing Voucher Preview Table */}
          {preview && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
                  Generated Closing Journal Entries Preview ({preview.closingLines.length} lines)
                </span>
                <span className="font-mono text-[10px] text-slate-400">Voucher: JE-CLOSE-{selectedYear}</span>
              </div>

              <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--md-sys-color-outline-variant)]">
                    <tr>
                      <th className="p-2.5 pl-3">Account</th>
                      <th className="p-2.5">Narration</th>
                      <th className="p-2.5 text-right w-28">Debit (MVR)</th>
                      <th className="p-2.5 text-right w-28">Credit (MVR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                    {preview.closingLines.map((line) => (
                      <tr key={line.id} className="hover:bg-[var(--md-sys-color-surface-container)]">
                        <td className="p-2 pl-3 font-bold text-[var(--md-sys-color-primary)]">
                          {line.accountCode} - {line.accountName}
                        </td>
                        <td className="p-2 text-slate-400 text-[11px] font-sans">
                          {line.narration}
                        </td>
                        <td className="p-2 text-right text-sky-400 font-bold">
                          {line.debit > 0 ? formatMVR(line.debit) : '—'}
                        </td>
                        <td className="p-2 text-right text-emerald-400 font-bold">
                          {line.credit > 0 ? formatMVR(line.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-center justify-between text-xs">
          <span className="text-[var(--md-sys-color-on-surface-variant)]">
            Irreversible fiscal action. Requires Financial Controller authority.
          </span>
          <div className="flex gap-3">
            <Button variant="outlined" size="md" onClick={onClose}>
              <span>Cancel</span>
            </Button>
            <Button variant="filled" size="md" onClick={handleExecute}>
              <span>Execute Year-End Close</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
