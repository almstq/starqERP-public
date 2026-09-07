import React, { useState } from 'react';
import { X, Plus, Trash2, ShieldCheck, FileText, AlertCircle, Sparkles } from 'lucide-react';
import { Surface, Button } from '../ui';
import { Invoice, Customer } from '../../types/erp';
import { CreditNote } from '../../domain/creditNotes';
import { issueCreditNote } from '../../lib/settlement';

interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  invoices: Invoice[];
  targetInvoice?: Invoice | null;
  onCreditNoteCreated: (creditNote: CreditNote) => void;
  formatMVR: (amount: number) => string;
  isGstRegistered: boolean;
  gstRate: number;
}

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  isOpen,
  onClose,
  customers,
  invoices,
  targetInvoice,
  onCreditNoteCreated,
  formatMVR,
  isGstRegistered,
  gstRate,
}) => {
  if (!isOpen) return null;

  const [customerId, setCustomerId] = useState<string>(
    targetInvoice ? targetInvoice.customerId : (customers[0]?.id || '')
  );
  const [invoiceId, setInvoiceId] = useState<string>(targetInvoice?.id || '');
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('Sales Allowance / Rate Concession');
  const [items, setItems] = useState<Array<{ description: string; quantity: number; unitPrice: number; taxRate: number }>>([
    {
      description: targetInvoice ? `Credit adjustment for ${targetInvoice.invoiceNumber}` : 'Credit Allowance',
      quantity: 1,
      unitPrice: 1000,
      taxRate: isGstRegistered ? gstRate : 0,
    },
  ]);
  const [error, setError] = useState<string | null>(null);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const customerInvoices = invoices.filter((i) => i.customerId === customerId && i.status !== 'Cancelled');

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        description: '',
        quantity: 1,
        unitPrice: 0,
        taxRate: isGstRegistered ? gstRate : 0,
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const taxAmount = isGstRegistered
    ? items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * (Number(item.taxRate) || 0)) / 100, 0)
    : 0;
  const totalAmount = subtotal + taxAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedCustomer) {
      setError('Please select a valid customer.');
      return;
    }

    try {
      const matchedInv = invoices.find((i) => i.id === invoiceId);
      const creditNote = issueCreditNote({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        invoiceId: matchedInv?.id || null,
        invoiceNumber: matchedInv?.invoiceNumber || null,
        issueDate,
        reason,
        items,
        createdBy: 'Admin',
      });

      onCreditNoteCreated(creditNote);
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      data-testid="credit-note-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                Issue Authoritative Credit Note
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Generates reversing double-entry journals against Revenue and Output GST
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
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 erp-scroll-region">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Customer Selector */}
            <div className="space-y-1.5">
              <label className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
                Customer Account *
              </label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setInvoiceId('');
                }}
                disabled={Boolean(targetInvoice)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer disabled:opacity-60"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Linked Invoice (Optional) */}
            <div className="space-y-1.5">
              <label className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
                Apply to Invoice (Optional)
              </label>
              <select
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                disabled={Boolean(targetInvoice)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer disabled:opacity-60"
              >
                <option value="">Standalone Customer Credit (No Invoice)</option>
                {customerInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — {formatMVR(inv.totalAmount)} ({inv.paymentStatus})
                  </option>
                ))}
              </select>
            </div>

            {/* Issue Date */}
            <div className="space-y-1.5">
              <label className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
                Issue Date *
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] font-mono"
              />
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
                Reason / Narration *
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Rate concession, Damaged goods allowance"
                required
                className="w-full px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
              />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
                Credit Line Items
              </span>
              <button
                type="button"
                onClick={addItem}
                className="text-xs text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-1 cursor-pointer font-semibold"
              >
                <Plus size={14} /> Add Line
              </button>
            </div>

            <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--md-sys-color-outline-variant)]">
                  <tr>
                    <th className="p-2.5 pl-3">Description</th>
                    <th className="p-2.5 w-16 text-right">Qty</th>
                    <th className="p-2.5 w-28 text-right">Rate (MVR)</th>
                    <th className="p-2.5 w-24 text-right">Amount</th>
                    <th className="p-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                  {items.map((item, index) => {
                    const lineSubtotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                    return (
                      <tr key={index} className="bg-[var(--md-sys-color-surface)]">
                        <td className="p-2 pl-3">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                            placeholder="Allowance description"
                            required
                            className="w-full px-2 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] text-right font-mono text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] text-right font-mono text-xs"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-[var(--md-sys-color-on-surface)]">
                          {formatMVR(lineSubtotal)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            disabled={items.length <= 1}
                            className="text-[var(--md-sys-color-on-surface-variant)] hover:text-rose-400 disabled:opacity-30 cursor-pointer p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reversing Journal Preview & Totals Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs">
            <div className="space-y-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              <span className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider flex items-center gap-1">
                <Sparkles size={11} className="text-purple-400" />
                Automatic Accounting Effect:
              </span>
              <div className="font-mono text-[10px] space-y-0.5 pl-1 border-l-2 border-purple-400">
                <div>DR 4000 Revenue (Reversal): +{formatMVR(subtotal)}</div>
                {isGstRegistered && taxAmount > 0 && (
                  <div>DR 2200 Output GST (Reversal): +{formatMVR(taxAmount)}</div>
                )}
                <div>CR 1200 Accounts Receivable: +{formatMVR(totalAmount)}</div>
              </div>
            </div>

            <div className="space-y-1.5 text-right font-mono">
              <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
                <span>Credit Subtotal:</span>
                <span>{formatMVR(subtotal)}</span>
              </div>
              {isGstRegistered && (
                <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
                  <span>Output GST ({gstRate}%):</span>
                  <span>{formatMVR(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-[var(--md-sys-color-primary)] border-t border-[var(--md-sys-color-outline-variant)] pt-1">
                <span>Total Credit Note:</span>
                <span>{formatMVR(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outlined" size="md" type="button" onClick={onClose}>
              <span>Cancel</span>
            </Button>
            <Button variant="filled" size="md" type="submit">
              <span>Post & Issue Credit Note</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
