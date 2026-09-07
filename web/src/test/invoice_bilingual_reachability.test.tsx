import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Invoice, OrganisationTenant } from '../types/erp';

/**
 * SERP-234 — REACHABILITY evidence, which is a different claim from the
 * render test at `bilingual_invoice_print.test.tsx`.
 *
 * That test renders `<BilingualInvoicePrintView />` with NO invoice prop, so
 * it exercises the component's own demo fallback. It passed for weeks while
 * no user could open the screen at all. A passing render test is not
 * evidence that a capability is reachable, and this file exists to hold the
 * difference:
 *
 *   - render test  ->  "the component works when handed data"
 *   - THIS test    ->  "a user on a real route can get to it, and it is
 *                       handed the REAL invoice rather than the fixture"
 *
 * `ERPContext` is mocked because `InvoiceDetailView` is a routed container
 * that reads from context rather than props. The live provider deliberately
 * initialises `invoices` to `[]` and fills it from the server (SERP-288
 * removed the demo datasets from the tenant surface), so there is no
 * offline seam other than the context itself.
 */

const testInvoice: Invoice = {
  id: 'inv-serp234',
  invoiceNumber: 'INV-2026-0234',
  customerId: 'cust-serp234',
  customerName: 'Fehendhoo Marine Services Pvt Ltd',
  customerPhone: '+960 771-2345',
  customerIsland: 'Fehendhoo',
  date: '2026-08-28',
  dueDate: '2026-09-15',
  gstRate: 8,
  items: [
    {
      id: 'line-1',
      description: 'Outboard engine overhaul — 250hr service',
      quantity: 1,
      unitPrice: 18000,
      amount: 18000,
      category: 'Labor/Service',
    },
  ],
  subtotal: 18000,
  gstAmount: 1440,
  totalAmount: 19440,
  amountPaid: 0,
  balanceDue: 19440,
  status: 'Sent',
  bankDetails: 'BML 7701192837101',
  notes: '',
};

const testTenant = {
  id: 'tenant-serp234',
  name: 'Ignition Ink',
  legalName: 'Club Ignition Pvt Ltd',
  tinNumber: '',
  currency: 'MVR',
  currencySymbol: 'MVR',
  gstRate: 8,
} as unknown as OrganisationTenant;

const erpValue = {
  invoices: [testInvoice],
  jobs: [],
  payments: [],
  currentTenant: testTenant,
  formatMVR: (n: number) => `MVR ${n.toFixed(2)}`,
  setIsRecordPaymentOpen: vi.fn(),
};

vi.mock('../context/ERPContext', () => ({
  useERP: () => erpValue,
  ERPProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Imported after the mock so the container and the print sheet both
// resolve `useERP` to the stub above.
const { InvoiceDetailView } = await import('../components/invoices/InvoiceDetailView');

describe('SERP-234: bilingual invoice is reachable from the invoice route', () => {
  const renderAt = (invoiceId: string) =>
    render(
      <MemoryRouter initialEntries={[`/invoices/${invoiceId}`]}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailView />} />
        </Routes>
      </MemoryRouter>,
    );

  it('offers the Dhivehi/English control on the invoice detail route', () => {
    renderAt(testInvoice.id);

    // The door itself. Before SERP-234 no control anywhere reached this view.
    expect(screen.getByTestId('toggle-bilingual-invoice')).toBeDefined();
  });

  it('is closed by default, so the standard invoice is what loads', () => {
    renderAt(testInvoice.id);

    expect(screen.queryByTestId('bilingual-invoice-print-view')).toBeNull();
    expect(
      screen.getByTestId('toggle-bilingual-invoice').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('opens the bilingual tax invoice when the control is used', () => {
    renderAt(testInvoice.id);

    fireEvent.click(screen.getByTestId('toggle-bilingual-invoice'));

    const sheet = screen.getByTestId('bilingual-invoice-print-view');
    expect(sheet).toBeDefined();
    // Thaana chrome proves it is the real bilingual sheet, not a placeholder.
    expect(within(sheet).getAllByText(/ޓެކްސް އިންވޮއިސް/).length).toBeGreaterThan(0);
  });

  it('hands the sheet the REAL invoice, not the component demo fixture', () => {
    renderAt(testInvoice.id);
    fireEvent.click(screen.getByTestId('toggle-bilingual-invoice'));

    const sheet = screen.getByTestId('bilingual-invoice-print-view');

    // The invoice on the route reached the sheet...
    expect(
      within(sheet).getAllByText(new RegExp(testInvoice.invoiceNumber)).length,
    ).toBeGreaterThan(0);
    expect(
      within(sheet).getAllByText(/Fehendhoo Marine Services/).length,
    ).toBeGreaterThan(0);

    // ...and the component's own demo invoice did NOT.
    expect(within(sheet).queryByText(/INV-2026-0042/)).toBeNull();
    expect(within(sheet).queryByText(/Island Horizon Transport/)).toBeNull();
  });

  it('prints a dash for the seller TIN when the tenant is not GST-registered', () => {
    renderAt(testInvoice.id);
    fireEvent.click(screen.getByTestId('toggle-bilingual-invoice'));

    const sheet = screen.getByTestId('bilingual-invoice-print-view');
    // `tinNumber` is documented as empty until MIRA registration is verified.
    // The sheet must degrade to a dash and never invent a placeholder TIN.
    expect(within(sheet).getAllByText(/TIN/).length).toBeGreaterThan(0);
    expect(within(sheet).queryByText(/undefined/)).toBeNull();
  });

  it('returns to the standard invoice when toggled back', () => {
    renderAt(testInvoice.id);
    const toggle = screen.getByTestId('toggle-bilingual-invoice');

    fireEvent.click(toggle);
    expect(screen.getByTestId('bilingual-invoice-print-view')).toBeDefined();

    fireEvent.click(toggle);
    expect(screen.queryByTestId('bilingual-invoice-print-view')).toBeNull();
  });

  it('does not offer the control when the invoice does not exist', () => {
    renderAt('inv-does-not-exist');

    expect(screen.queryByTestId('toggle-bilingual-invoice')).toBeNull();
    expect(screen.getByText(/Invoice Not Found/)).toBeDefined();
  });
});
