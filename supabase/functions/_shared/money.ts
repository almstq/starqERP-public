/**
 * Money — the canonical monetary value type for STARQ ERP.
 *
 * Promoted into canonical `starqERP/contracts/` under SERP-347.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * The database stores money as `numeric(20, 6)` — twenty significant digits,
 * six decimal places — in `commercial_documents.gross_total`,
 * `settlement_allocations.allocated_amount`, journal lines, and every other
 * monetary column. Postgres `numeric` is exact decimal arithmetic.
 *
 * TypeScript `number` is IEEE-754 binary floating point and is not. The tax
 * engine in `contracts/commands.ts` currently computes with it:
 *
 *     const roundedAmount = Math.round(lineAmount * 100) / 100;
 *     const tax = Math.round(base * rate * 100) / 100;
 *
 * That is demonstrably wrong for values that are not exactly representable in
 * binary. Measured, on this codebase's own arithmetic:
 *
 *     1.005   → 1.00    (correct: 1.01)   because 1.005 * 100 = 100.49999999999999
 *     162.295 → 162.29  (correct: 162.30) because 162.295 * 100 = 16229.499999999998
 *
 * Those are statutory GST figures. Under-collecting eight laari per line is a
 * filing defect, not a rounding preference.
 *
 * Money removes floating point from the monetary path entirely: every value is
 * a `bigint` count of micro-units (10^-6), which is exactly the scale Postgres
 * `numeric(20, 6)` holds. Conversion in both directions is lossless and total.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. SCALE IS FIXED AT 6 and matches the column. There is no per-instance
 *    `decimalPlaces`, because two values of differing scale can be added
 *    without error and produce a wrong answer silently. That was a real defect
 *    in the reviewed reference implementation.
 *
 * 2. NOTHING TRUNCATES SILENTLY. Parsing a value with more than six decimal
 *    places throws unless the caller passes an explicit rounding mode. Losing
 *    money must be a decision, never a default.
 *
 * 3. CURRENCY IS CHECKED ON EVERY BINARY OPERATION. `character(3)`, matching
 *    the column.
 *
 * 4. DIVISION DOES NOT EXIST. `allocate()` does. Splitting money by division
 *    loses or invents units; allocation distributes an exact total by largest
 *    remainder so the parts always re-sum to the whole. This is what
 *    `settlement_allocations` needs when one payment settles several documents.
 *
 * 5. `toNumber()` DOES NOT EXIST. There is no safe conversion to `number`, so
 *    the type does not offer one. Use `toDecimalString()` for SQL and display.
 *
 * @see DEC-068 — single source of financial truth
 * @see SERP-122 / SERP-164 — date-effective statutory taxation
 */

/** Decimal places held by every monetary column: `numeric(20, 6)`. */
export const MONEY_SCALE = 6 as const;

/** 10 ** MONEY_SCALE, as a bigint. One unit of currency in micro-units. */
export const MONEY_UNIT = 1_000_000n;

/**
 * `numeric(20, 6)` permits twenty significant digits, of which six are
 * fractional — so fourteen integer digits. Values beyond this cannot be stored
 * and are rejected here rather than at the database, where the failure would
 * arrive mid-transaction.
 */
export const MONEY_MAX_MICROS = 10n ** 20n - 1n;

/**
 * How to resolve a value carrying more precision than the scale can hold.
 *
 * `half_up` matches the conventional treatment of statutory rounding and is
 * what a human doing this on paper would do. `half_even` (banker's rounding)
 * is available for contexts that require it. There is deliberately no default:
 * a caller that has not thought about rounding gets an exception instead.
 */
export type RoundingMode = 'half_up' | 'half_even' | 'floor' | 'ceil';

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

