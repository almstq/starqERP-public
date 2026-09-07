import { describe, it, expect } from 'vitest';
import { calculateMiraGst201Return, generateMiraConnectCsv } from './miraGst201';

describe('SERP-297: MIRA GST-201 Tax Return Calculation Engine', () => {
  const sampleInvoices = [
    {
      id: 'inv-01',
      invoiceNumber: 'INV-2026-001',
      issueDate: '2026-08-05',
      customerName: 'Island Resorts Maldives',
      subtotal: 100000,
      taxAmount: 8000,
      status: 'paid',
    },
    {
      id: 'inv-02',
      invoiceNumber: 'INV-2026-002',
      issueDate: '2026-08-12',
      customerName: 'Export Shipping Co',
      subtotal: 25000,
      isZeroRated: true,
      status: 'paid',
    },
    {
      id: 'inv-03',
      invoiceNumber: 'INV-2026-003',
      issueDate: '2026-08-20',
      customerName: 'State Training Institute',
      subtotal: 15000,
      isExempt: true,
      status: 'paid',
    },
  ];

  const sampleExpenses = [
    {
      id: 'exp-01',
      reference: 'EXP-SUP-01',
      date: '2026-08-08',
      supplierName: 'Paint & Hardware Male',
      amount: 21600, // 20000 + 1600 (8% GST)
      taxAmount: 1600,
      isCapitalExpense: false,
    },
    {
      id: 'exp-02',
      reference: 'EXP-CAP-01',
      date: '2026-08-18',
      supplierName: 'Dell Technology Maldives',
      amount: 43200, // 40000 + 3200 (8% GST)
      taxAmount: 3200,
      isCapitalExpense: true,
    },
  ];

  it('computes exact MIRA Form 201 box values for general sector 8% GST', () => {
    const result = calculateMiraGst201Return({
      invoices: sampleInvoices,
      expenses: sampleExpenses,
      periodYear: 2026,
      periodMonth: 8,
      tin: '1002345GST501',
      legalEntityName: 'Club Ignition Pvt Ltd',
      isGstRegistered: true,
    });

    // Output Tax (Boxes 1-7)
    expect(result.box1_standardSupplies8Value).toBe(100000);
    expect(result.box2_standardSupplies8Tax).toBe(8000);
    expect(result.box5_zeroRatedSuppliesValue).toBe(25000);
    expect(result.box6_exemptSuppliesValue).toBe(15000);
    expect(result.box7_totalOutputTax).toBe(8000);

    // Input Tax (Boxes 8-12)
    expect(result.box8_standardPurchasesValue).toBe(20000);
    expect(result.box9_standardPurchasesTax).toBe(1600);
    expect(result.box10_capitalPurchasesValue).toBe(40000);
    expect(result.box11_capitalPurchasesTax).toBe(3200);
    expect(result.box12_totalInputTax).toBe(4800);

    // Net MIRA Payable (Box 13 = Box 7 - Box 12 = 8000 - 4800 = 3200)
    expect(result.box13_netGstPayable).toBe(3200);
    expect(result.isRefundable).toBe(false);
    expect(result.filingDueDate).toBe('2026-09-28');
  });

  it('demarcates non-GST-registered entities with zero tax liability', () => {
    const result = calculateMiraGst201Return({
      invoices: sampleInvoices,
      expenses: sampleExpenses,
      periodYear: 2026,
      periodMonth: 8,
      tin: '',
      legalEntityName: 'Small Micro Enterprise',
      isGstRegistered: false,
    });

    expect(result.isGstRegistered).toBe(false);
    expect(result.box7_totalOutputTax).toBe(0);
    expect(result.box12_totalInputTax).toBe(0);
    expect(result.box13_netGstPayable).toBe(0);
  });

  it('formats valid MIRAconnect CSV export with all 13 boxes', () => {
    const result = calculateMiraGst201Return({
      invoices: sampleInvoices,
      expenses: sampleExpenses,
      periodYear: 2026,
      periodMonth: 8,
      tin: '1002345GST501',
      legalEntityName: 'Club Ignition Pvt Ltd',
      isGstRegistered: true,
    });

    const csv = generateMiraConnectCsv(result);
    expect(csv).toContain('MIRA_FORM,GST-201');
    expect(csv).toContain('TIN,1002345GST501');
    expect(csv).toContain('Box 1 & 2,Standard Rated Supplies (8%),100000.00,8000.00');
    expect(csv).toContain('Box 13,Net GST Payable / (Refundable),,3200.00');
  });
});
