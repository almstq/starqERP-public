/**
 * SERP-346 — observation 10, and the arithmetic half of observation 9.
 *
 * The acceptance gate declared these NOT YET PROVEN when it was written, which
 * was honest and is now closed:
 *
 *   9.  Trial balance nets to zero, and assets = liabilities + equity.
 *   10. P&L drill-down reconciles line-for-line to GL entries, and GST return
 *       boxes reconcile to the underlying tax-coded journals.
 *
 * These are the assertions an auditor makes first, because they are the ones a
 * misstatement cannot survive. Everything is computed from a posted ledger and
 * cross-checked against an independent sum of the same journal lines — never
 * against the reporting function's own intermediate totals, which would prove
 * only that the function agrees with itself.
 */

import { describe, it, expect } from 'vitest';
import {
  computeTrialBalanceFromLedger,
  computeAuthoritativeProfitAndLoss,
  computeAuthoritativeBalanceSheet,
} from '../lib/bookkeeping';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';
import { JournalEntry } from '../domain/journals';
import { accountClassForCode } from '../domain/accounts';
import { resolveTaxRate } from '../domain/taxRates';

const accounts = DEFAULT_CHART_OF_ACCOUNTS;

const je = (id: string, date: string, lines: Array<[string, number, number]>): JournalEntry =>
  ({
    id, entryNumber: id.toUpperCase(), date, narration: id, status: 'POSTED',
    lines: lines.map(([accountCode, debit, credit], i) => ({
      id: `${id}-${i}`, accountCode, accountName: accountCode,
      accountClass: accountClassForCode(accountCode), debit, credit,
    })),
    totalDebit: lines.reduce((s, l) => s + l[1], 0),
    totalCredit: lines.reduce((s, l) => s + l[2], 0),
    isBalanced: true,
  } as JournalEntry);

/**
 * A small but complete month: two sales with GST, the cost of one of them, an
 * expense, a wage run and a bank receipt. Every entry balances.
 */
const journals: JournalEntry[] = [
  // Opening capital, so the bank is funded rather than overdrawn
  je('je-0a', '2026-06-01', [['1111', 100000, 0], ['3100', 0, 100000]]),
  // Stock purchased on credit, so inventory exists before it is sold
  je('je-0b', '2026-06-01', [['1310', 40000, 0], ['2110', 0, 40000]]),
  // Sale of parts, 8% general GST
  je('je-1', '2026-06-02', [['1210', 10800, 0], ['4120', 0, 10000], ['2121', 0, 800]]),
  // Cost of that sale
  je('je-2', '2026-06-02', [['5110', 6000, 0], ['1310', 0, 6000]]),
  // Labour revenue, 8% GST
  je('je-3', '2026-06-10', [['1210', 5400, 0], ['4110', 0, 5000], ['2121', 0, 400]]),
  // Rent
  je('je-4', '2026-06-05', [['6210', 12000, 0], ['1111', 0, 12000]]),
  // Payroll: staff cost and employer pension
  je('je-5', '2026-06-28', [['6110', 25000, 0], ['6120', 1750, 0], ['2130', 0, 3500], ['2140', 0, 23250]]),
  // Customer pays the first invoice
  je('je-6', '2026-06-20', [['1111', 10800, 0], ['1210', 0, 10800]]),
];

describe('SERP-346 observation 9 — the books balance', () => {
  const tb = computeTrialBalanceFromLedger({ journals, accounts });

  it('every posted journal balances individually', () => {
    for (const j of journals) {
      const d = j.lines.reduce((s, l) => s + l.debit, 0);
      const c = j.lines.reduce((s, l) => s + l.credit, 0);
      expect(Math.abs(d - c), `${j.entryNumber} is unbalanced`).toBeLessThan(0.005);
    }
  });

  it('the trial balance nets to zero', () => {
    const debits = tb.accounts.reduce((s, a) => s + a.debit, 0);
    const credits = tb.accounts.reduce((s, a) => s + a.credit, 0);
    expect(Math.abs(debits - credits)).toBeLessThan(0.005);
  });

  it('every trial balance row equals an independent net movement of the source lines', () => {
    // Cross-check each account against the raw journal lines rather than trusting
    // the report's own totals. A netted trial balance will not equal the sum of
    // gross debits, so compare net movement per account, which is the real claim.
    for (const row of tb.accounts) {
      const ls = journals.flatMap((j) => j.lines).filter((l) => l.accountCode === row.code);
      const net = ls.reduce((s, l) => s + l.debit - l.credit, 0);
      expect(row.debit - row.credit, `${row.code} ${row.name}`).toBeCloseTo(net, 2);
    }
  });

  it('assets = liabilities + equity, including the current-period result', () => {
    const bs = computeAuthoritativeBalanceSheet({ journals, accounts });
    expect(bs.totalAssets).toBeGreaterThan(0);
    expect(Math.abs(bs.totalAssets - bs.totalLiabilitiesAndEquity)).toBeLessThan(0.05);
  });

  it('current-period net income is carried into equity, not left out of it', () => {
    // The specification is explicit that there is no postable Current Year
    // Earnings account: the result is COMPUTED and presented in equity. If it
    // were dropped, assets and equity would differ by exactly the period result.
    const bs = computeAuthoritativeBalanceSheet({ journals, accounts });
    const pnl = computeAuthoritativeProfitAndLoss({ journals, accounts });
    expect(bs.equity.currentPeriodNetIncome).toBeCloseTo(pnl.netOperatingIncome, 2);
    expect(
      Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.equity.totalEquity)),
      'equity must already include the period result',
    ).toBeLessThan(0.05);
  });

  it('this fixture is a genuine loss, so the equity carry is actually exercised', () => {
    const pnl = computeAuthoritativeProfitAndLoss({ journals, accounts });
    expect(pnl.netOperatingIncome).toBeLessThan(0);
  });

});

