import { JournalEntry } from './journals';

export type SupportedCurrency = 'MVR' | 'USD' | 'EUR' | 'GBP' | 'SGD' | 'AED';

export interface ExchangeRateRecord {
  currency: SupportedCurrency;
  rateToBaseMvr: number; // e.g. 15.42 for USD
  source: 'MMA_OFFICIAL' | 'BANK_SPOT' | 'CUSTOM';
  effectiveDate: string;
}

export const DEFAULT_MMA_RATES: Record<SupportedCurrency, number> = {
  MVR: 1.0,
  USD: 15.42, // MMA pegged buying/selling band
  EUR: 16.85,
  GBP: 19.80,
  SGD: 11.60,
  AED: 4.20,
};

export interface MultiCurrencyTransaction {
  id: string;
  transactionType: 'INVOICE_AR' | 'BILL_AP' | 'PAYMENT_RECEIPT' | 'SUPPLIER_PAYMENT';
  reference: string;
  currency: SupportedCurrency;
  foreignAmount: number;
  exchangeRate: number; // Rate to MVR on transaction date
  baseMvrAmount: number; // foreignAmount * exchangeRate
  transactionDate: string;
}

export interface FxSettlementResult {
  settlementId: string;
  originalReference: string;
  currency: SupportedCurrency;
  foreignAmountSettled: number;
  originalRate: number;
  originalMvrAmount: number;
  settlementRate: number;
  settledMvrAmount: number;
  fxDifferenceMvr: number; // settledMvr - originalMvr
  type: 'REALIZED_GAIN' | 'REALIZED_LOSS' | 'NO_VARIANCE';
  journalEntry: JournalEntry;
}

export interface UnrealizedRevaluationResult {
  accountCode: string;
  accountName: string;
  currency: SupportedCurrency;
  foreignBalance: number;
  bookMvrBalance: number;
  closingMmaRate: number;
  revaluedMvrBalance: number;
  unrealizedGainLossMvr: number;
  type: 'UNREALIZED_GAIN' | 'UNREALIZED_LOSS' | 'BALANCED';
}

/**
 * Converts foreign currency amount to base currency MVR.
 */
export function convertToBaseMvr(amount: number, currency: SupportedCurrency, rate?: number): number {
  if (currency === 'MVR') return round2(amount);
  const effectiveRate = rate || DEFAULT_MMA_RATES[currency] || 1.0;
  return round2(amount * effectiveRate);
}

/**
 * Calculates Realized Foreign Exchange Gain/Loss upon settling foreign invoices or bills.
 */
