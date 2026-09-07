import { describe, expect, it } from 'vitest';
import { resolveInvoiceFinanceDecision } from '../../../supabase/functions/_shared/invoiceFinance';

const input = {
  items: [{ quantity: 2, unitPrice: 500 }],
  taxMode: 'exclusive' as const,
  snapshotDate: '2026-09-06',
};

describe('SERP-339 Item 5 invoice finance boundary', () => {
  it('returns HOLD when authoritative tax resolution is unavailable', async () => {
    const result = await resolveInvoiceFinanceDecision(input, async () => {
      throw new Error('database unavailable');
    });

    expect(result.status).toBe('HOLD');
    expect(result.value).toBeNull();
    expect(result.reason).toMatch(/HOLD/);
  });

  it('returns READY with server-derived values and ignores caller totals', async () => {
    const result = await resolveInvoiceFinanceDecision(input, async (lineAmount) => ({
      is_taxable: true,
      tax_rate: 0.08,
      base_amount: lineAmount,
      tax_amount: 80,
      gross_amount: 1080,
      err_msg: null,
    }));

    expect(result).toMatchObject({
      status: 'READY',
      value: { gstRate: 0.08, gstAmount: 80, subtotal: 1000, totalAmount: 1080 },
    });
  });

  it('returns HOLD when invoice lines resolve to mixed tax rates', async () => {
    let lineIndex = 0;
    const result = await resolveInvoiceFinanceDecision(
      { ...input, items: [{ quantity: 1, unitPrice: 500 }, { quantity: 1, unitPrice: 500 }] },
      async (lineAmount) => {
        const rate = lineIndex++ === 0 ? 0.08 : 0.1;
        return {
        is_taxable: true,
        tax_rate: rate,
        base_amount: lineAmount,
        tax_amount: lineAmount * rate,
        gross_amount: lineAmount * (1 + rate),
        err_msg: null,
        };
      },
    );

    expect(result.status).toBe('HOLD');
    expect(result.value).toBeNull();
    expect(result.reason).toMatch(/Mixed tax rates/);
  });
});
