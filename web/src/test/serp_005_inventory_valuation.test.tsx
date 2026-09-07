import { describe, it, expect } from 'vitest';

export interface InventoryValuationItem {
  id: string;
  tenantId: string;
  sku: string;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost: number;
  sellingPrice: number;
}

export function validateStockMovement(payload: {
  tenantId: string;
  itemId: string;
  type: 'Received' | 'Deducted (Job)' | 'Adjustment' | 'Waste';
  quantity: number;
  unitCost: number;
  reference: string;
  actorId: string;
  currentStockOnHand: number;
}): { valid: boolean; error?: string; resultingStock?: number; valueImpact?: number } {
  if (!payload.tenantId) return { valid: false, error: 'tenant_id_required' };
  if (!payload.itemId) return { valid: false, error: 'item_id_required' };
  if (!payload.actorId) return { valid: false, error: 'actor_id_required' };
  if (!payload.reference) return { valid: false, error: 'movement_reference_required' };
  if (payload.quantity <= 0) return { valid: false, error: 'positive_quantity_required' };

  if (payload.type === 'Received') {
    return {
      valid: true,
      resultingStock: payload.currentStockOnHand + payload.quantity,
      valueImpact: payload.quantity * payload.unitCost,
    };
  }
  if (payload.type === 'Deducted (Job)' || payload.type === 'Waste') {
    if (payload.quantity > payload.currentStockOnHand) {
      return { valid: false, error: 'insufficient_stock_on_hand' };
    }
    return {
      valid: true,
      resultingStock: payload.currentStockOnHand - payload.quantity,
      valueImpact: -(payload.quantity * payload.unitCost),
    };
  }
  if (payload.type === 'Adjustment') {
    return {
      valid: true,
      resultingStock: payload.quantity,
      valueImpact: (payload.quantity - payload.currentStockOnHand) * payload.unitCost,
    };
  }
  return { valid: false, error: 'unknown_type' };
}

export function computeValuation(
  tenantId: string,
  items: InventoryValuationItem[]
) {
  const filtered = items.filter((i) => i.tenantId === tenantId);
  let totalCost = 0;
  let totalRetail = 0;
  let totalUnits = 0;
  let lowStock = 0;
  let outOfStock = 0;

  for (const it of filtered) {
    const q = Math.max(0, it.quantityOnHand);
    totalUnits += q;
    totalCost += q * it.unitCost;
    totalRetail += q * it.sellingPrice;
    if (q === 0) outOfStock++;
    else if (q <= it.reorderLevel) lowStock++;
  }

  return {
    tenantId,
    totalItems: filtered.length,
    totalUnitsOnHand: totalUnits,
    totalValuationCost: totalCost,
    totalPotentialRetailValue: totalRetail,
    lowStockItemsCount: lowStock,
    outOfStockItemsCount: outOfStock,
  };
}

describe('SERP-005: Stage 2 Inventory — Stock, Movement & Valuation', () => {
  const TENANT = 'tenant-ignition';

  it('validates stock addition from receiving and calculates value impact', () => {
    const res = validateStockMovement({
      tenantId: TENANT,
      itemId: 'it-primer-01',
      type: 'Received',
      quantity: 12,
      unitCost: 350,
      reference: 'PO-2026-042',
      actorId: 'usr-manager-1',
      currentStockOnHand: 8,
    });

    expect(res.valid).toBe(true);
    expect(res.resultingStock).toBe(20);
    expect(res.valueImpact).toBe(4200);
  });

  it('strictly blocks deductions exceeding stock on hand (zero phantom negative stock)', () => {
    const res = validateStockMovement({
      tenantId: TENANT,
      itemId: 'it-clear-02',
      type: 'Deducted (Job)',
      quantity: 10,
      unitCost: 800,
      reference: 'JOB-2026-088',
      actorId: 'usr-tech-2',
      currentStockOnHand: 3, // only 3 in stock!
    });

    expect(res.valid).toBe(false);
    expect(res.error).toBe('insufficient_stock_on_hand');
  });

  it('calculates total asset valuation and low-stock alerts per tenant', () => {
    const items: InventoryValuationItem[] = [
      {
        id: '1',
        tenantId: TENANT,
        sku: 'SKU-01',
        quantityOnHand: 20,
        reorderLevel: 5,
        unitCost: 100,
        sellingPrice: 180,
      },
      {
        id: '2',
        tenantId: TENANT,
        sku: 'SKU-02',
        quantityOnHand: 2,
        reorderLevel: 5, // Low stock
        unitCost: 400,
        sellingPrice: 700,
      },
      {
        id: '3',
        tenantId: TENANT,
        sku: 'SKU-03',
        quantityOnHand: 0, // Out of stock
        reorderLevel: 2,
        unitCost: 1500,
        sellingPrice: 2500,
      },
      {
        id: '4',
        tenantId: 'tenant-other', // cross tenant
        sku: 'SKU-OTHER',
        quantityOnHand: 99,
        reorderLevel: 10,
        unitCost: 9999,
        sellingPrice: 99999,
      },
    ];

    const val = computeValuation(TENANT, items);
    expect(val.totalItems).toBe(3);
    expect(val.totalUnitsOnHand).toBe(22);
    // (20 * 100) + (2 * 400) = 2000 + 800 = 2800
    expect(val.totalValuationCost).toBe(2800);
    // (20 * 180) + (2 * 700) = 3600 + 1400 = 5000
    expect(val.totalPotentialRetailValue).toBe(5000);
    expect(val.lowStockItemsCount).toBe(1);
    expect(val.outOfStockItemsCount).toBe(1);
  });
});
