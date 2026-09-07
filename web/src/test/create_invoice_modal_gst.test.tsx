import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Bug fix, 5 Sep 2026 (docs/qa/BUG_LOG_2026-09-05_FOUNDER_LIVE_TESTING.md #1).
 *
 * CreateInvoiceModal hardcoded `gstRate = 0; gstAmount = 0;` despite its own
 * label reading "Maldives GST (8%)" - every invoice created through it was
 * silently understated by the full GST amount, and that wrong amount was
 * persisted via createInvoice(), not just shown wrong on screen. This test
 * pins the fix: the displayed total and the amount actually submitted must
 * both reflect the real resolved GST rate.
 */

const testCustomer = {
  id: 'cust-1',
  name: 'Fehendhoo Marine Services Pvt Ltd',
  phone: '+960 771-2345',
  island: 'Fehendhoo',
};

const createInvoiceMock = vi.fn((_invoice: Record<string, unknown>) => ({ id: 'inv-new' }));

const erpValue = {
  isCreateInvoiceOpen: true,
  setIsCreateInvoiceOpen: vi.fn(),
  customers: [testCustomer],
  jobs: [],
  createInvoice: createInvoiceMock,
  prefilledCustomerId: null,
  setPrefilledCustomerId: vi.fn(),
  setSelectedInvoiceId: vi.fn(),
  formatMVR: (n: number) => `MVR ${n.toFixed(2)}`,
};

vi.mock('../context/ERPContext', () => ({
  useERP: () => erpValue,
}));

const { CreateInvoiceModal } = await import('../components/invoices/CreateInvoiceModal');

describe('CreateInvoiceModal: GST is actually computed, not hardcoded to zero', () => {
  it('shows a non-zero GST amount for the default MVR 25,000 line item', () => {
    render(<CreateInvoiceModal />);

    // Default seed item is 1 x 25,000 = 25,000 subtotal. At the current 8%
    // general GST band that is 2,000.00 - not 0.00.
    expect(screen.getByText('MVR 2000.00')).toBeDefined();
    expect(screen.queryByText('MVR 0.00')).toBeNull();
  });

  it('shows a total that includes GST, not just the bare subtotal', () => {
    render(<CreateInvoiceModal />);

    expect(screen.getByText('MVR 27000.00')).toBeDefined();
  });

  it('labels the GST line with the actual resolved rate, not a hardcoded string', () => {
    render(<CreateInvoiceModal />);

    expect(screen.getByText(/Maldives GST \(8%\):/)).toBeDefined();
  });

  it('persists the computed gstAmount/totalAmount, not zero, when the invoice is created', () => {
    render(<CreateInvoiceModal />);

    fireEvent.click(screen.getByRole('button', { name: /Issue Tax Invoice/i }));

    expect(createInvoiceMock).toHaveBeenCalledTimes(1);
    const submitted = createInvoiceMock.mock.calls[0][0];
    expect(submitted.subtotal).toBe(25000);
    expect(submitted.gstAmount).toBe(2000);
    expect(submitted.totalAmount).toBe(27000);
    expect(submitted.gstRate).toBeCloseTo(0.08);
  });
});
