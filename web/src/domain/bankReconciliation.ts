import type { JournalEntry } from './journals';
import { accountClassForCode } from './accounts';
export interface BankAccountConfig {
  id: string;
  accountCode: string; // canonical bank codes: "1111" BML MVR, "1112" BML USD, "1113" MIB MVR
  accountName: string; // e.g. "Bank of Maldives (BML MVR)"
  bankName: 'BML' | 'MIB' | 'CASH' | 'OTHER';
  accountNumber: string; // e.g. "7730000123456"
  currency: 'MVR' | 'USD';
  branchCode?: string;
  currentLedgerBalance: number;
}

export interface BankStatementLine {
  id: string;
  statementId: string;
  date: string; // YYYY-MM-DD
  description: string;
  reference: string;
  debit: number; // Outflow (expenses, withdrawals, bank fees)
  credit: number; // Inflow (customer receipts, deposits)
  balance: number; // Running statement balance
  status: 'unreconciled' | 'matched' | 'manual_cleared' | 'booked_adjustment';
  matchedTransactionId?: string | null;
  matchedType?: 'payment_receipt' | 'supplier_payment' | 'expense' | 'manual_journal' | null;
  confidenceScore?: number; // 0.0 to 1.0
  adjustmentJournalId?: string | null;
}

export interface BankStatement {
  id: string;
  bankAccountId: string;
  bankName: 'BML' | 'MIB' | 'CASH' | 'OTHER';
  accountNumber: string;
  currency: 'MVR' | 'USD';
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  lines: BankStatementLine[];
  uploadedAt: string;
  uploadedBy: string;
}

export interface ERPReconciliationCandidate {
  id: string;
  type: 'payment_receipt' | 'supplier_payment' | 'expense' | 'manual_journal';
  date: string;
  reference: string;
  narration: string;
  amount: number;
  isDebit: boolean; // True for bank outflow, False for bank inflow
  reconciled: boolean;
}

export interface ReconciliationSummary {
  statementOpeningBalance: number;
  statementClosingBalance: number;
  totalDebits: number;
  totalCredits: number;
  reconciledLinesCount: number;
  unreconciledLinesCount: number;
  erpLedgerBalance: number;
  unpresentedPayments: number; // ERP payments not on statement
  uncreditedDeposits: number; // ERP receipts not on statement
  adjustedBankBalance: number;
  isBalanced: boolean;
  variance: number;
}

/**
 * Parses Bank of Maldives (BML) standard statement CSV exports.
 * Typical Headers: Date, Description, Debit, Credit, Balance, Reference
 */
