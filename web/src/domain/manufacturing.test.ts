import { describe, it, expect } from 'vitest';
import {
  SAMPLE_BOMS,
  createProductionOrder,
  startProductionOrder,
  completeProductionOrder,
} from './manufacturing';

describe('SERP-014: Manufacturing & Bill of Materials (BOM) Engine', () => {
  const boatBom = SAMPLE_BOMS[0]; // 28ft Fiberglass Launch Hull

  it('creates production order with precise raw materials, labor, and absorbed overhead', () => {
    // 2x Boats:
    // Resin: 3*8500 = 25,500 * 2 = 51,000
    // Mat: 6*1800 = 10,800 * 2 = 21,600
    // Gelcoat: 4*3200 = 12,800 * 2 = 25,600
    // Total Raw Material = 98,200
    // Direct Labor = 25,000 * 2 = 50,000
    // Overhead = 50,000 * 15% = 7,500
    // Total WIP = 155,700 (77,850 per boat)
    const order = createProductionOrder({
      id: 'po-101',
      orderNumber: 'PO-2026-001',
      bom: boatBom,
      plannedQuantity: 2,
    });

    expect(order.totalRawMaterialCostMvr).toBe(98200);
    expect(order.totalLaborCostMvr).toBe(50000);
    expect(order.totalOverheadCostMvr).toBe(7500);
    expect(order.totalWipCostMvr).toBe(155700);
    expect(order.finishedGoodsUnitCostMvr).toBe(77850);
    expect(order.status).toBe('PLANNED');
  });

  it('starts production and generates a balanced raw materials issue to WIP journal', () => {
    const order = createProductionOrder({
      id: 'po-101',
      orderNumber: 'PO-2026-001',
      bom: boatBom,
      plannedQuantity: 2,
    });

    const started = startProductionOrder(order, '2026-08-28', 'tenant-01');
    expect(started.status).toBe('IN_PROGRESS');
    expect(started.issueJournal).toBeDefined();
    expect(started.issueJournal?.isBalanced).toBe(true);
    expect(started.issueJournal?.lines.find((l) => l.accountCode === '1330')?.debit).toBe(155700);
    expect(started.issueJournal?.lines.find((l) => l.accountCode === '1310')?.credit).toBe(98200);
  });

  it('completes production with finished goods receipt and accounts for scrap waste', () => {
    const order = createProductionOrder({
      id: 'po-101',
      orderNumber: 'PO-2026-001',
      bom: boatBom,
      plannedQuantity: 2,
    });

    const started = startProductionOrder(order, '2026-08-28', 'tenant-01');
    // 1 completed successfully (77,850), 1 scrapped due to lamination defect (77,850 scrap)
    const completed = completeProductionOrder({
      order: started,
      completedQuantity: 1,
      scrapQuantity: 1,
      completionDate: '2026-08-29',
      tenantId: 'tenant-01',
    });

    expect(completed.status).toBe('COMPLETED');
    expect(completed.scrapExpenseMvr).toBe(77850);
    expect(completed.completionJournal?.isBalanced).toBe(true);
    expect(completed.completionJournal?.lines.find((l) => l.accountCode === '1310')?.debit).toBe(77850);
    expect(completed.completionJournal?.lines.find((l) => l.accountCode === '5220')?.debit).toBe(77850);
    expect(completed.completionJournal?.lines.find((l) => l.accountCode === '1330')?.credit).toBe(155700);
  });
});
