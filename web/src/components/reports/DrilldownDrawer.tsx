import React from 'react';
import { X, BookOpen, ExternalLink, Calendar, User, FileText, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Surface, Button } from '../ui';
import { JournalEntry, JournalLine } from '../../domain/journals';

export interface DrilldownAccountDetails {
  code: string;
  name: string;
  accountClass: string;
  totalAmount: number;
}

interface DrilldownDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  account: DrilldownAccountDetails | null;
  journals: JournalEntry[];
  formatMVR: (amount: number) => string;
}

export const DrilldownDrawer: React.FC<DrilldownDrawerProps> = ({
  isOpen,
  onClose,
  account,
  journals,
  formatMVR,
}) => {
  if (!isOpen || !account) return null;

  // Extract all lines posting to this account code across all journals
  const contributingLines: Array<{
    journal: JournalEntry;
    line: JournalLine;
  }> = [];

  journals.forEach((j) => {
    j.lines.forEach((l) => {
      if (l.accountCode === account.code) {
        contributingLines.push({ journal: j, line: l });
      }
    });
  });

  // Sort by date descending
  contributingLines.sort((a, b) => b.journal.date.localeCompare(a.journal.date));

  const totalDebits = contributingLines.reduce((sum, item) => sum + item.line.debit, 0);
  const totalCredits = contributingLines.reduce((sum, item) => sum + item.line.credit, 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end transition-opacity"
      data-testid="pnl-drilldown-drawer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[var(--md-sys-color-surface)] border-l border-[var(--md-sys-color-outline-variant)] h-full flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)] border border-[var(--md-sys-color-primary)]">
                {account.code}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
                {account.accountClass}
              </span>
            </div>
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
              {account.name}
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Itemized General Ledger journal postings contributing to P&L line total
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Account Activity Summary Banner */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-[var(--md-sys-color-surface-container-low)] border-b border-[var(--md-sys-color-outline-variant)] text-xs">
          <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
            <span className="text-[10px] uppercase font-bold text-[var(--md-sys-color-on-surface-variant)]">Total Debits</span>
            <div className="font-mono font-bold text-sky-400 text-sm">{formatMVR(totalDebits)}</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
            <span className="text-[10px] uppercase font-bold text-[var(--md-sys-color-on-surface-variant)]">Total Credits</span>
            <div className="font-mono font-bold text-emerald-400 text-sm">{formatMVR(totalCredits)}</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
            <span className="text-[10px] uppercase font-bold text-[var(--md-sys-color-on-surface-variant)]">Net Line Contribution</span>
            <div className="font-mono font-bold text-[var(--md-sys-color-primary)] text-sm">{formatMVR(account.totalAmount)}</div>
          </div>
        </div>

        {/* Contributing Journal Lines List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 erp-scroll-region">
          {contributingLines.length === 0 ? (
            <div className="py-16 text-center text-[var(--md-sys-color-on-surface-variant)] space-y-2">
              <BookOpen className="w-8 h-8 mx-auto opacity-40 text-[var(--md-sys-color-primary)]" />
              <p className="text-xs">No individual journal lines found for this account.</p>
            </div>
          ) : (
            contributingLines.map(({ journal, line }, idx) => (
              <div
                key={`${journal.id}-${line.id}-${idx}`}
                className="p-3.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] hover:border-[var(--md-sys-color-primary)] transition space-y-2"
              >
                <div className="flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[var(--md-sys-color-primary)]">
                      {journal.entryNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]">
                      {journal.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)] font-mono text-[11px]">
                    <Calendar size={12} />
                    <span>{journal.date}</span>
                  </div>
                </div>

                <div className="text-xs text-[var(--md-sys-color-on-surface)] font-medium">
                  {line.narration || journal.narration}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[var(--md-sys-color-outline-variant)]/60 text-xs">
                  <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1 font-mono">
                    <User size={10} />
                    <span>Posted by {journal.postedBy || 'System'}</span>
                  </div>

                  <div className="font-mono font-bold">
                    {line.debit > 0 ? (
                      <span className="text-sky-400">DR +{formatMVR(line.debit)}</span>
                    ) : (
                      <span className="text-emerald-400">CR +{formatMVR(line.credit)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-center justify-between text-xs">
          <span className="text-[var(--md-sys-color-on-surface-variant)]">
            Showing {contributingLines.length} contributing transactions
          </span>
          <Button variant="filled" size="sm" onClick={onClose}>
            <span>Close Drilldown</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