export function parseBmlCsv(csvContent: string, bankAccountId: string): BankStatement {
  const lines = csvContent.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('Invalid BML CSV: File must contain header and at least one transaction line');
  }

  const statementId = `stmt-bml-${Date.now()}`;
  const statementLines: BankStatementLine[] = [];
  let headerIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('date') && (lower.includes('description') || lower.includes('details') || lower.includes('narration'))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error('BML CSV Header not recognized. Expected columns: Date, Description, Debit, Credit, Balance, Reference');
  }

  const headerCols = lines[headerIndex].split(',').map(c => c.trim().toLowerCase().replace(/['"]/g, ''));
  const dateCol = headerCols.findIndex(c => c.includes('date'));
  const descCol = headerCols.findIndex(c => c.includes('desc') || c.includes('detail') || c.includes('narration'));
  const debitCol = headerCols.findIndex(c => c.includes('debit') || c.includes('withdrawal') || c.includes('out'));
  const creditCol = headerCols.findIndex(c => c.includes('credit') || c.includes('deposit') || c.includes('in'));
  const balCol = headerCols.findIndex(c => c.includes('balance') || c.includes('running'));
  const refCol = headerCols.findIndex(c => c.includes('ref') || c.includes('cheque') || c.includes('txn'));

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawCols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (rawCols.length <= 1 || !rawCols[dateCol]) continue;

    const dateStr = rawCols[dateCol];
    const desc = descCol !== -1 ? rawCols[descCol] : 'BML Transaction';
    const debit = debitCol !== -1 ? parseFloat(rawCols[debitCol].replace(/[^0-9.-]/g, '')) || 0 : 0;
    const credit = creditCol !== -1 ? parseFloat(rawCols[creditCol].replace(/[^0-9.-]/g, '')) || 0 : 0;
    const balance = balCol !== -1 ? parseFloat(rawCols[balCol].replace(/[^0-9.-]/g, '')) || 0 : 0;
    const ref = refCol !== -1 ? rawCols[refCol] : `TXN-${i}`;

    statementLines.push({
      id: `${statementId}-line-${i}`,
      statementId,
      date: normalizeDateString(dateStr),
      description: desc,
      reference: ref,
      debit,
      credit,
      balance,
      status: 'unreconciled',
    });
  }

  if (statementLines.length === 0) {
    throw new Error('No valid transaction rows found in BML CSV');
  }

  const openingBalance = statementLines[0].balance + statementLines[0].debit - statementLines[0].credit;
  const closingBalance = statementLines[statementLines.length - 1].balance;

  return {
    id: statementId,
    bankAccountId,
    bankName: 'BML',
    accountNumber: 'BML-MVR-773000',
    currency: 'MVR',
    startDate: statementLines[0].date,
    endDate: statementLines[statementLines.length - 1].date,
    openingBalance,
    closingBalance,
    lines: statementLines,
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'System Accountant',
  };
}

/**
 * Parses Maldives Islamic Bank (MIB) statement CSV exports.
 * Typical Headers: Transaction Date, Details, Withdrawal, Deposit, Balance, Ref No
 */
export function parseMibCsv(csvContent: string, bankAccountId: string): BankStatement {
  const lines = csvContent.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('Invalid MIB CSV: File must contain header and at least one transaction line');
  }

  const statementId = `stmt-mib-${Date.now()}`;
  const statementLines: BankStatementLine[] = [];
  let headerIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('date') && (lower.includes('details') || lower.includes('description') || lower.includes('particulars'))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error('MIB CSV Header not recognized.');
  }

  const headerCols = lines[headerIndex].split(',').map(c => c.trim().toLowerCase().replace(/['"]/g, ''));
  const dateCol = headerCols.findIndex(c => c.includes('date'));
  const descCol = headerCols.findIndex(c => c.includes('detail') || c.includes('particular') || c.includes('narration') || c.includes('desc'));
  const withdrawCol = headerCols.findIndex(c => c.includes('withdrawal') || c.includes('debit'));
  const depositCol = headerCols.findIndex(c => c.includes('deposit') || c.includes('credit'));
  const balCol = headerCols.findIndex(c => c.includes('balance'));
  const refCol = headerCols.findIndex(c => c.includes('ref') || c.includes('cheque') || c.includes('id'));

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawCols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (rawCols.length <= 1 || !rawCols[dateCol]) continue;

    const dateStr = rawCols[dateCol];
    const desc = descCol !== -1 ? rawCols[descCol] : 'MIB Transaction';
    const debit = withdrawCol !== -1 ? parseFloat(rawCols[withdrawCol].replace(/[^0-9.-]/g, '')) || 0 : 0;
    const credit = depositCol !== -1 ? parseFloat(rawCols[depositCol].replace(/[^0-9.-]/g, '')) || 0 : 0;
    const balance = balCol !== -1 ? parseFloat(rawCols[balCol].replace(/[^0-9.-]/g, '')) || 0 : 0;
    const ref = refCol !== -1 ? rawCols[refCol] : `MIB-TXN-${i}`;

    statementLines.push({
      id: `${statementId}-line-${i}`,
      statementId,
      date: normalizeDateString(dateStr),
      description: desc,
      reference: ref,
      debit,
      credit,
      balance,
      status: 'unreconciled',
    });
  }

  const openingBalance = statementLines.length > 0
    ? statementLines[0].balance + statementLines[0].debit - statementLines[0].credit
    : 0;
  const closingBalance = statementLines.length > 0
    ? statementLines[statementLines.length - 1].balance
    : 0;

  return {
    id: statementId,
    bankAccountId,
    bankName: 'MIB',
    accountNumber: 'MIB-MVR-990100',
    currency: 'MVR',
    startDate: statementLines[0]?.date || new Date().toISOString().slice(0, 10),
    endDate: statementLines[statementLines.length - 1]?.date || new Date().toISOString().slice(0, 10),
    openingBalance,
    closingBalance,
    lines: statementLines,
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'System Accountant',
  };
}

/**
 * Normalizes varied bank date strings (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD) into ISO YYYY-MM-DD.
 */
export function normalizeDateString(raw: string): string {
  const clean = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  const dmyMatch = clean.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  return new Date(clean).toISOString().slice(0, 10);
}

/**
 * Heuristic auto-reconciliation engine.
 * Matches bank statement lines with candidate ERP payments and expenses.
 */
export function autoMatchStatementLines(
  statementLines: BankStatementLine[],
  erpCandidates: ERPReconciliationCandidate[]
): {
  matchedPairs: Array<{ statementLineId: string; candidateId: string; confidence: number; rule: string }>;
  unmatchedStatementLines: BankStatementLine[];
  unmatchedCandidates: ERPReconciliationCandidate[];
} {
  const matchedPairs: Array<{ statementLineId: string; candidateId: string; confidence: number; rule: string }> = [];
  const claimedCandidateIds = new Set<string>();
  const matchedLineIds = new Set<string>();

  // Pass 1: Exact Reference + Exact Amount Match (Confidence = 1.0)
  for (const line of statementLines) {
    if (line.status !== 'unreconciled') continue;
    const lineAmount = line.credit > 0 ? line.credit : line.debit;
    const isOutflow = line.debit > 0;

    for (const cand of erpCandidates) {
      if (claimedCandidateIds.has(cand.id)) continue;
      if (cand.isDebit !== isOutflow) continue;

      if (
        Math.abs(cand.amount - lineAmount) < 0.01 &&
        line.reference &&
        cand.reference &&
        (line.reference.toLowerCase().includes(cand.reference.toLowerCase()) ||
         cand.reference.toLowerCase().includes(line.reference.toLowerCase()) ||
         line.description.toLowerCase().includes(cand.reference.toLowerCase()))
      ) {
        matchedPairs.push({
          statementLineId: line.id,
          candidateId: cand.id,
          confidence: 1.0,
          rule: 'Exact Reference & Amount Match',
        });
        claimedCandidateIds.add(cand.id);
        matchedLineIds.add(line.id);
        break;
      }
    }
  }

  // Pass 2: Exact Amount + Date Proximity (+/- 3 days) (Confidence = 0.90)
  for (const line of statementLines) {
    if (matchedLineIds.has(line.id) || line.status !== 'unreconciled') continue;
    const lineAmount = line.credit > 0 ? line.credit : line.debit;
    const isOutflow = line.debit > 0;
    const lineTime = new Date(line.date).getTime();

    for (const cand of erpCandidates) {
      if (claimedCandidateIds.has(cand.id)) continue;
      if (cand.isDebit !== isOutflow) continue;

      const candTime = new Date(cand.date).getTime();
      const diffDays = Math.abs(lineTime - candTime) / (1000 * 60 * 60 * 24);

      if (Math.abs(cand.amount - lineAmount) < 0.01 && diffDays <= 3) {
        matchedPairs.push({
          statementLineId: line.id,
          candidateId: cand.id,
          confidence: diffDays === 0 ? 0.95 : 0.85,
          rule: `Exact Amount with ${Math.round(diffDays)}d Date Proximity`,
        });
        claimedCandidateIds.add(cand.id);
        matchedLineIds.add(line.id);
        break;
      }
    }
  }

  const unmatchedStatementLines = statementLines.filter(l => !matchedLineIds.has(l.id));
  const unmatchedCandidates = erpCandidates.filter(c => !claimedCandidateIds.has(c.id));

  return {
    matchedPairs,
    unmatchedStatementLines,
    unmatchedCandidates,
  };
}

/**
 * Creates double-entry adjustment journal lines for bank fees or interest.
 */
export function createBankAdjustmentEntry(params: {
  statementLine: BankStatementLine;
  bankAccountCode: string; // canonical bank code, e.g. "1111" BML MVR Main
  adjustmentType: 'bank_fee' | 'interest_income';
  narration?: string;
  tenantId: string;
}): JournalEntry {
  const { statementLine, bankAccountCode, adjustmentType, narration, tenantId } = params;
  const isFee = adjustmentType === 'bank_fee';
  let amount = isFee ? statementLine.debit : statementLine.credit;
  if (amount <= 0) {
    amount = statementLine.debit > 0 ? statementLine.debit : statementLine.credit;
  }

  if (amount <= 0) {
    throw new Error(`Cannot create ${adjustmentType} with non-positive amount`);
  }

  const feeAccountCode = '6310'; // Bank & Merchant Gateway Fees — canonical chart, see docs/specs/CHART_OF_ACCOUNTS_SPECIFICATION.md
  const interestAccountCode = '8000'; // Interest Income

  const lines = isFee
    ? [
        {
          id: `${statementLine.id}-adj-debit`,
          accountCode: feeAccountCode,
          accountId: `acc-${feeAccountCode}`,
          accountClass: accountClassForCode(feeAccountCode),
          accountName: 'Bank Charges & Processing Fees',
          debit: amount,
          credit: 0,
          narration: narration || statementLine.description || 'Monthly bank charges',
        },
        {
          id: `${statementLine.id}-adj-credit`,
          accountCode: bankAccountCode,
          accountId: `acc-${bankAccountCode}`,
          accountClass: accountClassForCode(bankAccountCode),
          accountName: 'Operating Bank Account',
          debit: 0,
          credit: amount,
          narration: narration || statementLine.description || 'Bank charges deduction',
        },
      ]
    : [
        {
          id: `${statementLine.id}-adj-debit`,
          accountCode: bankAccountCode,
          accountId: `acc-${bankAccountCode}`,
          accountClass: accountClassForCode(bankAccountCode),
          accountName: 'Operating Bank Account',
          debit: amount,
          credit: 0,
          narration: narration || statementLine.description || 'Bank interest receipt',
        },
        {
          id: `${statementLine.id}-adj-credit`,
          accountCode: interestAccountCode,
          accountId: `acc-${interestAccountCode}`,
          accountClass: accountClassForCode(interestAccountCode),
          accountName: 'Interest & Profit Income',
          debit: 0,
          credit: amount,
          narration: narration || statementLine.description || 'Bank interest credit',
        },
      ];

  return {
    id: `je-bank-adj-${statementLine.id}`,
    entryNumber: `JE-ADJ-${Date.now().toString().slice(-6)}`,
    date: statementLine.date,
    source: 'BANK_RECONCILIATION',
    reference: statementLine.reference || `ADJ-${statementLine.id}`,
    narration: narration || `Direct Bank Adjustment: ${statementLine.description}`,
    lines,
    totalDebit: amount,
    totalCredit: amount,
    isBalanced: true,
    postedBy: 'System / Bank Reconciliation Engine',
    postedAt: new Date().toISOString(),
    tenantId,
    status: 'POSTED',
  };
}

/**
 * Calculates authoritative Bank Reconciliation Statement summary and variance.
 */
export function calculateReconciliationSummary(
  statement: BankStatement,
  erpLedgerBalance: number,
  unpresentedPayments: number,
  uncreditedDeposits: number
): ReconciliationSummary {
  const totalDebits = statement.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredits = statement.lines.reduce((s, l) => s + l.credit, 0);
  const reconciledLinesCount = statement.lines.filter(l => l.status === 'matched' || l.status === 'manual_cleared' || l.status === 'booked_adjustment').length;
  const unreconciledLinesCount = statement.lines.length - reconciledLinesCount;

  // Adjusted Bank Balance = Statement Ending Balance + Uncredited Deposits - Unpresented Cheques/Payments
  const adjustedBankBalance = statement.closingBalance + uncreditedDeposits - unpresentedPayments;
  const variance = Math.abs(adjustedBankBalance - erpLedgerBalance);
  const isBalanced = variance < 0.01;

  return {
    statementOpeningBalance: statement.openingBalance,
    statementClosingBalance: statement.closingBalance,
    totalDebits,
    totalCredits,
    reconciledLinesCount,
    unreconciledLinesCount,
    erpLedgerBalance,
    unpresentedPayments,
    uncreditedDeposits,
    adjustedBankBalance,
    isBalanced,
    variance,
  };
}
