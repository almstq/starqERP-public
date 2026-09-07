/**
 * STARQ ERP — Authoritative Bookkeeping Spine & Financial Statements Engine
 *
 * Implements:
 * - SERP-291: Live double-entry journal posting and General Ledger compilation.
 * - SERP-292: Standard 2-column Trial Balance (Debit = Credit) & authoritative Balance Sheet.
 * - Invariants:
 *     1. sum(Debits) === sum(Credits) (0.00 MVR variance).
 *     2. Total Assets === Total Liabilities + Total Equity (including period Net Income).
 *     3. DEC-043 / DEC-068: Single Source of Financial Truth.
 */

import { AccountRecord, AccountClass } from '../domain/accounts';
import { JournalEntry, compileGeneralLedger } from '../domain/journals';
import { Invoice, Payment, Expense, PurchaseOrder } from '../types/erp';

export interface DetailedLedgerAccount {
  id: string;
  code: string;
  name: string;
  accountClass: AccountClass;
  subtype: string;
  debit: number;
  credit: number;
  balance: number; // Signed balance according to normal account class
}

export interface AuthoritativeTrialBalance {
  accounts: DetailedLedgerAccount[];
  totalDebits: number;
  totalCredits: number;
  variance: number;
  isBalanced: boolean;
  asOfDate: string;
}

export interface AuthoritativeProfitAndLoss {
  asOfDate: string;
  operatingRevenue: Array<{ code: string; name: string; amount: number }>;
  totalRevenue: number;
  costOfGoodsSold: Array<{ code: string; name: string; amount: number }>;
  totalCOGS: number;
  grossProfit: number;
  operatingExpenses: Array<{ code: string; name: string; amount: number }>;
  totalOperatingExpenses: number;
  netOperatingIncome: number;
  operatingMarginPct: number;
}

export interface BalanceSheetCategoryGroup {
  title: string;
  accounts: Array<{
    id: string;
    code: string;
    name: string;
    amount: number;
  }>;
  subtotal: number;
}

