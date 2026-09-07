/**
 * STARQ ERP — Credit Notes, Customer Advances & Settlement Domain (SERP-294)
 */

import { JournalEntry, JournalLine } from './journals';
import { AccountRecord, accountClassForCode } from './accounts';

/**
 * Double-entry totals for a journal entry, computed rather than asserted.
 *
 * isBalanced is DERIVED from the lines. Hardcoding it to true would make the
 * field a statement of intent instead of a fact, and an unbalanced entry would
 * then be reported as balanced — which defeats the point of carrying the flag.
 */
function journalTotals(lines: JournalLine[]): {
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
} {
  const totalDebit = Math.round(lines.reduce((sum, l) => sum + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((sum, l) => sum + l.credit, 0) * 100) / 100;
  return { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.005 };
}

export interface CreditNoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number; // e.g. 8 for 8% GST, 0 for exempt
  subtotal: number;
  taxAmount: number;
  total: number;
}

export type CreditNoteStatus = 'Draft' | 'Issued' | 'PartiallyAllocated' | 'FullyAllocated' | 'Cancelled';

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  tenantId?: string;
  bookId?: string;
  customerId: string;
  customerName: string;
  invoiceId?: string | null; // Linked invoice if created against a specific invoice
  invoiceNumber?: string | null;
  issueDate: string;
  reason: string;
  items: CreditNoteItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  allocatedAmount: number;
  remainingBalance: number;
  status: CreditNoteStatus;
  currency: string;
  createdAt: string;
  createdBy: string;
}

export type AdvanceStatus = 'Unallocated' | 'PartiallyAllocated' | 'FullyAllocated' | 'Refunded';

export interface CustomerAdvance {
  id: string;
  receiptNumber: string;
  tenantId?: string;
  bookId?: string;
  customerId: string;
  customerName: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'Bank Transfer' | 'Cash' | 'Cheque' | 'Card';
  reference: string;
  notes?: string;
  allocatedAmount: number;
  remainingBalance: number;
  status: AdvanceStatus;
  currency: string;
  createdAt: string;
  createdBy: string;
}

