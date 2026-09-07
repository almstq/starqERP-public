/**
 * Maldives Green Tax — SERP-339 beta finance layer.
 *
 * Statutory reference: MIRA Green Tax Regulation (consolidated), MIRA circular
 * effective 1 January 2025, Validation Study §3.7.
 *
 * Two rules make this unlike ordinary per-night hotel billing:
 *  - The chargeable unit is a completed TWELVE-HOUR block within a rolling
 *    stay, not a calendar night. A block under 12 hours is not chargeable.
 *  - A guest who checks out and checks back in within 12 hours is treated as
 *    never having checked out - adjacent stay segments with a gap under 12
 *    hours are merged into one continuous stay before counting blocks.
 *
 * Green Tax is a collected amount, never revenue, and GST must never be
 * computed on it (MIRA n.d.m; n.d.n) - the GST engine must exclude any line
 * carrying this module's output from its taxable base. That is a rule this
 * module states at its boundary (excludedFromGstBase); enforcing it inside
 * the GST calculators themselves is separate integration work.
 */

export type GreenTaxGuestCategory = 'GENERAL' | 'MALDIVIAN' | 'RESIDENT_PERMIT_HOLDER' | 'CHILD_UNDER_TWO';

export interface GreenTaxStaySegment {
  /** ISO 8601 datetime, e.g. '2026-03-01T14:00:00.000Z'. */
  checkIn: string;
  checkOut: string;
}

export interface GreenTaxRequest {
  guestCategory: GreenTaxGuestCategory;
  /** One or more stay segments for the same guest at the same establishment. */
  stays: GreenTaxStaySegment[];
  /** True only for a hotel or tourist guesthouse on an inhabited island with 50 or fewer registered rooms. */
  reducedRateSmallGuesthouse?: boolean;
}

export type GreenTaxStatus = 'EXEMPT' | 'CHARGEABLE';

export interface GreenTaxDecision {
  status: GreenTaxStatus;
  chargeableTwelveHourBlocks: number;
  ratePerBlockUsd: 0 | 6 | 12;
  totalGreenTaxUsd: number;
  currency: 'USD';
  /** Always true: Green Tax must never enter a GST taxable base (MIRA n.d.m / n.d.n). */
  excludedFromGstBase: true;
  reason: string;
}

export class GreenTaxValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GreenTaxValidationError';
  }
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function parseIsoDateTime(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new GreenTaxValidationError(`${field} must be a valid ISO datetime.`);
  }
  return date;
}

/**
 * Merges stay segments whose gap to the next segment is under 12 hours - per
 * the regulation, that gap does not count as a checkout. Segments are
 * expected to be for the same guest/establishment; the caller is responsible
 * for that grouping.
 */
function mergeContinuousStays(stays: GreenTaxStaySegment[]): Array<{ start: Date; end: Date }> {
  const parsed = stays
    .map((s) => ({
      start: parseIsoDateTime(s.checkIn, 'checkIn'),
      end: parseIsoDateTime(s.checkOut, 'checkOut'),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const seg of parsed) {
    if (seg.end <= seg.start) {
      throw new GreenTaxValidationError('checkOut must be after checkIn.');
    }
  }

  const merged: Array<{ start: Date; end: Date }> = [];
  for (const seg of parsed) {
    const last = merged[merged.length - 1];
    if (last && seg.start.getTime() - last.end.getTime() < TWELVE_HOURS_MS) {
      if (seg.end > last.end) last.end = seg.end;
    } else {
      merged.push({ start: seg.start, end: seg.end });
    }
  }
  return merged;
}

export function calculateGreenTax(request: GreenTaxRequest): GreenTaxDecision {
  if (!Array.isArray(request.stays) || request.stays.length === 0) {
    throw new GreenTaxValidationError('At least one stay segment is required.');
  }

  if (request.guestCategory !== 'GENERAL') {
    return {
      status: 'EXEMPT',
      chargeableTwelveHourBlocks: 0,
      ratePerBlockUsd: 0,
      totalGreenTaxUsd: 0,
      currency: 'USD',
      excludedFromGstBase: true,
      reason: `${request.guestCategory} guests are exempt from Green Tax.`,
    };
  }

  // Each merged (continuous) span is floored independently - pooling raw
  // duration across separate, non-continuous visits before flooring would
  // wrongly manufacture a chargeable block out of two visits that each fell
  // short of twelve hours on their own.
  const merged = mergeContinuousStays(request.stays);
  const chargeableTwelveHourBlocks = merged.reduce(
    (sum, seg) => sum + Math.floor((seg.end.getTime() - seg.start.getTime()) / TWELVE_HOURS_MS),
    0,
  );

  const ratePerBlockUsd: 6 | 12 = request.reducedRateSmallGuesthouse ? 6 : 12;
  const totalGreenTaxUsd = round2(chargeableTwelveHourBlocks * ratePerBlockUsd);

  return {
    status: chargeableTwelveHourBlocks > 0 ? 'CHARGEABLE' : 'EXEMPT',
    chargeableTwelveHourBlocks,
    ratePerBlockUsd: chargeableTwelveHourBlocks > 0 ? ratePerBlockUsd : 0,
    totalGreenTaxUsd,
    currency: 'USD',
    excludedFromGstBase: true,
    reason:
      chargeableTwelveHourBlocks > 0
        ? `${chargeableTwelveHourBlocks} completed 12-hour block(s) at USD ${ratePerBlockUsd}/block.`
        : 'Stay did not reach a completed 12-hour block.',
  };
}
