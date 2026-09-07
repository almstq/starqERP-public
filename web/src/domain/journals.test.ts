import { describe, it, expect } from 'vitest';
import {
  validateJournalEntry,
  deriveOperationalJournals,
  compileGeneralLedger,
  JournalLine,
} from './journals';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';
import { Invoice, Payment, Expense, PurchaseOrder } from '../types/erp';

describe('Double-Entry Balance Invariant & Journal Validation (SERP-291)', () => {
  it('rejects empty or single-line journal entries', () => {
    const resEmpty = validateJournalEntry([]);
    expect(resEmpty.isValid).toBe(false);
    expect(resEmpty.errors).toContain('A journal entry must contain at least 2 lines (minimum 1 debit and 1 credit).');

    const resSingle = validateJournalEntry([
      { accountId: 'acc-1', accountCode: '1000', accountName: 'Cash', debit: 500, credit: 0 },
    ]);
    expect(resSingle.isValid).toBe(false);
    expect(resSingle.errors).toContain('A journal entry must contain at least 2 lines (minimum 1 debit and 1 credit).');
  });

  it('rejects single-sided journal entries (all debits or all credits)', () => {
    const resAllDebits = validateJournalEntry([
      { accountId: 'acc-1', accountCode: '1000', accountName: 'Cash', debit: 500, credit: 0 },
      { accountId: 'acc-2', accountCode: '1100', accountName: 'AR', debit: 500, credit: 0 },
    ]);
    expect(resAllDebits.isValid).toBe(false);
    expect(resAllDebits.errors).toContain('Total credits must be greater than zero.');

    const resAllCredits = validateJournalEntry([
      { accountId: 'acc-1', accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 500 },
      { accountId: 'acc-2', accountCode: '2100', accountName: 'GST', debit: 0, credit: 500 },
    ]);
    expect(resAllCredits.isValid).toBe(false);
    expect(resAllCredits.errors).toContain('Total debits must be greater than zero.');
  });

  it('rejects unbalanced journal entries and calculates exact variance', () => {
    const resUnbalanced = validateJournalEntry([
      { accountId: 'acc-1', accountCode: '1000', accountName: 'Cash', debit: 1250, credit: 0 },
      { accountId: 'acc-2', accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 1000 },
    ]);
    expect(resUnbalanced.isValid).toBe(false);
    expect(resUnbalanced.variance).toBe(250);
    expect(resUnbalanced.totalDebit).toBe(1250);
    expect(resUnbalanced.totalCredit).toBe(1000);
    expect(resUnbalanced.errors.some((e) => e.includes('out of balance'))).toBe(true);
  });

  it('rejects negative numbers and lines with both debit and credit', () => {
    const resNegative = validateJournalEntry([
      { accountId: 'acc-1', accountCode: '1000', accountName: 'Cash', debit: -500, credit: 0 },
      { accountId: 'acc-2', accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 500 },
    ]);
    expect(resNegative.isValid).toBe(false);
    expect(resNegative.errors.some((e) => e.includes('Negative values are prohibited'))).toBe(true);

    const resBoth = validateJournalEntry([
      { accountId: 'acc-1', accountCode: '1000', accountName: 'Cash', debit: 500, credit: 500 },
      { accountId: 'acc-2', accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 500 },
    ]);
    expect(resBoth.isValid).toBe(false);
    expect(resBoth.errors.some((e) => e.includes('both a debit and a credit'))).toBe(true);
  });

  it('accepts perfectly balanced multi-line journal entries', () => {
    const validLines = [
      { accountId: 'acc-1', accountCode: '1000', accountName: 'Bank & Cash', debit: 10800, credit: 0 },
      { accountId: 'acc-2', accountCode: '4000', accountName: 'Service Revenue', debit: 0, credit: 10000 },
      { accountId: 'acc-3', accountCode: '2100', accountName: 'GST Payable', debit: 0, credit: 800 },
    ];
    const res = validateJournalEntry(validLines);
    expect(res.isValid).toBe(true);
    expect(res.variance).toBe(0);
    expect(res.totalDebit).toBe(10800);
    expect(res.totalCredit).toBe(10800);
    expect(res.errors.length).toBe(0);
  });
});

