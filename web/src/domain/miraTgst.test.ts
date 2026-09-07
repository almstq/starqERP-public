import { describe, it, expect } from 'vitest';
import { calculateMiraTgstReturn, createGreenTaxJournalEntry, GreenTaxStayRecord } from './miraTgst';

describe('SERP-319: MIRA Tourism GST (16% TGSTA) and Green Tax Engine', () => {
  const sampleInvoices = [
    {
      id: 'inv-tour-01',
      invoiceNumber: 'INV-TGST-001',
      issueDate: '2026-08-05',
      customerName: 'Global Luxury Charters',
      subtotal: 200000,
      taxAmount: 32000, // 16% TGST
      isTourismSector: true,
      gstRate: 0.16,
      status: 'paid',
    },
    {
      id: 'inv-gen-01',
      invoiceNumber: 'INV-GEN-001',
      issueDate: '2026-08-10',
      customerName: 'Local Male Delivery',
      subtotal: 50000,
      taxAmount: 4000, // 8% General GST
      isTourismSector: false,
      gstRate: 0.08,
      status: 'paid',
    },
  ];

  const sampleExpenses = [
    {
      id: 'exp-tour-01',
      reference: 'EXP-YACHT-FUEL',
      date: '2026-08-12',
      supplierName: 'State Electric & Fuel Maldives',
      amount: 58000, // 50000 + 8000 (16% TGST)
      taxAmount: 8000,
      isTourismSector: true,
    },
  ];

  const sampleStays: GreenTaxStayRecord[] = [
    {
      id: 'stay-01',
      guestName: 'Alexander Wright',
      passportOrId: 'GB9920194',
      nationality: 'British',
      isTourist: true,
      checkInDate: '2026-08-01',
      checkOutDate: '2026-08-08',
      totalNights: 7,
      ratePerNightUsd: 6.0,
      totalGreenTaxUsd: 42.0,
      exchangeRate: 15.42,
      totalGreenTaxMvr: 647.64,
    },
    {
      id: 'stay-02',
      guestName: 'Ibrahim Rasheed',
      passportOrId: 'A091823',
      nationality: 'Maldivian',
      isTourist: false, // Maldivians exempt
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-13',
      totalNights: 3,
      ratePerNightUsd: 6.0,
      totalGreenTaxUsd: 0,
      exchangeRate: 15.42,
      totalGreenTaxMvr: 0,
    },
  ];

  it('calculates 16% TGST output tax and input tax deductions accurately', () => {
    const result = calculateMiraTgstReturn({
      invoices: sampleInvoices,
      expenses: sampleExpenses,
      greenTaxStays: sampleStays,
      periodYear: 2026,
      periodMonth: 8,
      tin: '1002345GST501',
      legalEntityName: 'Maldives Yacht Charters Pvt Ltd',
    });

    expect(result.totalTourismTaxableSuppliesMvr).toBe(200000);
    expect(result.totalTgstOutputTaxMvr).toBe(32000); // 16% of 200,000
    expect(result.totalTourismPurchasesMvr).toBe(50000);
    expect(result.totalTgstInputTaxMvr).toBe(8000);
    expect(result.netTgstPayableMvr).toBe(24000); // 32,000 - 8,000
  });

  it('preserves recorded TGST and holds filing when current registration is false', () => {
    const result = calculateMiraTgstReturn({
      invoices: sampleInvoices,
      expenses: sampleExpenses,
      periodYear: 2026,
      periodMonth: 8,
      tin: '',
      legalEntityName: 'Unregistered Tenant',
      isGstRegistered: false,
    });

    expect(result.isGstRegistered).toBe(false);
    expect(result.totalTourismTaxableSuppliesMvr).toBe(200000);
    expect(result.totalTgstOutputTaxMvr).toBe(32000);
    expect(result.totalTgstInputTaxMvr).toBe(8000);
    expect(result.netTgstPayableMvr).toBe(24000);
    expect(result.filingReadiness).toMatchObject({ status: 'HOLD', value: null });
  });

  it('tracks Green Tax ($6.00 USD/night) for tourists while exempting local citizens', () => {
    const result = calculateMiraTgstReturn({
      invoices: sampleInvoices,
      expenses: sampleExpenses,
      greenTaxStays: sampleStays,
      periodYear: 2026,
      periodMonth: 8,
      tin: '1002345GST501',
      legalEntityName: 'Maldives Yacht Charters Pvt Ltd',
      usdToMvrRate: 15.42,
    });

    expect(result.totalTouristBedNights).toBe(7); // Only British tourist
    expect(result.totalGreenTaxPayableUsd).toBe(42.0); // 7 nights * $6
    expect(result.totalGreenTaxPayableMvr).toBe(647.64); // 42 * 15.42
  });

  it('generates balanced double-entry journal entry for Green Tax liability', () => {
    const result = calculateMiraTgstReturn({
      invoices: sampleInvoices,
      expenses: sampleExpenses,
      greenTaxStays: sampleStays,
      periodYear: 2026,
      periodMonth: 8,
      tin: '1002345GST501',
      legalEntityName: 'Maldives Yacht Charters Pvt Ltd',
    });

    const je = createGreenTaxJournalEntry(result, 'tenant-safari-01');
    expect(je).toBeDefined();
    expect(je?.isBalanced).toBe(true);
    expect(je?.totalDebit).toBe(647.64);
    expect(je?.totalCredit).toBe(647.64);
    expect(je?.lines[1].accountCode).toBe('2123'); // Green Tax Payable (MIRA)
  });
});

