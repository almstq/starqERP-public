import { describe, it, expect } from 'vitest';
import {
  parseReceiptOcr,
  generateAiMatchSuggestions,
  convertMatchToReconciliationProposal,
  BankTransaction,
} from './aiReconciliation';
import { DEFAULT_AI_AGENTS } from './agentRegistry';

describe('SERP-016: AI-Assisted Reconciliation & OCR Extraction Engine', () => {
  const financeBot = DEFAULT_AI_AGENTS.find((a) => a.handle === '@financebot')!;

  it('extracts structured invoice, TIN, and amount from Maldives receipt text', () => {
    const rawReceipt = `
      ===================================
             STARQ LOGISTICS PVT LTD
             TIN: 1001234GST001
      ===================================
      Date: 2026-08-28
      Invoice: INV-2026-8891
      BML Ref: BML789456123
      -----------------------------------
      Marine Spares & Fuel
      Subtotal: MVR 25,000.00
      GST 8%:   MVR 2,000.00
      TOTAL:    MVR 27,000.00
      ===================================
    `;

    const extracted = parseReceiptOcr(rawReceipt);
    expect(extracted.invoiceNumber).toBe('INV-2026-8891');
    expect(extracted.vendorTin).toBe('1001234GST001');
    expect(extracted.totalAmountMvr).toBe(27000);
    expect(extracted.bmlReference).toBe('BML789456123');
    expect(extracted.confidenceScore).toBeGreaterThanOrEqual(80);
  });

  it('scores and matches bank statement transactions against open invoices', () => {
    const bankTxs: BankTransaction[] = [
      {
        id: 'btx-01',
        date: '2026-08-28',
        description: 'BML TRANSFER TO STARQ LOGISTICS INV-2026-8891',
        amount: 27000,
        type: 'DEBIT',
        isReconciled: false,
      },
    ];

    const openInvoices = [
      {
        id: 'inv-01',
        invoiceNumber: 'INV-2026-8891',
        customerOrVendor: 'Starq Logistics Pvt Ltd',
        date: '2026-08-28',
        amountMvr: 27000,
        reference: 'INV-2026-8891',
      },
    ];

    const suggestions = generateAiMatchSuggestions(bankTxs, openInvoices);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].confidenceScore).toBe(100);
    expect(suggestions[0].matchedInvoiceNumber).toBe('INV-2026-8891');
  });

  it('converts AI match suggestion into a verifiable AgentActionProposal', () => {
    const suggestion = {
      id: 'aimatch-01',
      bankTxId: 'btx-01',
      bankTxDate: '2026-08-28',
      bankTxDescription: 'BML TRANSFER TO STARQ LOGISTICS',
      bankTxAmount: 27000,
      matchedInvoiceId: 'inv-01',
      matchedInvoiceNumber: 'INV-2026-8891',
      customerOrVendorName: 'Starq Logistics',
      invoiceAmount: 27000,
      confidenceScore: 95,
      matchReason: 'Exact reference match',
      status: 'SUGGESTED' as const,
    };

    const proposal = convertMatchToReconciliationProposal(suggestion, financeBot);
    expect(proposal.agentHandle).toBe('@financebot');
    expect(proposal.requiredScope).toBe('bank:reconcile_propose');
    expect(proposal.riskLevel).toBe('LOW');
    expect(proposal.status).toBe('PENDING_APPROVAL');
  });
});
