import React, { useState } from 'react';
import { useERP } from '../../context/ERPContext';
import { Modal } from '../common/Modal';
import { InventoryItem } from '../../types/erp';

interface Props {
  item: InventoryItem | null;
  onClose: () => void;
}

export const StockAdjustmentModal: React.FC<Props> = ({ item, onClose }) => {
  const { adjustStockLevel, formatMVR } = useERP();
  const [newQty, setNewQty] = useState(item ? item.quantityOnHand : 0);
  const [reason, setReason] = useState('Stock Count Verification');

  if (!item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    adjustStockLevel(item.id, Number(newQty), reason);
    onClose();
  };

  return (
    <Modal
      isOpen={!!item}
      onClose={onClose}
      title={`Adjust Stock Level: ${item.name}`}
      subtitle={`SKU: ${item.sku} | Location: ${item.locationInShop}`}
      maxWidth="md"
      actions={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-xs font-semibold border border-[var(--md-sys-color-outline-variant)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
          >
            Save Stock Count
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
          <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
            <span>Current Recorded Quantity:</span>
            <span className="font-mono font-bold text-[var(--md-sys-color-on-surface)]">
              {item.quantityOnHand} {item.unit}
            </span>
          </div>
          <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
            <span>Minimum Safe Threshold:</span>
            <span className="font-mono text-rose-600 font-semibold">
              {item.reorderLevel} {item.unit}
            </span>
          </div>
          <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
            <span>Unit Cost:</span>
            <span className="font-mono text-emerald-600 font-semibold">{formatMVR(item.unitCost)}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
            New Physical Count Quantity ({item.unit}) *
          </label>
          <input
            type="number"
            min="0"
            required
            value={newQty}
            onChange={(e) => setNewQty(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-bold text-blue-600 font-mono focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Adjustment Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
          >
            <option value="Physical Stock Take">Monthly Physical Stock Take</option>
            <option value="New Shipment Received">New Supplier Delivery Received</option>
            <option value="Damaged / Spillage">Damaged / Spillage / Expired Batch</option>
            <option value="Internal Garage Test">Internal Sample / Demo Test</option>
          </select>
        </div>
      </form>
    </Modal>
  );
};
