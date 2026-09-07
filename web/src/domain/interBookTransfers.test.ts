/**
 * SERP-316 — inter-book transfers and consolidation elimination.
 *
 * The test that matters most is the one that proves an imbalance is REPORTED.
 * The previous consolidation took `Math.min` of two figures that must be
 * identical, which turned its most valuable finding into a rounding step.
 */

import { describe, it, expect } from 'vitest';
import {
  interBookJournal,
  reconcileInterBook,
  eliminateInterBookBalances,
  INTER_BOOK_ACCOUNTS,
  InterBookError,
  type InterBookTransfer,
} from './interBookTransfers';
import { generateConsolidatedReport, type BranchIncomeStatement } from './consolidatedBranches';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';

const transfer = (over: Partial<InterBookTransfer> = {}): InterBookTransfer => ({
  reference: 'IBT-1',
  fromBookId: 'book-starq-tech',
  toBookId: 'book-starq-dynamics',
  amount: 20000,
  kind: 'service',
  sourceAccount: '4100',
  destinationAccount: '6210',
  date: '2026-09-01',
  ...over,
});

describe('the paired journal', () => {
  it('produces one balanced entry in EACH book, not one spanning both', () => {
    // Each book is a complete set of records that must stand alone. A trial
    // balance for one book has to balance without reference to the other, or
    // neither can be audited independently — which is the whole reason for
    // keeping them apart.
    const lines = interBookJournal(transfer());

    const st = lines.filter((l) => l.bookId === 'book-starq-tech');
    const sd = lines.filter((l) => l.bookId === 'book-starq-dynamics');
    expect(st.reduce((s, l) => s + l.amount, 0)).toBe(0);
    expect(sd.reduce((s, l) => s + l.amount, 0)).toBe(0);
  });

  it('the source book is owed, the destination book owes', () => {
    const lines = interBookJournal(transfer());
    const dueFrom = lines.find((l) => l.accountCode === INTER_BOOK_ACCOUNTS.dueFrom)!;
    const dueTo = lines.find((l) => l.accountCode === INTER_BOOK_ACCOUNTS.dueTo)!;

    expect(dueFrom.bookId).toBe('book-starq-tech');
    expect(dueFrom.amount).toBe(20000); // debit: an asset
    expect(dueTo.bookId).toBe('book-starq-dynamics');
    expect(dueTo.amount).toBe(-20000); // credit: a liability
  });

  it('carries NO GST', () => {
    // A transfer between two books of one legal entity is not a supply — the
    // entity cannot supply itself. Charging GST would create a liability to
    // MIRA on a transaction that never left the company.
    const lines = interBookJournal(transfer());
    expect(lines).toHaveLength(4);
    expect(lines.some((l) => /21[12]\d/.test(l.accountCode)), 'no output GST account may appear')
      .toBe(false);
  });

  it('refuses a transfer to the same book', () => {
    expect(() => interBookJournal(transfer({ toBookId: 'book-starq-tech' })))
      .toThrow(InterBookError);
  });

  it('refuses a zero or negative amount', () => {
    expect(() => interBookJournal(transfer({ amount: 0 }))).toThrow(InterBookError);
    expect(() => interBookJournal(transfer({ amount: -100 }))).toThrow(InterBookError);
  });
});

describe('reconciliation reports the imbalance rather than absorbing it', () => {
  it('balanced books reconcile', () => {
    const r = reconcileInterBook([
      { bookId: 'st', dueFrom: 20000, dueTo: 0 },
      { bookId: 'sd', dueFrom: 0, dueTo: 20000 },
    ]);
    expect(r.balanced).toBe(true);
    expect(r.imbalance).toBe(0);
    expect(r.eliminable).toBe(20000);
  });

  it('a transfer recorded on ONE SIDE ONLY is surfaced with its amount', () => {
    // ST billed SD 20,000 and SD never recorded it. The entity's books are out
    // by 20,000 and somebody needs to know tonight, not at year end.
    const r = reconcileInterBook([
      { bookId: 'st', dueFrom: 20000, dueTo: 0 },
      { bookId: 'sd', dueFrom: 0, dueTo: 0 },
    ]);
    expect(r.balanced).toBe(false);
    expect(r.imbalance).toBe(20000);
  });

  it('and the discrepancy is not hidden by taking the smaller figure', () => {
    const r = reconcileInterBook([
      { bookId: 'st', dueFrom: 20000, dueTo: 0 },
      { bookId: 'sd', dueFrom: 0, dueTo: 5000 },
    ]);
    expect(r.eliminable).toBe(5000);
    // Math.min alone would have reported 5000 and said nothing else.
    expect(r.imbalance).toBe(15000);
  });
});

