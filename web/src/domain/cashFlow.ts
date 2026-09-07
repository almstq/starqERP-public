import { JournalEntry } from './journals';

export interface CashFlowLineItem {
  code: string;
  name: string;
  amount: number;
  isOutflow: boolean;
  notes?: string;
}

export interface CashFlowActivitySection {
  title: string;
  items: CashFlowLineItem[];
  netCashFlow: number;
}

export interface CashFlowStatement {
  statementId: string;
  periodName: string;
  startDate: string;
  endDate: string;
  currency: 'MVR';
  
  // Three Primary IFRS Activity Sections
  operatingActivities: CashFlowActivitySection;
  investingActivities: CashFlowActivitySection;
  financingActivities: CashFlowActivitySection;

  netChangeInCash: number;
  openingCashBalance: number;
  closingCashBalance: number;
  balanceSheetCashBalance: number;
  isBalanced: boolean;
  variance: number;

  generatedAt: string;
}

export interface ComputeCashFlowParams {
  journals: JournalEntry[];
  periodStartDate?: string;
  periodEndDate?: string;
  openingCash?: number;
}

/**
 * Computes authoritative Cash Flow Statement (Direct & Indirect) from double-entry journal movements.
 * Cash and Cash Equivalents accounts: 1000 to 1099 (1000 Cash on Hand, 1010 BML MVR, 1020 BML USD, 1030 MIB MVR).
 */
