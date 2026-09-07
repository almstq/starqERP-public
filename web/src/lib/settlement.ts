/**
 * STARQ ERP — Authoritative Settlement Allocation Engine (SERP-294)
 *
 * Implements strict business rules for:
 * 1. Credit Note creation & invoice linking
 * 2. Customer Advance deposit capture
 * 3. Atomic, zero-leakage settlement allocation against outstanding invoices
 * 4. Rejection of over-allocation, negative allocation, and cross-customer mixing
 */

import {
  CreditNote,
  CreditNoteItem,
  CustomerAdvance,
  SettlementAllocation,
} from '../domain/creditNotes';
import { Invoice } from '../types/erp';

export interface IssueCreditNoteParams {
  customerId: string;
  customerName: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  issueDate: string;
  reason: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate?: number;
  }>;
  createdBy?: string;
  existingCreditNotesCount?: number;
}

export function issueCreditNote(params: IssueCreditNoteParams): CreditNote {
  if (!params.customerId || !params.customerName) {
    throw new Error('Customer details are required to issue a credit note');
  }
  if (!params.items || params.items.length === 0) {
    throw new Error('Credit note must contain at least one item');
  }

  const items: CreditNoteItem[] = params.items.map((item, idx) => {
    if (item.quantity <= 0 || item.unitPrice < 0) {
      throw new Error(`Item ${idx + 1} has invalid quantity or price`);
    }
    const subtotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
    const taxRate = item.taxRate ?? 0;
    const taxAmount = Math.round((subtotal * taxRate) / 100 * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    return {
      id: `cni-${Date.now()}-${idx}`,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate,
      subtotal,
      taxAmount,
      total,
    };
  });

  const subtotal = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
  const taxAmount = Math.round(items.reduce((s, i) => s + i.taxAmount, 0) * 100) / 100;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  if (totalAmount <= 0) {
    throw new Error('Total credit note amount must be greater than zero');
  }

  const count = (params.existingCreditNotesCount || 0) + 1;
  const creditNoteNumber = `CN-2026-${String(count).padStart(3, '0')}`;

  return {
    id: `cn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    creditNoteNumber,
    customerId: params.customerId,
    customerName: params.customerName,
    invoiceId: params.invoiceId || null,
    invoiceNumber: params.invoiceNumber || null,
    issueDate: params.issueDate || new Date().toISOString().split('T')[0],
    reason: params.reason || 'Sales Allowance / Adjustment',
    items,
    subtotal,
    taxAmount,
    totalAmount,
    allocatedAmount: 0,
    remainingBalance: totalAmount,
    status: 'Issued',
    currency: 'MVR',
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy || 'Admin',
  };
}

export interface RecordCustomerAdvanceParams {
  customerId: string;
  customerName: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'Bank Transfer' | 'Cash' | 'Cheque' | 'Card';
  reference: string;
  notes?: string;
  createdBy?: string;
  existingAdvancesCount?: number;
}

export function recordCustomerAdvance(params: RecordCustomerAdvanceParams): CustomerAdvance {
  if (!params.customerId || !params.customerName) {
    throw new Error('Customer details are required for advance deposit');
  }
  if (!params.amount || params.amount <= 0) {
    throw new Error('Advance deposit amount must be greater than zero');
  }

  const count = (params.existingAdvancesCount || 0) + 1;
  const receiptNumber = `ADV-2026-${String(count).padStart(3, '0')}`;
  const roundedAmount = Math.round(params.amount * 100) / 100;

  return {
    id: `adv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    receiptNumber,
    customerId: params.customerId,
    customerName: params.customerName,
    paymentDate: params.paymentDate || new Date().toISOString().split('T')[0],
    amount: roundedAmount,
    paymentMethod: params.paymentMethod,
    reference: params.reference,
    notes: params.notes,
    allocatedAmount: 0,
    remainingBalance: roundedAmount,
    status: 'Unallocated',
    currency: 'MVR',
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy || 'Admin',
  };
}

export interface ApplySettlementParams {
  sourceType: 'CREDIT_NOTE' | 'CUSTOMER_ADVANCE';
  source: CreditNote | CustomerAdvance;
  targetInvoice: Invoice;
  allocatedAmount: number;
  allocationDate?: string;
  notes?: string;
  createdBy?: string;
  existingAllocationsCount?: number;
}

export interface ApplySettlementResult {
  allocation: SettlementAllocation;
  updatedSource: CreditNote | CustomerAdvance;
  updatedInvoice: Invoice;
}

/**
 * Validates and atomically allocates credit note / advance balance against an invoice.
 */
export function applySettlementAllocation(params: ApplySettlementParams): ApplySettlementResult {
  const { sourceType, source, targetInvoice, allocatedAmount } = params;

  if (allocatedAmount <= 0) {
    throw new Error('Allocation amount must be strictly positive (> 0.00 MVR)');
  }

  const roundedAllocation = Math.round(allocatedAmount * 100) / 100;

  // 1. Validate Customer Match
  if (source.customerId !== targetInvoice.customerId) {
    throw new Error(
      `Customer mismatch: Source belongs to "${source.customerName}", but invoice belongs to "${targetInvoice.customerName}"`
    );
  }

  // 2. Validate Source Balance
  if (roundedAllocation > source.remainingBalance + 0.001) {
    const sourceNum = 'creditNoteNumber' in source ? source.creditNoteNumber : source.receiptNumber;
    throw new Error(
      `Over-allocation rejected: Requested ${roundedAllocation.toFixed(2)} MVR exceeds available balance of ${source.remainingBalance.toFixed(2)} MVR on ${sourceNum}`
    );
  }

  // 3. Compute Target Invoice Remaining Balance
  const totalPaidSoFar = (targetInvoice.payments || []).reduce((sum, p) => sum + p.amount, 0);
  const invoiceRemaining = Math.max(0, targetInvoice.totalAmount - totalPaidSoFar);

  if (invoiceRemaining <= 0.005) {
    throw new Error(`Invoice ${targetInvoice.invoiceNumber} is already fully paid and settled.`);
  }

  if (roundedAllocation > invoiceRemaining + 0.001) {
    throw new Error(
      `Over-allocation rejected: Requested ${roundedAllocation.toFixed(2)} MVR exceeds outstanding invoice balance of ${invoiceRemaining.toFixed(2)} MVR`
    );
  }

  // 4. Create Settlement Allocation Record
  const count = (params.existingAllocationsCount || 0) + 1;
  const sourceNumber = 'creditNoteNumber' in source ? source.creditNoteNumber : source.receiptNumber;
  const allocationNumber = `ALLOC-2026-${String(count).padStart(3, '0')}`;
  const allocDate = params.allocationDate || new Date().toISOString().split('T')[0];

  const allocation: SettlementAllocation = {
    id: `alloc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    allocationNumber,
    sourceType,
    sourceId: source.id,
    sourceNumber,
    targetInvoiceId: targetInvoice.id,
    targetInvoiceNumber: targetInvoice.invoiceNumber,
    customerId: source.customerId,
    customerName: source.customerName,
    allocatedAmount: roundedAllocation,
    allocationDate: allocDate,
    notes: params.notes,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy || 'Admin',
  };

  // 5. Update Source
  const newSourceAllocated = Math.round((source.allocatedAmount + roundedAllocation) * 100) / 100;
  const newSourceRemaining = Math.max(0, Math.round((source.remainingBalance - roundedAllocation) * 100) / 100);

  let updatedSource: CreditNote | CustomerAdvance;
  if (sourceType === 'CREDIT_NOTE') {
    const cn = source as CreditNote;
    const status = newSourceRemaining <= 0.005 ? 'FullyAllocated' : 'PartiallyAllocated';
    updatedSource = {
      ...cn,
      allocatedAmount: newSourceAllocated,
      remainingBalance: newSourceRemaining,
      status,
    };
  } else {
    const adv = source as CustomerAdvance;
    const status = newSourceRemaining <= 0.005 ? 'FullyAllocated' : 'PartiallyAllocated';
    updatedSource = {
      ...adv,
      allocatedAmount: newSourceAllocated,
      remainingBalance: newSourceRemaining,
      status,
    };
  }

  // 6. Update Invoice with Payment Record
  const newPayment = {
    id: `pay-alloc-${allocation.id}`,
    invoiceId: targetInvoice.id,
    invoiceNumber: targetInvoice.invoiceNumber,
    amount: roundedAllocation,
    paymentDate: allocDate,
    paymentMethod: sourceType === 'CREDIT_NOTE' ? 'Credit Note' : 'Customer Advance',
    reference: sourceNumber,
    customerName: targetInvoice.customerName,
    recordedBy: params.createdBy || 'Admin',
  };

  const updatedPayments = [...(targetInvoice.payments || []), newPayment];
  const newTotalPaid = Math.round(updatedPayments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const newInvoiceRemaining = Math.max(0, Math.round((targetInvoice.totalAmount - newTotalPaid) * 100) / 100);

  const updatedInvoice: Invoice = {
    ...targetInvoice,
    payments: updatedPayments,
    paymentStatus: newInvoiceRemaining <= 0.005 ? 'Paid' : 'Partial',
    status: newInvoiceRemaining <= 0.005 ? 'Paid' : targetInvoice.status,
  };

  return {
    allocation,
    updatedSource,
    updatedInvoice,
  };
}
