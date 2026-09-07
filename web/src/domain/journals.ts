/**
 * STARQ ERP — Double-Entry Journal & General Ledger Domain Model
 *
 * Implements:
 * - SERP-291: Live double-entry journal posting UI and General Ledger explorer.
 * - Balance invariant: sum(Debit) === sum(Credit) (0.00 variance enforcement).
 * - Multi-source ledger compilation (Invoices, Payments, Bills, Expenses, Manual Journals).
 * - Client-derived vs server-authoritative ledger attribution.
 */

import { AccountClass, AccountRecord } from './accounts';
import { Invoice, Payment, Expense, PurchaseOrder } from '../types/erp';

export type JournalEntrySource =
  | 'MANUAL'
  | 'INVOICE'
  | 'PAYMENT'
  | 'BILL'
  | 'EXPENSE'
  | 'CREDIT_NOTE'
  | 'ADVANCE_DEPOSIT'
  | 'SETTLEMENT_ALLOCATION'
  | 'STOCK_TRANSFER_DISPATCH'
  | 'STOCK_TRANSFER_RECEIPT'
  | 'YEAR_END_CLOSE'
  | 'JOB_COMPLETION'
  | 'FX_REALIZATION'
  | 'PAYROLL_PROVISION'
  | 'BANK_RECONCILIATION'
  | 'PRODUCTION_ORDER_ISSUE'
  | 'PRODUCTION_ORDER_COMPLETION'
  | 'STOCK_ADJUSTMENT'
  | 'OPENING_BALANCE';

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  narration?: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  entryNumber: string; // e.g. "JE-2026-0001"
  date: string; // ISO YYYY-MM-DD
  source: JournalEntrySource;
  reference?: string; // Document ref, e.g. "INV-2026-0012"
  narration: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  postedBy: string; // Actor ID or User Name
  postedAt: string; // ISO Timestamp
  tenantId: string;
  bookId?: string;
  status: 'POSTED' | 'DRAFT' | 'VOIDED';
}

export interface GeneralLedgerTransaction {
  id: string;
  journalEntryId: string;
  entryNumber: string;
  date: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  source: JournalEntrySource;
  reference?: string;
  narration: string;
  debit: number;
  credit: number;
  runningBalance: number;
  postedBy: string;
  postedAt: string;
}

export interface JournalValidationResult {
  isValid: boolean;
  errors: string[];
  totalDebit: number;
  totalCredit: number;
  variance: number;
}

/**
 * Validates a journal entry candidate against double-entry mathematical invariants.
 *
 * Rules:
 * 1. Must contain at least 2 lines (rejects zero-line and single-line journals).
 * 2. Total Debit must be > 0 and Total Credit must be > 0 (rejects single-sided journals).
 * 3. Every line must reference a valid account and contain non-negative amounts.
 * 4. A single line cannot contain both Debit and Credit > 0 simultaneously.
 * 5. Strict Balance Invariant: Math.abs(totalDebit - totalCredit) < 0.005 (0.00 MVR variance).
 */