describe('General Ledger Derivation & Running Balance (SERP-291)', () => {
  it('derives balanced journals from operational invoices, payments, expenses', () => {
    const mockInvoices: Invoice[] = [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        customerId: 'cust-1',
        customerName: 'Apex Marine',
        customerPhone: '7777777',
        customerIsland: 'Male',
        amountPaid: 0,
        balanceDue: 0,
        bankDetails: 'BML 7701192837101',
        date: '2026-08-01',
        dueDate: '2026-08-15',
        subtotal: 10000,
        gstRate: 8,
        gstAmount: 800,
        totalAmount: 10800,
        status: 'Paid',
        items: [],
      },
    ];

    const mockPayments: Payment[] = [
      {
        id: 'pay-1',
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        customerId: 'cust-1',
        referenceNumber: 'REF-INV-2026-0001',
        status: 'Verified',
        customerName: 'Apex Marine',
        amount: 10800,
        paymentDate: '2026-08-05',
        method: 'BML Transfer',
        paymentNumber: 'RCT-0001',
      },
    ];

    const journals = deriveOperationalJournals({
      invoices: mockInvoices,
      payments: mockPayments,
      expenses: [],
      purchaseOrders: [],
      accounts: DEFAULT_CHART_OF_ACCOUNTS,
      isGstRegistered: true,
      tenantId: 'tenant-stq',
    });

    expect(journals.length).toBe(2);
    expect(journals[0].isBalanced).toBe(true);
    expect(journals[0].totalDebit).toBe(10800);
    expect(journals[0].totalCredit).toBe(10800);
    expect(journals[1].isBalanced).toBe(true);
    expect(journals[1].totalDebit).toBe(10800);
    expect(journals[1].totalCredit).toBe(10800);
  });

  it('calculates accurate running balance across General Ledger postings', () => {
    const mockJournals = [
      {
        id: 'je-1',
        entryNumber: 'JE-001',
        date: '2026-08-01',
        source: 'MANUAL' as const,
        narration: 'Capital Injection',
        lines: [
          {
            id: 'l1',
            accountId: '1000',
            accountCode: '1000',
            accountName: 'Bank & Cash',
            accountClass: 'ASSET' as const,
            debit: 50000,
            credit: 0,
          },
          {
            id: 'l2',
            accountId: '3000',
            accountCode: '3000',
            accountName: 'Owner Capital',
            accountClass: 'EQUITY' as const,
            debit: 0,
            credit: 50000,
          },
        ],
        totalDebit: 50000,
        totalCredit: 50000,
        isBalanced: true,
        postedBy: 'Admin',
        postedAt: '2026-08-01T00:00:00Z',
        tenantId: 'tenant-stq',
        status: 'POSTED' as const,
      },
      {
        id: 'je-2',
        entryNumber: 'JE-002',
        date: '2026-08-02',
        source: 'EXPENSE' as const,
        narration: 'Office Rent Payment',
        lines: [
          {
            id: 'l3',
            accountId: '6000',
            accountCode: '6000',
            accountName: 'Rent Expense',
            accountClass: 'EXPENSE' as const,
            debit: 12000,
            credit: 0,
          },
          {
            id: 'l4',
            accountId: '1000',
            accountCode: '1000',
            accountName: 'Bank & Cash',
            accountClass: 'ASSET' as const,
            debit: 0,
            credit: 12000,
          },
        ],
        totalDebit: 12000,
        totalCredit: 12000,
        isBalanced: true,
        postedBy: 'Admin',
        postedAt: '2026-08-02T00:00:00Z',
        tenantId: 'tenant-stq',
        status: 'POSTED' as const,
      },
    ];

    // Filter by Account 1000 (Asset: Debit Normal)
    const ledger1000 = compileGeneralLedger(mockJournals, '1000');
    expect(ledger1000.length).toBe(2);
    // Reverse chron order: newest first
    expect(ledger1000[0].entryNumber).toBe('JE-002');
    expect(ledger1000[0].credit).toBe(12000);
    expect(ledger1000[0].runningBalance).toBe(38000); // 50,000 - 12,000 = 38,000

    expect(ledger1000[1].entryNumber).toBe('JE-001');
    expect(ledger1000[1].debit).toBe(50000);
    expect(ledger1000[1].runningBalance).toBe(50000);
  });
});
