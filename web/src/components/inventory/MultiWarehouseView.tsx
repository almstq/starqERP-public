import React, { useState } from 'react';
import {
  Building2,
  Ship,
  ArrowRightLeft,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Send,
  Download,
  Receipt,
  Layers,
  MapPin
} from 'lucide-react';
import {
  MALDIVES_DEFAULT_WAREHOUSES,
  WarehouseLocation,
  WarehouseStockItem,
  StockTransferOrder,
  createStockTransferOrder,
  dispatchStockTransfer,
  receiveStockTransfer,
  evaluateWarehouseStockReorders,
} from '../../domain/warehouse';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const MultiWarehouseView: React.FC = () => {
  const { formatMVR, currentTenant, addJournalEntry } = useERP();

  const [warehouses] = useState<WarehouseLocation[]>(MALDIVES_DEFAULT_WAREHOUSES);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('wh-male');

  const [stockItems, setStockItems] = useState<WarehouseStockItem[]>([
    {
      id: 'stk-1',
      itemId: 'item-01',
      itemCode: 'SEAL-01',
      itemName: 'Marine Hydraulic Seals Kit',
      warehouseId: 'wh-male',
      warehouseCode: 'WH-MLE',
      quantityOnHand: 45,
      reorderPoint: 10,
      safetyStock: 5,
      unitCostMvr: 500,
      batchNumber: 'LOT-2026-08',
    },
    {
      id: 'stk-2',
      itemId: 'item-02',
      itemCode: 'PUMP-88',
      itemName: 'High-Flow Bilge Pump 12V',
      warehouseId: 'wh-male',
      warehouseCode: 'WH-MLE',
      quantityOnHand: 18,
      reorderPoint: 5,
      safetyStock: 2,
      unitCostMvr: 4000,
      batchNumber: 'LOT-2026-04',
    },
    {
      id: 'stk-3',
      itemId: 'item-01',
      itemCode: 'SEAL-01',
      itemName: 'Marine Hydraulic Seals Kit',
      warehouseId: 'wh-thilafushi',
      warehouseCode: 'WH-THL',
      quantityOnHand: 3, // Low stock!
      reorderPoint: 10,
      safetyStock: 5,
      unitCostMvr: 500,
      batchNumber: 'LOT-2026-08',
    },
  ]);

  const [transfers, setTransfers] = useState<StockTransferOrder[]>([
    {
      id: 'sto-01',
      transferNumber: 'STO-2026-001',
      sourceWarehouseId: 'wh-male',
      sourceWarehouseCode: 'WH-MLE',
      destinationWarehouseId: 'wh-thilafushi',
      destinationWarehouseCode: 'WH-THL',
      vesselNameOrSeaRoute: 'MV Horizon Trader (Male - Thilafushi Sea Cargo)',
      items: [
        {
          itemId: 'item-01',
          itemCode: 'SEAL-01',
          itemName: 'Marine Hydraulic Seals Kit',
          quantity: 20,
          unitCostMvr: 500,
          totalValueMvr: 10000,
          batchNumber: 'LOT-2026-08',
        },
      ],
      totalTransferValueMvr: 10000,
      status: 'DRAFT',
    },
  ]);

  const reorderAlerts = evaluateWarehouseStockReorders(stockItems);
  const activeWh = warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0];
  const activeStock = stockItems.filter((s) => s.warehouseId === selectedWarehouseId);

  const handleDispatchTransfer = (transferId: string) => {
    const tr = transfers.find((t) => t.id === transferId);
    if (!tr) return;

    const dispatched = dispatchStockTransfer(tr, '2026-08-28', currentTenant.id || 'tenant-starq');
    if (dispatched.dispatchJournal) {
      if (typeof (addJournalEntry as any) === 'function') {
        (addJournalEntry as any)(dispatched.dispatchJournal);
      }
    }

    setTransfers((prev) => prev.map((t) => (t.id === transferId ? dispatched : t)));
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(`Transfer #${dispatched.transferNumber} dispatched! In-Transit journal posted to GL.`);
    }
  };

  const handleReceiveTransfer = (transferId: string) => {
    const tr = transfers.find((t) => t.id === transferId);
    if (!tr) return;

    const received = receiveStockTransfer(tr, '2026-08-29', currentTenant.id || 'tenant-starq');
    if (received.receiptJournal) {
      if (typeof (addJournalEntry as any) === 'function') {
        (addJournalEntry as any)(received.receiptJournal);
      }
    }

    setTransfers((prev) => prev.map((t) => (t.id === transferId ? received : t)));
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(`Transfer #${received.transferNumber} received at ${received.destinationWarehouseCode}! In-Transit cleared.`);
    }
  };

  return (
    <div className="space-y-6" data-testid="multi-warehouse-view">
      {/* Header */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Building2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Multi-Warehouse & Inter-Island Inventory</h2>
                <Badge variant="neutral">Sea Cargo Dispatch Engine</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Multi-location stock tracking, Sea Transfer Notes (Account 1350 Goods-in-Transit), and batch traceability.
              </p>
            </div>
          </div>
        </div>
      </Surface>

      {/* Warehouse Locations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {warehouses.map((wh) => {
          const count = stockItems.filter((s) => s.warehouseId === wh.id).length;
          const isSelected = selectedWarehouseId === wh.id;

          return (
            <Surface
              key={wh.id}
              onClick={() => setSelectedWarehouseId(wh.id)}
              className={`p-4 rounded-2xl border transition cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 border-cyan-500/50 shadow-lg'
                  : 'bg-[#0a0f1d] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-cyan-400">{wh.code}</span>
                {wh.isMainHub && <Badge variant="positive">Central Hub</Badge>}
              </div>

              <div className="mt-2">
                <h3 className="text-sm font-bold text-white">{wh.name}</h3>
                <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                  <MapPin size={12} />
                  <span>{wh.island}, {wh.atoll} Atoll</span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 flex justify-between items-center text-xs font-mono">
                <span className="text-slate-500">{count} SKUs Tracked</span>
                <span className="text-slate-400">{wh.contactPerson}</span>
              </div>
            </Surface>
          );
        })}
      </div>

      {/* Reorder Alerts */}
      {reorderAlerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-amber-200">
                Low Stock Reorder Triggered ({reorderAlerts.length} Location Alert)
              </div>
              <div className="text-[11px] text-amber-300/80">
                {reorderAlerts.map((a) => `${a.warehouseCode}: ${a.itemName} (Qty: ${a.quantityOnHand} / Reorder: ${a.reorderPoint})`).join(' | ')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock Items at Selected Warehouse */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Package size={16} className="text-cyan-400" />
            <span>Inventory SKUs at {activeWh.name} ({activeWh.code})</span>
          </h3>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-mono text-slate-400 uppercase">
                <th className="py-2.5 px-3">Item Code / Description</th>
                <th className="py-2.5 px-3">Batch / Lot</th>
                <th className="py-2.5 px-3 text-right">Qty on Hand</th>
                <th className="py-2.5 px-3 text-right">Reorder Point</th>
                <th className="py-2.5 px-3 text-right">Unit Cost</th>
                <th className="py-2.5 px-3 text-right">Total Asset Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {activeStock.map((s) => (
                <tr key={s.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-white font-sans">{s.itemName}</span>
                    <span className="block text-[10px] text-slate-500">{s.itemCode}</span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">{s.batchNumber || '-'}</td>
                  <td className={`py-2.5 px-3 text-right font-bold ${s.quantityOnHand <= s.reorderPoint ? 'text-amber-400' : 'text-slate-200'}`}>
                    {s.quantityOnHand}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{s.reorderPoint}</td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{formatMVR(s.unitCostMvr)}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-cyan-400">
                    {formatMVR(s.quantityOnHand * s.unitCostMvr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Inter-Island Stock Transfers & In-Transit Register */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Ship size={16} className="text-sky-400" />
            <span>Inter-Island Stock Transfer Orders (Sea Freight)</span>
          </h3>
        </div>

        <div className="space-y-3 font-mono text-xs">
          {transfers.map((t) => (
            <div key={t.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{t.transferNumber}</span>
                  <Badge variant={t.status === 'RECEIVED' ? 'positive' : t.status === 'DISPATCHED' ? 'warning' : 'neutral'}>
                    {t.status}
                  </Badge>
                </div>
                <div className="text-slate-400 font-sans text-xs flex items-center gap-1">
                  <Ship size={12} className="text-sky-400" />
                  <span>{t.vesselNameOrSeaRoute}</span>
                </div>
              </div>

              <div className="flex justify-between items-center text-[11px]">
                <div className="space-y-0.5">
                  <div className="text-slate-400">
                    Route: <span className="text-white font-bold">{t.sourceWarehouseCode}</span> → <span className="text-cyan-400 font-bold">{t.destinationWarehouseCode}</span>
                  </div>
                  <div className="text-slate-500">
                    Items: {t.items.map((it) => `${it.itemName} (x${it.quantity})`).join(', ')}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase">Transfer Value</span>
                  <div className="font-bold text-emerald-400 text-sm">{formatMVR(t.totalTransferValueMvr)}</div>
                </div>
              </div>

              {/* Lifecycle Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/60">
                {t.status === 'DRAFT' && (
                  <Button
                    variant="filled"
                    size="sm"
                    onClick={() => handleDispatchTransfer(t.id)}
                    icon={<Send size={14} />}
                  >
                    <span>Dispatch to In-Transit (Account 1350)</span>
                  </Button>
                )}
                {t.status === 'DISPATCHED' && (
                  <Button
                    variant="filled"
                    size="sm"
                    onClick={() => handleReceiveTransfer(t.id)}
                    icon={<CheckCircle2 size={14} />}
                  >
                    <span>Receive at {t.destinationWarehouseCode}</span>
                  </Button>
                )}
                {t.status === 'RECEIVED' && (
                  <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 size={14} />
                    <span>Delivered & Inventory Transferred ✓</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
};