export function validateJournalEntry(
  lines: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    debit?: number | string;
    credit?: number | string;
    narration?: string;
  }>
): JournalValidationResult {
  const errors: string[] = [];

  if (!lines || lines.length < 2) {
    errors.push('A journal entry must contain at least 2 lines (minimum 1 debit and 1 credit).');
  }

  let totalDebit = 0;
  let totalCredit = 0;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (!line.accountId || !line.accountCode) {
      errors.push(`Line ${lineNum}: Account must be selected.`);
    }

    const d = typeof line.debit === 'number' ? line.debit : parseFloat(String(line.debit || 0)) || 0;
    const c = typeof line.credit === 'number' ? line.credit : parseFloat(String(line.credit || 0)) || 0;

    if (d < 0 || c < 0) {
      errors.push(`Line ${lineNum}: Negative values are prohibited in double-entry bookkeeping.`);
    }

    if (d > 0 && c > 0) {
      errors.push(`Line ${lineNum}: A single line cannot have both a debit and a credit amount.`);
    }

    if (d === 0 && c === 0) {
      errors.push(`Line ${lineNum}: Line amount cannot be zero.`);
    }

    totalDebit += d;
    totalCredit += c;
  });

  if (totalDebit <= 0) {
    errors.push('Total debits must be greater than zero.');
  }
  if (totalCredit <= 0) {
    errors.push('Total credits must be greater than zero.');
  }

  // Exact variance check
  const variance = Math.round((totalDebit - totalCredit) * 100) / 100;
  if (Math.abs(variance) >= 0.005) {
    errors.push(
      `Journal entry is out of balance. Total Debits (MVR ${totalDebit.toFixed(2)}) !== Total Credits (MVR ${totalCredit.toFixed(2)}). Variance: MVR ${variance.toFixed(2)}.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    variance: Math.abs(variance),
  };
}

/**
 * Derives double-entry journal entries from operational transactions (Invoices, Payments, Bills, Expenses).
 */
export function deriveOperationalJournals(params: {
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  purchaseOrders: PurchaseOrder[];
  accounts: AccountRecord[];
  isGstRegistered: boolean;
  tenantId: string;
}): JournalEntry[] {
  const { invoices, payments, expenses, purchaseOrders, accounts, isGstRegistered, tenantId } = params;
  const journals: JournalEntry[] = [];

  const getAcc = (code: string) => {
    return (
      accounts.find((a) => a.code === code) || {
        id: `acc-${code}`,
        code,
        name: `Account ${code}`,
        accountClass: (code.startsWith('1')
          ? 'ASSET'
          : code.startsWith('2')
          ? 'LIABILITY'
          : code.startsWith('3')
          ? 'EQUITY'
          : code.startsWith('4')
          ? 'REVENUE'
          : 'EXPENSE') as AccountClass,
      }
    );
  };

  // 1. Invoices -> DR 1100 (AR), CR 4000 (Revenue), CR 2100 (GST Payable if reg)
  invoices.forEach((inv) => {
    const lines: JournalLine[] = [];
    const arAcc = getAcc('1100');
    const revAcc = getAcc('4000');
    const gstAcc = getAcc('2100');

    lines.push({
      id: `${inv.id}-dr-ar`,
      accountId: arAcc.id,
      accountCode: arAcc.code,
      accountName: arAcc.name,
      accountClass: 'ASSET',
      narration: `Invoice ${inv.invoiceNumber} — ${inv.customerName}`,
      debit: inv.totalAmount,
      credit: 0,
    });

    if (isGstRegistered && inv.gstAmount > 0) {
      lines.push({
        id: `${inv.id}-cr-rev`,
        accountId: revAcc.id,
        accountCode: revAcc.code,
        accountName: revAcc.name,
        accountClass: 'REVENUE',
        narration: `Operating revenue for ${inv.invoiceNumber}`,
        debit: 0,
        credit: inv.subtotal,
      });
      lines.push({
        id: `${inv.id}-cr-gst`,
        accountId: gstAcc.id,
        accountCode: gstAcc.code,
        accountName: gstAcc.name,
        accountClass: 'LIABILITY',
        narration: `GST Output tax for ${inv.invoiceNumber}`,
        debit: 0,
        credit: inv.gstAmount,
      });
    } else {
      lines.push({
        id: `${inv.id}-cr-rev`,
        accountId: revAcc.id,
        accountCode: revAcc.code,
        accountName: revAcc.name,
        accountClass: 'REVENUE',
        narration: `Operating revenue for ${inv.invoiceNumber}`,
        debit: 0,
        credit: inv.totalAmount,
      });
    }

    journals.push({
      id: `je-inv-${inv.id}`,
      entryNumber: `JE-INV-${inv.invoiceNumber}`,
      date: inv.date,
      source: 'INVOICE',
      reference: inv.invoiceNumber,
      narration: `Tax Invoice issue to ${inv.customerName}`,
      lines,
      totalDebit: inv.totalAmount,
      totalCredit: inv.totalAmount,
      isBalanced: true,
      postedBy: 'System / Invoice Dispatch',
      postedAt: new Date(inv.date).toISOString(),
      tenantId,
      status: 'POSTED',
    });
  });

  // 2. Payments -> DR 1000 (Bank/Cash), CR 1100 (AR)
  payments.forEach((pay) => {
    const bankAcc = getAcc('1000');
    const arAcc = getAcc('1100');

    journals.push({
      id: `je-pay-${pay.id}`,
      entryNumber: `JE-RCT-${pay.paymentNumber || pay.id.slice(-6).toUpperCase()}`,
      date: pay.paymentDate,
      source: 'PAYMENT',
      reference: pay.invoiceNumber || pay.paymentNumber,
      narration: `Payment received via ${pay.method} — ${pay.customerName}`,
      lines: [
        {
          id: `${pay.id}-dr-bank`,
          accountId: bankAcc.id,
          accountCode: bankAcc.code,
          accountName: bankAcc.name,
          accountClass: 'ASSET',
          narration: `Collections deposited to ${pay.method}`,
          debit: pay.amount,
          credit: 0,
        },
        {
          id: `${pay.id}-cr-ar`,
          accountId: arAcc.id,
          accountCode: arAcc.code,
          accountName: arAcc.name,
          accountClass: 'ASSET',
          narration: `Settlement for invoice ${pay.invoiceNumber || 'Customer Account'}`,
          debit: 0,
          credit: pay.amount,
        },
      ],
      totalDebit: pay.amount,
      totalCredit: pay.amount,
      isBalanced: true,
      postedBy: 'System / Payment Cashier',
      postedAt: new Date(pay.paymentDate).toISOString(),
      tenantId,
      status: 'POSTED',
    });
  });

  // 3. Expenses -> DR 6000 (Admin/Operating Exp), CR 1000 (Bank/Cash)
  expenses.forEach((exp) => {
    const expAcc = getAcc('6000');
    const bankAcc = getAcc('1000');

    journals.push({
      id: `je-exp-${exp.id}`,
      entryNumber: `JE-EXP-${exp.id.slice(-6).toUpperCase()}`,
      date: exp.date,
      source: 'EXPENSE',
      reference: exp.receiptRef || exp.category,
      narration: `Operating Expense: ${exp.description} (${exp.category})`,
      lines: [
        {
          id: `${exp.id}-dr-exp`,
          accountId: expAcc.id,
          accountCode: expAcc.code,
          accountName: expAcc.name,
          accountClass: 'EXPENSE',
          narration: exp.description,
          debit: exp.amount,
          credit: 0,
        },
        {
          id: `${exp.id}-cr-bank`,
          accountId: bankAcc.id,
          accountCode: bankAcc.code,
          accountName: bankAcc.name,
          accountClass: 'ASSET',
          narration: `Disbursement from ${exp.paymentMethod || 'Bank'}`,
          debit: 0,
          credit: exp.amount,
        },
      ],
      totalDebit: exp.amount,
      totalCredit: exp.amount,
      isBalanced: true,
      postedBy: 'System / Accounts Payable',
      postedAt: new Date(exp.date).toISOString(),
      tenantId,
      status: 'POSTED',
    });
  });

  // 4. Purchase Orders (PO / Bills) -> DR 5000 (COGS), CR 2000 (AP) or CR 1000 if Paid
  purchaseOrders.forEach((po) => {
    if (po.status !== 'Draft' && po.status !== 'Cancelled') {
      const cogsAcc = getAcc('5000');
      const apAcc = po.paymentStatus === 'Paid' ? getAcc('1000') : getAcc('2000');

      journals.push({
        id: `je-po-${po.id}`,
        entryNumber: `JE-BILL-${po.poNumber}`,
        date: po.orderDate,
        source: 'BILL',
        reference: po.poNumber,
        narration: `Procurement Bill from ${po.supplierName}`,
        lines: [
          {
            id: `${po.id}-dr-cogs`,
            accountId: cogsAcc.id,
            accountCode: cogsAcc.code,
            accountName: cogsAcc.name,
            accountClass: 'EXPENSE',
            narration: `Vendor parts & inventory: ${po.poNumber}`,
            debit: po.totalAmount,
            credit: 0,
          },
          {
            id: `${po.id}-cr-ap`,
            accountId: apAcc.id,
            accountCode: apAcc.code,
            accountName: apAcc.name,
            accountClass: apAcc.code.startsWith('1') ? 'ASSET' : 'LIABILITY',
            narration: po.paymentStatus === 'Paid' ? 'Paid immediately via Bank' : `Accounts Payable to ${po.supplierName}`,
            debit: 0,
            credit: po.totalAmount,
          },
        ],
        totalDebit: po.totalAmount,
        totalCredit: po.totalAmount,
        isBalanced: true,
        postedBy: 'System / Procurement Engine',
        postedAt: new Date(po.orderDate).toISOString(),
        tenantId,
        status: 'POSTED',
      });
    }
  });

  return journals;
}

/**
 * Flattens all journal entries into a chronological General Ledger transaction stream,
 * computing running balance for each account using normal accounting conventions:
 * - Asset / Expense normal balance: Debit (+), Credit (-)
 * - Liability / Equity / Revenue normal balance: Credit (+), Debit (-)
 */
export function compileGeneralLedger(
  journals: JournalEntry[],
  selectedAccountId?: string
): GeneralLedgerTransaction[] {
  // Sort journals chronologically
  const sorted = [...journals].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const accountBalances = new Map<string, number>();
  const ledgerTransactions: GeneralLedgerTransaction[] = [];

  sorted.forEach((entry) => {
    entry.lines.forEach((line) => {
      if (selectedAccountId && line.accountId !== selectedAccountId && line.accountCode !== selectedAccountId) {
        return;
      }

      const isDebitNormal = line.accountClass === 'ASSET' || line.accountClass === 'EXPENSE';
      const prevBal = accountBalances.get(line.accountCode) || 0;
      const netDelta = isDebitNormal ? line.debit - line.credit : line.credit - line.debit;
      const newBal = prevBal + netDelta;

      accountBalances.set(line.accountCode, newBal);

      ledgerTransactions.push({
        id: `${entry.id}-${line.id}`,
        journalEntryId: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date,
        accountId: line.accountId,
        accountCode: line.accountCode,
        accountName: line.accountName,
        accountClass: line.accountClass,
        source: entry.source,
        reference: entry.reference,
        narration: line.narration || entry.narration,
        debit: line.debit,
        credit: line.credit,
        runningBalance: Math.round(newBal * 100) / 100,
        postedBy: entry.postedBy,
        postedAt: entry.postedAt,
      });
    });
  });

  // Return in reverse chronological order for UI display
  return ledgerTransactions.reverse();
}
