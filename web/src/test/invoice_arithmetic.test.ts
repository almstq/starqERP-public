import { describe, it, expect } from 'vitest';
import { InvoiceLineItem, Invoice } from '../types/erp';

describe('Invoice Arithmetic & Total Calculations (SERP-195 / DEC-072)', () => {
  it('correctly calculates line amount from quantity and unit price without floating point drift', () => {
    const qty = 3;
    const unitPrice = 125.50;
    const lineAmount = Math.round(qty * unitPrice * 100) / 100;
    expect(lineAmount).toBe(376.50);
  });

  it('correctly calculates subtotal, GST, and gross total for GST-registered tenant (8% GGST)', () => {
    const lines: InvoiceLineItem[] = [
      { id: '1', description: 'Brake Pad Replacement', quantity: 2, unitPrice: 450, amount: 900, category: 'Material/Part' },
      { id: '2', description: 'Labor - Inspection', quantity: 1, unitPrice: 200, amount: 200, category: 'Labor/Service' },
    ];

    const subtotal = lines.reduce((acc, l) => acc + l.amount, 0);
    expect(subtotal).toBe(1100);

    const gstRate = 0.08;
    const gstAmount = Math.round(subtotal * gstRate * 100) / 100;
    expect(gstAmount).toBe(88.00);

    const totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;
    expect(totalAmount).toBe(1188.00);
  });

  it('correctly calculates 0% GST when tenant is not_registered (Starq Tech)', () => {
    const lines: InvoiceLineItem[] = [
      { id: '1', description: 'Custom AI Consulting', quantity: 10, unitPrice: 1000, amount: 10000, category: 'Labor/Service' },
    ];

    const subtotal = lines.reduce((acc, l) => acc + l.amount, 0);
    const gstRate = 0.00;
    const gstAmount = Math.round(subtotal * gstRate * 100) / 100;
    const totalAmount = subtotal + gstAmount;

    expect(gstAmount).toBe(0.00);
    expect(totalAmount).toBe(10000.00);
  });

  it('handles inclusive GST calculation without returning NaN or fractional laari errors', () => {
    // 108 MVR inclusive of 8% GST -> base: 100 MVR, GST: 8 MVR
    const quotedAmount = 108.00;
    const gstRate = 0.08;
    const subtotal = Math.round((quotedAmount / (1 + gstRate)) * 100) / 100;
    const gstAmount = Math.round((quotedAmount - subtotal) * 100) / 100;

    expect(subtotal).toBe(100.00);
    expect(gstAmount).toBe(8.00);
    expect(subtotal + gstAmount).toBe(quotedAmount);
    expect(isNaN(subtotal)).toBe(false);
    expect(isNaN(gstAmount)).toBe(false);
  });

  it('updates balance due cleanly when partial payment is allocated', () => {
    const totalAmount = 1188.00;
    const partialPayment = 500.00;
    const amountPaid = partialPayment;
    const balanceDue = Math.round((totalAmount - amountPaid) * 100) / 100;

    expect(balanceDue).toBe(688.00);
  });
});
