/**
 * Normalised bank statement transaction consumed by the AI matching engine.
 * Local to this module: the reconciliation parser works on
 * `BankStatementLine` (separate debit/credit columns), whereas the matcher
 * operates on a single signed `amount` plus an explicit direction.
 */
export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  isReconciled: boolean;
  reference?: string;
}

import { AgentActionProposal, RegisteredAgent, proposeAgentAction } from './agentRegistry';

export interface ExtractedReceiptData {
  invoiceNumber?: string;
  vendorName?: string;
  vendorTin?: string;
  date?: string;
  totalAmountMvr: number;
  gstAmountMvr?: number;
  bmlReference?: string;
  confidenceScore: number;
  rawText: string;
}

export interface AiMatchSuggestion {
  id: string;
  bankTxId: string;
  bankTxDate: string;
  bankTxDescription: string;
  bankTxAmount: number;
  matchedInvoiceId: string;
  matchedInvoiceNumber: string;
  customerOrVendorName: string;
  invoiceAmount: number;
  confidenceScore: number;
  matchReason: string;
  status: 'SUGGESTED' | 'ACCEPTED' | 'REJECTED';
}

export function parseReceiptOcr(rawText: string): ExtractedReceiptData {
  let confidence = 50;
  let totalAmount = 0;
  let gstAmount = 0;
  let invNum: string | undefined;
  let vendor: string | undefined;
  let tin: string | undefined;
  let date: string | undefined;
  let bmlRef: string | undefined;

  const invMatch = rawText.match(/(?:INVOICE|INV|BILL|REC)[\s#:]*([A-Z0-9-]+)/i);
  if (invMatch) {
    invNum = invMatch[1].toUpperCase();
    confidence += 15;
  }

  const tinMatch = rawText.match(/(?:TIN|GST\s*NO|TAX\s*ID)[\s#:]*([0-9]{5,10}[A-Z0-9]*)/i);
  if (tinMatch) {
    tin = tinMatch[1].toUpperCase();
    confidence += 10;
  }

  const bmlMatch = rawText.match(/(?:BML\s*REF|FAVARA|TXN|REF)[\s#:]*([A-Z0-9]{8,20})/i);
  if (bmlMatch) {
    bmlRef = bmlMatch[1].toUpperCase();
    confidence += 15;
  }

  const totalMatch = rawText.match(/\b(?:TOTAL|GRAND\s*TOTAL|NET\s*PAYABLE)[\s#:]*(?:MVR|RF|Rf)?\s*([0-9,]+\.[0-9]{2})/i);
  if (totalMatch) {
    totalAmount = parseFloat(totalMatch[1].replace(/,/g, ''));
    confidence += 15;
  } else {
    const amountMatch = rawText.match(/\b(?:AMOUNT|MVR|RF|NET)[\s#:]*([0-9,]+\.[0-9]{2})/i);
    if (amountMatch) {
      totalAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
      confidence += 10;
    }
  }

  const dateMatch = rawText.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})/);
  if (dateMatch) {
    date = dateMatch[0];
  }

  if (rawText.toLowerCase().includes('logistics') || rawText.toLowerCase().includes('marine')) {
    vendor = 'Starq Logistics Pvt Ltd';
  } else if (rawText.toLowerCase().includes('starq')) {
    vendor = 'Starq Holdings Pvt Ltd';
  } else if (rawText.toLowerCase().includes('dhiraagu')) {
    vendor = 'Dhiraagu PLC';
  }

  return {
    invoiceNumber: invNum,
    vendorName: vendor,
    vendorTin: tin,
    date,
    totalAmountMvr: totalAmount,
    gstAmountMvr: gstAmount,
    bmlReference: bmlRef,
    confidenceScore: Math.min(confidence, 100),
    rawText,
  };
}

export function generateAiMatchSuggestions(
  bankTransactions: BankTransaction[],
  openInvoices: Array<{
    id: string;
    invoiceNumber: string;
    customerOrVendor: string;
    date: string;
    amountMvr: number;
    reference?: string;
  }>
): AiMatchSuggestion[] {
  const suggestions: AiMatchSuggestion[] = [];

  for (const tx of bankTransactions) {
    if (tx.isReconciled) continue;

    for (const inv of openInvoices) {
      let score = 0;
      const reasons: string[] = [];

      if (
        inv.reference &&
        tx.description.toUpperCase().includes(inv.reference.toUpperCase())
      ) {
        score = 100;
        reasons.push(`Exact Reference match (${inv.reference})`);
      } else if (tx.description.toUpperCase().includes(inv.invoiceNumber.toUpperCase())) {
        score = 95;
        reasons.push(`Invoice #${inv.invoiceNumber} in transaction narrative`);
      }

      if (Math.abs(tx.amount - inv.amountMvr) < 0.01) {
        if (score === 0) {
          score = 85;
          reasons.push(`Exact Amount match (MVR ${inv.amountMvr.toFixed(2)})`);

          if (tx.date === inv.date) {
            score = Math.min(score + 10, 100);
            reasons.push('Exact transaction date match');
          }
        }
      }

      if (
        tx.description.toLowerCase().includes(inv.customerOrVendor.toLowerCase())
      ) {
        if (score === 0) {
          score = 75;
          reasons.push(`Entity '${inv.customerOrVendor}' recognized in statement`);
        }
      }

      if (score >= 70) {
        suggestions.push({
          id: `aimatch-${tx.id}-${inv.id}`,
          bankTxId: tx.id,
          bankTxDate: tx.date,
          bankTxDescription: tx.description,
          bankTxAmount: tx.amount,
          matchedInvoiceId: inv.id,
          matchedInvoiceNumber: inv.invoiceNumber,
          customerOrVendorName: inv.customerOrVendor,
          invoiceAmount: inv.amountMvr,
          confidenceScore: score,
          matchReason: reasons.join(' · '),
          status: 'SUGGESTED',
        });
      }
    }
  }

  return suggestions;
}

export function convertMatchToReconciliationProposal(
  suggestion: AiMatchSuggestion,
  agent: RegisteredAgent
): AgentActionProposal {
  return proposeAgentAction({
    id: `prop-rec-${suggestion.id}`,
    agent,
    actionType: 'RECONCILE_BANK_TX',
    summary: `Auto-reconcile Bank Tx #${suggestion.bankTxId} against Invoice ${suggestion.matchedInvoiceNumber} (${suggestion.matchReason})`,
    requiredScope: 'bank:reconcile_propose',
    riskLevel: suggestion.confidenceScore >= 90 ? 'LOW' : 'MEDIUM',
  });
}
