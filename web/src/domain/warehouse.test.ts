import { describe, it, expect } from 'vitest';
import {
  createStockTransferOrder,
  dispatchStockTransfer,
  receiveStockTransfer,
  evaluateWarehouseStockReorders,
  MALDIVES_DEFAULT_WAREHOUSES,
  WarehouseStockItem,
} from './warehouse';

describe('SERP-013: Multi-Warehouse & Inter-Island Stock Transfer Engine', () => {
  const sourceWh = MALDIVES_DEFAULT_WAREHOUSES[0]; // WH-MLE (Male)
  const destWh = MALDIVES_DEFAULT_WAREHOUSES[2]; // WH-THL (Thilafushi Yard)

  const sampleItems = [
    { itemId: 'item-01', itemCode: 'SEAL-01', itemName: 'Marine Hydraulic Seals', quantity: 20, unitCostMvr: 500, batchNumber: 'LOT-2026-08' },
    { itemId: 'item-02', itemCode: 'PUMP-88', itemName: 'High-Flow Bilge Pump', quantity: 5, unitCostMvr: 4000, batchNumber: 'LOT-2026-04' },
  ];

  it('creates an inter-island Stock Transfer Order with accurate valuation', () => {
    const order = createStockTransferOrder({
      id: 'sto-101',
      transferNumber: 'STO-2026-001',
      sourceWarehouse: sourceWh,
      destinationWarehouse: destWh,
      vesselNameOrSeaRoute: 'MV Albatross Express - Male to Thilafushi',
      items: sampleItems,
      tenantId: 'tenant-01',
    });

    expect(order.totalTransferValueMvr).toBe(30000); // (20*500) + (5*4000) = 10,000 + 20,000
    expect(order.sourceWarehouseCode).toBe('WH-MLE');
    expect(order.destinationWarehouseCode).toBe('WH-THL');
    expect(order.status).toBe('DRAFT');
  });

  it('generates a balanced In-Transit journal upon dispatch', () => {
    const order = createStockTransferOrder({
      id: 'sto-101',
      transferNumber: 'STO-2026-001',
      sourceWarehouse: sourceWh,
      destinationWarehouse: destWh,
      vesselNameOrSeaRoute: 'MV Albatross Express',
      items: sampleItems,
      tenantId: 'tenant-01',
    });

    const dispatched = dispatchStockTransfer(order, '2026-08-28', 'tenant-01');
    expect(dispatched.status).toBe('DISPATCHED');
    expect(dispatched.dispatchJournal).toBeDefined();
    expect(dispatched.dispatchJournal?.isBalanced).toBe(true);
    expect(dispatched.dispatchJournal?.lines.find((l) => l.accountCode === '1320')?.debit).toBe(30000);
    expect(dispatched.dispatchJournal?.lines.find((l) => l.accountCode === '1310')?.credit).toBe(30000);
  });

  it('generates a balanced Receipt journal clearing In-Transit upon destination delivery', () => {
    const order = createStockTransferOrder({
      id: 'sto-101',
      transferNumber: 'STO-2026-001',
      sourceWarehouse: sourceWh,
      destinationWarehouse: destWh,
      vesselNameOrSeaRoute: 'MV Albatross Express',
      items: sampleItems,
      tenantId: 'tenant-01',
    });

    const dispatched = dispatchStockTransfer(order, '2026-08-28', 'tenant-01');
    const received = receiveStockTransfer(dispatched, '2026-08-29', 'tenant-01');

    expect(received.status).toBe('RECEIVED');
    expect(received.receiptJournal).toBeDefined();
    expect(received.receiptJournal?.isBalanced).toBe(true);
    expect(received.receiptJournal?.lines.find((l) => l.accountCode === '1310')?.debit).toBe(30000);
    expect(received.receiptJournal?.lines.find((l) => l.accountCode === '1320')?.credit).toBe(30000);
  });

  it('detects low stock reorder alerts across warehouse locations', () => {
    const stockItems: WarehouseStockItem[] = [
      {
        id: 'stk-1',
        itemId: 'item-01',
        itemCode: 'SEAL-01',
        itemName: 'Marine Hydraulic Seals',
        warehouseId: 'wh-thilafushi',
        warehouseCode: 'WH-THL',
        quantityOnHand: 4, // Below reorder point of 10
        reorderPoint: 10,
        safetyStock: 5,
        unitCostMvr: 500,
      },
      {
        id: 'stk-2',
        itemId: 'item-02',
        itemCode: 'PUMP-88',
        itemName: 'High-Flow Bilge Pump',
        warehouseId: 'wh-thilafushi',
        warehouseCode: 'WH-THL',
        quantityOnHand: 15,
        reorderPoint: 5,
        safetyStock: 2,
        unitCostMvr: 4000,
      },
    ];

    const alerts = evaluateWarehouseStockReorders(stockItems);
    expect(alerts.length).toBe(1);
    expect(alerts[0].itemCode).toBe('SEAL-01');
    expect(alerts[0].deficitQuantity).toBe(11); // 10 + 5 - 4
  });
});