export interface AuthoritativeBalanceSheet {
  asOfDate: string;
  currentAssets: BalanceSheetCategoryGroup;
  nonCurrentAssets: BalanceSheetCategoryGroup;
  totalAssets: number;
  currentLiabilities: BalanceSheetCategoryGroup;
  longTermLiabilities: BalanceSheetCategoryGroup;
  totalLiabilities: number;
  equity: {
    capitalAccounts: Array<{ id: string; code: string; name: string; amount: number }>;
    retainedEarnings: number;
    currentPeriodNetIncome: number;
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  variance: number;
}

/**
 * Computes authoritative 2-column Trial Balance from posted General Ledger journals.
 */
export function computeTrialBalanceFromLedger(params: {
  journals: JournalEntry[];
  accounts: AccountRecord[];
  asOfDate?: string;
}): AuthoritativeTrialBalance {
  const { journals, accounts, asOfDate } = params;

  // Filter journals by asOfDate
  const effectiveJournals = asOfDate
    ? journals.filter((j) => j.date <= asOfDate && j.status === 'POSTED')
    : journals.filter((j) => j.status === 'POSTED');

  // Accumulate debit and credit postings per account
  const debitSums = new Map<string, number>();
  const creditSums = new Map<string, number>();

  effectiveJournals.forEach((j) => {
    j.lines.forEach((l) => {
      debitSums.set(l.accountCode, (debitSums.get(l.accountCode) || 0) + l.debit);
      creditSums.set(l.accountCode, (creditSums.get(l.accountCode) || 0) + l.credit);
    });
  });

  const detailedAccounts: DetailedLedgerAccount[] = [];
  let totalDebits = 0;
  let totalCredits = 0;

  accounts.forEach((acc) => {
    const rawDebit = debitSums.get(acc.code) || 0;
    const rawCredit = creditSums.get(acc.code) || 0;

    if (rawDebit === 0 && rawCredit === 0 && acc.balance === 0) {
      return; // Omit zero-balance accounts from trial balance presentation
    }

    const isDebitNormal = acc.accountClass === 'ASSET' || acc.accountClass === 'EXPENSE';
    const netRaw = rawDebit - rawCredit;

    let displayDebit = 0;
    let displayCredit = 0;

    if (isDebitNormal) {
      if (netRaw >= 0) {
        displayDebit = netRaw;
      } else {
        displayCredit = Math.abs(netRaw);
      }
    } else {
      if (netRaw <= 0) {
        displayCredit = Math.abs(netRaw);
      } else {
        displayDebit = netRaw;
      }
    }

    totalDebits += displayDebit;
    totalCredits += displayCredit;

    detailedAccounts.push({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      accountClass: acc.accountClass,
      subtype: acc.subtype,
      debit: Math.round(displayDebit * 100) / 100,
      credit: Math.round(displayCredit * 100) / 100,
      balance: Math.round((isDebitNormal ? netRaw : -netRaw) * 100) / 100,
    });
  });

  // Sort by Account Code
  detailedAccounts.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const roundedDebits = Math.round(totalDebits * 100) / 100;
  const roundedCredits = Math.round(totalCredits * 100) / 100;
  const variance = Math.round(Math.abs(roundedDebits - roundedCredits) * 100) / 100;

  return {
    accounts: detailedAccounts,
    totalDebits: roundedDebits,
    totalCredits: roundedCredits,
    variance,
    isBalanced: variance === 0,
    asOfDate: asOfDate || new Date().toISOString().split('T')[0],
  };
}

/**
 * Computes authoritative Profit & Loss Statement from posted General Ledger journals.
 */
export function computeAuthoritativeProfitAndLoss(params: {
  journals: JournalEntry[];
  accounts: AccountRecord[];
  asOfDate?: string;
}): AuthoritativeProfitAndLoss {
  const tb = computeTrialBalanceFromLedger(params);

  const operatingRevenue: Array<{ code: string; name: string; amount: number }> = [];
  const costOfGoodsSold: Array<{ code: string; name: string; amount: number }> = [];
  const operatingExpenses: Array<{ code: string; name: string; amount: number }> = [];

  let totalRevenue = 0;
  let totalCOGS = 0;
  let totalOperatingExpenses = 0;

  tb.accounts.forEach((acc) => {
    if (acc.accountClass === 'REVENUE') {
      const amt = acc.credit - acc.debit;
      operatingRevenue.push({ code: acc.code, name: acc.name, amount: amt });
      totalRevenue += amt;
    } else if (acc.accountClass === 'EXPENSE') {
      const amt = acc.debit - acc.credit;
      if (acc.code.startsWith('5')) {
        costOfGoodsSold.push({ code: acc.code, name: acc.name, amount: amt });
        totalCOGS += amt;
      } else {
        operatingExpenses.push({ code: acc.code, name: acc.name, amount: amt });
        totalOperatingExpenses += amt;
      }
    }
  });

  const grossProfit = totalRevenue - totalCOGS;
  const netOperatingIncome = grossProfit - totalOperatingExpenses;
  const operatingMarginPct = totalRevenue > 0 ? Math.round((netOperatingIncome / totalRevenue) * 1000) / 10 : 0;

  return {
    asOfDate: params.asOfDate || new Date().toISOString().split('T')[0],
    operatingRevenue,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    costOfGoodsSold,
    totalCOGS: Math.round(totalCOGS * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    operatingExpenses,
    totalOperatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
    netOperatingIncome: Math.round(netOperatingIncome * 100) / 100,
    operatingMarginPct,
  };
}

/**
 * Computes authoritative Balance Sheet with strict Assets === Liabilities + Equity mathematical integrity.
 */
export function computeAuthoritativeBalanceSheet(params: {
  journals: JournalEntry[];
  accounts: AccountRecord[];
  asOfDate?: string;
}): AuthoritativeBalanceSheet {
  const tb = computeTrialBalanceFromLedger(params);
  const pnl = computeAuthoritativeProfitAndLoss(params);

  const currentAssetAccounts: Array<{ id: string; code: string; name: string; amount: number }> = [];
  const nonCurrentAssetAccounts: Array<{ id: string; code: string; name: string; amount: number }> = [];
  const currentLiabilityAccounts: Array<{ id: string; code: string; name: string; amount: number }> = [];
  const longTermLiabilityAccounts: Array<{ id: string; code: string; name: string; amount: number }> = [];
  const capitalAccounts: Array<{ id: string; code: string; name: string; amount: number }> = [];

  let currentAssetsSubtotal = 0;
  let nonCurrentAssetsSubtotal = 0;
  let currentLiabilitiesSubtotal = 0;
  let longTermLiabilitiesSubtotal = 0;
  let capitalSubtotal = 0;

  tb.accounts.forEach((acc) => {
    if (acc.accountClass === 'ASSET') {
      const amt = acc.debit - acc.credit;
      if (acc.code.startsWith('15') || acc.subtype === 'FIXED_ASSET' || acc.subtype === 'NON_CURRENT_ASSET') {
        nonCurrentAssetAccounts.push({ id: acc.id, code: acc.code, name: acc.name, amount: amt });
        nonCurrentAssetsSubtotal += amt;
      } else {
        currentAssetAccounts.push({ id: acc.id, code: acc.code, name: acc.name, amount: amt });
        currentAssetsSubtotal += amt;
      }
    } else if (acc.accountClass === 'LIABILITY') {
      const amt = acc.credit - acc.debit;
      if (acc.code.startsWith('25') || acc.subtype === 'LONG_TERM_LIABILITY') {
        longTermLiabilityAccounts.push({ id: acc.id, code: acc.code, name: acc.name, amount: amt });
        longTermLiabilitiesSubtotal += amt;
      } else {
        currentLiabilityAccounts.push({ id: acc.id, code: acc.code, name: acc.name, amount: amt });
        currentLiabilitiesSubtotal += amt;
      }
    } else if (acc.accountClass === 'EQUITY') {
      const amt = acc.credit - acc.debit;
      capitalAccounts.push({ id: acc.id, code: acc.code, name: acc.name, amount: amt });
      capitalSubtotal += amt;
    }
  });

  const totalAssets = Math.round((currentAssetsSubtotal + nonCurrentAssetsSubtotal) * 100) / 100;
  const totalLiabilities = Math.round((currentLiabilitiesSubtotal + longTermLiabilitiesSubtotal) * 100) / 100;
  const totalEquity = Math.round((capitalSubtotal + pnl.netOperatingIncome) * 100) / 100;
  const totalLiabilitiesAndEquity = Math.round((totalLiabilities + totalEquity) * 100) / 100;

  const variance = Math.round(Math.abs(totalAssets - totalLiabilitiesAndEquity) * 100) / 100;

  return {
    asOfDate: params.asOfDate || new Date().toISOString().split('T')[0],
    currentAssets: {
      title: 'Current Assets',
      accounts: currentAssetAccounts,
      subtotal: Math.round(currentAssetsSubtotal * 100) / 100,
    },
    nonCurrentAssets: {
      title: 'Non-Current Assets & Fixed Property',
      accounts: nonCurrentAssetAccounts,
      subtotal: Math.round(nonCurrentAssetsSubtotal * 100) / 100,
    },
    totalAssets,
    currentLiabilities: {
      title: 'Current Liabilities & Statutory Taxes',
      accounts: currentLiabilityAccounts,
      subtotal: Math.round(currentLiabilitiesSubtotal * 100) / 100,
    },
    longTermLiabilities: {
      title: 'Long-Term Liabilities & Borrowings',
      accounts: longTermLiabilityAccounts,
      subtotal: Math.round(longTermLiabilitiesSubtotal * 100) / 100,
    },
    totalLiabilities,
    equity: {
      capitalAccounts,
      retainedEarnings: 0,
      currentPeriodNetIncome: pnl.netOperatingIncome,
      totalEquity,
    },
    totalLiabilitiesAndEquity,
    isBalanced: variance === 0,
    variance,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy wrappers for operational mock calculation fallback
// ─────────────────────────────────────────────────────────────────────────────

export interface LedgerAccount {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalanceResult {
  accounts: LedgerAccount[];
  totalDebits: number;
  totalCredits: number;
  difference: number;
  isBalanced: boolean;
}

export interface ProfitAndLossResult {
  grossRevenue: number;
  costOfSales: number;
  grossProfit: number;
  operatingExpenses: number;
  netOperatingIncome: number;
  operatingMarginPct: number;
}

export interface BalanceSheetResult {
  currentAssets: {
    cashAndBank: number;
    accountsReceivable: number;
    total: number;
  };
  currentLiabilities: {
    accountsPayable: number;
    gstPayable: number;
    total: number;
  };
  equity: {
    retainedEarnings: number;
    currentPeriodIncome: number;
    total: number;
  };
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

export function computeTrialBalance(params: {
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  purchaseOrders: PurchaseOrder[];
  isGstRegistered: boolean;
}): TrialBalanceResult {
  const { invoices, payments, expenses, purchaseOrders, isGstRegistered } = params;

  let totalInvoicedGross = 0;
  let totalSalesRevenue = 0;
  let totalGstOutput = 0;

  for (const inv of invoices) {
    totalInvoicedGross += inv.totalAmount;
    totalSalesRevenue += inv.subtotal;
    if (isGstRegistered) {
      totalGstOutput += inv.gstAmount;
    } else {
      totalSalesRevenue += (inv.totalAmount - inv.subtotal);
    }
  }

  let totalPaymentsReceived = 0;
  for (const pay of payments) {
    totalPaymentsReceived += pay.amount;
  }

  let totalExpensesPaid = 0;
  for (const exp of expenses) {
    totalExpensesPaid += exp.amount;
  }

  let totalPurchasesIncurred = 0;
  let totalPurchasesPaid = 0;
  for (const po of purchaseOrders) {
    if (po.status !== 'Draft' && po.status !== 'Cancelled') {
      totalPurchasesIncurred += po.totalAmount;
      if (po.paymentStatus === 'Paid') {
        totalPurchasesPaid += po.totalAmount;
      }
    }
  }

  const cashAndBankBalance = totalPaymentsReceived - totalExpensesPaid - totalPurchasesPaid;
  const accountsReceivableBalance = totalInvoicedGross - totalPaymentsReceived;
  const accountsPayableBalance = totalPurchasesIncurred - totalPurchasesPaid;

  const accounts: LedgerAccount[] = [
    {
      code: '1000',
      name: 'Bank & Cash Accounts',
      type: 'asset',
      debit: cashAndBankBalance >= 0 ? cashAndBankBalance : 0,
      credit: cashAndBankBalance < 0 ? Math.abs(cashAndBankBalance) : 0,
      balance: cashAndBankBalance,
    },
    {
      code: '1100',
      name: 'Accounts Receivable (Trade Debtors)',
      type: 'asset',
      debit: accountsReceivableBalance >= 0 ? accountsReceivableBalance : 0,
      credit: accountsReceivableBalance < 0 ? Math.abs(accountsReceivableBalance) : 0,
      balance: accountsReceivableBalance,
    },
    {
      code: '2000',
      name: 'Accounts Payable (Trade Creditors)',
      type: 'liability',
      debit: accountsPayableBalance < 0 ? Math.abs(accountsPayableBalance) : 0,
      credit: accountsPayableBalance >= 0 ? accountsPayableBalance : 0,
      balance: accountsPayableBalance,
    },
    {
      code: '2100',
      name: 'GST Output Tax Payable',
      type: 'liability',
      debit: totalGstOutput < 0 ? Math.abs(totalGstOutput) : 0,
      credit: totalGstOutput >= 0 ? totalGstOutput : 0,
      balance: totalGstOutput,
    },
    {
      code: '4000',
      name: 'Sales & Service Revenue',
      type: 'revenue',
      debit: totalSalesRevenue < 0 ? Math.abs(totalSalesRevenue) : 0,
      credit: totalSalesRevenue >= 0 ? totalSalesRevenue : 0,
      balance: totalSalesRevenue,
    },
    {
      code: '5000',
      name: 'Cost of Goods Sold (Parts & Materials)',
      type: 'expense',
      debit: totalPurchasesIncurred >= 0 ? totalPurchasesIncurred : 0,
      credit: totalPurchasesIncurred < 0 ? Math.abs(totalPurchasesIncurred) : 0,
      balance: totalPurchasesIncurred,
    },
    {
      code: '6000',
      name: 'Operating & Administrative Expenses',
      type: 'expense',
      debit: totalExpensesPaid >= 0 ? totalExpensesPaid : 0,
      credit: totalExpensesPaid < 0 ? Math.abs(totalExpensesPaid) : 0,
      balance: totalExpensesPaid,
    },
  ];

  const totalDebits = Math.round(accounts.reduce((acc, a) => acc + a.debit, 0) * 100) / 100;
  const totalCredits = Math.round(accounts.reduce((acc, a) => acc + a.credit, 0) * 100) / 100;
  const difference = Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100;

  return {
    accounts,
    totalDebits,
    totalCredits,
    difference,
    isBalanced: difference === 0,
  };
}

export function computeProfitAndLoss(params: {
  invoices: Invoice[];
  expenses: Expense[];
  purchaseOrders: PurchaseOrder[];
  isGstRegistered: boolean;
}): ProfitAndLossResult {
  const { invoices, expenses, purchaseOrders, isGstRegistered } = params;

  let grossRevenue = 0;
  for (const inv of invoices) {
    grossRevenue += isGstRegistered ? inv.subtotal : inv.totalAmount;
  }

  let costOfSales = 0;
  for (const po of purchaseOrders) {
    if (po.status !== 'Draft' && po.status !== 'Cancelled') {
      costOfSales += po.totalAmount;
    }
  }

  let operatingExpenses = 0;
  for (const exp of expenses) {
    operatingExpenses += exp.amount;
  }

  const grossProfit = grossRevenue - costOfSales;
  const netOperatingIncome = grossProfit - operatingExpenses;
  const operatingMarginPct = grossRevenue > 0 ? Math.round((netOperatingIncome / grossRevenue) * 1000) / 10 : 0;

  return {
    grossRevenue,
    costOfSales,
    grossProfit,
    operatingExpenses,
    netOperatingIncome,
    operatingMarginPct,
  };
}

export function computeBalanceSheet(params: {
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  purchaseOrders: PurchaseOrder[];
  isGstRegistered: boolean;
}): BalanceSheetResult {
  const tb = computeTrialBalance(params);
  const pnl = computeProfitAndLoss(params);

  const cashAccount = tb.accounts.find((a) => a.code === '1000');
  const arAccount = tb.accounts.find((a) => a.code === '1100');
  const apAccount = tb.accounts.find((a) => a.code === '2000');
  const gstAccount = tb.accounts.find((a) => a.code === '2100');

  const cashAndBank = cashAccount?.balance || 0;
  const accountsReceivable = arAccount?.balance || 0;
  const currentAssetsTotal = cashAndBank + accountsReceivable;

  const accountsPayable = apAccount?.balance || 0;
  const gstPayable = gstAccount?.balance || 0;
  const currentLiabilitiesTotal = accountsPayable + gstPayable;

  const currentPeriodIncome = pnl.netOperatingIncome;
  const equityTotal = currentPeriodIncome;

  const totalAssets = currentAssetsTotal;
  const totalLiabilitiesAndEquity = currentLiabilitiesTotal + equityTotal;
  const isBalanced = Math.round(Math.abs(totalAssets - totalLiabilitiesAndEquity) * 100) / 100 === 0;

  return {
    currentAssets: {
      cashAndBank,
      accountsReceivable,
      total: currentAssetsTotal,
    },
    currentLiabilities: {
      accountsPayable,
      gstPayable,
      total: currentLiabilitiesTotal,
    },
    equity: {
      retainedEarnings: 0,
      currentPeriodIncome,
      total: equityTotal,
    },
    totalAssets,
    totalLiabilitiesAndEquity,
    isBalanced,
  };
}
