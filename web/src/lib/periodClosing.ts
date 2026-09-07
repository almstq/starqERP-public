/**
 * STARQ ERP — Year-End Closing & Retained Earnings Roll-Forward Engine (SERP-295)
 *
 * Implements authoritative fiscal year-end closing:
 * 1. Zeroes all temporary P&L accounts (Revenue 4000s, COGS 5000s, Expenses 6000s)
 * 2. Rolls forward net profit/loss into equity account "3200 - Retained Earnings"
 * 3. Marks all fiscal year periods as permanently CLOSED
 */

import { JournalEntry, JournalLine } from '../domain/journals';
import { AccountRecord, accountClassForCode } from '../domain/accounts';
import { AccountingPeriod } from '../domain/periods';

export interface YearEndClosePreview {
  fiscalYear: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  closingLines: JournalLine[];
  revenueAccountsToZero: Array<{ code: string; name: string; balance: number }>;
  expenseAccountsToZero: Array<{ code: string; name: string; balance: number }>;
}

export interface ExecuteYearEndCloseResult {
  closingJournal: JournalEntry;
  updatedPeriods: AccountingPeriod[];
  netIncome: number;
}

/**
 * Computes preview of year-end closing entries without mutating state.
 */
export function previewYearEndClose(params: {
  fiscalYear: number;
  journals: JournalEntry[];
  accounts: AccountRecord[];
}): YearEndClosePreview {
  const { fiscalYear, journals, accounts } = params;

  // Filter journals for the fiscal year
  const yearPrefix = `${fiscalYear}-`;
  const yearJournals = journals.filter(
    (j) => j.date.startsWith(yearPrefix) && j.source !== 'YEAR_END_CLOSE'
  );

  // Compute account balances for the year
  const accountTotals = new Map<string, { debit: number; credit: number }>();

  yearJournals.forEach((j) => {
    j.lines.forEach((l) => {
      const current = accountTotals.get(l.accountCode) || { debit: 0, credit: 0 };
      accountTotals.set(l.accountCode, {
        debit: current.debit + l.debit,
        credit: current.credit + l.credit,
      });
    });
  });

  const accountMap = new Map(accounts.map((a) => [a.code, a]));

  const revenueAccountsToZero: Array<{ code: string; name: string; balance: number }> = [];
  const expenseAccountsToZero: Array<{ code: string; name: string; balance: number }> = [];

  let totalRevenue = 0;
  let totalExpenses = 0;

  accountTotals.forEach((totals, code) => {
    const acc = accountMap.get(code);
    const classification = acc?.accountClass || (code.startsWith('4') ? 'REVENUE' : code.startsWith('5') || code.startsWith('6') ? 'EXPENSE' : 'OTHER');

    if (classification === 'REVENUE') {
      const netCredit = totals.credit - totals.debit;
      if (Math.abs(netCredit) > 0.005) {
        revenueAccountsToZero.push({
          code,
          name: acc?.name || `Revenue Account ${code}`,
          balance: Math.round(netCredit * 100) / 100,
        });
        totalRevenue += netCredit;
      }
    } else if (classification === 'EXPENSE') {
      const netDebit = totals.debit - totals.credit;
      if (Math.abs(netDebit) > 0.005) {
        expenseAccountsToZero.push({
          code,
          name: acc?.name || `Expense Account ${code}`,
          balance: Math.round(netDebit * 100) / 100,
        });
        totalExpenses += netDebit;
      }
    }
  });

  totalRevenue = Math.round(totalRevenue * 100) / 100;
  totalExpenses = Math.round(totalExpenses * 100) / 100;
  const netIncome = Math.round((totalRevenue - totalExpenses) * 100) / 100;

  // Build closing journal lines
  const closingLines: JournalLine[] = [];

  // 1. Debit Revenue accounts to zero them out
  revenueAccountsToZero.forEach((r, idx) => {
    closingLines.push({
      id: `close-rev-${idx}`,
      accountCode: r.code,
      accountId: `acc-${r.code}`,
      accountClass: accountClassForCode(r.code),
      accountName: `${r.name} (Year-End Zeroing)`,
      debit: r.balance,
      credit: 0,
      narration: `Close out ${r.code} to Retained Earnings for FY${fiscalYear}`,
    });
  });

  // 2. Credit Expense accounts to zero them out
  expenseAccountsToZero.forEach((e, idx) => {
    closingLines.push({
      id: `close-exp-${idx}`,
      accountCode: e.code,
      accountId: `acc-${e.code}`,
      accountClass: accountClassForCode(e.code),
      accountName: `${e.name} (Year-End Zeroing)`,
      debit: 0,
      credit: e.balance,
      narration: `Close out ${e.code} to Retained Earnings for FY${fiscalYear}`,
    });
  });

  // 3. Balancing entry to Retained Earnings (Account 3200)
  if (netIncome > 0) {
    // Profit: Credit Retained Earnings
    closingLines.push({
      id: 'close-retained-earnings',
      accountCode: '3200',
      accountId: 'acc-3200',
      accountClass: accountClassForCode('3200'),
      accountName: 'Retained Earnings',
      debit: 0,
      credit: netIncome,
      narration: `Roll forward FY${fiscalYear} Net Profit into Retained Earnings`,
    });
  } else if (netIncome < 0) {
    // Loss: Debit Retained Earnings
    closingLines.push({
      id: 'close-retained-earnings',
      accountCode: '3200',
      accountId: 'acc-3200',
      accountClass: accountClassForCode('3200'),
      accountName: 'Retained Earnings',
      debit: Math.abs(netIncome),
      credit: 0,
      narration: `Roll forward FY${fiscalYear} Net Loss into Retained Earnings`,
    });
  }

  return {
    fiscalYear,
    totalRevenue,
    totalExpenses,
    netIncome,
    closingLines,
    revenueAccountsToZero,
    expenseAccountsToZero,
  };
}

