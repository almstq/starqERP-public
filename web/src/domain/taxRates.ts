/**
 * STARQ ERP — Maldives GST rate resolution by time of supply (SERP-342)
 *
 * WHY THIS FILE EXISTS. domain/miraTgst.ts computed tourism GST at a hard-coded
 * 0.16 — a selector, a multiplier and a reverse-charge divisor of (16/116). The
 * rate has been 17% since 1 July 2025. The database has been correct the whole
 * time: migration 202608250017 carries effective-dated schedules and resolves
 * them by time of supply in app_private.calculate_line_tax.
 *
 * SWAPPING THE CONSTANT TO 0.17 WOULD BE THE SAME DEFECT POINTING BACKWARDS.
 * Adjudication docs/adjudications/2026-08-22_TGST-RATE-16-vs-17.md settled this
 * on 22 August and is explicit about it: a system holding a single current rate
 * misstates every prior-period correction and every credit note raised against
 * an older invoice. A return filed for June 2025 must compute at 16% and one for
 * July 2025 at 17% FROM THE SAME CODE.
 *
 * This module is the client-side mirror of migration 202608250017. The database
 * is the authority; if the two ever disagree, this file is the bug.
 *
 * TIME OF SUPPLY is the earlier of invoice issue or payment received. Callers
 * pass that date; this module does not guess it.
 */

export type TaxType = 'gst_general' | 'gst_tourism';

export interface TaxRateBand {
  taxType: TaxType;
  /** Fractional rate, e.g. 0.17 for 17%. */
  rate: number;
  /** Inclusive ISO date on which the band takes effect. */
  effectiveFrom: string;
  /** Inclusive ISO date on which it stops, or null for the current band. */
  effectiveTo: string | null;
  description: string;
}

/**
 * Mirrors the seed in migration 202608250017_tax_regimes_and_periods.sql.
 * Keep the two in step; the migration is the authority.
 */
export const MALDIVES_GST_SCHEDULE: readonly TaxRateBand[] = [
  { taxType: 'gst_general', rate: 0.06, effectiveFrom: '2011-10-02', effectiveTo: '2022-12-31', description: 'Maldives GGST 6% (historical)' },
  { taxType: 'gst_general', rate: 0.08, effectiveFrom: '2023-01-01', effectiveTo: null, description: 'Maldives GGST 8% (current)' },
  { taxType: 'gst_tourism', rate: 0.12, effectiveFrom: '2015-11-01', effectiveTo: '2022-12-31', description: 'Maldives TGST 12% (historical)' },
  { taxType: 'gst_tourism', rate: 0.16, effectiveFrom: '2023-01-01', effectiveTo: '2025-06-30', description: 'Maldives TGST 16% (historical)' },
  { taxType: 'gst_tourism', rate: 0.17, effectiveFrom: '2025-07-01', effectiveTo: null, description: 'Maldives TGST 17% (current, from 1 July 2025)' },
] as const;

export class TaxRateUnavailable extends Error {
  constructor(taxType: TaxType, supplyDate: string) {
    super(`No ${taxType} rate is in effect for a supply dated ${supplyDate}. The rate schedule starts later than this date.`);
    this.name = 'TaxRateUnavailable';
  }
}

/**
 * The band in force for a supply on the given date.
 * Throws rather than defaulting: a silent fallback to the current rate is how a
 * prior-period correction gets misstated.
 */
export function resolveTaxBand(taxType: TaxType, supplyDate: string): TaxRateBand {
  const band = MALDIVES_GST_SCHEDULE.find(
    (b) => b.taxType === taxType && supplyDate >= b.effectiveFrom && (b.effectiveTo === null || supplyDate <= b.effectiveTo),
  );
  if (!band) throw new TaxRateUnavailable(taxType, supplyDate);
  return band;
}

/** Fractional rate in force on a date, e.g. 0.17. */
export function resolveTaxRate(taxType: TaxType, supplyDate: string): number {
  return resolveTaxBand(taxType, supplyDate).rate;
}

/**
 * Tax on a tax-EXCLUSIVE amount. `subtotal * rate`.
 */
export function taxOnExclusive(taxType: TaxType, supplyDate: string, subtotal: number): number {
  const rate = resolveTaxRate(taxType, supplyDate);
  return Math.round(subtotal * rate * 100) / 100;
}

/**
 * Tax embedded in a tax-INCLUSIVE amount — the reverse charge.
 * `gross * rate / (1 + rate)`, which at 16% is the familiar 16/116 and at 17%
 * becomes 17/117. Hard-coding either is the defect this replaces.
 */
export function taxWithinInclusive(taxType: TaxType, supplyDate: string, gross: number): number {
  const rate = resolveTaxRate(taxType, supplyDate);
  return Math.round(((gross * rate) / (1 + rate)) * 100) / 100;
}

/**
 * Does a recorded rate match the band in force on that date?
 * Used to identify tourism supplies without pinning a literal, so a 2025 invoice
 * at 0.16 and a 2026 invoice at 0.17 are both recognised correctly.
 */
export function rateMatchesBand(taxType: TaxType, supplyDate: string, recordedRate: number | undefined): boolean {
  if (recordedRate === undefined || recordedRate === null) return false;
  try {
    return Math.abs(resolveTaxRate(taxType, supplyDate) - recordedRate) < 1e-9;
  } catch {
    return false;
  }
}

/** Every band for a tax type, oldest first. For UI and reconciliation displays. */
export function bandsFor(taxType: TaxType): TaxRateBand[] {
  return MALDIVES_GST_SCHEDULE.filter((b) => b.taxType === taxType);
}
