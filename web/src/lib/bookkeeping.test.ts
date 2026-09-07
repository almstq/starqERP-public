import { describe, it, expect } from 'vitest';
import {
  computeTrialBalanceFromLedger,
  computeAuthoritativeBalanceSheet,
  computeAuthoritativeProfitAndLoss,
} from './bookkeeping';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';
import { JournalEntry } from '../domain/journals';

describe('Authoritative Trial Balance & Balance Sheet Engine (SERP-292)', () => {
  const mockJournals: JournalEntry[] = [
    // 1. Initial Partner Capital: DR 1000 Bank 100,000, CR 3000 Capital 100,000
    {
      id: 'je-1',
      entryNumber: 'JE-001',
      date: '2026-08-01',
      source: 'MANUAL',
      narration: 'Partner Capital Injection',
      lines: [
        {
          id: 'l1',
          accountId: '1000',
          accountCode: '1000',
          accountName: 'Bank & Cash',
          accountClass: 'ASSET',
          debit: 100000,
          credit: 0,
        },
        {
          id: 'l2',
          accountId: '3000',
          accountCode: '3000',
          accountName: 'Owner Capital',
          accountClass: 'EQUITY',
          debit: 0,
          credit: 100000,
        },
      ],
      totalDebit: 100000,
      totalCredit: 100000,
      isBalanced: true,
      postedBy: 'Admin',
      postedAt: '2026-08-01T00:00:00Z',
      tenantId: 'tenant-stq',
      status: 'POSTED',
    },
    // 2. Sales Invoice: DR 1100 AR 32,400, CR 4000 Revenue 30,000, CR 2100 GST 2,400
    {
      id: 'je-2',
      entryNumber: 'JE-002',
      date: '2026-08-05',
      source: 'INVOICE',
      narration: 'Invoice INV-001',
      lines: [
        {
          id: 'l3',
          accountId: '1100',
          accountCode: '1100',
          accountName: 'Accounts Receivable',
          accountClass: 'ASSET',
          debit: 32400,
          credit: 0,
        },
        {
          id: 'l4',
          accountId: '4000',
          accountCode: '4000',
          accountName: 'Sales Revenue',
          accountClass: 'REVENUE',
          debit: 0,
          credit: 30000,
        },
        {
          id: 'l5',
          accountId: '2100',
          accountCode: '2100',
          accountName: 'GST Payable',
          accountClass: 'LIABILITY',
          debit: 0,
          credit: 2400,
        },
      ],
      totalDebit: 32400,
      totalCredit: 32400,
      isBalanced: true,
      postedBy: 'System',
      postedAt: '2026-08-05T00:00:00Z',
      tenantId: 'tenant-stq',
      status: 'POSTED',
    },
    // 3. Operating Expense: DR 6000 Rent 15,000, CR 1000 Bank 15,000
    {
      id: 'je-3',
      entryNumber: 'JE-003',
      date: '2026-08-10',
      source: 'EXPENSE',
      narration: 'Rent Expense',
      lines: [
        {
          id: 'l6',
          accountId: '6000',
          accountCode: '6000',
          accountName: 'Rent Expense',
          accountClass: 'EXPENSE',
          debit: 15000,
          credit: 0,
        },
        {
          id: 'l7',
          accountId: '1000',
          accountCode: '1000',
          accountName: 'Bank & Cash',
          accountClass: 'ASSET',
          debit: 0,
          credit: 15000,
        },
      ],
      totalDebit: 15000,
      totalCredit: 15000,
      isBalanced: true,
      postedBy: 'Admin',
      postedAt: '2026-08-10T00:00:00Z',
      tenantId: 'tenant-stq',
      status: 'POSTED',
    },
    // 4. Procurement Bill: DR 5000 COGS 8,000, CR 2000 AP 8,000
    {
      id: 'je-4',
      entryNumber: 'JE-004',
      date: '2026-08-12',
      source: 'BILL',
      narration: 'Vendor Parts Procurement',
      lines: [
        {
          id: 'l8',
          accountId: '5000',
          accountCode: '5000',
          accountName: 'COGS',
          accountClass: 'EXPENSE',
          debit: 8000,
          credit: 0,
        },
        {
          id: 'l9',
          accountId: '2000',
          accountCode: '2000',
          accountName: 'Accounts Payable',
          accountClass: 'LIABILITY',
          debit: 0,
          credit: 8000,
        },
      ],
      totalDebit: 8000,
      totalCredit: 8000,
      isBalanced: true,
      postedBy: 'System',
      postedAt: '2026-08-12T00:00:00Z',
      tenantId: 'tenant-stq',
      status: 'POSTED',
    },
  ];

  it('computes a balanced 2-column Trial Balance with exact 0.00 MVR variance', () => {
    const tb = computeTrialBalanceFromLedger({
      journals: mockJournals,
      accounts: DEFAULT_CHART_OF_ACCOUNTS,
    });

    expect(tb.isBalanced).toBe(true);
    expect(tb.variance).toBe(0);
    expect(tb.totalDebits).toBe(tb.totalCredits);

    // Verify account presence & balances
    // 1000 Bank: 100,000 - 15,000 = 85,000 Debit
    const bank = tb.accounts.find((a) => a.code === '1000');
    expect(bank).toBeDefined();
    expect(bank?.debit).toBe(85000);
    expect(bank?.credit).toBe(0);

    // 1100 AR: 32,400 Debit
    const ar = tb.accounts.find((a) => a.code === '1100');
    expect(ar?.debit).toBe(32400);

    // 2000 AP: 8,000 Credit
    const ap = tb.accounts.find((a) => a.code === '2000');
    expect(ap?.credit).toBe(8000);

    // 2100 GST: 2,400 Credit
    const gst = tb.accounts.find((a) => a.code === '2100');
    expect(gst?.credit).toBe(2400);

    // 3000 Capital: 100,000 Credit
    const capital = tb.accounts.find((a) => a.code === '3000');
    expect(capital?.credit).toBe(100000);

    // 4000 Revenue: 30,000 Credit
    const rev = tb.accounts.find((a) => a.code === '4000');
    expect(rev?.credit).toBe(30000);

    // 5000 COGS: 8,000 Debit
    const cogs = tb.accounts.find((a) => a.code === '5000');
    expect(cogs?.debit).toBe(8000);

    // 6000 Rent: 15,000 Debit
    const rent = tb.accounts.find((a) => a.code === '6000');
    expect(rent?.debit).toBe(15000);

    // Total Debits = 85,000 + 32,400 + 8,000 + 15,000 = 140,400
    // Total Credits = 8,000 + 2,400 + 100,000 + 30,000 = 140,400
    expect(tb.totalDebits).toBe(140400);
    expect(tb.totalCredits).toBe(140400);
  });

  it('computes authoritative Profit & Loss statement', () => {
    const pnl = computeAuthoritativeProfitAndLoss({
      journals: mockJournals,
      accounts: DEFAULT_CHART_OF_ACCOUNTS,
    });

    expect(pnl.totalRevenue).toBe(30000);
    expect(pnl.totalCOGS).toBe(8000);
    expect(pnl.grossProfit).toBe(22000); // 30,000 - 8,000 = 22,000
    expect(pnl.totalOperatingExpenses).toBe(15000);
    expect(pnl.netOperatingIncome).toBe(7000); // 22,000 - 15,000 = 7,000
  });

  it('computes authoritative Balance Sheet with strict Assets = Liabilities + Equity integrity', () => {
    const bs = computeAuthoritativeBalanceSheet({
      journals: mockJournals,
      accounts: DEFAULT_CHART_OF_ACCOUNTS,
    });

    // Total Assets: Bank (85,000) + AR (32,400) = 117,400
    expect(bs.totalAssets).toBe(117400);

    // Total Liabilities: AP (8,000) + GST (2,400) = 10,400
    expect(bs.totalLiabilities).toBe(10400);

    // Total Equity: Capital (100,000) + Net Income (7,000) = 107,000
    expect(bs.equity.totalEquity).toBe(107000);
    expect(bs.equity.currentPeriodNetIncome).toBe(7000);

    // Total Liabilities + Equity = 10,400 + 107,000 = 117,400
    expect(bs.totalLiabilitiesAndEquity).toBe(117400);

    // Mathematical Invariant: Total Assets === Total Liabilities + Equity
    expect(bs.isBalanced).toBe(true);
    expect(bs.variance).toBe(0);
  });
});
