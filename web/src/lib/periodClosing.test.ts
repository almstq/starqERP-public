import { accountClassForCode } from '../domain/accounts';
import { describe, it, expect } from 'vitest';
import {
  generateFiscalPeriods,
  assertPeriodNotLocked,
  lockPeriod,
  unlockPeriod,
} from '../domain/periods';
import {
  previewYearEndClose,
  executeYearEndClose,
} from './periodClosing';
import { JournalEntry } from '../domain/journals';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';

describe('SERP-295: Accounting Period Lock & Year-End Roll-Forward Engine', () => {
  const fiscalYear = 2026;
  const initialPeriods = generateFiscalPeriods(fiscalYear);

  it('generates 12 standard fiscal periods for the year', () => {
    expect(initialPeriods.length).toBe(12);
    expect(initialPeriods[0].periodName).toBe('January 2026');
    expect(initialPeriods[0].startDate).toBe('2026-01-01');
    expect(initialPeriods[0].status).toBe('OPEN');
    expect(initialPeriods[11].periodName).toBe('December 2026');
  });

  it('locks a past accounting period and blocks new/modified transactions in that date range', () => {
    // Lock March 2026 (2026-03-01 to 2026-03-31)
    const lockedPeriods = lockPeriod('period-2026-03', initialPeriods, 'Controller Ali');
    const march = lockedPeriods.find((p) => p.id === 'period-2026-03');

    expect(march?.status).toBe('LOCKED');
    expect(march?.lockedBy).toBe('Controller Ali');

    // Attempting to post on 2026-03-15 throws error
    expect(() => {
      assertPeriodNotLocked('2026-03-15', lockedPeriods);
    }).toThrow(/Accounting period "March 2026" is LOCKED/i);

    // Posting on 2026-04-01 (OPEN period) succeeds without error
    expect(() => {
      assertPeriodNotLocked('2026-04-01', lockedPeriods);
    }).not.toThrow();
  });

  it('requires an audited unlocking workflow with reason logging', () => {
    const lockedPeriods = lockPeriod('period-2026-03', initialPeriods, 'Controller Ali');

    // Unlocking without reason throws error
    expect(() => {
      unlockPeriod('period-2026-03', lockedPeriods, '', 'Controller Ali');
    }).toThrow(/audit reason of at least 5 characters/i);

    // Unlocking with valid reason succeeds and logs audit entry
    const unlockedPeriods = unlockPeriod(
      'period-2026-03',
      lockedPeriods,
      'Auditor requested backdated depreciation adjustment',
      'Controller Ali'
    );

    const march = unlockedPeriods.find((p) => p.id === 'period-2026-03');
    expect(march?.status).toBe('OPEN');
    expect(march?.unlockHistory?.length).toBe(1);
    expect(march?.unlockHistory?.[0].reason).toBe('Auditor requested backdated depreciation adjustment');

    // Posting on 2026-03-15 now succeeds
    expect(() => {
      assertPeriodNotLocked('2026-03-15', unlockedPeriods);
    }).not.toThrow();
  });

  it('executes year-end closing wizard, zeroes P&L accounts, and rolls net income into Retained Earnings', () => {
    const mockYearJournals: JournalEntry[] = [
      // 1. Revenue Posting: CR 4000 Sales Revenue 50,000 (DR 1200 AR 50,000)
      {
        id: 'je-1',
        entryNumber: 'JE-001',
        date: '2026-06-15',
        narration: 'Commercial overhaul revenue',
        source: 'INVOICE',
        lines: [
          { id: '1', accountCode: '1200', accountId: 'acc-1200', accountClass: accountClassForCode('1200'), accountName: 'Accounts Receivable', debit: 50000, credit: 0 },
          { id: '2', accountCode: '4000', accountId: 'acc-4000', accountClass: accountClassForCode('4000'), accountName: 'Operating & Service Revenue', debit: 0, credit: 50000 },
        ],
        totalDebit: 50000,
        totalCredit: 50000,
        isBalanced: true,
        postedBy: 'Test Harness',
        postedAt: '2026-06-15T00:00:00.000Z',
        tenantId: 'tenant-test',
        status: 'POSTED',
      },
      // 2. COGS Posting: DR 5000 COGS 20,000 (CR 1300 Inventory 20,000)
      {
        id: 'je-2',
        entryNumber: 'JE-002',
        date: '2026-07-20',
        narration: 'Material parts cost',
        source: 'BILL',
        lines: [
          { id: '3', accountCode: '5000', accountId: 'acc-5000', accountClass: accountClassForCode('5000'), accountName: 'Cost of Goods Sold', debit: 20000, credit: 0 },
          { id: '4', accountCode: '1300', accountId: 'acc-1300', accountClass: accountClassForCode('1300'), accountName: 'Raw Materials Inventory', debit: 0, credit: 20000 },
        ],
        totalDebit: 20000,
        totalCredit: 20000,
        isBalanced: true,
        postedBy: 'Test Harness',
        postedAt: '2026-07-20T00:00:00.000Z',
        tenantId: 'tenant-test',
        status: 'POSTED',
      },
      // 3. Operating Expense: DR 6000 Rent & Utilities 10,000 (CR 1010 Bank 10,000)
      {
        id: 'je-3',
        entryNumber: 'JE-003',
        date: '2026-08-01',
        narration: 'Dockyard rent',
        source: 'EXPENSE',
        lines: [
          { id: '5', accountCode: '6000', accountId: 'acc-6000', accountClass: accountClassForCode('6000'), accountName: 'Operating & Administrative Expenses', debit: 10000, credit: 0 },
          { id: '6', accountCode: '1010', accountId: 'acc-1010', accountClass: accountClassForCode('1010'), accountName: 'BML Operations Account', debit: 0, credit: 10000 },
        ],
        totalDebit: 10000,
        totalCredit: 10000,
        isBalanced: true,
        postedBy: 'Test Harness',
        postedAt: '2026-08-01T00:00:00.000Z',
        tenantId: 'tenant-test',
        status: 'POSTED',
      },
    ];

    // Net Income = Revenue (50,000) - COGS (20,000) - Opex (10,000) = 20,000 Profit
    const preview = previewYearEndClose({
      fiscalYear,
      journals: mockYearJournals,
      accounts: DEFAULT_CHART_OF_ACCOUNTS,
    });

    expect(preview.totalRevenue).toBe(50000);
    expect(preview.totalExpenses).toBe(30000);
    expect(preview.netIncome).toBe(20000);
    expect(preview.revenueAccountsToZero.length).toBe(1);
    expect(preview.expenseAccountsToZero.length).toBe(2);

    // Execute year-end close
    const result = executeYearEndClose({
      fiscalYear,
      journals: mockYearJournals,
      accounts: DEFAULT_CHART_OF_ACCOUNTS,
      periods: initialPeriods,
      closedBy: 'Head of Finance',
    });

    expect(result.closingJournal.entryNumber).toBe('JE-CLOSE-2026');
    expect(result.closingJournal.date).toBe('2026-12-31');

    // Verify closing journal zeroing entries:
    // DR 4000 Revenue 50,000
    // CR 5000 COGS 20,000
    // CR 6000 Opex 10,000
    // CR 3200 Retained Earnings 20,000
    const revDebit = result.closingJournal.lines.find((l) => l.accountCode === '4000')?.debit;
    const cogsCredit = result.closingJournal.lines.find((l) => l.accountCode === '5000')?.credit;
    const opexCredit = result.closingJournal.lines.find((l) => l.accountCode === '6000')?.credit;
    const reCredit = result.closingJournal.lines.find((l) => l.accountCode === '3200')?.credit;

    expect(revDebit).toBe(50000);
    expect(cogsCredit).toBe(20000);
    expect(opexCredit).toBe(10000);
    expect(reCredit).toBe(20000);

    // Verify double entry equality
    const totalDebits = result.closingJournal.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredits = result.closingJournal.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebits).toBe(50000);
    expect(totalCredits).toBe(50000);

    // Verify all periods are marked CLOSED
    const closedCount = result.updatedPeriods.filter((p) => p.status === 'CLOSED').length;
    expect(closedCount).toBe(12);

    // Verify asserting closed period throws permanent closure error
    expect(() => {
      assertPeriodNotLocked('2026-05-10', result.updatedPeriods);
    }).toThrow(/permanently CLOSED/i);
  });
});
