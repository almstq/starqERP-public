import React, { useState } from 'react';
import { X, Check, AlertCircle, ArrowRight, DollarSign, FileText, Sparkles } from 'lucide-react';
import { Surface, Button } from '../ui';
import { Invoice, Customer } from '../../types/erp';
import { CreditNote, CustomerAdvance, SettlementAllocation } from '../../domain/creditNotes';
import { applySettlementAllocation } from '../../lib/settlement';

interface SettlementAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  invoices: Invoice[];
  creditNotes: CreditNote[];
  advances: CustomerAdvance[];
  onAllocationCompleted: (result: {
    allocation: SettlementAllocation;
    updatedSource: CreditNote | CustomerAdvance;
    updatedInvoice: Invoice;
  }) => void;
  formatMVR: (amount: number) => string;
}

export const SettlementAllocationModal: React.FC<SettlementAllocationModalProps> = ({
  isOpen,
  onClose,
  customers,
  invoices,
  creditNotes,
  advances,
  onAllocationCompleted,
  formatMVR,
}) => {
  if (!isOpen) return null;

  const [customerId, setCustomerId] = useState<string>(customers[0]?.id || '');
  const [sourceType, setSourceType] = useState<'CREDIT_NOTE' | 'CUSTOMER_ADVANCE'>('CREDIT_NOTE');
  const [sourceId, setSourceId] = useState<string>('');
  const [targetInvoiceId, setTargetInvoiceId] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [notes, setNotes] = useState<string>('Settlement Allocation');
  const [error, setError] = useState<string | null>(null);

  // Filter available sources for the selected customer with positive remaining balance
  const availableCreditNotes = creditNotes.filter(
    (cn) => cn.customerId === customerId && cn.remainingBalance > 0.005 && cn.status !== 'Cancelled'
  );
  const availableAdvances = advances.filter(
    (adv) => adv.customerId === customerId && adv.remainingBalance > 0.005 && adv.status !== 'Refunded'
  );

  // Filter unpaid invoices for this customer
  const unpaidInvoices = invoices.filter((inv) => {
    if (inv.customerId !== customerId || inv.status === 'Cancelled') return false;
    const paid = (inv.payments || []).reduce((s, p) => s + p.amount, 0);
    return inv.totalAmount - paid > 0.005;
  });

  const selectedSource =
    sourceType === 'CREDIT_NOTE'
      ? availableCreditNotes.find((cn) => cn.id === sourceId) || availableCreditNotes[0]
      : availableAdvances.find((adv) => adv.id === sourceId) || availableAdvances[0];

  const selectedInvoice =
    unpaidInvoices.find((i) => i.id === targetInvoiceId) || unpaidInvoices[0];

  // Calculate limits
  const sourceRemaining = selectedSource ? selectedSource.remainingBalance : 0;
  const invoicePaid = selectedInvoice ? (selectedInvoice.payments || []).reduce((s, p) => s + p.amount, 0) : 0;
  const invoiceRemaining = selectedInvoice ? Math.max(0, selectedInvoice.totalAmount - invoicePaid) : 0;
  const maxAllocatable = Math.min(sourceRemaining, invoiceRemaining);

  const handleMaxClick = () => {
    setAmountInput(maxAllocatable.toFixed(2));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedSource) {
      setError('Please select a valid credit source with available balance.');
      return;
    }
    if (!selectedInvoice) {
      setError('Please select an unpaid target invoice.');
      return;
    }

    const allocAmount = parseFloat(amountInput);
    if (isNaN(allocAmount) || allocAmount <= 0) {
      setError('Allocation amount must be greater than zero.');
      return;
    }

    try {
      const result = applySettlementAllocation({
        sourceType,
        source: selectedSource,
        targetInvoice: selectedInvoice,
        allocatedAmount: allocAmount,
        notes,
        createdBy: 'Admin',
      });

      onAllocationCompleted(result);
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      data-testid="settlement-allocation-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                Allocate Credit / Advance Settlement
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Apply unallocated customer funds to settle outstanding receivables
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
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 erp-scroll-region text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Selector */}
          <div className="space-y-1.5">
            <label className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
              Customer *
            </label>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setSourceId('');
                setTargetInvoiceId('');
                setAmountInput('');
              }}
              className="w-full px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>

          {/* Source Type Selector & Source Record */}
          <div className="space-y-3 p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
                1. Funding Source (Credit Note / Advance)
              </span>
              <div className="flex gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="sourceType"
                    checked={sourceType === 'CREDIT_NOTE'}
                    onChange={() => {
                      setSourceType('CREDIT_NOTE');
                      setSourceId('');
                      setAmountInput('');
                    }}
                  />
                  <span>Credit Note</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="sourceType"
                    checked={sourceType === 'CUSTOMER_ADVANCE'}
                    onChange={() => {
                      setSourceType('CUSTOMER_ADVANCE');
                      setSourceId('');
                      setAmountInput('');
                    }}
                  />
                  <span>Customer Advance</span>
                </label>
              </div>
            </div>

            {sourceType === 'CREDIT_NOTE' ? (
              availableCreditNotes.length === 0 ? (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] italic">
                  No credit notes with available balance found for this customer.
                </p>
              ) : (
                <select
                  value={selectedSource?.id || ''}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer font-mono"
                >
                  {availableCreditNotes.map((cn) => (
                    <option key={cn.id} value={cn.id}>
                      {cn.creditNoteNumber} — Avail: {formatMVR(cn.remainingBalance)} (Total: {formatMVR(cn.totalAmount)})
                    </option>
                  ))}
                </select>
              )
            ) : availableAdvances.length === 0 ? (
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] italic">
                No advance deposits with available balance found for this customer.
              </p>
            ) : (
              <select
                value={selectedSource?.id || ''}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer font-mono"
              >
                {availableAdvances.map((adv) => (
                  <option key={adv.id} value={adv.id}>
                    {adv.receiptNumber} — Avail: {formatMVR(adv.remainingBalance)} (Total: {formatMVR(adv.amount)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Target Invoice Selector */}
          <div className="space-y-2 p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
            <span className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
              2. Target Invoice to Settle
            </span>
            {unpaidInvoices.length === 0 ? (
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] italic">
                No unpaid or partial invoices available for this customer.
              </p>
            ) : (
              <select
                value={selectedInvoice?.id || ''}
                onChange={(e) => setTargetInvoiceId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer font-mono"
              >
                {unpaidInvoices.map((inv) => {
                  const paid = (inv.payments || []).reduce((s, p) => s + p.amount, 0);
                  const bal = inv.totalAmount - paid;
                  return (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — Balance Due: {formatMVR(bal)} (Total: {formatMVR(inv.totalAmount)})
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Allocation Amount Input with Max button */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
                Settlement Allocation Amount (MVR) *
              </label>
              <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                Max Allocatable: <span className="font-bold text-[var(--md-sys-color-primary)]">{formatMVR(maxAllocatable)}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min="0.01"
                max={maxAllocatable}
                step="0.01"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0.00"
                required
                className="flex-1 px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] font-mono text-sm font-bold"
              />
              <button
                type="button"
                onClick={handleMaxClick}
                disabled={maxAllocatable <= 0}
                className="px-4 py-2 rounded-xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)] font-bold text-xs border border-[var(--md-sys-color-primary)] hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                Max
              </button>
            </div>
          </div>

          {/* Settlement Preview Summary */}
          {selectedSource && selectedInvoice && maxAllocatable > 0 && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono space-y-1">
              <div className="font-bold uppercase text-[10px] tracking-wider text-emerald-400">
                Settlement Effect Summary:
              </div>
              <div className="flex justify-between">
                <span>Invoice {selectedInvoice.invoiceNumber} After:</span>
                <span>{formatMVR(Math.max(0, invoiceRemaining - (parseFloat(amountInput) || 0)))}</span>
              </div>
              <div className="flex justify-between">
                <span>Source Balance After:</span>
                <span>{formatMVR(Math.max(0, sourceRemaining - (parseFloat(amountInput) || 0)))}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outlined" size="md" type="button" onClick={onClose}>
              <span>Cancel</span>
            </Button>
            <Button
              variant="filled"
              size="md"
              type="submit"
              disabled={maxAllocatable <= 0 || !amountInput || parseFloat(amountInput) <= 0}
            >
              <span>Apply Settlement</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