describe('SERP-342: time-of-supply resolution wired into the TGST return', () => {
  it('leaves legacy invoices (no supplyEventType) using issueDate exactly as before', () => {
    const result = calculateMiraTgstReturn({
      invoices: [
        {
          id: 'inv-legacy',
          issueDate: '2026-08-05',
          subtotal: 100000,
          taxAmount: 17000,
          isTourismSector: true,
          gstRate: 0.17,
          status: 'paid',
        },
      ],
      expenses: [],
      periodYear: 2026,
      periodMonth: 8,
      tin: 'T1',
      legalEntityName: 'Legacy Co',
    });
    expect(result.totalTgstOutputTaxMvr).toBe(17000);
    expect(result.unresolvedTimeOfSupplyInvoiceIds).toEqual([]);
  });

  it('excludes an invoice from a return in the LATE invoice month when the deemed date actually falls in the prior month', () => {
    // Goods delivered 2026-06-27; the 3-day deemed window closes 2026-06-30 -
    // still June. The invoice is only raised 2026-07-04 - July. A June-only
    // return must exclude this invoice under the deemed date (June 30 IS in
    // June, so it should actually be picked up by June, not excluded - see
    // the next test). This test instead proves the July return does NOT
    // double-count it: the deemed date already placed it in June.
    const result = calculateMiraTgstReturn({
      invoices: [
        {
          id: 'inv-deemed',
          issueDate: '2026-07-04', // legacy field still present but must NOT be used once supplyEventType opts in
          supplyEventType: 'GOODS_DELIVERY',
          supplyEventDate: '2026-06-27',
          documents: [{ type: 'TAX_INVOICE', issuedDate: '2026-07-04' }],
          subtotal: 100000,
          taxAmount: 16000,
          isTourismSector: true,
          gstRate: 0.16,
          status: 'paid',
        },
      ],
      expenses: [],
      periodYear: 2026,
      periodMonth: 7, // July, where the late invoice was actually raised
      tin: 'T1',
      legalEntityName: 'Deemed Co',
    });
    // The deemed date (2026-06-30) is in June, not July - so the July return,
    // built from the LEGACY invoice date, would have wrongly included it (and
    // double-counted it alongside the June return below). Using time of
    // supply correctly excludes it from July.
    expect(result.totalTgstOutputTaxMvr).toBe(0);
    expect(result.unresolvedTimeOfSupplyInvoiceIds).toEqual([]);
  });

  it('includes the invoice in June - the EARLIER period - via the deemed date, not the late July invoice date', () => {
    const result = calculateMiraTgstReturn({
      invoices: [
        {
          id: 'inv-deemed-2',
          issueDate: '2026-07-04',
          supplyEventType: 'GOODS_DELIVERY',
          supplyEventDate: '2026-06-27',
          documents: [{ type: 'TAX_INVOICE', issuedDate: '2026-07-04' }],
          subtotal: 100000,
          taxAmount: 16000,
          isTourismSector: true,
          gstRate: 0.16,
          status: 'paid',
        },
      ],
      expenses: [],
      periodYear: 2026,
      periodMonth: 6, // deemed date 2026-06-30 falls in June, the delivery's own month
      tin: 'T1',
      legalEntityName: 'Deemed Co',
    });
    expect(result.totalTourismTaxableSuppliesMvr).toBe(100000);
    expect(result.totalTgstOutputTaxMvr).toBe(16000);
  });

  it('falls back to the legacy date and records the id when time of supply cannot be resolved', () => {
    const result = calculateMiraTgstReturn({
      invoices: [
        {
          id: 'inv-advance',
          issueDate: '2026-08-05',
          supplyEventType: 'ADVANCE_DEPOSIT_OR_INSTALMENT', // deliberately unresolved case
          subtotal: 100000,
          taxAmount: 17000,
          isTourismSector: true,
          gstRate: 0.17,
          status: 'paid',
        },
      ],
      expenses: [
        {
          id: 'exp-advance',
          date: '2026-08-06',
          supplyEventType: 'ADVANCE_DEPOSIT_OR_INSTALMENT' as never,
          amount: 11700,
          taxAmount: 1700,
          isTourismSector: true,
        },
      ],
      periodYear: 2026,
      periodMonth: 8,
      tin: 'T1',
      legalEntityName: 'Advance Co',
    });
    // Falls back to issueDate/date, which is within the period, so it's still counted.
    expect(result.totalTgstOutputTaxMvr).toBe(17000);
    expect(result.unresolvedTimeOfSupplyInvoiceIds).toEqual(['inv-advance']);
    expect(result.unresolvedTimeOfSupplyExpenseIds).toEqual(['exp-advance']);
  });
});