/**
 * Executes authoritative year-end close, generating the closing journal and marking fiscal periods CLOSED.
 */
export function executeYearEndClose(params: {
  fiscalYear: number;
  journals: JournalEntry[];
  accounts: AccountRecord[];
  periods: AccountingPeriod[];
  closedBy?: string;
}): ExecuteYearEndCloseResult {
  const { fiscalYear, journals, accounts, periods, closedBy = 'Financial Controller' } = params;

  // Check if year-end close has already been run for this fiscal year
  const existingClose = journals.find(
    (j) => j.source === 'YEAR_END_CLOSE' && j.date.startsWith(`${fiscalYear}-`)
  );
  if (existingClose) {
    throw new Error(`Fiscal Year ${fiscalYear} has already been closed under journal ${existingClose.entryNumber}.`);
  }

  const preview = previewYearEndClose({ fiscalYear, journals, accounts });

  if (preview.closingLines.length === 0) {
    throw new Error(`No active revenue or expense transactions found for Fiscal Year ${fiscalYear}.`);
  }

  const closingDate = `${fiscalYear}-12-31`;
  const closingJournal: JournalEntry = {
    id: `je-close-${fiscalYear}`,
    entryNumber: `JE-CLOSE-${fiscalYear}`,
    date: closingDate,
    narration: `Fiscal Year-End Closing & Roll-Forward for FY${fiscalYear} into Retained Earnings`,
    source: 'YEAR_END_CLOSE',
    reference: `fy-${fiscalYear}`,
    lines: preview.closingLines,
    totalDebit: Math.round(preview.closingLines.reduce((sum, l) => sum + l.debit, 0) * 100) / 100,
    totalCredit: Math.round(preview.closingLines.reduce((sum, l) => sum + l.credit, 0) * 100) / 100,
    isBalanced:
      Math.abs(
        preview.closingLines.reduce((sum, l) => sum + l.debit, 0) -
          preview.closingLines.reduce((sum, l) => sum + l.credit, 0),
      ) < 0.005,
    tenantId: params.journals[0]?.tenantId || '',
    status: 'POSTED',
    postedAt: new Date().toISOString(),
    postedBy: closedBy,
  };

  // Update periods for this fiscal year to CLOSED
  const updatedPeriods = periods.map((p) => {
    if (p.fiscalYear === fiscalYear) {
      return {
        ...p,
        status: 'CLOSED' as const,
        closedAt: new Date().toISOString(),
        closedBy,
      };
    }
    return p;
  });

  return {
    closingJournal,
    updatedPeriods,
    netIncome: preview.netIncome,
  };
}
