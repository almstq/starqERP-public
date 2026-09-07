import { describe, it, expect } from 'vitest';
import {
  convertToBaseMvr,
  calculateRealizedFxGainLoss,
  calculateUnrealizedRevaluation,
  DEFAULT_MMA_RATES,
} from './multiCurrency';

describe('SERP-318: Multi-Currency, MMA Rates & FX Gain/Loss Engine', () => {
  it('converts foreign currencies to base MVR using MMA rates accurately', () => {
    expect(convertToBaseMvr(1000, 'USD')).toBe(15420); // 1000 * 15.42
    expect(convertToBaseMvr(500, 'EUR')).toBe(8425);   // 500 * 16.85
    expect(convertToBaseMvr(2000, 'MVR')).toBe(2000);  // Base 1:1
  });

  it('calculates Realized FX Gain when AR invoice is collected at higher exchange rate', () => {
    // Invoice issued at 15.42, collected at 15.60
    const result = calculateRealizedFxGainLoss({
      transactionType: 'AR_COLLECTION',
      reference: 'INV-USD-1001',
      currency: 'USD',
      foreignAmount: 10000,
      originalRate: 15.42,
      settlementRate: 15.60,
      settlementDate: '2026-08-25',
      tenantId: 'tenant-01',
    });

    expect(result.type).toBe('REALIZED_GAIN');
    expect(result.originalMvrAmount).toBe(154200);
    expect(result.settledMvrAmount).toBe(156000);
    expect(result.fxDifferenceMvr).toBe(1800); // +1,800 MVR Gain
    expect(result.journalEntry.isBalanced).toBe(true);
    expect(result.journalEntry.lines.find(l => l.accountCode === '4310')?.credit).toBe(1800);
  });

  it('calculates Realized FX Loss when AP supplier bill is paid at higher exchange rate', () => {
    // Bill booked at 15.42, paid at 15.70
    const result = calculateRealizedFxGainLoss({
      transactionType: 'AP_DISBURSEMENT',
      reference: 'BILL-YACHT-PART',
      currency: 'USD',
      foreignAmount: 5000,
      originalRate: 15.42,
      settlementRate: 15.70,
      settlementDate: '2026-08-26',
      tenantId: 'tenant-01',
    });

    expect(result.type).toBe('REALIZED_LOSS');
    expect(result.originalMvrAmount).toBe(77100);
    expect(result.settledMvrAmount).toBe(78500);
    expect(result.journalEntry.isBalanced).toBe(true);
    expect(result.journalEntry.lines.find(l => l.accountCode === '6410')?.debit).toBe(1400); // 1,400 Loss
  });

  it('calculates Period-End Unrealized FX revaluation for USD bank account', () => {
    // USD Bank holds $20,000 USD booked at 15.42 (MVR 308,400). Period-end MMA rate moves to 15.55.
    const reval = calculateUnrealizedRevaluation({
      accountCode: '1020',
      accountName: 'BML USD Operating Account',
      currency: 'USD',
      foreignBalance: 20000,
      bookMvrBalance: 308400,
      closingMmaRate: 15.55,
    });

    expect(reval.type).toBe('UNREALIZED_GAIN');
    expect(reval.revaluedMvrBalance).toBe(311000); // 20,000 * 15.55
    expect(reval.unrealizedGainLossMvr).toBe(2600); // +2,600 MVR Unrealized Gain
  });
});
