import { describe, it, expect } from 'vitest';
import {
  parseBmlCsv,
  parseMibCsv,
  autoMatchStatementLines,
  createBankAdjustmentEntry,
  calculateReconciliationSummary,
  BankStatementLine,
  ERPReconciliationCandidate,
} from './bankReconciliation';

describe('SERP-296: Bank & Cash Ledger Reconciliation Engine', () => {
  const SAMPLE_BML_CSV = `
Date,Description,Debit,Credit,Balance,Reference
2026-08-01,Opening Balance,0,0,150000.00,OPENING
2026-08-05,BML Transfer IN - E2E Transport,0,25000.00,175000.00,BML-TXN-99120
2026-08-10,Supplier Wire - Paint Supplies,12000.00,0,163000.00,WIRE-SUP-001
2026-08-15,Monthly Service Fee,150.00,0,162850.00,FEE-AUG-2026
2026-08-25,Deposit Account Profit,0,450.00,163300.00,INT-AUG-2026
`.trim();

  const SAMPLE_MIB_CSV = `
Transaction Date,Details,Withdrawal,Deposit,Balance,Ref No
01/08/2026,Balance B/F,0,0,80000.00,INIT
04/08/2026,Customer Direct Credit,0,18500.00,98500.00,MIB-DEP-4410
12/08/2026,Cheque Clearing - Rent,20000.00,0,78500.00,CHQ-100293
20/08/2026,Account Maintenance Fee,100.00,0,78400.00,CHG-9901
`.trim();

  it('parses Bank of Maldives (BML) CSV exports accurately', () => {
    const statement = parseBmlCsv(SAMPLE_BML_CSV, 'acc-bml-mvr-1010');
    expect(statement.bankName).toBe('BML');
    expect(statement.lines.length).toBe(5);
    expect(statement.openingBalance).toBe(150000);
    expect(statement.closingBalance).toBe(163300);
    expect(statement.lines[1].credit).toBe(25000);
    expect(statement.lines[1].reference).toBe('BML-TXN-99120');
    expect(statement.lines[3].debit).toBe(150);
  });

  it('parses Maldives Islamic Bank (MIB) CSV exports accurately', () => {
    const statement = parseMibCsv(SAMPLE_MIB_CSV, 'acc-mib-mvr-1030');
    expect(statement.bankName).toBe('MIB');
    expect(statement.lines.length).toBe(4);
    expect(statement.lines[1].credit).toBe(18500);
    expect(statement.lines[1].date).toBe('2026-08-04');
    expect(statement.lines[2].debit).toBe(20000);
  });

  it('auto-matches statement lines with ERP payments and receipts', () => {
    const statement = parseBmlCsv(SAMPLE_BML_CSV, 'acc-bml-mvr-1010');
    const erpCandidates: ERPReconciliationCandidate[] = [
      {
        id: 'erp-pay-001',
        type: 'payment_receipt',
        date: '2026-08-05',
        reference: 'BML-TXN-99120',
        narration: 'Customer settlement',
        amount: 25000,
        isDebit: false, // Bank inflow
        reconciled: false,
      },
      {
        id: 'erp-exp-001',
        type: 'expense',
        date: '2026-08-11', // 1 day diff
        reference: 'WIRE-SUP-001',
        narration: 'Paint supplies purchase',
        amount: 12000,
        isDebit: true, // Bank outflow
        reconciled: false,
      },
    ];

    const matchResult = autoMatchStatementLines(statement.lines, erpCandidates);
    expect(matchResult.matchedPairs.length).toBe(2);
    expect(matchResult.matchedPairs[0].confidence).toBe(1.0); // Exact ref match
    expect(matchResult.matchedPairs[1].confidence).toBeGreaterThanOrEqual(0.85); // Near-date match
    expect(matchResult.unmatchedStatementLines.length).toBe(3); // Opening, fee, interest
  });

  it('creates balanced double-entry adjustments for bank fees and interest', () => {
    const feeLine: BankStatementLine = {
      id: 'stmt-line-fee',
      statementId: 'stmt-001',
      date: '2026-08-15',
      description: 'Monthly BML Service Fee',
      reference: 'FEE-AUG-2026',
      debit: 150,
      credit: 0,
      balance: 162850,
      status: 'unreconciled',
    };

    const journal = createBankAdjustmentEntry({
      statementLine: feeLine,
      bankAccountCode: '1010',
      adjustmentType: 'bank_fee',
      tenantId: 'tenant-club-ignition',
    });

    expect(journal.isBalanced).toBe(true);
    expect(journal.totalDebit).toBe(150);
    expect(journal.totalCredit).toBe(150);
    expect(journal.lines[0].accountCode).toBe('6310'); // Bank fees
    expect(journal.lines[1].accountCode).toBe('1010'); // BML Bank MVR
  });

  it('calculates authoritative reconciliation summary and proves mathematical balance', () => {
    const statement = parseBmlCsv(SAMPLE_BML_CSV, 'acc-bml-mvr-1010');
    // Statement ending balance: 163,300
    // Unpresented cheques (ERP recorded payment not yet on bank statement): 5,000
    // Uncredited deposits (ERP recorded receipt not yet on bank statement): 2,000
    // ERP Ledger Balance: 163,300 + 2,000 - 5,000 = 160,300
    const erpLedgerBalance = 160300;
    const summary = calculateReconciliationSummary(statement, erpLedgerBalance, 5000, 2000);

    expect(summary.statementClosingBalance).toBe(163300);
    expect(summary.adjustedBankBalance).toBe(160300);
    expect(summary.isBalanced).toBe(true);
    expect(summary.variance).toBeLessThan(0.01);
  });
});
