import React, { useState } from 'react';
import {
  Calendar,
  Lock,
  Unlock,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Clock,
  History,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Surface, Button } from '../ui';
import { Badge } from '../common/Badge';
import { AccountingPeriod, lockPeriod, unlockPeriod } from '../../domain/periods';
import { JournalEntry } from '../../domain/journals';
import { AccountRecord } from '../../domain/accounts';
import { UnlockPeriodModal } from './UnlockPeriodModal';
import { YearEndClosingModal } from './YearEndClosingModal';

interface PeriodManagementViewProps {
  periods: AccountingPeriod[];
  onPeriodsUpdated: (periods: AccountingPeriod[]) => void;
  journals: JournalEntry[];
  accounts: AccountRecord[];
  onClosingJournalPosted: (journal: JournalEntry) => void;
  formatMVR: (amount: number) => string;
}

export const PeriodManagementView: React.FC<PeriodManagementViewProps> = ({
  periods,
  onPeriodsUpdated,
  journals,
  accounts,
  onClosingJournalPosted,
  formatMVR,
}) => {
  const [selectedPeriodToUnlock, setSelectedPeriodToUnlock] = useState<AccountingPeriod | null>(null);
  const [isYearEndModalOpen, setIsYearEndModalOpen] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<AccountingPeriod | null>(null);

  const openPeriodsCount = periods.filter((p) => p.status === 'OPEN').length;
  const lockedPeriodsCount = periods.filter((p) => p.status === 'LOCKED').length;
  const closedPeriodsCount = periods.filter((p) => p.status === 'CLOSED').length;

  const handleLock = (periodId: string) => {
    try {
      const updated = lockPeriod(periodId, periods, 'Financial Controller');
      onPeriodsUpdated(updated);
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  const handleUnlockConfirmed = (periodId: string, reason: string) => {
    try {
      const updated = unlockPeriod(periodId, periods, reason, 'Financial Controller');
      onPeriodsUpdated(updated);
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  const handleClosingExecuted = (result: {
    closingJournal: JournalEntry;
    updatedPeriods: AccountingPeriod[];
    netIncome: number;
  }) => {
    onPeriodsUpdated(result.updatedPeriods);
    onClosingJournalPosted(result.closingJournal);
  };

  return (
    <div className="space-y-6" data-testid="period-management-view">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Surface variant="filled" level={1} padding="sm" className="h-[104px] flex flex-col justify-between">
          <div className="flex items-center justify-between h-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] truncate">
              Open Accounting Periods
            </span>
            <div className="p-1 rounded-md bg-emerald-500/15 text-emerald-400">
              <Calendar size={13} />
            </div>
          </div>
          <div className="my-auto leading-none font-mono text-2xl font-bold text-emerald-400">
            {openPeriodsCount} / {periods.length}
          </div>
          <div className="h-3.5 leading-none text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)] truncate">
            Active for transaction posting
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" className="h-[104px] flex flex-col justify-between">
          <div className="flex items-center justify-between h-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] truncate">
              Locked Closed Months
            </span>
            <div className="p-1 rounded-md bg-amber-500/15 text-amber-400">
              <Lock size={13} />
            </div>
          </div>
          <div className="my-auto leading-none font-mono text-2xl font-bold text-amber-300">
            {lockedPeriodsCount}
          </div>
          <div className="h-3.5 leading-none text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)] truncate">
            Protected against backdated edits
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" className="h-[104px] flex flex-col justify-between">
          <div className="flex items-center justify-between h-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] truncate">
              Fiscal Year Status
            </span>
            <div className="p-1 rounded-md bg-purple-500/15 text-purple-400">
              <Sparkles size={13} />
            </div>
          </div>
          <div className="my-auto leading-none font-mono text-2xl font-bold text-[var(--md-sys-color-primary)]">
            {closedPeriodsCount === 12 ? 'CLOSED' : 'ACTIVE FY2026'}
          </div>
          <div className="h-3.5 leading-none text-[11px] font-mono text-purple-300 truncate">
            {closedPeriodsCount === 12 ? 'Rolled into Retained Earnings' : 'Ready for Month-End Close'}
          </div>
        </Surface>
      </div>

      {/* Main Period Management Table */}
      <Surface variant="filled" level={1} padding="md" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
              FY2026 Accounting Periods & Lock Controls
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Enforces period locking against backdated edits and controls fiscal year-end roll-forward
            </p>
          </div>
          <Button
            variant="filled"
            size="sm"
            onClick={() => setIsYearEndModalOpen(true)}
            icon={<Sparkles size={14} />}
            data-testid="open-year-end-modal-btn"
          >
            <span>Year-End Close Wizard</span>
          </Button>
        </div>

        <div className="erp-scroll-region overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--md-sys-color-outline-variant)]">
              <tr>
                <th className="py-2.5 px-4">Period</th>
                <th className="py-2.5 px-4">Date Range</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4">Locked By / Date</th>
                <th className="py-2.5 px-4 text-right">Lock Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)] font-mono">
              {periods.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors">
                  <td className="py-2.5 px-4 font-sans font-bold text-[var(--md-sys-color-on-surface)]">
                    {p.periodName}
                  </td>
                  <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                    {p.startDate} to {p.endDate}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <Badge
                      variant={p.status === 'OPEN' ? 'positive' : p.status === 'LOCKED' ? 'warning' : 'neutral'}
                      size="sm"
                    >
                      {p.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4 font-sans text-xs text-slate-400">
                    {p.lockedAt ? (
                      <div>
                        <span className="font-semibold text-amber-300">{p.lockedBy}</span>
                        <span className="text-[10px] block font-mono text-slate-500">{p.lockedAt.slice(0, 10)}</span>
                      </div>
                    ) : p.closedAt ? (
                      <div>
                        <span className="font-semibold text-purple-300">{p.closedBy}</span>
                        <span className="text-[10px] block font-mono text-slate-500">{p.closedAt.slice(0, 10)}</span>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-sans">
                    {p.status === 'OPEN' ? (
                      <button
                        onClick={() => handleLock(p.id)}
                        className="px-3 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 text-xs font-bold transition cursor-pointer flex items-center gap-1 ml-auto"
                        data-testid={`lock-btn-${p.id}`}
                      >
                        <Lock size={12} />
                        <span>Lock Month</span>
                      </button>
                    ) : p.status === 'LOCKED' ? (
                      <div className="flex items-center justify-end gap-2">
                        {p.unlockHistory && p.unlockHistory.length > 0 && (
                          <button
                            onClick={() => setHistoryPeriod(p)}
                            title="View Unlock History"
                            className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                          >
                            <History size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedPeriodToUnlock(p)}
                          className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 text-xs font-bold transition cursor-pointer flex items-center gap-1"
                          data-testid={`unlock-btn-${p.id}`}
                        >
                          <Unlock size={12} />
                          <span>Unlock (Audited)</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] font-bold text-slate-500 uppercase">
                        Permanently Closed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Audited Unlock Modal */}
      <UnlockPeriodModal
        isOpen={Boolean(selectedPeriodToUnlock)}
        onClose={() => setSelectedPeriodToUnlock(null)}
        period={selectedPeriodToUnlock}
        onUnlockConfirmed={handleUnlockConfirmed}
      />

      {/* Year-End Close Modal */}
      <YearEndClosingModal
        isOpen={isYearEndModalOpen}
        onClose={() => setIsYearEndModalOpen(false)}
        fiscalYear={2026}
        journals={journals}
        accounts={accounts}
        periods={periods}
        onClosingExecuted={handleClosingExecuted}
        formatMVR={formatMVR}
      />
    </div>
  );
};
