import { describe, it, expect } from 'vitest';
import { toInvoicePrintData } from './invoicePrint';
import type { Invoice, OrganisationTenant } from '../types/erp';

/**
 * SERP-234 — reachability evidence for the bilingual invoice print sheet.
 *
 * These tests prove the MAPPING, and they deliberately also pin the two gaps
 * the mapping cannot close, so that a later change which silently invents a
 * customer TIN or a Dhivehi line description fails here rather than shipping.
 */
describe('SERP-234: bilingual invoice print — real invoice mapping', () => {
  const invoice: Invoice = {
    id: 'inv-501',
    invoiceNumber: 'INV-2026-0501',
    customerId: 'cust-horizon',
    customerName: 'Island Horizon Transport Pvt Ltd',
    customerPhone: '7712345',
    customerIsland: 'Male',
    date: '2026-08-28',
    dueDate: '2026-09-15',
    gstRate: 8,
    items: [
      {
        id: 'line-1',
        description: 'Marine engine service — 200hr',
        quantity: 1,
        unitPrice: 8500,
        amount: 8500,
        category: 'Labor/Service',
      },
      {
        id: 'line-2',
        description: 'Impeller kit',
        quantity: 2,
        unitPrice: 750,
        amount: 1500,
        category: 'Material/Part',
      },
    ],
    subtotal: 10000,
    gstAmount: 800,
    totalAmount: 10800,
    amountPaid: 0,
    balanceDue: 10800,
    status: 'Sent',
    bankDetails: 'BML 7701192837101',
    notes: '',
  };

  const tenant: Pick<OrganisationTenant, 'currency'> = { currency: 'MVR' };

  it('carries identity, dates and money across unchanged', () => {
    const printed = toInvoicePrintData(invoice, tenant);

    expect(printed.id).toBe('inv-501');
    expect(printed.invoiceNumber).toBe('INV-2026-0501');
    expect(printed.customerName).toBe('Island Horizon Transport Pvt Ltd');
    expect(printed.dueDate).toBe('2026-09-15');
    expect(printed.subtotal).toBe(10000);
    expect(printed.totalAmount).toBe(10800);
    expect(printed.status).toBe('Sent');
  });

  it('renames the two fields the print sheet spells differently', () => {
    const printed = toInvoicePrintData(invoice, tenant);

    // stored `date` -> printed `issueDate`
    expect(printed.issueDate).toBe(invoice.date);
    // stored `gstAmount` -> printed `taxAmount`
    expect(printed.taxAmount).toBe(invoice.gstAmount);
  });

  it('takes currency from the tenant rather than assuming MVR', () => {
    expect(toInvoicePrintData(invoice, { currency: 'MVR' }).currency).toBe('MVR');
    expect(toInvoicePrintData(invoice, { currency: 'USD' }).currency).toBe('USD');
  });

  it('applies the invoice-level GST rate to every line', () => {
    const printed = toInvoicePrintData(invoice, tenant);

    expect(printed.items).toHaveLength(2);
    for (const line of printed.items) {
      expect(line.gstRate).toBe(8);
    }
    expect(printed.items[0].description).toBe('Marine engine service — 200hr');
    expect(printed.items[1].quantity).toBe(2);
    expect(printed.items[1].amount).toBe(1500);
  });

  it('sums of the mapped lines still reconcile to the mapped subtotal', () => {
    const printed = toInvoicePrintData(invoice, tenant);
    const lineSum = printed.items.reduce((total, line) => total + line.amount, 0);

    expect(lineSum).toBe(printed.subtotal);
  });

  /**
   * GAP PINS — these two assertions are not describing desired behaviour. They
   * hold the honest state of the data model so it cannot be quietly faked.
   */
  it('GAP: leaves customerTin absent, because Customer has no TIN field', () => {
    const printed = toInvoicePrintData(invoice, tenant);

    expect(printed.customerTin).toBeUndefined();
    // Specifically: it must NOT fall back to the seller's own TIN, which would
    // print the tenant's number in the buyer's position on a tax invoice.
  });

  it('GAP: leaves descriptionDhivehi absent, because line items are English only', () => {
    const printed = toInvoicePrintData(invoice, tenant);

    for (const line of printed.items) {
      expect(line.descriptionDhivehi).toBeUndefined();
    }
  });

  it('maps an empty invoice without inventing lines', () => {
    const empty: Invoice = { ...invoice, items: [], subtotal: 0, gstAmount: 0, totalAmount: 0 };
    const printed = toInvoicePrintData(empty, tenant);

    expect(printed.items).toEqual([]);
    expect(printed.subtotal).toBe(0);
    expect(printed.taxAmount).toBe(0);
  });
});