describe('balance sheet elimination', () => {
  it('removes the receivable and the payable the entity owes itself', () => {
    const { entries, residual } = eliminateInterBookBalances({
      balances: [
        { bookId: 'st', dueFrom: 20000, dueTo: 0 },
        { bookId: 'sd', dueFrom: 0, dueTo: 20000 },
      ],
    });
    expect(entries).toHaveLength(2);
    expect(entries.reduce((s, e) => s + e.amount, 0)).toBe(0);
    expect(residual).toBe(0);
  });

  it('REFUSES to consolidate over books that disagree', () => {
    // Producing a clean consolidated balance sheet over books that do not
    // reconcile is precisely the outcome this task exists to prevent.
    expect(() =>
      eliminateInterBookBalances({
        balances: [
          { bookId: 'st', dueFrom: 20000, dueTo: 0 },
          { bookId: 'sd', dueFrom: 0, dueTo: 5000 },
        ],
      }),
    ).toThrow(/out by 15000/);
  });

  it('unless the imbalance is explicitly accepted, and then it SURVIVES', () => {
    const { residual, reconciliation } = eliminateInterBookBalances({
      balances: [
        { bookId: 'st', dueFrom: 20000, dueTo: 0 },
        { bookId: 'sd', dueFrom: 0, dueTo: 5000 },
      ],
      acceptImbalance: true,
    });
    // It stays on the consolidated balance sheet as an unreconciled item rather
    // than being written off. An entity that cannot explain a balance should
    // show it, not lose it.
    expect(residual).toBe(15000);
    expect(reconciliation.balanced).toBe(false);
  });

  it('nothing to eliminate produces no entries rather than a zero-value journal', () => {
    const { entries } = eliminateInterBookBalances({
      balances: [{ bookId: 'st', dueFrom: 0, dueTo: 0 }],
    });
    expect(entries).toEqual([]);
  });
});

describe('the concealment in generateConsolidatedReport is fixed', () => {
  const branch = (over: Partial<BranchIncomeStatement>): BranchIncomeStatement => ({
    branchId: 'b', branchCode: 'B', branchName: 'B',
    externalRevenue: 100000, internalInterBranchRevenue: 0, totalRevenue: 100000,
    costOfGoodsSold: 40000, grossProfit: 60000, operatingExpenses: 20000,
    internalInterBranchCharges: 0, netIncome: 40000, ...over,
  });

  it('matched inter-branch amounts reconcile', () => {
    const r = generateConsolidatedReport({
      periodName: 'Sep 2026',
      branchData: [
        branch({ branchId: 'st', internalInterBranchRevenue: 20000 }),
        branch({ branchId: 'sd', internalInterBranchCharges: 20000 }),
      ],
    });
    expect(r.interBranchReconciled).toBe(true);
    expect(r.interBranchImbalance).toBe(0);
  });

  it('an unmatched amount is reported, where Math.min alone said nothing', () => {
    const r = generateConsolidatedReport({
      periodName: 'Sep 2026',
      branchData: [
        branch({ branchId: 'st', internalInterBranchRevenue: 20000 }),
        branch({ branchId: 'sd', internalInterBranchCharges: 5000 }),
      ],
    });
    expect(r.eliminatedInterBranchRevenue).toBe(5000); // the honest matched part
    expect(r.interBranchImbalance).toBe(15000);        // and the part that was vanishing
    expect(r.interBranchReconciled).toBe(false);
  });

  it('consolidated revenue never includes internal sales', () => {
    // A group cannot make money selling to itself.
    const r = generateConsolidatedReport({
      periodName: 'Sep 2026',
      branchData: [
        branch({ branchId: 'st', externalRevenue: 100000, internalInterBranchRevenue: 20000 }),
        branch({ branchId: 'sd', externalRevenue: 50000, internalInterBranchCharges: 20000 }),
      ],
    });
    expect(r.consolidatedRevenue).toBe(150000);
    expect(r.aggregatedTotalRevenue).toBe(170000);
  });
});

describe('the accounts the module posts to actually exist', () => {
  it('1220 and 2160 are on the seeded chart', () => {
    // A module that posts to a code no chart defines posts into thin air. This
    // is the same failure as the stale bank_accounts.gl_account_code rows.
    const codes = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.code));
    expect(codes.has(INTER_BOOK_ACCOUNTS.dueFrom)).toBe(true);
    expect(codes.has(INTER_BOOK_ACCOUNTS.dueTo)).toBe(true);
  });

  it('and are on the correct side of the balance sheet', () => {
    const dueFrom = DEFAULT_CHART_OF_ACCOUNTS.find((a) => a.code === INTER_BOOK_ACCOUNTS.dueFrom)!;
    const dueTo = DEFAULT_CHART_OF_ACCOUNTS.find((a) => a.code === INTER_BOOK_ACCOUNTS.dueTo)!;
    expect(dueFrom.accountClass).toBe('ASSET');
    expect(dueTo.accountClass).toBe('LIABILITY');
  });
});
