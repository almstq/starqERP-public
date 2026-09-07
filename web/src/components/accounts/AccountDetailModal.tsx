import React from 'react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { AccountRecord, CLASS_LABELS, SUBTYPE_LABELS } from '../../domain/accounts';
import { Building2, Hash, Lock, Globe, Shield, Calendar, Layers, FileText } from 'lucide-react';

interface AccountDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: AccountRecord | null;
  accounts: AccountRecord[];
  onEdit: (account: AccountRecord) => void;
}

export const AccountDetailModal: React.FC<AccountDetailModalProps> = ({
  isOpen,
  onClose,
  account,
  accounts,
  onEdit,
}) => {
  if (!account) return null;

  const parent = account.parentId ? accounts.find((a) => a.id === account.parentId) : null;
  const children = accounts.filter((a) => a.parentId === account.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Account Details: ${account.code} - ${account.name}`}
      maxWidth="xl"
    >
      <div className="space-y-5" data-testid="account-detail-modal">
        {/* Top Header Card */}
        <div className="p-4 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[var(--md-sys-color-primary)]">
                  {account.code}
                </span>
                <Badge variant={account.status === 'ACTIVE' ? 'positive' : 'neutral'}>
                  {account.status}
                </Badge>
                {account.isSystem && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]">
                    <Lock className="w-3 h-3" /> System Account
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-[var(--md-sys-color-on-surface)] mt-1">
                {account.name}
              </h3>
            </div>

            <div className="text-right">
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                Ledger Balance
              </div>
              <div className="text-xl font-mono font-bold text-[var(--md-sys-color-on-surface)] mt-0.5">
                {account.currency === 'USD' ? '$' : 'MVR '} {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-[var(--md-sys-color-outline)] mt-0.5">
                (Real double-entry GL rollup)
              </div>
            </div>
          </div>

          {account.description && (
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
              {account.description}
            </p>
          )}
        </div>

        {/* Account Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
            <div className="text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1.5 font-medium mb-1">
              <Layers className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" /> Class
            </div>
            <div className="font-semibold text-[var(--md-sys-color-on-surface)]">
              {CLASS_LABELS[account.accountClass]}
            </div>
          </div>

          <div className="p-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
            <div className="text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1.5 font-medium mb-1">
              <FileText className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" /> Subtype
            </div>
            <div className="font-semibold text-[var(--md-sys-color-on-surface)] truncate" title={SUBTYPE_LABELS[account.subtype]}>
              {SUBTYPE_LABELS[account.subtype]}
            </div>
          </div>

          <div className="p-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
            <div className="text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1.5 font-medium mb-1">
              <Globe className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" /> Currency
            </div>
            <div className="font-semibold text-[var(--md-sys-color-on-surface)]">
              {account.currency}
            </div>
          </div>
        </div>

        {/* Parent & Children Hierarchy Card */}
        <div className="p-4 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
            Hierarchy Context
          </h4>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-[var(--md-sys-color-surface-container-high)]">
              <span className="text-[var(--md-sys-color-on-surface-variant)]">Parent Account:</span>
              <span className="font-mono font-medium text-[var(--md-sys-color-on-surface)]">
                {parent ? `${parent.code} - ${parent.name}` : 'None (Top-Level Node)'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-[var(--md-sys-color-surface-container-high)]">
              <span className="text-[var(--md-sys-color-on-surface-variant)]">Hierarchy Depth Level:</span>
              <span className="font-mono font-medium text-[var(--md-sys-color-on-surface)]">
                Level {account.level}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-[var(--md-sys-color-surface-container-high)]">
              <span className="text-[var(--md-sys-color-on-surface-variant)]">Direct Sub-Accounts:</span>
              <span className="font-mono font-medium text-[var(--md-sys-color-on-surface)]">
                {children.length} sub-accounts
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(account);
            }}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition"
          >
            Edit Account
          </button>
        </div>
      </div>
    </Modal>
  );
};
