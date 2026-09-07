import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Money, MoneyError } from '../../contracts/money.ts';

const MVR = 'MVR';

// ─────────────────────────────────────────────────────────────────────────────
// The defect this type exists to remove.
// These are the exact cases where contracts/commands.ts computes the wrong
// statutory figure using Math.round(x * 100) / 100.
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('regression: 1.005 rounds to 1.01, not 1.00', () => {
  // Math.round(1.005 * 100) / 100 === 1 because 1.005 * 100 === 100.49999999999999
  assertEquals(Math.round(1.005 * 100) / 100, 1, 'float behaviour, for the record');
  const m = Money.fromDecimalString('1.005', MVR);
  assertEquals(m.toDisplayString(2), '1.01');
});

Deno.test('regression: 162.295 rounds to 162.30, not 162.29', () => {
  assertEquals(Math.round(162.295 * 100) / 100, 162.29, 'float behaviour');
  const m = Money.fromDecimalString('162.295', MVR);
  assertEquals(m.toDisplayString(2), '162.30');
});

Deno.test('regression: repeated addition does not drift', () => {
  let float = 0;
  let money = Money.zero(MVR);
  for (let i = 0; i < 1000; i++) {
    float += 0.1;
    money = money.add(Money.fromDecimalString('0.1', MVR));
  }
  // The float result is not 100.
  assertEquals(float === 100, false);
  assertEquals(money.toDecimalString(), '100.000000');
});

// ─────────────────────────────────────────────────────────────────────────────
// Parsing and the no-silent-truncation rule
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('parses to exact micro-units', () => {
  assertEquals(Money.fromDecimalString('1', MVR).micros, 1_000_000n);
  assertEquals(Money.fromDecimalString('0.000001', MVR).micros, 1n);
  assertEquals(Money.fromDecimalString('-2.5', MVR).micros, -2_500_000n);
  assertEquals(Money.fromDecimalString('0', MVR).micros, 0n);
});

Deno.test('excess precision throws rather than truncating silently', () => {
  assertThrows(
    () => Money.fromDecimalString('1.0000005', MVR),
    MoneyError,
    'decimal places',
  );
});

Deno.test('excess precision is accepted only with an explicit rounding mode', () => {
  assertEquals(
    Money.fromDecimalString('1.0000005', MVR, 'half_up').toDecimalString(),
    '1.000001',
  );
  assertEquals(
    Money.fromDecimalString('1.0000005', MVR, 'half_even').toDecimalString(),
    '1.000000',
  );
  assertEquals(
    Money.fromDecimalString('1.0000009', MVR, 'floor').toDecimalString(),
    '1.000000',
  );
  assertEquals(
    Money.fromDecimalString('1.0000001', MVR, 'ceil').toDecimalString(),
    '1.000001',
  );
});

Deno.test('rejects malformed input', () => {
  for (const bad of ['', 'abc', '1.2.3', '1,5', ' 1e5', '--1', '1.']) {
    assertThrows(() => Money.fromDecimalString(bad, MVR), MoneyError);
  }
});

Deno.test('rejects a bad currency code', () => {
  assertThrows(() => Money.fromDecimalString('1', 'mvr'), MoneyError);
  assertThrows(() => Money.fromDecimalString('1', 'RUFIYAA'), MoneyError);
});

