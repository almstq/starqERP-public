import { describe, it, expect } from 'vitest';
import {
  issueCreditNote,
  recordCustomerAdvance,
  applySettlementAllocation,
} from './settlement';
import {
  generateCreditNoteJournals,
  generateCustomerAdvanceJournals,
  generateSettlementAllocationJournals,
} from '../domain/creditNotes';
import { Invoice } from '../types/erp';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';

describe('SERP-294: Credit Notes, Customer Advances & Settlement Engine', () => {
  const mockInvoice: Invoice = {
    id: 'inv-101',
    invoiceNumber: 'INV-2026-101',
    linkedJobId: 'job-101',
    customerId: 'cust-crown',
    customerName: 'Crown Resorts Maldives',
    customerPhone: '7777777',
    customerIsland: 'Male',
    gstRate: 8,
    amountPaid: 0,
    balanceDue: 0,
    bankDetails: 'BML 7701192837101',
    date: '2026-08-10',
    dueDate: '2026-08-25',
    items: [],
    subtotal: 10000,
    gstAmount: 800,
    totalAmount: 10800,
    status: 'Sent',
    paymentStatus: 'Unpaid',
    payments: [],
  };

  it('issues credit notes linked to invoices or standalone credits', () => {
    const creditNote = issueCreditNote({
      customerId: 'cust-crown',
      customerName: 'Crown Resorts Maldives',
      invoiceId: mockInvoice.id,
      invoiceNumber: mockInvoice.invoiceNumber,
      issueDate: '2026-08-15',
      reason: 'Damaged Paint Allowance',
      items: [
        {
          description: 'Defective Marine Primer batch discount',
          quantity: 2,
          unitPrice: 1000,
          taxRate: 8,
        },
      ],
      existingCreditNotesCount: 0,
    });

    expect(creditNote.creditNoteNumber).toBe('CN-2026-001');
    expect(creditNote.subtotal).toBe(2000);
    expect(creditNote.taxAmount).toBe(160);
    expect(creditNote.totalAmount).toBe(2160);
    expect(creditNote.remainingBalance).toBe(2160);
    expect(creditNote.status).toBe('Issued');
  });

  it('generates authoritative reversing double-entry journals for credit notes', () => {
    const creditNote = issueCreditNote({
      customerId: 'cust-crown',
      customerName: 'Crown Resorts Maldives',
      issueDate: '2026-08-15',
      reason: 'Rate concession',
      items: [
        {
          description: 'Special Rate Concession',
          quantity: 1,
          unitPrice: 5000,
          taxRate: 8,
        },
      ],
      existingCreditNotesCount: 1,
    });

    const journals = generateCreditNoteJournals({
      creditNotes: [creditNote],
      accounts: DEFAULT_CHART_OF_ACCOUNTS,
      isGstRegistered: true,
    });

    expect(journals.length).toBe(1);
    const je = journals[0];
    expect(je.entryNumber).toBe('JE-CN-2026-002');
    expect(je.source).toBe('CREDIT_NOTE');

    // Verify double-entry balance: Debits (Revenue 5,000 + GST 400) = Credit (AR 5,400)
    const revDebit = je.lines.find((l) => l.accountCode === '4110')?.debit;
    const gstDebit = je.lines.find((l) => l.accountCode === '2121')?.debit;
    const arCredit = je.lines.find((l) => l.accountCode === '1210')?.credit;

    expect(revDebit).toBe(5000);
    expect(gstDebit).toBe(400);
    expect(arCredit).toBe(5400);

    const totalDebits = je.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredits = je.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('records customer advance deposits and generates liability holding journals', () => {
    const advance = recordCustomerAdvance({
      customerId: 'cust-crown',
      customerName: 'Crown Resorts Maldives',
      paymentDate: '2026-08-01',
      amount: 15000,
      paymentMethod: 'Bank Transfer',
      reference: 'BML-ADV-789',
      notes: 'Initial refit deposit',
      existingAdvancesCount: 0,
    });

    expect(advance.receiptNumber).toBe('ADV-2026-001');
    expect(advance.amount).toBe(15000);
    expect(advance.remainingBalance).toBe(15000);
    expect(advance.status).toBe('Unallocated');

    const journals = generateCustomerAdvanceJournals({
      advances: [advance],
      accounts: DEFAULT_CHART_OF_ACCOUNTS,
    });

    expect(journals.length).toBe(1);
    const je = journals[0];
    expect(je.entryNumber).toBe('JE-ADV-2026-001');

    // Debits (Bank 15,000) = Credits (Customer Advance Liability 15,000)
    const bankDebit = je.lines.find((l) => l.accountCode === '1111')?.debit;
    const advCredit = je.lines.find((l) => l.accountCode === '2150')?.credit;

    expect(bankDebit).toBe(15000);
    expect(advCredit).toBe(15000);
  });

  it('allocates advance deposits against unpaid invoices and prevents over-allocation', () => {
    const advance = recordCustomerAdvance({
      customerId: 'cust-crown',
      customerName: 'Crown Resorts Maldives',
      paymentDate: '2026-08-01',
      amount: 20000,
      paymentMethod: 'Bank Transfer',
      reference: 'BML-REF-001',
      existingAdvancesCount: 0,
    });

    // 1. Partial allocation of 5,000 against 10,800 invoice
    const result1 = applySettlementAllocation({
      sourceType: 'CUSTOMER_ADVANCE',
      source: advance,
      targetInvoice: mockInvoice,
      allocatedAmount: 5000,
      existingAllocationsCount: 0,
    });

    expect(result1.allocation.allocatedAmount).toBe(5000);
    expect(result1.updatedSource.allocatedAmount).toBe(5000);
    expect(result1.updatedSource.remainingBalance).toBe(15000);
    expect(result1.updatedSource.status).toBe('PartiallyAllocated');
    expect(result1.updatedInvoice.paymentStatus).toBe('Partial');
    expect(result1.updatedInvoice.payments.length).toBe(1);

    // 2. Reject over-allocation exceeding remaining invoice balance (Remaining = 5,800, requesting 6,000)
    expect(() => {
      applySettlementAllocation({
        sourceType: 'CUSTOMER_ADVANCE',
        source: result1.updatedSource,
        targetInvoice: result1.updatedInvoice,
        allocatedAmount: 6000,
      });
    }).toThrow(/exceeds outstanding invoice balance/i);

    // 3. Reject negative and zero allocations
    expect(() => {
      applySettlementAllocation({
        sourceType: 'CUSTOMER_ADVANCE',
        source: result1.updatedSource,
        targetInvoice: result1.updatedInvoice,
        allocatedAmount: -500,
      });
    }).toThrow(/strictly positive/i);

    // 4. Reject customer mismatch
    const otherInvoice: Invoice = {
      ...mockInvoice,
      id: 'inv-other',
      customerId: 'cust-other',
      customerName: 'Other Resort',
    };
    expect(() => {
      applySettlementAllocation({
        sourceType: 'CUSTOMER_ADVANCE',
        source: result1.updatedSource,
        targetInvoice: otherInvoice,
        allocatedAmount: 1000,
      });
    }).toThrow(/customer mismatch/i);

    // 5. Complete full allocation of remaining 5,800
    const result2 = applySettlementAllocation({
      sourceType: 'CUSTOMER_ADVANCE',
      source: result1.updatedSource,
      targetInvoice: result1.updatedInvoice,
      allocatedAmount: 5800,
      existingAllocationsCount: 1,
    });

    expect(result2.updatedInvoice.paymentStatus).toBe('Paid');
    expect(result2.updatedInvoice.status).toBe('Paid');
    expect(result2.updatedSource.allocatedAmount).toBe(10800);
    expect(result2.updatedSource.remainingBalance).toBe(9200);

    // 6. Verify Settlement Allocation Journals (DR 2300 Advances, CR 1200 AR)
    const allocJournals = generateSettlementAllocationJournals({
      allocations: [result1.allocation, result2.allocation],
    });

    expect(allocJournals.length).toBe(2);
    expect(allocJournals[0].lines.find((l) => l.accountCode === '2150')?.debit).toBe(5000);
    expect(allocJournals[0].lines.find((l) => l.accountCode === '1210')?.credit).toBe(5000);
  });
});
