import { describe, it, expect } from 'vitest';

export interface CounterSaleItem {
  itemId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export function validateCounterSale(payload: {
  idempotencyKey: string;
  tenantId: string;
  customerName?: string;
  items: CounterSaleItem[];
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  paymentMethod: string;
  actorSeat: string;
}, processedKeys: Set<string>): { valid: boolean; error?: string; isReplay?: boolean } {
  if (!payload.idempotencyKey) return { valid: false, error: 'idempotency_key_required' };
  if (processedKeys.has(payload.idempotencyKey)) {
    return { valid: true, isReplay: true };
  }

  if (!payload.tenantId) return { valid: false, error: 'tenant_id_required' };
  
  const allowedSeats = ['counter', 'financial_controller', 'director', 'managing_director', 'owner'];
  if (!allowedSeats.includes(payload.actorSeat)) {
    return { valid: false, error: `unauthorized_seat: ${payload.actorSeat}` };
  }

  if (!payload.items || payload.items.length === 0) {
    return { valid: false, error: 'items_required' };
  }

  const calculatedSubtotal = payload.items.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
  if (Math.abs(payload.subtotal - calculatedSubtotal) > 0.01) {
    return { valid: false, error: 'subtotal_mismatch' };
  }

  const expectedGst = Math.round((calculatedSubtotal * payload.gstRate) / 100 * 100) / 100;
  if (Math.abs(payload.gstAmount - expectedGst) > 0.05) {
    return { valid: false, error: 'gst_mismatch' };
  }

  if (Math.abs(payload.totalAmount - (calculatedSubtotal + expectedGst)) > 0.05) {
    return { valid: false, error: 'total_mismatch' };
  }

  processedKeys.add(payload.idempotencyKey);
  return { valid: true, isReplay: false };
}

describe('SERP-006: Stage 3 Counter Capability Inside ERP', () => {
  const TENANT = 'tenant-starq';

  it('validates authorized counter sale and reconciles arithmetic', () => {
    const processed = new Set<string>();
    const res = validateCounterSale({
      idempotencyKey: 'idemp-001',
      tenantId: TENANT,
      customerName: 'Walk-in Retail Client',
      items: [
        { itemId: 'i-1', name: 'Coolant 1L', sku: 'SKU-CLN-1', quantity: 2, unitPrice: 150, total: 300 },
        { itemId: 'i-2', name: 'Oil Filter', sku: 'SKU-FLT-2', quantity: 1, unitPrice: 200, total: 200 },
      ],
      subtotal: 500,
      gstRate: 8,
      gstAmount: 40,
      totalAmount: 540,
      paymentMethod: 'Cash',
      actorSeat: 'counter',
    }, processed);

    expect(res.valid).toBe(true);
    expect(res.isReplay).toBe(false);
  });

  it('handles idempotency replay without duplicate execution', () => {
    const processed = new Set<string>();
    const payload = {
      idempotencyKey: 'idemp-replay-99',
      tenantId: TENANT,
      customerName: 'Walk-in Retail Client',
      items: [
        { itemId: 'i-1', name: 'Coolant 1L', sku: 'SKU-CLN-1', quantity: 1, unitPrice: 150, total: 150 },
      ],
      subtotal: 150,
      gstRate: 0,
      gstAmount: 0,
      totalAmount: 150,
      paymentMethod: 'Cash',
      actorSeat: 'counter',
    };

    const first = validateCounterSale(payload, processed);
    expect(first.valid).toBe(true);
    expect(first.isReplay).toBe(false);

    const second = validateCounterSale(payload, processed);
    expect(second.valid).toBe(true);
    expect(second.isReplay).toBe(true);
  });

  it('denies counter sale execution for unauthorized roles', () => {
    const processed = new Set<string>();
    const res = validateCounterSale({
      idempotencyKey: 'idemp-unauth',
      tenantId: TENANT,
      customerName: 'Customer',
      items: [
        { itemId: 'i-1', name: 'Coolant 1L', sku: 'SKU-CLN-1', quantity: 1, unitPrice: 150, total: 150 },
      ],
      subtotal: 150,
      gstRate: 0,
      gstAmount: 0,
      totalAmount: 150,
      paymentMethod: 'Cash',
      actorSeat: 'technician', // Technician cannot act as counter POS
    }, processed);

    expect(res.valid).toBe(false);
    expect(res.error).toContain('unauthorized_seat');
  });
});
