import { describe, it, expect } from 'vitest';

export interface TaxDoc {
  documentId: string;
  documentNumber: string;
  documentType: 'Invoice' | 'CounterSale' | 'PurchaseOrder' | 'Expense';
  date: string;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
}

export function computeTaxWorkingPaper(params: {
  tenantId: string;
  taxPeriod: string;
  isGstRegistered: boolean;
  tinNumber?: string;
  sales: TaxDoc[];
  purchases: TaxDoc[];
}) {
  let totalSales = 0;
  let totalOutputGst = 0;
  for (const s of params.sales) {
    totalSales += s.taxableAmount;
    if (params.isGstRegistered) totalOutputGst += s.gstAmount;
  }

  let totalPurchases = 0;
  let totalInputGst = 0;
  for (const p of params.purchases) {
    totalPurchases += p.taxableAmount;
    if (params.isGstRegistered) totalInputGst += p.gstAmount;
  }

  return {
    tenantId: params.tenantId,
    taxPeriod: params.taxPeriod,
    gstRegistrationStatus: params.isGstRegistered ? 'registered' : 'not_registered',
    tinNumber: params.tinNumber,
    totalTaxableSales: Math.round(totalSales * 100) / 100,
    totalOutputGst: Math.round(totalOutputGst * 100) / 100,
    totalTaxablePurchases: Math.round(totalPurchases * 100) / 100,
    totalInputGst: Math.round(totalInputGst * 100) / 100,
    netGstPayable: Math.round((totalOutputGst - totalInputGst) * 100) / 100,
    salesCount: params.sales.length,
    purchasesCount: params.purchases.length,
    isReviewable: true,
  };
}

describe('SERP-007: Stage 4 Commercial, Purchasing & Tax Working Papers', () => {
  const REGISTERED_TENANT = 'tenant-ignition';
  const NON_REGISTERED_TENANT = 'tenant-starq';

  it('generates reviewable tax working paper with input/output offset for registered tenant', () => {
    const sales: TaxDoc[] = [
      { documentId: 'inv-1', documentNumber: 'INV-2026-01', documentType: 'Invoice', date: '2026-08-10', taxableAmount: 50000, gstRate: 8, gstAmount: 4000 },
      { documentId: 'pos-1', documentNumber: 'POS-2026-01', documentType: 'CounterSale', date: '2026-08-12', taxableAmount: 10000, gstRate: 8, gstAmount: 800 },
    ];
    const purchases: TaxDoc[] = [
      { documentId: 'po-1', documentNumber: 'PO-2026-01', documentType: 'PurchaseOrder', date: '2026-08-04', taxableAmount: 20000, gstRate: 8, gstAmount: 1600 },
      { documentId: 'exp-1', documentNumber: 'EXP-2026-01', documentType: 'Expense', date: '2026-08-05', taxableAmount: 5000, gstRate: 8, gstAmount: 400 },
    ];

    const paper = computeTaxWorkingPaper({
      tenantId: REGISTERED_TENANT,
      taxPeriod: '2026-08',
      isGstRegistered: true,
      tinNumber: '1068940GST001',
      sales,
      purchases,
    });

    expect(paper.gstRegistrationStatus).toBe('registered');
    expect(paper.totalTaxableSales).toBe(60000);
    expect(paper.totalOutputGst).toBe(4800);
    expect(paper.totalTaxablePurchases).toBe(25000);
    expect(paper.totalInputGst).toBe(2000);
    expect(paper.netGstPayable).toBe(2800); // 4800 - 2000
    expect(paper.isReviewable).toBe(true);
  });

  it('guarantees 0% tax schedule and zero output/input GST claims for non-registered tenant', () => {
    const sales: TaxDoc[] = [
      { documentId: 'inv-2', documentNumber: 'INV-2026-02', documentType: 'Invoice', date: '2026-08-10', taxableAmount: 30000, gstRate: 0, gstAmount: 0 },
    ];
    const purchases: TaxDoc[] = [
      { documentId: 'po-2', documentNumber: 'PO-2026-02', documentType: 'PurchaseOrder', date: '2026-08-04', taxableAmount: 15000, gstRate: 0, gstAmount: 0 },
    ];

    const paper = computeTaxWorkingPaper({
      tenantId: NON_REGISTERED_TENANT,
      taxPeriod: '2026-08',
      isGstRegistered: false,
      sales,
      purchases,
    });

    expect(paper.gstRegistrationStatus).toBe('not_registered');
    expect(paper.totalTaxableSales).toBe(30000);
    expect(paper.totalOutputGst).toBe(0);
    expect(paper.totalTaxablePurchases).toBe(15000);
    expect(paper.totalInputGst).toBe(0);
    expect(paper.netGstPayable).toBe(0);
    expect(paper.isReviewable).toBe(true);
  });
});
