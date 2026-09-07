import React, { useState, useEffect } from 'react';
import { useERP } from '../../context/ERPContext';
import { Modal } from '../common/Modal';
import { PaymentMethod } from '../../types/erp';

export const RecordPaymentModal: React.FC = () => {
  const {
    isRecordPaymentOpen,
    setIsRecordPaymentOpen,
    invoices,
    customers,
    recordPayment,
    prefilledInvoiceId,
    setPrefilledInvoiceId,
    formatMVR
  } = useERP();

  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>('BML Bank Transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bankAccount, setBankAccount] = useState('BML Main Operations (7730000189201)');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (prefilledInvoiceId) {
      setInvoiceId(prefilledInvoiceId);
      const inv = invoices.find((i) => i.id === prefilledInvoiceId);
      if (inv) {
        setAmount(inv.balanceDue);
        setReferenceNumber(`BML-TX-${Math.floor(100000 + Math.random() * 900000)}`);
      }
    } else {
      const unpaid = invoices.find((i) => i.balanceDue > 0);
      if (unpaid) {
        setInvoiceId(unpaid.id);
        setAmount(unpaid.balanceDue);
      }
    }
  }, [prefilledInvoiceId, invoices]);

  const selectedInvoice = invoices.find((i) => i.id === invoiceId);

  const handleInvoiceChange = (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) {
      setAmount(inv.balanceDue);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || amount <= 0) return;

    recordPayment({
      invoiceId: selectedInvoice.id,
      invoiceNumber: selectedInvoice.invoiceNumber,
      customerId: selectedInvoice.customerId,
      customerName: selectedInvoice.customerName,
      amount: Number(amount),
      paymentDate: new Date().toISOString().split('T')[0],
      method,
      referenceNumber: referenceNumber || `BML-${Math.floor(100000 + Math.random() * 900000)}`,
      bankAccount,
      status: 'Verified',
      notes
    });

    setIsRecordPaymentOpen(false);
    setPrefilledInvoiceId(undefined);
  };

  return (
    <Modal
      isOpen={isRecordPaymentOpen}
      onClose={() => {
        setIsRecordPaymentOpen(false);
        setPrefilledInvoiceId(undefined);
      }}
      title="Record Customer Payment Receipt"
      subtitle="Reconcile BML/MIB bank slip, cash, or credit card collection"
      maxWidth="lg"
      actions={
        <>
          <button
            type="button"
            onClick={() => setIsRecordPaymentOpen(false)}
            className="px-4 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-xs font-semibold border border-[var(--md-sys-color-outline-variant)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
          >
            Confirm & Settle Balance
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Invoice selection */}
        <div>
          <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Select Invoice to Settle *</label>
          <select
            required
            value={invoiceId}
            onChange={(e) => handleInvoiceChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
          >
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber} — {inv.customerName} (Due: {formatMVR(inv.balanceDue)})
              </option>
            ))}
          </select>
        </div>

        {selectedInvoice && (
          <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
            <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
              <span>Customer:</span>
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{selectedInvoice.customerName}</span>
            </div>
            <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
              <span>Invoice Total:</span>
              <span className="mono-num text-[var(--md-sys-color-on-surface)]">{formatMVR(selectedInvoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-rose-600 font-bold">
              <span>Current Outstanding Balance:</span>
              <span className="mono-num">{formatMVR(selectedInvoice.balanceDue)}</span>
            </div>
          </div>
        )}

        {/* Amount Paid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Payment Amount (MVR) *</label>
            <input
              type="number"
              required
              min="1"
              max={selectedInvoice?.balanceDue || undefined}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-bold text-emerald-600 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            >
              <option value="BML Bank Transfer">Bank of Maldives (BML Transfer)</option>
              <option value="MIB Transfer">Maldives Islamic Bank (MIB)</option>
              <option value="Cash">Cash (Garage Counter)</option>
              <option value="BML POS Card">BML Card Swipe (POS Machine)</option>
              <option value="Cheque">Corporate Cheque</option>
            </select>
          </div>
        </div>

        {/* Bank & Reference */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Bank Slip / Transaction Reference</label>
            <input
              type="text"
              required
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. TXN-89218731"
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-mono text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Deposited To Account</label>
            <input
              type="text"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Internal Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Verified on BML Mobile banking portal..."
            className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
          />
        </div>
      </form>
    </Modal>
  );
};
