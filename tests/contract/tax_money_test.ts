/**
 * SERP-347 — statutory tax calculation must not run on floating point.
 *
 * Gate 1 acceptance. The two figures the Founder named are the first two tests;
 * the rest is regression coverage around the existing statutory behaviour, so
 * that removing floating point did not change any answer that was already right.
 */
import {
  assertEquals,
  assertNotEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  calculateLineTax,
  type TaxRateScheduleRecord,
  type TaxRegistrationRecord,
} from '../../contracts/commands.ts';

const GST_8: TaxRateScheduleRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  taxType: 'gst_general',
  rate: 0.08,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  description: 'GGST 8%',
  createdAt: '2026-01-01T00:00:00Z',
};

const GST_6: TaxRateScheduleRecord = {
  id: '00000000-0000-4000-8000-000000000002',
  taxType: 'gst_general',
  rate: 0.06,
  effectiveFrom: '2025-01-01',
  effectiveTo: '2025-12-31',
  description: 'GGST 6% (historic)',
  createdAt: '2025-01-01T00:00:00Z',
};

const REGISTERED: TaxRegistrationRecord = {
  id: '00000000-0000-4000-8000-000000000010',
  organisationId: '00000000-0000-4000-8000-000000000011',
  taxType: 'gst_general',
  registrationStatus: 'registered',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const UNREGISTERED: TaxRegistrationRecord = {
  ...REGISTERED,
  registrationStatus: 'not_registered',
};

/**
 * Compare exact decimal strings as scaled integers. Note the leading zeros:
 * '0.010000' has the same value as '0010000' micros, so these must be compared
 * as BigInt, never as text.
 */
function micros(decimal: string): bigint {
  return BigInt(decimal.replace('.', ''));
}

function calc(
  lineAmount: number,
  taxMode: 'inclusive' | 'exclusive' | 'zero_rated' | 'exempt' = 'exclusive',
  registration: TaxRegistrationRecord | null = REGISTERED,
  supplyDate = '2026-08-29',
  schedules: readonly TaxRateScheduleRecord[] = [GST_8, GST_6],
) {
  return calculateLineTax({
    registration,
    schedules,
    taxType: 'gst_general',
    supplyDate,
    taxMode,
    lineAmount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE 1 ACCEPTANCE — the two figures named in the authorisation
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-347 acceptance: 1.005 rounds to 1.01, not 1.00', () => {
  // The arithmetic this replaced, preserved so the defect stays visible.
  assertEquals(Math.round(1.005 * 100) / 100, 1);
  assertEquals(calc(1.005).baseAmountExact, '1.010000');
  assertEquals(calc(1.005).baseAmount, 1.01);
});

Deno.test('SERP-347 acceptance: 162.295 rounds to 162.30, not 162.29', () => {
  assertEquals(Math.round(162.295 * 100) / 100, 162.29);
  assertEquals(calc(162.295).baseAmountExact, '162.300000');
  assertEquals(calc(162.295).baseAmount, 162.3);
});

Deno.test('SERP-347: the replaced arithmetic disagrees with the new result', () => {
  // Guards against a future "simplification" back to Math.round.
  assertNotEquals(Math.round(1.005 * 100) / 100, calc(1.005).baseAmount);
  assertNotEquals(Math.round(162.295 * 100) / 100, calc(162.295).baseAmount);
});

// ─────────────────────────────────────────────────────────────────────────────
// The identity an auditor checks first
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('exclusive: base + tax === gross exactly, across many amounts', () => {
  for (let cents = 1; cents <= 2000; cents++) {
    const r = calc(cents / 100, 'exclusive');
    assertEquals(
      micros(r.baseAmountExact) + micros(r.taxAmountExact),
      micros(r.grossAmountExact),
      `failed at ${cents / 100}`,
    );
  }
});

Deno.test('inclusive: base + tax === gross exactly, across many amounts', () => {
  for (let cents = 1; cents <= 2000; cents++) {
    const r = calc(cents / 100, 'inclusive');
    assertEquals(
      micros(r.baseAmountExact) + micros(r.taxAmountExact),
      micros(r.grossAmountExact),
      `failed at ${cents / 100}`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Statutory behaviour that must be unchanged
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('8% exclusive on a round amount', () => {
  const r = calc(100, 'exclusive');
  assertEquals(r.isTaxable, true);
  assertEquals(r.taxRate, 0.08);
  assertEquals(r.baseAmountExact, '100.000000');
  assertEquals(r.taxAmountExact, '8.000000');
  assertEquals(r.grossAmountExact, '108.000000');
});

Deno.test('8% inclusive on a round gross', () => {
  const r = calc(108, 'inclusive');
  assertEquals(r.grossAmountExact, '108.000000');
  assertEquals(r.baseAmountExact, '100.000000');
  assertEquals(r.taxAmountExact, '8.000000');
});

Deno.test('an unregistered entity charges no tax', () => {
  const r = calc(100, 'exclusive', UNREGISTERED);
  assertEquals(r.isTaxable, false);
  assertEquals(r.taxRate, 0);
  assertEquals(r.taxAmountExact, '0.000000');
  assertEquals(r.grossAmountExact, '100.000000');
});

Deno.test('no registration record at all charges no tax', () => {
  const r = calc(100, 'exclusive', null);
  assertEquals(r.isTaxable, false);
  assertEquals(r.grossAmountExact, '100.000000');
});

Deno.test('zero-rated and exempt charge no tax but keep the base', () => {
  for (const mode of ['zero_rated', 'exempt'] as const) {
    const r = calc(250.5, mode);
    assertEquals(r.isTaxable, false, mode);
    assertEquals(r.taxAmountExact, '0.000000', mode);
    assertEquals(r.baseAmountExact, '250.500000', mode);
    assertEquals(r.grossAmountExact, '250.500000', mode);
  }
});

Deno.test('date-effective schedule resolution is unchanged', () => {
  const historic = calc(100, 'exclusive', REGISTERED, '2025-06-15');
  assertEquals(historic.taxRate, 0.06);
  assertEquals(historic.taxAmountExact, '6.000000');

  const current = calc(100, 'exclusive', REGISTERED, '2026-08-29');
  assertEquals(current.taxRate, 0.08);
  assertEquals(current.taxAmountExact, '8.000000');
});

Deno.test('no schedule for the supply date is an explicit error, not a zero', () => {
  const r = calc(100, 'exclusive', REGISTERED, '2020-01-01');
  assertEquals(r.errorMessage, 'no_tax_rate_for_supply_date');
  assertEquals(r.isTaxable, false);
  assertEquals(r.grossAmountExact, '0.000000');
});

Deno.test('a zero line amount is handled without error', () => {
  const r = calc(0, 'exclusive');
  assertEquals(r.baseAmountExact, '0.000000');
  assertEquals(r.taxAmountExact, '0.000000');
  assertEquals(r.grossAmountExact, '0.000000');
});

Deno.test('a negative line amount (credit note) keeps its sign', () => {
  const r = calc(-100, 'exclusive');
  assertEquals(r.baseAmountExact, '-100.000000');
  assertEquals(r.taxAmountExact, '-8.000000');
  assertEquals(r.grossAmountExact, '-108.000000');
});

Deno.test('exact strings are the authoritative field and are scale 6', () => {
  const r = calc(1.005);
  for (const s of [r.baseAmountExact, r.taxAmountExact, r.grossAmountExact]) {
    assertEquals(s.split('.')[1].length, 6, s);
  }
});

Deno.test('awkward inclusive amounts still balance', () => {
  for (const v of [0.01, 0.05, 1.005, 33.33, 162.295, 999.99, 1234.565]) {
    const r = calc(v, 'inclusive');
    assertEquals(
      micros(r.baseAmountExact) + micros(r.taxAmountExact),
      micros(r.grossAmountExact),
      `failed at ${v}`,
    );
  }
});