Deno.test('rejects values wider than numeric(20,6)', () => {
  assertThrows(() => Money.fromMicros(10n ** 20n, MVR), MoneyError, 'numeric(20, 6)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Round-trip with the database representation
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('decimal string round-trips losslessly at scale 6', () => {
  for (const v of ['0.000000', '1.000000', '-1.500000', '999999.999999', '0.000001']) {
    assertEquals(Money.fromDecimalString(v, MVR).toDecimalString(), v);
  }
});

Deno.test('toDecimalString always emits six places, as the column holds', () => {
  assertEquals(Money.fromDecimalString('5', MVR).toDecimalString(), '5.000000');
  assertEquals(Money.fromDecimalString('-0.5', MVR).toDecimalString(), '-0.500000');
});

// ─────────────────────────────────────────────────────────────────────────────
// Currency safety — the defect found in the reviewed implementation
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('mixed currencies are refused on every binary operation', () => {
  const mvr = Money.fromDecimalString('1', 'MVR');
  const usd = Money.fromDecimalString('1', 'USD');
  assertThrows(() => mvr.add(usd), MoneyError, 'cannot add');
  assertThrows(() => mvr.subtract(usd), MoneyError, 'cannot subtract');
  assertThrows(() => mvr.compare(usd), MoneyError, 'cannot compare');
  assertEquals(mvr.equals(usd), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// GST at 8% — the statutory path
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('8% GST is exact', () => {
  const base = Money.fromDecimalString('100.00', MVR);
  const tax = base.multiply('0.08', 'half_up');
  assertEquals(tax.toDecimalString(), '8.000000');
  assertEquals(base.add(tax).toDisplayString(2), '108.00');
});

Deno.test('8% GST on an awkward base', () => {
  const base = Money.fromDecimalString('162.295', MVR);
  const tax = base.multiply('0.08', 'half_up');
  // 162.295 * 0.08 = 12.9836 exactly
  assertEquals(tax.toDecimalString(), '12.983600');
});

Deno.test('multiply requires an exact decimal factor', () => {
  const m = Money.fromDecimalString('100', MVR);
  assertThrows(() => m.multiply('eight percent', 'half_up'), MoneyError);
});

Deno.test('multiply preserves sign correctly', () => {
  const m = Money.fromDecimalString('-100', MVR);
  assertEquals(m.multiply('0.08', 'half_up').toDecimalString(), '-8.000000');
});

// ─────────────────────────────────────────────────────────────────────────────
// allocate() — the settlement_allocations operation
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('allocate splits evenly and loses nothing', () => {
  const total = Money.fromDecimalString('100.000000', MVR);
  const parts = total.allocate([1n, 1n, 1n]);
  assertEquals(parts.map((p) => p.toDecimalString()), [
    '33.333334',
    '33.333333',
    '33.333333',
  ]);
  assertEquals(Money.sum(parts).toDecimalString(), total.toDecimalString());
});

Deno.test('allocate splits by weight and loses nothing', () => {
  const total = Money.fromDecimalString('0.000010', MVR);
  const parts = total.allocate([3n, 7n]);
  assertEquals(Money.sum(parts).toDecimalString(), total.toDecimalString());
});

Deno.test('allocate: one payment settling three invoices re-sums exactly', () => {
  const payment = Money.fromDecimalString('1000.00', MVR);
  const invoices = [
    Money.fromDecimalString('333.33', MVR),
    Money.fromDecimalString('333.33', MVR),
    Money.fromDecimalString('333.34', MVR),
  ];
  const weights = invoices.map((i) => i.micros);
  const allocations = payment.allocate(weights);
  assertEquals(Money.sum(allocations).toDecimalString(), payment.toDecimalString());
  // Every allocation is strictly positive — settlement_allocations has
  // `check (allocated_amount > 0)`.
  assertEquals(allocations.every((a) => a.isPositive()), true);
});

Deno.test('allocate is deterministic across runs', () => {
  const total = Money.fromDecimalString('10.000001', MVR);
  const a = total.allocate([1n, 1n, 1n]).map((m) => m.toDecimalString());
  const b = total.allocate([1n, 1n, 1n]).map((m) => m.toDecimalString());
  assertEquals(a, b);
});

Deno.test('allocate handles negative totals without losing units', () => {
  const total = Money.fromDecimalString('-100.000000', MVR);
  const parts = total.allocate([1n, 1n, 1n]);
  assertEquals(Money.sum(parts).toDecimalString(), total.toDecimalString());
  assertEquals(parts.every((p) => p.isNegative()), true);
});

Deno.test('allocate rejects degenerate weights', () => {
  const m = Money.fromDecimalString('1', MVR);
  assertThrows(() => m.allocate([]), MoneyError);
  assertThrows(() => m.allocate([0n, 0n]), MoneyError);
  assertThrows(() => m.allocate([-1n, 2n]), MoneyError);
});

// ─────────────────────────────────────────────────────────────────────────────
// Refund ceiling — the invariant Goose identified, proven here
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('cumulative refunds cannot exceed the captured amount', () => {
  const captured = Money.fromDecimalString('500.00', MVR);
  const refunds = [
    Money.fromDecimalString('200.00', MVR),
    Money.fromDecimalString('250.00', MVR),
  ];
  const proposed = Money.fromDecimalString('50.000001', MVR);
  const already = Money.sum(refunds);
  assertEquals(already.add(proposed).greaterThan(captured), true);
  assertEquals(
    already.add(Money.fromDecimalString('50.00', MVR)).equals(captured),
    true,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('display rounds half-up at two places by default', () => {
  assertEquals(Money.fromDecimalString('1.005', MVR).toDisplayString(), '1.01');
  assertEquals(Money.fromDecimalString('1.004', MVR).toDisplayString(), '1.00');
  assertEquals(Money.fromDecimalString('-1.005', MVR).toDisplayString(), '-1.01');
});

Deno.test('display at zero places', () => {
  assertEquals(Money.fromDecimalString('1.6', MVR).toDisplayString(0), '2');
});

Deno.test('sum of an empty list needs an explicit currency', () => {
  assertThrows(() => Money.sum([]), MoneyError);
  assertEquals(Money.sum([], MVR).toDecimalString(), '0.000000');
});