export interface SettlementAllocation {
  id: string;
  allocationNumber: string;
  tenantId?: string;
  sourceType: 'CREDIT_NOTE' | 'CUSTOMER_ADVANCE';
  sourceId: string;
  sourceNumber: string;
  targetInvoiceId: string;
  targetInvoiceNumber: string;
  customerId: string;
  customerName: string;
  allocatedAmount: number;
  allocationDate: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

/**
 * Generates authoritative reversing double-entry journals for issued credit notes.
 *
 * Accounting Entry:
 *   DR 4100 / 4000 (Sales Returns / Revenue Reversal) - Subtotal
 *   DR 2200 (Output GST Payable Reversal)             - Tax Amount
 *   CR 1200 (Accounts Receivable)                     - Total Credit Amount
 */
export function generateCreditNoteJournals(params: {
  creditNotes: CreditNote[];
  accounts: AccountRecord[];
  isGstRegistered?: boolean;
}): JournalEntry[] {
  const journals: JournalEntry[] = [];

  params.creditNotes.forEach((cn) => {
    if (cn.status === 'Cancelled' || cn.status === 'Draft' || cn.totalAmount <= 0) {
      return;
    }

    const lines: JournalLine[] = [];

    // 1. Debit Revenue / Sales Returns
    if (cn.subtotal > 0) {
      lines.push({
        id: `${cn.id}-rev`,
        accountCode: '4110',
        accountId: 'acc-4110',
        accountClass: accountClassForCode('4110'),
        accountName: 'Workshop & Job Labor Revenue',
        debit: Math.round(cn.subtotal * 100) / 100,
        credit: 0,
        narration: `Credit Note ${cn.creditNoteNumber} - ${cn.reason || 'Sales Allowance'} (${cn.customerName})`,
      });
    }

    // 2. Debit Output GST (Reversing tax liability)
    if (cn.taxAmount > 0 && params.isGstRegistered !== false) {
      lines.push({
        id: `${cn.id}-gst`,
        accountCode: '2121',
        accountId: 'acc-2121',
        accountClass: accountClassForCode('2121'),
        accountName: 'MIRA Output GST Payable',
        debit: Math.round(cn.taxAmount * 100) / 100,
        credit: 0,
        narration: `GST Reversal on Credit Note ${cn.creditNoteNumber}`,
      });
    }

    // 3. Credit Accounts Receivable (Reducing customer balance)
    lines.push({
      id: `${cn.id}-ar`,
      accountCode: '1210',
      accountId: 'acc-1210',
      accountClass: accountClassForCode('1210'),
      accountName: 'Trade Debtors Control Account',
      debit: 0,
      credit: Math.round(cn.totalAmount * 100) / 100,
      narration: `Credit Note Issued: ${cn.creditNoteNumber} - ${cn.customerName}`,
    });

    journals.push({
      id: `je-cn-${cn.id}`,
      entryNumber: `JE-${cn.creditNoteNumber}`,
      date: cn.issueDate,
      narration: `Credit Note ${cn.creditNoteNumber} issued to ${cn.customerName}: ${cn.reason || 'Sales Allowance'}`,
      source: 'CREDIT_NOTE',
      reference: cn.id,
      lines,
      ...journalTotals(lines),
      tenantId: cn.tenantId || '',
      status: 'POSTED',
      postedAt: cn.createdAt,
      postedBy: cn.createdBy || 'System',
    });
  });

  return journals;
}

/**
 * Generates authoritative journals for Customer Advance deposits.
 *
 * Accounting Entry:
 *   DR 1114 Petty Cash Fund / 1111 BML MVR Main   - Received Amount
 *   CR 2150 Customer Advances & Deposits          - Liability Holding
 */
export function generateCustomerAdvanceJournals(params: {
  advances: CustomerAdvance[];
  accounts: AccountRecord[];
}): JournalEntry[] {
  const journals: JournalEntry[] = [];

  params.advances.forEach((adv) => {
    if (adv.status === 'Refunded' || adv.amount <= 0) return;

    const lines: JournalLine[] = [
      // 1. Debit Cash/Bank
      {
        id: `${adv.id}-bank`,
        accountCode: adv.paymentMethod === 'Cash' ? '1114' : '1111',
        accountId: `acc-${adv.paymentMethod === 'Cash' ? '1114' : '1111'}`,
        accountClass: accountClassForCode(adv.paymentMethod === 'Cash' ? '1114' : '1111'),
        accountName: adv.paymentMethod === 'Cash' ? 'Petty Cash Fund' : 'Bank of Maldives (BML) MVR Main',
        debit: Math.round(adv.amount * 100) / 100,
        credit: 0,
        narration: `Customer Advance Received: ${adv.receiptNumber} from ${adv.customerName}`,
      },
      // 2. Credit Customer Advance Liability
      {
        id: `${adv.id}-adv-liab`,
        accountCode: '2150',
        accountId: 'acc-2150',
        accountClass: accountClassForCode('2150'),
        accountName: 'Customer Advances & Deposits',
        debit: 0,
        credit: Math.round(adv.amount * 100) / 100,
        narration: `Advance Deposit Holding: ${adv.receiptNumber} (${adv.customerName})`,
      },
    ];

    journals.push({
      id: `je-adv-${adv.id}`,
      entryNumber: `JE-${adv.receiptNumber}`,
      date: adv.paymentDate,
      narration: `Customer Advance Deposit ${adv.receiptNumber} from ${adv.customerName} via ${adv.paymentMethod}`,
      source: 'ADVANCE_DEPOSIT',
      reference: adv.id,
      lines,
      ...journalTotals(lines),
      tenantId: adv.tenantId || '',
      status: 'POSTED',
      postedAt: adv.createdAt,
      postedBy: adv.createdBy || 'System',
    });
  });

  return journals;
}

/**
 * Generates authoritative journals when an Advance is allocated against an Invoice.
 *
 * Accounting Entry:
 *   DR 2300 (Customer Advances Liability) - Allocated Amount
 *   CR 1200 (Accounts Receivable)         - Clearing Invoice Balance
 */
export function generateSettlementAllocationJournals(params: {
  allocations: SettlementAllocation[];
}): JournalEntry[] {
  const journals: JournalEntry[] = [];

  params.allocations.forEach((alloc) => {
    // Only customer advances create an AR-clearing journal (since credit notes already cleared AR upon issuance)
    if (alloc.sourceType !== 'CUSTOMER_ADVANCE' || alloc.allocatedAmount <= 0) {
      return;
    }

    const lines: JournalLine[] = [
      // 1. Debit Customer Advance Liability (releasing the holding liability)
      {
        id: `${alloc.id}-dr-adv`,
        accountCode: '2150',
        accountId: 'acc-2150',
        accountClass: accountClassForCode('2150'),
        accountName: 'Customer Advances & Deposits',
        debit: Math.round(alloc.allocatedAmount * 100) / 100,
        credit: 0,
        narration: `Settlement of ${alloc.targetInvoiceNumber} using Advance ${alloc.sourceNumber}`,
      },
      // 2. Credit Accounts Receivable (clearing the invoice receivable balance)
      {
        id: `${alloc.id}-cr-ar`,
        accountCode: '1210',
        accountId: 'acc-1210',
        accountClass: accountClassForCode('1210'),
        accountName: 'Trade Debtors Control Account',
        debit: 0,
        credit: Math.round(alloc.allocatedAmount * 100) / 100,
        narration: `Invoice ${alloc.targetInvoiceNumber} settled via Advance ${alloc.sourceNumber}`,
      },
    ];

    journals.push({
      id: `je-alloc-${alloc.id}`,
      entryNumber: `JE-${alloc.allocationNumber}`,
      date: alloc.allocationDate,
      narration: `Settlement Allocation: ${alloc.sourceNumber} applied to ${alloc.targetInvoiceNumber} (${alloc.customerName})`,
      source: 'SETTLEMENT_ALLOCATION',
      reference: alloc.id,
      lines,
      ...journalTotals(lines),
      tenantId: alloc.tenantId || '',
      status: 'POSTED',
      postedAt: alloc.createdAt,
      postedBy: alloc.createdBy || 'System',
    });
  });

  return journals;
}
