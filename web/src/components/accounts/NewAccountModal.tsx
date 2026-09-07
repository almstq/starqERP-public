import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../common/Modal';
import {
  AccountRecord,
  AccountClass,
  AccountSubtype,
  AccountCurrency,
  CLASS_LABELS,
  SUBTYPE_LABELS,
  CLASS_CODE_RANGES,
} from '../../domain/accounts';
import {
  validateAccountDraft,
  subtypesForClass,
  eligibleParentsFor,
  suggestNextCode,
  describeClassRange,
} from '../../domain/accountValidation';
import { Building2, Hash, AlertCircle } from 'lucide-react';

interface NewAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (account: AccountRecord) => void;
  accounts: AccountRecord[];
  initialParentId?: string | null;
  editingAccount?: AccountRecord | null;
}

export const NewAccountModal: React.FC<NewAccountModalProps> = ({
  isOpen,
  onClose,
  onSave,
  accounts,
  initialParentId = null,
  editingAccount = null,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [accountClass, setAccountClass] = useState<AccountClass>('ASSET');
  const [subtype, setSubtype] = useState<AccountSubtype>('CURRENT_ASSET');
  const [parentId, setParentId] = useState<string>('');
  const [currency, setCurrency] = useState<AccountCurrency>('MVR');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingAccount) {
      setName(editingAccount.name);
      setCode(editingAccount.code);
      setAccountClass(editingAccount.accountClass);
      setSubtype(editingAccount.subtype);
      setParentId(editingAccount.parentId || '');
      setCurrency(editingAccount.currency);
      setDescription(editingAccount.description || '');
      setError(null);
    } else {
      setName('');
      setAccountClass(initialParentId ? (accounts.find((a) => a.id === initialParentId)?.accountClass || 'ASSET') : 'ASSET');
      setSubtype('CURRENT_ASSET');
      setParentId(initialParentId || '');
      setCurrency('MVR');
      setDescription('');
      setError(null);

      // SERP-343: suggest inside the block the account actually belongs to. The
      // old rule took the maximum across the whole class, so a new utility
      // account was proposed after the highest-numbered expense in the chart.
      const parent = accounts.find((a) => a.id === (initialParentId || ''));
      setCode(suggestNextCode(accountClass, accounts, parent?.code));
    }
  }, [isOpen, editingAccount, initialParentId]);

  // Handle class change -> adjust code and subtype
  const handleClassChange = (newClass: AccountClass) => {
    setAccountClass(newClass);
    setCode(suggestNextCode(newClass, accounts));
    setParentId('');

    // Default subtype for the class
    if (newClass === 'ASSET') setSubtype('CURRENT_ASSET');
    else if (newClass === 'LIABILITY') setSubtype('CURRENT_LIABILITY');
    else if (newClass === 'EQUITY') setSubtype('OWNERS_EQUITY');
    else if (newClass === 'REVENUE') setSubtype('OPERATING_REVENUE');
    else if (newClass === 'EXPENSE') setSubtype('OPERATING_EXPENSE');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedCode = code.trim();

    // SERP-343: full structural validation. The old path checked required and
    // unique only — it never enforced the class/range relationship it displays
    // in its own UI, nor the subtype/class matrix, nor hierarchy acyclicity.
    const issues = validateAccountDraft({
      code: trimmedCode,
      name: trimmedName,
      accountClass,
      subtype,
      parentId: parentId || null,
      accounts,
      editingAccountId: editingAccount?.id,
    });
    if (issues.length > 0) {
      setError(issues.map((i) => i.message).join(' '));
      return;
    }

    const selectedParent = accounts.find((a) => a.id === parentId);
    const level = selectedParent ? selectedParent.level + 1 : 0;

    const accountRecord: AccountRecord = {
      id: editingAccount ? editingAccount.id : `coa-custom-${Date.now()}`,
      code: trimmedCode,
      name: trimmedName,
      accountClass,
      subtype,
      parentId: parentId || null,
      level,
      currency,
      status: editingAccount ? editingAccount.status : 'ACTIVE',
      balance: editingAccount ? editingAccount.balance : 0,
      isSystem: editingAccount ? editingAccount.isSystem : false,
      description: description.trim() || undefined,
    };

    onSave(accountRecord);
    onClose();
  };

  // SERP-343: excluding only the account itself let it be parented to its own
  // child. eligibleParentsFor excludes every descendant.
  const eligibleParents = useMemo(
    () => eligibleParentsFor(accountClass, accounts, editingAccount?.id),
    [accountClass, accounts, editingAccount?.id],
  );

  // SERP-343: the dropdown used to offer every subtype for every class, so
  // Asset + Payroll Expense was selectable.
  const availableSubtypes = useMemo(() => subtypesForClass(accountClass), [accountClass]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingAccount ? `Edit Account: ${editingAccount.code}` : 'Create New Account'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4" data-testid="new-account-form">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
              Account Class <span className="text-[var(--md-sys-color-error)]">*</span>
            </label>
            <select
              value={accountClass}
              onChange={(e) => handleClassChange(e.target.value as AccountClass)}
              disabled={editingAccount?.isSystem}
              className="w-full h-10 px-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--md-sys-color-primary)] disabled:opacity-60"
            >
              {(Object.keys(CLASS_LABELS) as AccountClass[]).map((cls) => (
                <option key={cls} value={cls}>
                  {CLASS_LABELS[cls]} ({describeClassRange(cls)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
              Account Code <span className="text-[var(--md-sys-color-error)]">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 1116"
                disabled={editingAccount?.isSystem}
                className="w-full h-10 pl-8 pr-3 font-mono text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] disabled:opacity-60"
              />
              <Hash className="w-3.5 h-3.5 absolute left-3 top-3.5 text-[var(--md-sys-color-outline)]" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
            Account Name <span className="text-[var(--md-sys-color-error)]">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. BML USD Operational Savings"
              className="w-full h-10 pl-8 pr-3 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
            />
            <Building2 className="w-3.5 h-3.5 absolute left-3 top-3.5 text-[var(--md-sys-color-outline)]" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
              Parent Account (Optional)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--md-sys-color-primary)]"
            >
              <option value="">None (Top-Level Group)</option>
              {eligibleParents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {'—'.repeat(parent.level)} {parent.code} - {parent.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
              Subtype / Detail Type
            </label>
            <select
              value={subtype}
              onChange={(e) => setSubtype(e.target.value as AccountSubtype)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--md-sys-color-primary)]"
            >
              {availableSubtypes.map((st) => (
                <option key={st} value={st}>
                  {SUBTYPE_LABELS[st]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
            Designated Currency
          </label>
          <div className="flex gap-4">
            {(['MVR', 'USD', 'MULTI'] as AccountCurrency[]).map((curr) => (
              <label
                key={curr}
                className={`flex-1 flex items-center justify-center h-10 border rounded-lg cursor-pointer text-sm font-medium transition ${
                  currency === curr
                    ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                    : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                }`}
              >
                <input
                  type="radio"
                  name="currency"
                  value={curr}
                  checked={currency === curr}
                  onChange={() => setCurrency(curr)}
                  className="sr-only"
                />
                {curr === 'MULTI' ? 'Multi-Currency' : curr}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
            Description / Notes (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Account operational purpose or MIRA tax notes..."
            className="w-full p-3 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm font-medium rounded-lg bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:opacity-90 shadow-sm transition"
          >
            {editingAccount ? 'Save Changes' : 'Create Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