export function calculateRealizedFxGainLoss(params: {
  transactionType: 'AR_COLLECTION' | 'AP_DISBURSEMENT';
  reference: string;
  currency: SupportedCurrency;
  foreignAmount: number;
  originalRate: number;
  settlementRate: number;
  settlementDate: string;
  tenantId: string;
}): FxSettlementResult {
  const {
    transactionType,
    reference,
    currency,
    foreignAmount,
    originalRate,
    settlementRate,
    settlementDate,
    tenantId,
  } = params;

  const originalMvr = round2(foreignAmount * originalRate);
  const settledMvr = round2(foreignAmount * settlementRate);
  const diffMvr = round2(settledMvr - originalMvr);

  let type: 'REALIZED_GAIN' | 'REALIZED_LOSS' | 'NO_VARIANCE' = 'NO_VARIANCE';
  let isGain = false;

  if (transactionType === 'AR_COLLECTION') {
    // AR: Received more MVR than originally booked = GAIN
    if (diffMvr > 0.005) {
      type = 'REALIZED_GAIN';
      isGain = true;
    } else if (diffMvr < -0.005) {
      type = 'REALIZED_LOSS';
      isGain = false;
    }
  } else {
    // AP: Paid more MVR than originally booked = LOSS
    if (diffMvr > 0.005) {
      type = 'REALIZED_LOSS';
      isGain = false;
    } else if (diffMvr < -0.005) {
      type = 'REALIZED_GAIN';
      isGain = true;
    }
  }

  const absDiff = round2(Math.abs(diffMvr));

  // Generate balanced Realized FX Journal Entry
  const journalLines: any[] = [];
  if (transactionType === 'AR_COLLECTION') {
    if (isGain) {
      journalLines.push(
        { id: 'l1', accountCode: '1111', accountName: 'Bank of Maldives (BML) MVR Main', debit: settledMvr, credit: 0, description: `Bank Settlement (${foreignAmount} ${currency} @ ${settlementRate})` },
        { id: 'l2', accountCode: '1210', accountName: 'Trade Debtors Control Account', debit: 0, credit: originalMvr, description: `AR Invoice Clearing (${foreignAmount} ${currency} @ ${originalRate})` },
        { id: 'l3', accountCode: '4310', accountName: 'Realized Foreign Exchange Gain', debit: 0, credit: absDiff, description: `FX Gain on ${reference}` }
      );
    } else {
      journalLines.push(
        { id: 'l1', accountCode: '1111', accountName: 'Bank of Maldives (BML) MVR Main', debit: settledMvr, credit: 0, description: `Bank Settlement (${foreignAmount} ${currency} @ ${settlementRate})` },
        { id: 'l2', accountCode: '6410', accountName: 'Realized Foreign Exchange Loss', debit: absDiff, credit: 0, description: `FX Loss on ${reference}` },
        { id: 'l3', accountCode: '1210', accountName: 'Trade Debtors Control Account', debit: 0, credit: originalMvr, description: `AR Invoice Clearing (${foreignAmount} ${currency} @ ${originalRate})` }
      );
    }
  } else {
    // AP Disbursement
    if (isGain) {
      // Paid less MVR
      journalLines.push(
        { id: 'l1', accountCode: '2110', accountName: 'Accounts Payable (Trade Creditors)', debit: originalMvr, credit: 0, description: `AP Bill Clearing (${foreignAmount} ${currency} @ ${originalRate})` },
        { id: 'l2', accountCode: '1111', accountName: 'Bank of Maldives (BML) MVR Main', debit: 0, credit: settledMvr, description: `Bank Settlement (${foreignAmount} ${currency} @ ${settlementRate})` },
        { id: 'l3', accountCode: '4310', accountName: 'Realized Foreign Exchange Gain', debit: 0, credit: absDiff, description: `FX Gain on ${reference}` }
      );
    } else {
      // Paid more MVR
      journalLines.push(
        { id: 'l1', accountCode: '2110', accountName: 'Accounts Payable (Trade Creditors)', debit: originalMvr, credit: 0, description: `AP Bill Clearing (${foreignAmount} ${currency} @ ${originalRate})` },
        { id: 'l2', accountCode: '6410', accountName: 'Realized Foreign Exchange Loss', debit: absDiff, credit: 0, description: `FX Loss on ${reference}` },
        { id: 'l3', accountCode: '1111', accountName: 'Bank of Maldives (BML) MVR Main', debit: 0, credit: settledMvr, description: `Bank Settlement (${foreignAmount} ${currency} @ ${settlementRate})` }
      );
    }
  }

  const totalDebit = round2(journalLines.reduce((s, l) => s + (l.debit || 0), 0));
  const totalCredit = round2(journalLines.reduce((s, l) => s + (l.credit || 0), 0));

  const journalEntry: JournalEntry = {
    id: `je-fx-${Date.now()}`,
    entryNumber: `JE-FX-${Date.now().toString().slice(-6)}`,
    date: settlementDate,
    source: 'FX_REALIZATION',
    reference: `FX-${reference}`,
    narration: `Realized FX ${type === 'REALIZED_GAIN' ? 'Gain' : 'Loss'} on settlement of ${reference} (${foreignAmount} ${currency})`,
    lines: journalLines,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    postedBy: 'System / FX Engine',
    postedAt: new Date().toISOString(),
    tenantId,
    status: 'POSTED',
  };

  return {
    settlementId: `FX-SETTLE-${reference}`,
    originalReference: reference,
    currency,
    foreignAmountSettled: foreignAmount,
    originalRate,
    originalMvrAmount: originalMvr,
    settlementRate,
    settledMvrAmount: settledMvr,
    fxDifferenceMvr: diffMvr,
    type,
    journalEntry,
  };
}

/**
 * Calculates Period-End Unrealized Foreign Exchange revaluation for foreign bank balances (e.g. 1020 BML USD).
 */
export function calculateUnrealizedRevaluation(params: {
  accountCode: string;
  accountName: string;
  currency: SupportedCurrency;
  foreignBalance: number;
  bookMvrBalance: number;
  closingMmaRate: number;
}): UnrealizedRevaluationResult {
  const { accountCode, accountName, currency, foreignBalance, bookMvrBalance, closingMmaRate } = params;

  const revaluedMvr = round2(foreignBalance * closingMmaRate);
  const diff = round2(revaluedMvr - bookMvrBalance);

  let type: 'UNREALIZED_GAIN' | 'UNREALIZED_LOSS' | 'BALANCED' = 'BALANCED';
  if (diff > 0.005) type = 'UNREALIZED_GAIN';
  else if (diff < -0.005) type = 'UNREALIZED_LOSS';

  return {
    accountCode,
    accountName,
    currency,
    foreignBalance,
    bookMvrBalance: round2(bookMvrBalance),
    closingMmaRate,
    revaluedMvrBalance: revaluedMvr,
    unrealizedGainLossMvr: diff,
    type,
  };
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
