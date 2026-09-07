import React, { useState } from 'react';
import { useERP } from '../../context/ERPContext';
import { Modal } from '../common/Modal';
import { StockCategory } from '../../types/erp';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const NewItemModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { suppliers, addInventoryItem } = useERP();

  const [name, setName] = useState('');
  const [sku, setSku] = useState(`SKU-${Math.floor(1000 + Math.random() * 9000)}`);
  const [category, setCategory] = useState<StockCategory>('Paints & Primers');
  const [quantityOnHand, setQuantityOnHand] = useState<number>(10);
  const [unit, setUnit] = useState('Liters');
  const [unitCost, setUnitCost] = useState<number>(1200);
  const [sellingPrice, setSellingPrice] = useState<number>(1800);
  const [reorderLevel, setReorderLevel] = useState<number>(5);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [locationInShop, setLocationInShop] = useState('Paint Mixing Bay A - Shelf 1');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const supp = suppliers.find((s) => s.id === supplierId);

    addInventoryItem({
      name,
      sku,
      category,
      quantityOnHand: Number(quantityOnHand),
      unit,
      unitCost: Number(unitCost),
      sellingPrice: Number(sellingPrice),
      reorderLevel: Number(reorderLevel),
      supplierId: supp?.id || 'supp-1',
      supplierName: supp?.name || 'Local Paint Distributor',
      locationInShop
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Inventory Stock SKU"
      subtitle="Register automotive paints, vinyl films, PPF, ceramics, or garage consumables"
      maxWidth="xl"
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
            Save Stock Item
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Item / SKU Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Glasurit 2K High Gloss Clearcoat"
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">SKU Code</label>
            <input
              type="text"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-mono text-blue-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Stock Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as StockCategory)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            >
              <option value="Paints & Primers">Paints & Primers</option>
              <option value="Clearcoats & Hardener">Clearcoats & Hardener</option>
              <option value="Vinyl & PPF Wraps">Vinyl & PPF Wraps</option>
              <option value="Compounds & Detailing">Compounds & Detailing</option>
              <option value="Abrasives & Sanding">Abrasives & Sanding</option>
              <option value="Tools & PPE">Tools & PPE</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Primary Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.islandOrCountry})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
          <div>
            <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Opening Qty</label>
            <input
              type="number"
              min="0"
              required
              value={quantityOnHand}
              onChange={(e) => setQuantityOnHand(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-mono text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Unit Type</label>
            <input
              type="text"
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Liters / Rolls / Bottles"
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Unit Cost (MVR)</label>
            <input
              type="number"
              min="0"
              required
              value={unitCost}
              onChange={(e) => setUnitCost(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-mono text-emerald-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Min Threshold</label>
            <input
              type="number"
              min="1"
              required
              value={reorderLevel}
              onChange={(e) => setReorderLevel(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-mono text-rose-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Storage Location in Garage</label>
          <input
            type="text"
            value={locationInShop}
            onChange={(e) => setLocationInShop(e.target.value)}
            placeholder="e.g. Wrap Studio Climate Rack 1, Shelf B"
            className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
          />
        </div>
      </form>
    </Modal>
  );
};
