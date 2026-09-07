import { describe, it, expect } from 'vitest';
import {
  resolveTaxRate,
  resolveTaxBand,
  taxOnExclusive,
  taxWithinInclusive,
  rateMatchesBand,
  bandsFor,
  TaxRateUnavailable,
  MALDIVES_GST_SCHEDULE,
} from './taxRates';

describe('SERP-342: GST resolved by time of supply', () => {
  /**
   * The assertion the whole task exists for. Adjudication 2026-08-22 settled that
   * TGST became 17% on 1 July 2025, and warned that swapping a constant from 0.16
   * to 0.17 reproduces the identical defect backwards. These two cases must both
   * pass from ONE code path.
   */
  describe('THE PROOF — one code path, two rates', () => {
    it('computes a June 2025 tourism supply at 16%', () => {
      expect(resolveTaxRate('gst_tourism', '2025-06-30')).toBe(0.16);
      expect(taxOnExclusive('gst_tourism', '2025-06-30', 1000)).toBe(160);
    });

    it('computes a July 2025 tourism supply at 17%', () => {
      expect(resolveTaxRate('gst_tourism', '2025-07-01')).toBe(0.17);
      expect(taxOnExclusive('gst_tourism', '2025-07-01', 1000)).toBe(170);
    });

    it('switches exactly at the boundary, not a day either side', () => {
      expect(resolveTaxRate('gst_tourism', '2025-06-30')).toBe(0.16);
      expect(resolveTaxRate('gst_tourism', '2025-07-01')).toBe(0.17);
    });

    it('still computes a 2026 supply at 17%', () => {
      expect(resolveTaxRate('gst_tourism', '2026-08-30')).toBe(0.17);
    });
  });

  describe('historical bands remain reportable', () => {
    it('resolves TGST 12% for a 2016 supply', () => {
      expect(resolveTaxRate('gst_tourism', '2016-05-01')).toBe(0.12);
    });

    it('resolves general GST 6% before 2023 and 8% after', () => {
      expect(resolveTaxRate('gst_general', '2022-12-31')).toBe(0.06);
      expect(resolveTaxRate('gst_general', '2023-01-01')).toBe(0.08);
    });

    it('a prior-period correction uses the rate of the original supply, not today', () => {
      // A credit note raised in 2026 against a June-2025 tourism invoice.
      const originalSupply = '2025-06-15';
      expect(taxOnExclusive('gst_tourism', originalSupply, 5000)).toBe(800); // 16%
      // If the system had simply been switched to 0.17 this would be 850 and the
      // correction would misstate the return.
      expect(taxOnExclusive('gst_tourism', originalSupply, 5000)).not.toBe(850);
    });
  });

  describe('reverse charge on tax-inclusive amounts', () => {
    it('extracts 16/116 for a June 2025 supply', () => {
      expect(taxWithinInclusive('gst_tourism', '2025-06-30', 1160)).toBe(160);
    });

    it('extracts 17/117 for a July 2025 supply', () => {
      expect(taxWithinInclusive('gst_tourism', '2025-07-01', 1170)).toBe(170);
    });
  });

  describe('refuses rather than defaulting', () => {
    it('throws for a supply before any band exists', () => {
      expect(() => resolveTaxRate('gst_tourism', '2010-01-01')).toThrow(TaxRateUnavailable);
    });

    it('does not silently fall back to the current rate', () => {
      // A silent fallback is how a prior-period figure gets quietly restated.
      expect(() => resolveTaxRate('gst_general', '2000-01-01')).toThrow();
    });
  });

  describe('rateMatchesBand identifies tourism supplies without pinning a literal', () => {
    it('recognises a 2025 invoice recorded at 0.16', () => {
      expect(rateMatchesBand('gst_tourism', '2025-06-01', 0.16)).toBe(true);
    });

    it('recognises a 2026 invoice recorded at 0.17', () => {
      expect(rateMatchesBand('gst_tourism', '2026-01-01', 0.17)).toBe(true);
    });

    it('does not match a 2026 invoice recorded at the superseded 0.16', () => {
      expect(rateMatchesBand('gst_tourism', '2026-01-01', 0.16)).toBe(false);
    });

    it('is false for an undefined rate rather than throwing', () => {
      expect(rateMatchesBand('gst_tourism', '2026-01-01', undefined)).toBe(false);
    });
  });

  describe('the schedule mirrors migration 202608250017', () => {
    it('carries five bands', () => {
      expect(MALDIVES_GST_SCHEDULE).toHaveLength(5);
    });

    it('has exactly one open-ended band per tax type', () => {
      for (const t of ['gst_general', 'gst_tourism'] as const) {
        expect(bandsFor(t).filter((b) => b.effectiveTo === null)).toHaveLength(1);
      }
    });

    it('leaves no gap between consecutive bands', () => {
      for (const t of ['gst_general', 'gst_tourism'] as const) {
        const bands = bandsFor(t);
        for (let i = 0; i < bands.length - 1; i++) {
          const endsOn = new Date(bands[i].effectiveTo!);
          const nextStarts = new Date(bands[i + 1].effectiveFrom);
          const dayAfter = new Date(endsOn.getTime() + 86400000);
          expect(dayAfter.toISOString().slice(0, 10)).toBe(nextStarts.toISOString().slice(0, 10));
        }
      }
    });

    it('describes the current tourism band as 17% from 1 July 2025', () => {
      const band = resolveTaxBand('gst_tourism', '2026-08-30');
      expect(band.rate).toBe(0.17);
      expect(band.effectiveFrom).toBe('2025-07-01');
    });
  });
});