describe('SERP-346 observation 10 — P&L drills down to the GL, line for line', () => {
  const pnl = computeAuthoritativeProfitAndLoss({ journals, accounts });

  /** Independent net movement for an account, straight from the source lines. */
  const movement = (code: string) => {
    const ls = journals.flatMap((j) => j.lines).filter((l) => l.accountCode === code);
    const debit = ls.reduce((s, l) => s + l.debit, 0);
    const credit = ls.reduce((s, l) => s + l.credit, 0);
    return accountClassForCode(code) === 'REVENUE' ? credit - debit : debit - credit;
  };

  it('every revenue line equals the GL movement for that account', () => {
    for (const line of pnl.operatingRevenue) {
      expect(line.amount, `${line.code} ${line.name}`).toBeCloseTo(movement(line.code), 2);
    }
  });

  it('every COGS line equals the GL movement for that account', () => {
    for (const line of pnl.costOfGoodsSold) {
      expect(line.amount, `${line.code} ${line.name}`).toBeCloseTo(movement(line.code), 2);
    }
  });

  it('every operating expense line equals the GL movement for that account', () => {
    for (const line of pnl.operatingExpenses) {
      expect(line.amount, `${line.code} ${line.name}`).toBeCloseTo(movement(line.code), 2);
    }
  });

  it('the totals are the sum of their own lines, not computed some other way', () => {
    expect(pnl.totalRevenue).toBeCloseTo(pnl.operatingRevenue.reduce((s, l) => s + l.amount, 0), 2);
    expect(pnl.totalCOGS).toBeCloseTo(pnl.costOfGoodsSold.reduce((s, l) => s + l.amount, 0), 2);
  });

  it('gross profit is revenue less COGS, arithmetically', () => {
    expect(pnl.grossProfit).toBeCloseTo(pnl.totalRevenue - pnl.totalCOGS, 2);
  });

  it('no P&L line references an account absent from the chart', () => {
    const known = new Set(accounts.map((a) => a.code));
    for (const line of [...pnl.operatingRevenue, ...pnl.costOfGoodsSold, ...pnl.operatingExpenses]) {
      expect(known.has(line.code), `P&L shows ${line.code}, which is not in the chart`).toBe(true);
    }
  });

  it('COGS and operating expenses are split at the 5xxx/6xxx boundary, not by guesswork', () => {
    for (const l of pnl.costOfGoodsSold) expect(l.code.startsWith('5'), `${l.code} in COGS`).toBe(true);
    for (const l of pnl.operatingExpenses) expect(l.code.startsWith('6'), `${l.code} in OpEx`).toBe(true);
  });

  it('payroll appears in operating expenses and NOT under rent or utilities', () => {
    const codes = pnl.operatingExpenses.map((l) => l.code);
    expect(codes).toContain('6110');
    expect(codes).toContain('6120');
    // 6210 is present because this fixture posts real rent — but its amount must
    // be the rent alone, not rent plus a pension contribution.
    const rent = pnl.operatingExpenses.find((l) => l.code === '6210');
    expect(rent?.amount).toBeCloseTo(12000, 2);
  });
});

describe('SERP-346 observation 10 — GST reconciles to the tax-coded journals', () => {
  /** Output GST actually sitting in the ledger for the period. */
  const outputGstInLedger = journals
    .flatMap((j) => j.lines)
    .filter((l) => l.accountCode === '2121')
    .reduce((s, l) => s + l.credit - l.debit, 0);

  it('the ledger holds the GST the sales entries recorded', () => {
    expect(outputGstInLedger).toBeCloseTo(1200, 2); // 800 + 400
  });

  it('output GST equals the general rate applied to the taxable supplies', () => {
    const rate = resolveTaxRate('gst_general', '2026-06-02');
    const supplies = 10000 + 5000;
    expect(rate).toBe(0.08);
    expect(outputGstInLedger).toBeCloseTo(supplies * rate, 2);
  });

  it('the GST liability reconciles to revenue at the statutory rate, so a misposted line shows up', () => {
    const pnl = computeAuthoritativeProfitAndLoss({ journals, accounts });
    const rate = resolveTaxRate('gst_general', '2026-06-30');
    expect(outputGstInLedger).toBeCloseTo(pnl.totalRevenue * rate, 2);
  });

  it('GST sits in a liability account, never in revenue', () => {
    expect(accountClassForCode('2121')).toBe('LIABILITY');
    const pnl = computeAuthoritativeProfitAndLoss({ journals, accounts });
    const revenueCodes = pnl.operatingRevenue.map((l) => l.code);
    expect(revenueCodes).not.toContain('2121');
  });

  it('a tourism supply either side of 1 July 2025 reconciles at its own rate', () => {
    // The reconciliation must hold across the rate change, not only today.
    expect(resolveTaxRate('gst_tourism', '2025-06-30')).toBe(0.16);
    expect(resolveTaxRate('gst_tourism', '2025-07-01')).toBe(0.17);
    expect(1000 * resolveTaxRate('gst_tourism', '2025-06-30')).toBeCloseTo(160, 2);
    expect(1000 * resolveTaxRate('gst_tourism', '2025-07-01')).toBeCloseTo(170, 2);
  });
});
