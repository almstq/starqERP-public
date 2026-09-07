import React, { useState, useEffect } from 'react';
import { useERP } from '../../context/ERPContext';
import { Modal } from '../common/Modal';
import { InvoiceLineItem } from '../../types/erp';
import { Plus, Trash2, Receipt } from 'lucide-react';
import { resolveTaxRate, taxOnExclusive } from '../../domain/taxRates';

export const CreateInvoiceModal: React.FC = () => {
  const {
    isCreateInvoiceOpen,
    setIsCreateInvoiceOpen,
    customers,
    jobs,
    createInvoice,
    prefilledCustomerId,
    setPrefilledCustomerId,
    setSelectedInvoiceId,
    formatMVR
  } = useERP();

  const [customerId, setCustomerId] = useState('');
  const [linkedJobId, setLinkedJobId] = useState('');
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('Payment due within 14 days of tax invoice issuance.');

  const [items, setItems] = useState<InvoiceLineItem[]>([
    {
      id: `item-1`,
      description: 'Automotive Paint Service & Prep Labor',
      category: 'Labor/Service',
      quantity: 1,
      unitPrice: 25000,
      amount: 25000
    }
  ]);

  useEffect(() => {
    if (prefilledCustomerId) {
      setCustomerId(prefilledCustomerId);
    } else if (customers.length > 0 && !customerId) {
      setCustomerId(customers[0].id);
    }
  }, [prefilledCustomerId, customers]);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: `item-${Date.now()}`,
        description: 'Clearcoat & Consumables',
        category: 'Material/Part',
        quantity: 1,
        unitPrice: 3500,
        amount: 3500
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [field]: value
    };

    if (field === 'quantity' || field === 'unitPrice') {
      const q = field === 'quantity' ? Number(value) : updated[index].quantity;
      const p = field === 'unitPrice' ? Number(value) : updated[index].unitPrice;
      updated[index].amount = q * p;
    }

    setItems(updated);
  };

  // Bug fix 5 Sep 2026 (docs/qa/BUG_LOG_2026-09-05_FOUNDER_LIVE_TESTING.md #1):
  // gstRate/gstAmount were hardcoded to 0, so this modal's own "Maldives GST
  // (8%)" label was never actually applied - every invoice created here was
  // understated by the full GST amount. Resolved by date via taxRates.ts,
  // never a hardcoded constant, same convention as miraTgst.ts.
  const invoiceDate = new Date().toISOString().split('T')[0];
  const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
  const gstRate = resolveTaxRate('gst_general', invoiceDate);
  const gstAmount = taxOnExclusive('gst_general', invoiceDate, subtotal);
  const totalAmount = subtotal + gstAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return;

    const job = jobs.find((j) => j.id === linkedJobId);

    const newInv = createInvoice({
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerIsland: cust.island,
      linkedJobId: job?.id,
      linkedJobNumber: job?.jobId,
      date: invoiceDate,
      dueDate,
      items: items.map((it, idx) => ({ ...it, id: it.id || `inv-item-${Date.now()}-${idx}` })),
      subtotal,
      gstRate,
      gstAmount,
      totalAmount,
      amountPaid: 0,
      balanceDue: totalAmount,
      status: 'Sent',
      notes,
      bankDetails: 'BML MVR Account: 7730000189201'
    });

    setIsCreateInvoiceOpen(false);
    setPrefilledCustomerId(undefined);
    setSelectedInvoiceId(newInv.id);
  };

  return (
    <Modal
      isOpen={isCreateInvoiceOpen}
      onClose={() => {
        setIsCreateInvoiceOpen(false);
        setPrefilledCustomerId(undefined);
      }}
      title="Create MIRA GST Tax Invoice"
      subtitle="Issue a compliant Maldives SME invoice with 8% GST & BML bank details"
      maxWidth="3xl"
      actions={
        <>
          <button
            type="button"
            onClick={() => setIsCreateInvoiceOpen(false)}
            className="px-4 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-xs font-semibold border border-[var(--md-sys-color-outline-variant)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
          >
            Issue Tax Invoice
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Customer & Job Linkage */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Customer / Fleet *</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type}) — {c.phone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Link Work Order (Optional)</label>
            <select
              value={linkedJobId}
              onChange={(e) => setLinkedJobId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            >
              <option value="">-- Standalone Invoice --</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jobId} - {j.vehicle.plateNumber} ({j.serviceType})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Due Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Payment Due Date</label>
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Payment Terms</label>
            <input
              type="text"
              readOnly
              value="Net 14 Days / BML Bank Transfer"
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)] focus:outline-none"
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[var(--md-sys-color-on-surface)] uppercase text-[10px] tracking-wider">
              Invoice Line Items & Services
            </span>
            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] grid grid-cols-12 gap-2 items-center"
              >
                <div className="col-span-12 sm:col-span-5">
                  <input
                    type="text"
                    required
                    placeholder="Description of service / parts"
                    value={item.description}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] font-mono focus:outline-none focus:border-blue-500 text-center"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="Unit Price"
                    value={item.unitPrice}
                    onChange={(e) => handleItemChange(idx, 'unitPrice', Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] font-mono focus:outline-none focus:border-blue-500 text-right"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2 text-right font-bold text-[var(--md-sys-color-on-surface)] mono-num">
                  {formatMVR(item.amount)}
                </div>
                <div className="col-span-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="p-1 rounded text-[var(--md-sys-color-outline)] hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals Breakdown */}
        <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-2">
          <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
            <span>Subtotal:</span>
            <span className="font-mono text-[var(--md-sys-color-on-surface)] font-semibold">{formatMVR(subtotal)}</span>
          </div>
          <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
            <span>Maldives GST ({Math.round(gstRate * 100)}%):</span>
            <span className="font-mono text-[var(--md-sys-color-on-surface)] font-semibold">{formatMVR(gstAmount)}</span>
          </div>
          <div className="flex justify-between text-base font-extrabold text-[var(--md-sys-color-on-surface)] border-t border-[var(--md-sys-color-outline-variant)] pt-2">
            <span>Total Payable (MVR):</span>
            <span className="mono-num text-emerald-600">{formatMVR(totalAmount)}</span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Invoice Remarks & Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
          />
        </div>
      </form>
    </Modal>
  );
};
