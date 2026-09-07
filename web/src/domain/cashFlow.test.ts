import { accountClassForCode } from './accounts';
import { describe, it, expect } from 'vitest';
import { computeCashFlowStatement, isCashOrBankAccount } from './cashFlow';
import { JournalEntry } from './journals';

describe('SERP-317: Direct and Indirect Cash Flow Statement Reporting Engine', () => {
  const sampleJournals: JournalEntry[] = [
    // 1. Customer receipt (Operating Inflow: 50,000)
    {
      id: 'je-01',
      entryNumber: 'JE-RCT-001',
      date: '2026-08-05',
      source: 'PAYMENT',
      reference: 'RCT-1001',
      narration: 'Customer Settlement',
      lines: [
        { id: 'l1', accountCode: '1010', accountId: 'acc-1010', accountClass: accountClassForCode('1010'), accountName: 'BML MVR', debit: 50000, credit: 0, narration: 'Bank Receipt' },
        { id: 'l2', accountCode: '1100', accountId: 'acc-1100', accountClass: accountClassForCode('1100'), accountName: 'Accounts Receivable', debit: 0, credit: 50000, narration: 'AR Clearing' },
      ],
      totalDebit: 50000,
      totalCredit: 50000,
      isBalanced: true,
      postedBy: 'System',
      postedAt: '2026-08-05T10:00:00Z',
      tenantId: 'tenant-01',
      status: 'POSTED',
    },
    // 2. Supplier payment (Operating Outflow: 15,000)
    {
      id: 'je-02',
      entryNumber: 'JE-PAY-001',
      date: '2026-08-10',
      source: 'BILL',
      reference: 'PAY-2001',
      narration: 'Supplier Settlement',
      lines: [
        { id: 'l3', accountCode: '2000', accountId: 'acc-2000', accountClass: accountClassForCode('2000'), accountName: 'Accounts Payable', debit: 15000, credit: 0, narration: 'AP Clearing' },
        { id: 'l4', accountCode: '1010', accountId: 'acc-1010', accountClass: accountClassForCode('1010'), accountName: 'BML MVR', debit: 0, credit: 15000, narration: 'Bank Wire' },
      ],
      totalDebit: 15000,
      totalCredit: 15000,
      isBalanced: true,
      postedBy: 'System',
      postedAt: '2026-08-10T10:00:00Z',
      tenantId: 'tenant-01',
      status: 'POSTED',
    },
    // 3. Purchase of Capital Machinery (Investing Outflow: 20,000)
    {
      id: 'je-03',
      entryNumber: 'JE-CAP-001',
      date: '2026-08-15',
      source: 'MANUAL',
      reference: 'CAP-MACH-01',
      narration: 'Outboard Engine Purchase',
      lines: [
        { id: 'l5', accountCode: '1500', accountId: 'acc-1500', accountClass: accountClassForCode('1500'), accountName: 'Machinery & Equipment', debit: 20000, credit: 0, narration: 'Engine' },
        { id: 'l6', accountCode: '1010', accountId: 'acc-1010', accountClass: accountClassForCode('1010'), accountName: 'BML MVR', debit: 0, credit: 20000, narration: 'Bank Outflow' },
      ],
      totalDebit: 20000,
      totalCredit: 20000,
      isBalanced: true,
      postedBy: 'System',
      postedAt: '2026-08-15T10:00:00Z',
      tenantId: 'tenant-01',
      status: 'POSTED',
    },
    // 4. Owner Capital Injection (Financing Inflow: 30,000)
    {
      id: 'je-04',
      entryNumber: 'JE-FIN-001',
      date: '2026-08-20',
      source: 'MANUAL',
      reference: 'EQUITY-01',
      narration: 'Owner Capital Deposit',
      lines: [
        { id: 'l7', accountCode: '1010', accountId: 'acc-1010', accountClass: accountClassForCode('1010'), accountName: 'BML MVR', debit: 30000, credit: 0, narration: 'Capital Inflow' },
        { id: 'l8', accountCode: '3000', accountId: 'acc-3000', accountClass: accountClassForCode('3000'), accountName: 'Owner Equity', debit: 0, credit: 30000, narration: 'Capital Contribution' },
      ],
      totalDebit: 30000,
      totalCredit: 30000,
      isBalanced: true,
      postedBy: 'System',
      postedAt: '2026-08-20T10:00:00Z',
      tenantId: 'tenant-01',
      status: 'POSTED',
    },
  ];

  it('categorizes cash flows accurately across Operating, Investing, and Financing activities', () => {
    const cfs = computeCashFlowStatement({
      journals: sampleJournals,
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-31',
      openingCash: 10000,
    });

    // Operating: 50,000 receipts - 15,000 suppliers = +35,000
    expect(cfs.operatingActivities.netCashFlow).toBe(35000);

    // Investing: -20,000 machinery = -20,000
    expect(cfs.investingActivities.netCashFlow).toBe(-20000);

    // Financing: +30,000 equity = +30,000
    expect(cfs.financingActivities.netCashFlow).toBe(30000);

    // Net Change: 35,000 - 20,000 + 30,000 = +45,000
    expect(cfs.netChangeInCash).toBe(45000);

    // Closing Cash: 10,000 opening + 45,000 net = 55,000
    expect(cfs.closingCashBalance).toBe(55000);
  });

  it('validates mathematical identity: Closing Cash === Balance Sheet Cash & Bank', () => {
    const cfs = computeCashFlowStatement({
      journals: sampleJournals,
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-31',
      openingCash: 0,
    });

    // Balance Sheet cash from journals = 50,000 - 15,000 - 20,000 + 30,000 = 45,000
    expect(cfs.balanceSheetCashBalance).toBe(45000);
    expect(cfs.closingCashBalance).toBe(45000);
    expect(cfs.isBalanced).toBe(true);
    expect(cfs.variance).toBe(0);
  });

  it('accurately identifies cash and bank account codes (1000..1099)', () => {
    expect(isCashOrBankAccount('1000')).toBe(true); // Cash on Hand
    expect(isCashOrBankAccount('1010')).toBe(true); // BML MVR
    expect(isCashOrBankAccount('1030')).toBe(true); // MIB MVR
    expect(isCashOrBankAccount('1100')).toBe(false); // Accounts Receivable
    expect(isCashOrBankAccount('2000')).toBe(false); // Accounts Payable
  });
});