export function computeCashFlowStatement(params: ComputeCashFlowParams): CashFlowStatement {
  const {
    journals,
    periodStartDate = '2026-01-01',
    periodEndDate = '2026-12-31',
    openingCash = 0,
  } = params;

  const operatingItems: CashFlowLineItem[] = [];
  const investingItems: CashFlowLineItem[] = [];
  const financingItems: CashFlowLineItem[] = [];

  let receiptsFromCustomers = 0;
  let paymentsToSuppliers = 0;
  let operatingExpensePayments = 0;
  let taxPayments = 0;

  let capitalAssetPurchases = 0;
  let investmentReturns = 0;

  let equityContributions = 0;
  let loanRepayments = 0;

  // Filter journals in period
  const periodJournals = journals.filter((j) => {
    const d = j.date || j.postedAt?.slice(0, 10) || '';
    return d >= periodStartDate && d <= periodEndDate;
  });

  // Track all movements in Cash & Bank accounts (1000..1099)
  let totalCashDebits = 0;
  let totalCashCredits = 0;

  for (const j of periodJournals) {
    // Check if this journal impacts Cash/Bank
    const cashLines = j.lines.filter((l) => isCashOrBankAccount(l.accountCode));
    if (cashLines.length === 0) continue;

    const nonCashLines = j.lines.filter((l) => !isCashOrBankAccount(l.accountCode));

    for (const cl of cashLines) {
      totalCashDebits += cl.debit || 0;
      totalCashCredits += cl.credit || 0;
    }

    // Classify counter-entries
    for (const ncl of nonCashLines) {
      const code = ncl.accountCode;
      const netCredit = (ncl.credit || 0) - (ncl.debit || 0); // Inflow to bank
      const netDebit = (ncl.debit || 0) - (ncl.credit || 0);  // Outflow from bank

      // 1. Operating Activities
      if (code.startsWith('11') || code.startsWith('4')) {
        // Accounts Receivable (1100) or Revenue (4000) -> Customer Receipts
        if (netCredit > 0) receiptsFromCustomers += netCredit;
        else if (netDebit > 0) receiptsFromCustomers -= netDebit;
      } else if (code.startsWith('20') || code.startsWith('5')) {
        // Accounts Payable (2000) or COGS (5000) -> Supplier Payments
        if (netDebit > 0) paymentsToSuppliers += netDebit;
        else if (netCredit > 0) paymentsToSuppliers -= netCredit;
      } else if (code.startsWith('6') || code.startsWith('7')) {
        // Operating Expenses (6000..6999, 7000..7999)
        if (netDebit > 0) operatingExpensePayments += netDebit;
        else if (netCredit > 0) operatingExpensePayments -= netCredit;
      } else if (code.startsWith('21')) {
        // Statutory Taxes (2150 GST, 2160 Green Tax)
        if (netDebit > 0) taxPayments += netDebit;
        else if (netCredit > 0) taxPayments -= netCredit;
      }

      // 2. Investing Activities
      else if (code.startsWith('15') || code.startsWith('16')) {
        // Fixed Assets / Capital Equipment
        if (netDebit > 0) capitalAssetPurchases += netDebit;
        else if (netCredit > 0) capitalAssetPurchases -= netCredit;
      } else if (code.startsWith('8')) {
        // Interest / Investment Returns
        if (netCredit > 0) investmentReturns += netCredit;
        else if (netDebit > 0) investmentReturns -= netDebit;
      }

      // 3. Financing Activities
      else if (code.startsWith('3')) {
        // Equity / Capital Contributions
        if (netCredit > 0) equityContributions += netCredit;
        else if (netDebit > 0) equityContributions -= netDebit;
      } else if (code.startsWith('25') || code.startsWith('26')) {
        // Long-term Loans / Borrowings
        if (netDebit > 0) loanRepayments += netDebit;
        else if (netCredit > 0) equityContributions += netCredit;
      }
    }
  }

  // Operating Section
  if (receiptsFromCustomers !== 0) {
    operatingItems.push({
      code: 'CF-OPS-01',
      name: 'Cash Receipts from Customers & Sales',
      amount: round2(receiptsFromCustomers),
      isOutflow: false,
    });
  }
  if (paymentsToSuppliers !== 0) {
    operatingItems.push({
      code: 'CF-OPS-02',
      name: 'Cash Paid to Suppliers for Inventory & Materials',
      amount: round2(-Math.abs(paymentsToSuppliers)),
      isOutflow: true,
    });
  }
  if (operatingExpensePayments !== 0) {
    operatingItems.push({
      code: 'CF-OPS-03',
      name: 'Cash Paid for Operating Expenses & Payroll',
      amount: round2(-Math.abs(operatingExpensePayments)),
      isOutflow: true,
    });
  }
  if (taxPayments !== 0) {
    operatingItems.push({
      code: 'CF-OPS-04',
      name: 'Statutory Taxes Paid (GST & Green Tax)',
      amount: round2(-Math.abs(taxPayments)),
      isOutflow: true,
    });
  }

  const netOperatingCash = round2(
    receiptsFromCustomers - paymentsToSuppliers - operatingExpensePayments - taxPayments
  );

  // Investing Section
  if (capitalAssetPurchases !== 0) {
    investingItems.push({
      code: 'CF-INV-01',
      name: 'Purchase of Fixed Assets & Capital Equipment',
      amount: round2(-Math.abs(capitalAssetPurchases)),
      isOutflow: true,
    });
  }
  if (investmentReturns !== 0) {
    investingItems.push({
      code: 'CF-INV-02',
      name: 'Interest Received & Investment Profit',
      amount: round2(investmentReturns),
      isOutflow: false,
    });
  }

  const netInvestingCash = round2(investmentReturns - capitalAssetPurchases);

  // Financing Section
  if (equityContributions !== 0) {
    financingItems.push({
      code: 'CF-FIN-01',
      name: 'Capital Injections & Owner Contributions',
      amount: round2(equityContributions),
      isOutflow: false,
    });
  }
  if (loanRepayments !== 0) {
    financingItems.push({
      code: 'CF-FIN-02',
      name: 'Repayment of Borrowings & Loans',
      amount: round2(-Math.abs(loanRepayments)),
      isOutflow: true,
    });
  }

  const netFinancingCash = round2(equityContributions - loanRepayments);

  const netChangeInCash = round2(netOperatingCash + netInvestingCash + netFinancingCash);
  const closingCashBalance = round2(openingCash + netChangeInCash);

  // Total cash on balance sheet across all cash accounts
  let balanceSheetCash = 0;
  for (const j of journals) {
    for (const l of j.lines) {
      if (isCashOrBankAccount(l.accountCode)) {
        balanceSheetCash += (l.debit || 0) - (l.credit || 0);
      }
    }
  }
  balanceSheetCash = round2(balanceSheetCash);

  const variance = Math.abs(closingCashBalance - balanceSheetCash);
  const isBalanced = variance < 0.01;

  return {
    statementId: `CFS-${periodStartDate.slice(0, 7)}`,
    periodName: `FY2026 (${periodStartDate} to ${periodEndDate})`,
    startDate: periodStartDate,
    endDate: periodEndDate,
    currency: 'MVR',
    operatingActivities: {
      title: '1. Cash Flows from Operating Activities',
      items: operatingItems,
      netCashFlow: netOperatingCash,
    },
    investingActivities: {
      title: '2. Cash Flows from Investing Activities',
      items: investingItems,
      netCashFlow: netInvestingCash,
    },
    financingActivities: {
      title: '3. Cash Flows from Financing Activities',
      items: financingItems,
      netCashFlow: netFinancingCash,
    },
    netChangeInCash,
    openingCashBalance: round2(openingCash),
    closingCashBalance,
    balanceSheetCashBalance: balanceSheetCash,
    isBalanced,
    variance: round2(variance),
    generatedAt: new Date().toISOString(),
  };
}

export function isCashOrBankAccount(code: string): boolean {
  if (!code) return false;
  const num = parseInt(code, 10);
  return num >= 1000 && num <= 1099;
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