const CURRENCY_RE = /^[A-Z]{3}$/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export class Money {
  /**
   * @param micros Signed count of 10^-6 currency units. Exact.
   * @param currency ISO 4217 alphabetic code, uppercase.
   */
  private constructor(
    readonly micros: bigint,
    readonly currency: string,
  ) {
    Object.freeze(this);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Construction
  // ───────────────────────────────────────────────────────────────────────────

  private static assertCurrency(currency: string): void {
    if (!CURRENCY_RE.test(currency)) {
      throw new MoneyError(
        `currency must be three uppercase letters (ISO 4217), got ${JSON.stringify(currency)}`,
      );
    }
  }

  private static make(micros: bigint, currency: string): Money {
    if (micros > MONEY_MAX_MICROS || micros < -MONEY_MAX_MICROS) {
      throw new MoneyError(
        `value exceeds numeric(20, 6) and cannot be stored: ${micros} micros`,
      );
    }
    return new Money(micros, currency);
  }

  /** Construct from an exact count of micro-units. The primitive constructor. */
  static fromMicros(micros: bigint, currency: string): Money {
    Money.assertCurrency(currency);
    return Money.make(micros, currency);
  }

  /** Zero in the given currency. */
  static zero(currency: string): Money {
    return Money.fromMicros(0n, currency);
  }

  /**
   * Parse an exact decimal string — the form Postgres `numeric` emits and
   * accepts, and the only lossless text form of a monetary value.
   *
   * Throws on more than six decimal places unless `rounding` is supplied. That
   * is deliberate: silent truncation is how the reviewed implementation lost
   * a tenth of a laari without anyone noticing.
   *
   *     Money.fromDecimalString('1.005', 'MVR')                  → 1.005000
   *     Money.fromDecimalString('1.0000005', 'MVR')              → throws
   *     Money.fromDecimalString('1.0000005', 'MVR', 'half_up')   → 1.000001
   */
  static fromDecimalString(
    value: string,
    currency: string,
    rounding?: RoundingMode,
  ): Money {
    Money.assertCurrency(currency);

    const text = value.trim();
    if (!DECIMAL_RE.test(text)) {
      throw new MoneyError(
        `not an exact decimal literal: ${JSON.stringify(value)}`,
      );
    }

    const negative = text.startsWith('-');
    const unsigned = negative ? text.slice(1) : text;
    const [whole, fraction = ''] = unsigned.split('.');

    let micros: bigint;

    if (fraction.length <= MONEY_SCALE) {
      micros = BigInt(whole) * MONEY_UNIT +
        BigInt(fraction.padEnd(MONEY_SCALE, '0') || '0');
    } else {
      if (rounding === undefined) {
        throw new MoneyError(
          `${JSON.stringify(value)} carries ${fraction.length} decimal places; ` +
            `numeric(20, ${MONEY_SCALE}) holds ${MONEY_SCALE}. ` +
            `Pass an explicit RoundingMode to accept the loss.`,
        );
      }
      const kept = BigInt(whole) * MONEY_UNIT +
        BigInt(fraction.slice(0, MONEY_SCALE));
      const remainderDigits = fraction.slice(MONEY_SCALE);
      micros = applyRounding(kept, remainderDigits, negative, rounding);
    }

    return Money.make(negative ? -micros : micros, currency);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Serialisation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * The exact decimal string, always with six decimal places. This is the ONLY
   * form that should reach SQL — bind it as a parameter and let Postgres cast
   * it to `numeric(20, 6)`. Never interpolate, never send a JS number.
   */
  toDecimalString(): string {
    const negative = this.micros < 0n;
    const abs = negative ? -this.micros : this.micros;
    const whole = abs / MONEY_UNIT;
    const fraction = (abs % MONEY_UNIT).toString().padStart(MONEY_SCALE, '0');
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  /** Display form at a chosen scale. Presentation only — never persist this. */
  toDisplayString(displayScale = 2, rounding: RoundingMode = 'half_up'): string {
    if (displayScale < 0 || displayScale > MONEY_SCALE) {
      throw new MoneyError(`displayScale must be 0..${MONEY_SCALE}`);
    }
    const negative = this.micros < 0n;
    const abs = negative ? -this.micros : this.micros;
    const drop = MONEY_SCALE - displayScale;
    const divisor = 10n ** BigInt(drop);
    const kept = abs / divisor;
    const remainder = (abs % divisor).toString().padStart(drop, '0');
    const rounded = drop === 0
      ? kept
      : applyRounding(kept, remainder, negative, rounding);
    const text = rounded.toString().padStart(displayScale + 1, '0');
    const pivot = text.length - displayScale;
    const body = displayScale === 0
      ? text
      : `${text.slice(0, pivot)}.${text.slice(pivot)}`;
    return `${negative ? '-' : ''}${body}`;
  }

  toJSON(): { amount: string; currency: string } {
    return { amount: this.toDecimalString(), currency: this.currency };
  }

  toString(): string {
    return `${this.toDecimalString()} ${this.currency}`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Arithmetic — exact, total, and currency-checked
  // ───────────────────────────────────────────────────────────────────────────

  private assertSameCurrency(other: Money, op: string): void {
    if (this.currency !== other.currency) {
      throw new MoneyError(
        `cannot ${op} ${this.currency} and ${other.currency}`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other, 'add');
    return Money.make(this.micros + other.micros, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other, 'subtract');
    return Money.make(this.micros - other.micros, this.currency);
  }

  negate(): Money {
    return Money.make(-this.micros, this.currency);
  }

  abs(): Money {
    return this.micros < 0n ? this.negate() : this;
  }

  /**
   * Multiply by an exact decimal factor — a tax rate, a proration fraction, a
   * quantity. The factor is a string so that `0.08` cannot arrive as
   * `0.08000000000000000166...`.
   *
   * Rounding is REQUIRED. A rate applied to an amount almost never lands on a
   * whole micro-unit, and the caller must say how that is resolved.
   */
  multiply(factor: string, rounding: RoundingMode): Money {
    const text = factor.trim();
    if (!DECIMAL_RE.test(text)) {
      throw new MoneyError(`factor must be an exact decimal: ${JSON.stringify(factor)}`);
    }
    const negativeFactor = text.startsWith('-');
    const unsigned = negativeFactor ? text.slice(1) : text;
    const [whole, fraction = ''] = unsigned.split('.');
    const factorScale = BigInt(fraction.length);
    const factorInt = BigInt(whole + fraction);

    const product = this.micros * factorInt;              // scale: 6 + factorScale
    const divisor = 10n ** factorScale;                    // back down to scale 6
    const negativeResult = (product < 0n) !== negativeFactor
      ? product < 0n
      : product < 0n;

    const absProduct = product < 0n ? -product : product;
    const quotient = absProduct / divisor;
    const remainder = (absProduct % divisor).toString().padStart(
      Number(factorScale),
      '0',
    );
    const rounded = factorScale === 0n
      ? quotient
      : applyRounding(quotient, remainder, negativeResult, rounding);

    const signed = (this.micros < 0n) !== negativeFactor ? -rounded : rounded;
    return Money.make(signed, this.currency);
  }

  /**
   * Divide by an exact decimal SCALAR — a rate, a factor, a count.
   *
   * This is not the inverse of `allocate()` and must never be used to split an
   * amount between parties: dividing three ways and rounding each part loses or
   * invents units. Use `allocate()` for that.
   *
   * It exists for the one legitimate case: recovering a base amount from a
   * tax-inclusive gross, where `base = gross / (1 + rate)`. The caller must
   * then derive the tax by SUBTRACTION (`gross.subtract(base)`) so that
   * `base + tax === gross` holds exactly, rather than by a second rounding.
   *
   * Rounding is required, for the same reason it is required on `multiply`.
   */
  divide(divisor: string, rounding: RoundingMode): Money {
    const text = divisor.trim();
    if (!DECIMAL_RE.test(text)) {
      throw new MoneyError(`divisor must be an exact decimal: ${JSON.stringify(divisor)}`);
    }
    const negativeDivisor = text.startsWith('-');
    const unsigned = negativeDivisor ? text.slice(1) : text;
    const [whole, fraction = ''] = unsigned.split('.');
    const divisorScale = BigInt(fraction.length);
    const divisorInt = BigInt(whole + fraction);
    if (divisorInt === 0n) {
      throw new MoneyError('division by zero');
    }

    // Scale the dividend up by the divisor's scale so the quotient lands back
    // at scale 6 exactly, then resolve the remainder under the chosen mode.
    const scaled = this.micros * 10n ** divisorScale;
    const negativeResult = (this.micros < 0n) !== negativeDivisor;
    const absScaled = scaled < 0n ? -scaled : scaled;

    const quotient = absScaled / divisorInt;
    const remainder = absScaled % divisorInt;

    let rounded = quotient;
    if (remainder !== 0n) {
      const twice = remainder * 2n;
      switch (rounding) {
        case 'half_up':
          if (twice >= divisorInt) rounded += 1n;
          break;
        case 'half_even':
          if (twice > divisorInt) rounded += 1n;
          else if (twice === divisorInt && quotient % 2n !== 0n) rounded += 1n;
          break;
        case 'floor':
          if (negativeResult) rounded += 1n;
          break;
        case 'ceil':
          if (!negativeResult) rounded += 1n;
          break;
      }
    }

    return Money.make(negativeResult ? -rounded : rounded, this.currency);
  }

  /**
   * Split this amount across `weights` so that the parts sum EXACTLY back to
   * the whole. Largest-remainder: each part gets its floor share, then the
   * leftover micro-units are handed out one at a time to the largest
   * remainders. No unit is created or lost.
   *
   * This is what settling one payment against several documents requires. It
   * is the operation that division cannot do correctly, which is why this type
   * has no `divide`.
   *
   *     Money.fromDecimalString('100.000000','MVR').allocate([1n,1n,1n])
   *       → 33.333334, 33.333333, 33.333333    (sums to 100.000000)
   */
  allocate(weights: readonly bigint[]): Money[] {
    if (weights.length === 0) {
      throw new MoneyError('allocate requires at least one weight');
    }
    if (weights.some((w) => w < 0n)) {
      throw new MoneyError('allocate weights must not be negative');
    }
    const total = weights.reduce((a, b) => a + b, 0n);
    if (total === 0n) {
      throw new MoneyError('allocate weights must not sum to zero');
    }

    const negative = this.micros < 0n;
    const abs = negative ? -this.micros : this.micros;

    const shares: bigint[] = [];
    const remainders: Array<{ index: number; remainder: bigint }> = [];
    let distributed = 0n;

    weights.forEach((weight, index) => {
      const numerator = abs * weight;
      const share = numerator / total;
      shares.push(share);
      remainders.push({ index, remainder: numerator % total });
      distributed += share;
    });

    let leftover = abs - distributed;
    // Largest remainder first; ties resolve by original order, so the result is
    // deterministic and reproducible in an audit.
    remainders.sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index
      : a.remainder > b.remainder ? -1 : 1
    );
    for (const { index } of remainders) {
      if (leftover === 0n) break;
      shares[index] += 1n;
      leftover -= 1n;
    }

    return shares.map((s) => Money.make(negative ? -s : s, this.currency));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Comparison
  // ───────────────────────────────────────────────────────────────────────────

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other, 'compare');
    return this.micros > other.micros ? 1 : this.micros < other.micros ? -1 : 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.micros === other.micros;
  }

  greaterThan(other: Money): boolean { return this.compare(other) > 0; }
  lessThan(other: Money): boolean { return this.compare(other) < 0; }
  greaterThanOrEqual(other: Money): boolean { return this.compare(other) >= 0; }
  lessThanOrEqual(other: Money): boolean { return this.compare(other) <= 0; }

  isZero(): boolean { return this.micros === 0n; }
  isPositive(): boolean { return this.micros > 0n; }
  isNegative(): boolean { return this.micros < 0n; }

  /** Sum, with the currency taken from the first element. Empty sums need a currency. */
  static sum(values: readonly Money[], currency?: string): Money {
    if (values.length === 0) {
      if (!currency) {
        throw new MoneyError('summing an empty list requires an explicit currency');
      }
      return Money.zero(currency);
    }
    return values.reduce((a, b) => a.add(b));
  }
}

/**
 * Resolve `kept` given the discarded `remainderDigits`, under `mode`.
 * `negative` matters only for floor/ceil, which are direction-sensitive.
 */
function applyRounding(
  kept: bigint,
  remainderDigits: string,
  negative: boolean,
  mode: RoundingMode,
): bigint {
  if (remainderDigits.length === 0) return kept;

  const remainder = BigInt(remainderDigits);
  if (remainder === 0n) return kept;

  const half = 5n * 10n ** BigInt(remainderDigits.length - 1);

  switch (mode) {
    case 'half_up':
      return remainder >= half ? kept + 1n : kept;
    case 'half_even':
      if (remainder > half) return kept + 1n;
      if (remainder < half) return kept;
      return kept % 2n === 0n ? kept : kept + 1n;
    case 'floor':
      // Toward negative infinity: magnitude grows when the value is negative.
      return negative ? kept + 1n : kept;
    case 'ceil':
      return negative ? kept : kept + 1n;
  }
}
