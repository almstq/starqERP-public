import React, { useState } from 'react';
import { X, Lock, Unlock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Surface, Button } from '../ui';
import { AccountingPeriod } from '../../domain/periods';

interface UnlockPeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  period: AccountingPeriod | null;
  onUnlockConfirmed: (periodId: string, reason: string) => void;
}

export const UnlockPeriodModal: React.FC<UnlockPeriodModalProps> = ({
  isOpen,
  onClose,
  period,
  onUnlockConfirmed,
}) => {
  if (!isOpen || !period) return null;

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason || reason.trim().length < 5) {
      setError('An audit justification of at least 5 characters is required to unlock this closed period.');
      return;
    }

    try {
      onUnlockConfirmed(period.id, reason.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      data-testid="unlock-period-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                Audited Period Unlock Workflow
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Unlocking {period.periodName} ({period.startDate} to {period.endDate})
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Compliance Warning</span>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                Unlocking a closed accounting period allows backdated modifications to the General Ledger. All edits and the unlock reason will be durably recorded in the system audit log.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
              Mandatory Audit Reason / Controller Justification *
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Auditor requested adjustment of year-end depreciation accrual voucher."
              required
              className="w-full px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] text-xs"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outlined" size="md" type="button" onClick={onClose}>
              <span>Cancel</span>
            </Button>
            <Button variant="filled" size="md" type="submit">
              <span>Authorize & Unlock Period</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
