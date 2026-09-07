import React, { useState } from 'react';
import {
  Factory,
  Layers,
  Wrench,
  Package,
  Play,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Download,
  Plus,
  Flame,
  Clock
} from 'lucide-react';
import {
  SAMPLE_BOMS,
  BillOfMaterials,
  ProductionOrder,
  createProductionOrder,
  startProductionOrder,
  completeProductionOrder,
} from '../../domain/manufacturing';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const ProductionOrderView: React.FC = () => {
  const { formatMVR, currentTenant, addJournalEntry } = useERP();

  const [boms] = useState<BillOfMaterials[]>(SAMPLE_BOMS);
  const activeBom = boms[0];

  const [orders, setOrders] = useState<ProductionOrder[]>([
    {
      id: 'po-101',
      orderNumber: 'PO-2026-001',
      bomId: 'bom-fib-01',
      finishedGoodCode: 'FG-BOAT-28',
      finishedGoodName: '28ft Fiberglass Passenger Launch Hull',
      plannedQuantity: 2,
      completedQuantity: 0,
      scrapQuantity: 0,
      status: 'PLANNED',
      totalRawMaterialCostMvr: 98200,
      totalLaborCostMvr: 50000,
      totalOverheadCostMvr: 7500,
      totalWipCostMvr: 155700,
      finishedGoodsUnitCostMvr: 77850,
      scrapExpenseMvr: 0,
    },
  ]);

  const handleStartOrder = (orderId: string) => {
    const ord = orders.find((o) => o.id === orderId);
    if (!ord) return;

    const started = startProductionOrder(ord, '2026-08-28', currentTenant.id || 'tenant-starq');
    if (started.issueJournal) {
      if (typeof (addJournalEntry as any) === 'function') {
        (addJournalEntry as any)(started.issueJournal);
      }
    }

    setOrders((prev) => prev.map((o) => (o.id === orderId ? started : o)));
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(`Production Order #${started.orderNumber} started! Raw materials issued to Account 1400 WIP.`);
    }
  };

  const handleCompleteOrder = (orderId: string) => {
    const ord = orders.find((o) => o.id === orderId);
    if (!ord) return;

    // Complete 1 good unit, 1 scrap/defective unit for demo
    const completed = completeProductionOrder({
      order: ord,
      completedQuantity: 1,
      scrapQuantity: 1,
      completionDate: '2026-08-29',
      tenantId: currentTenant.id || 'tenant-starq',
    });

    if (completed.completionJournal) {
      if (typeof (addJournalEntry as any) === 'function') {
        (addJournalEntry as any)(completed.completionJournal);
      }
    }

    setOrders((prev) => prev.map((o) => (o.id === orderId ? completed : o)));
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(
        `Production Order #${completed.orderNumber} completed! Finished Goods capitalized to Account 1300, Scrap posted to Account 5100.`
      );
    }
  };

  return (
    <div className="space-y-6" data-testid="production-order-view">
      {/* Header */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Factory size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Manufacturing, Assembly & BOM Control</h2>
                <Badge variant="positive">Standard Costing</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Multi-level Bill of Materials (BOM), raw material issue to WIP (Account 1400), and scrap accounting (Account 5100).
              </p>
            </div>
          </div>
        </div>
      </Surface>

      {/* Bill of Materials Summary */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">Active Bill of Materials: {activeBom.finishedGoodName}</h3>
            <Badge variant="neutral">{activeBom.finishedGoodCode}</Badge>
          </div>
          <span className="text-xs text-slate-400 font-mono">Standard Yield: {activeBom.yieldQuantity} Unit</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-mono text-slate-400 uppercase">
                <th className="py-2.5 px-3">Component / Raw Material</th>
                <th className="py-2.5 px-3 text-right">Standard Qty</th>
                <th className="py-2.5 px-3 text-right">Scrap %</th>
                <th className="py-2.5 px-3 text-right">Unit Cost</th>
                <th className="py-2.5 px-3 text-right">Total Component Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {activeBom.components.map((c) => (
                <tr key={c.rawMaterialItemId} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-white font-sans">{c.rawMaterialName}</span>
                    <span className="block text-[10px] text-slate-500 font-mono">{c.rawMaterialCode}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{c.quantityRequired}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{c.scrapAllowancePct}%</td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{formatMVR(c.unitCostMvr)}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-amber-300">
                    {formatMVR(c.quantityRequired * c.unitCostMvr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Production Orders Workbench */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Wrench size={16} className="text-amber-400" />
            <span>Production Orders Execution & WIP Capitalization</span>
          </h3>
        </div>

        <div className="space-y-3 font-mono text-xs">
          {orders.map((ord) => (
            <div key={ord.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{ord.orderNumber}</span>
                  <span className="text-slate-400 font-sans">· {ord.finishedGoodName}</span>
                  <Badge variant={ord.status === 'COMPLETED' ? 'positive' : ord.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}>
                    {ord.status}
                  </Badge>
                </div>
                <div className="text-xs font-sans text-slate-400">
                  Planned: <span className="text-white font-bold">{ord.plannedQuantity} Units</span>
                </div>
              </div>

              {/* Cost Summary Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 text-[11px]">
                <div>
                  <span className="text-slate-500 text-[10px] block">Raw Materials</span>
                  <span className="font-bold text-slate-200">{formatMVR(ord.totalRawMaterialCostMvr)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Direct Labor</span>
                  <span className="font-bold text-slate-200">{formatMVR(ord.totalLaborCostMvr)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Overhead (15%)</span>
                  <span className="font-bold text-slate-200">{formatMVR(ord.totalOverheadCostMvr)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Total WIP Value</span>
                  <span className="font-bold text-emerald-400">{formatMVR(ord.totalWipCostMvr)}</span>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex justify-end gap-2 pt-1 font-sans">
                {ord.status === 'PLANNED' && (
                  <Button
                    variant="filled"
                    size="sm"
                    onClick={() => handleStartOrder(ord.id)}
                    icon={<Play size={14} />}
                  >
                    <span>Start Run & Issue Raw Materials to WIP</span>
                  </Button>
                )}
                {ord.status === 'IN_PROGRESS' && (
                  <Button
                    variant="filled"
                    size="sm"
                    onClick={() => handleCompleteOrder(ord.id)}
                    icon={<CheckCircle2 size={14} />}
                  >
                    <span>Complete Run & Capitalize to Finished Goods</span>
                  </Button>
                )}
                {ord.status === 'COMPLETED' && (
                  <div className="flex items-center gap-3 text-xs font-bold font-mono">
                    <span className="text-emerald-400">Yield: {ord.completedQuantity} Good Units ✓</span>
                    {ord.scrapQuantity > 0 && (
                      <span className="text-rose-400">Scrap: {ord.scrapQuantity} Units ({formatMVR(ord.scrapExpenseMvr)})</span>
                    )}
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
