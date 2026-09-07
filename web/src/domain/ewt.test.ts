import { describe, expect, it } from 'vitest';
import {
  calculateMonthlyEwt,
  EwtValidationError,
  EWT_STATUTORY_REGISTRATION_THRESHOLD_MVR,
} from './ewt';

describe('Maldives Employee Withholding Tax (EWT)', () => {
  it('identifies unregistered nil-withholding below MVR 30,000 threshold', () => {
    const result = calculateMonthlyEwt({
      grossRemunerationMvr: 25000,
      employeeMrpsDeductionMvr: 1750, // 7% of 25,000
      payDate: '2026-09-30',
    });

    expect(result).toMatchObject({
      grossRemunerationMvr: 25000,
      employeeMrpsDeductionMvr: 1750,
      taxableRemunerationBaseMvr: 23250,
      ewtAmountMvr: 0,
      effectiveRatePercent: 0,
      requiresMiraRegistration: false,
      liabilityAccountCode: '2124',
      status: 'NIL_UNREGISTERED',
    });
  });

  it('identifies registered nil-withholding at exact MVR 30,000 threshold boundary', () => {
    const result = calculateMonthlyEwt({
      grossRemunerationMvr: EWT_STATUTORY_REGISTRATION_THRESHOLD_MVR, // exactly 30,000
      employeeMrpsDeductionMvr: 2100, // 7% of 30,000
      payDate: '2026-09-30',
    });

    expect(result).toMatchObject({
      grossRemunerationMvr: 30000,
      employeeMrpsDeductionMvr: 2100,
      taxableRemunerationBaseMvr: 27900,
      ewtAmountMvr: 0,
      requiresMiraRegistration: true,
      status: 'NIL_REGISTERED',
    });
  });

  it('identifies registered nil-withholding between MVR 30,000 and MVR 60,000', () => {
    // Gross remuneration = 45,000 >= 30,000 registration threshold, but base < 60,000 taxable threshold
    const result = calculateMonthlyEwt({
      grossRemunerationMvr: 45000,
      employeeMrpsDeductionMvr: 2800, // 7% of 40,000 basic
      payDate: '2026-09-30',
    });

    expect(result).toMatchObject({
      grossRemunerationMvr: 45000,
      employeeMrpsDeductionMvr: 2800,
      taxableRemunerationBaseMvr: 42200,
      ewtAmountMvr: 0,
      effectiveRatePercent: 0,
      requiresMiraRegistration: true,
      liabilityAccountCode: '2124',
      status: 'NIL_REGISTERED',
    });
  });

  it('computes correct 5.5% tax for Bracket 1 (MVR 60,001 - 100,000)', () => {
    // Gross: 80,000, MRPS: 5,600 (7% of 80,000 basic)
    // Taxable Base = 80,000 - 5,600 = 74,400
    // First 60,000 @ 0% = 0
    // Remaining (74,400 - 60,000) = 14,400 @ 5.5% = 792.00
    const result = calculateMonthlyEwt({
      grossRemunerationMvr: 80000,
      employeeMrpsDeductionMvr: 5600,
      payDate: '2026-09-30',
    });

    expect(result.taxableRemunerationBaseMvr).toBe(74400);
    expect(result.ewtAmountMvr).toBe(792);
    expect(result.effectiveRatePercent).toBe(0.99); // 792 / 80,000 = 0.99%
    expect(result.status).toBe('COMPUTED');
    expect(result.liabilityAccountCode).toBe('2124');
    expect(result.requiresMiraRegistration).toBe(true);
  });

  it('verifies that EWT base is ordered AFTER MRPS deduction (prevents overwithholding)', () => {
    // Suppose gross = 70,000, basic = 70,000, MRPS = 4,900
    // Correct base: 70,000 - 4,900 = 65,100 -> tax = (65,100 - 60,000) * 5.5% = 5,100 * 0.055 = 280.50
    // INCORRECT parallel calculation: (70,000 - 60,000) * 5.5% = 10,000 * 0.055 = 550.00
    const result = calculateMonthlyEwt({
      grossRemunerationMvr: 70000,
      employeeMrpsDeductionMvr: 4900,
      payDate: '2026-09-30',
    });

    expect(result.taxableRemunerationBaseMvr).toBe(65100);
    expect(result.ewtAmountMvr).toBe(280.5);
    expect(result.ewtAmountMvr).not.toBe(550.0);
  });

  it('computes multi-bracket progressive tax across Bracket 1 and Bracket 2 (up to 150,000)', () => {
    // Gross: 130,000, MRPS: 7,000
    // Taxable base = 123,000
    // 0 - 60,000: 0
    // 60,000 - 100,000 (40,000 @ 5.5%): 2,200.00
    // 100,000 - 123,000 (23,000 @ 8.0%): 1,840.00
    // Total Tax: 2,200 + 1,840 = 4,040.00
    const result = calculateMonthlyEwt({
      grossRemunerationMvr: 130000,
      employeeMrpsDeductionMvr: 7000,
      payDate: '2026-09-30',
    });

    expect(result.taxableRemunerationBaseMvr).toBe(123000);
    expect(result.ewtAmountMvr).toBe(4040);
    expect(result.bracketsBreakdown[1].taxAmount).toBe(2200);
    expect(result.bracketsBreakdown[2].taxAmount).toBe(1840);
  });

  it('computes progressive tax across all brackets up to top 15% band (> 200,000)', () => {
    // Gross: 260,000, MRPS: 10,000
    // Taxable base = 250,000
    // Bracket 0 (0 - 60k): 0
    // Bracket 1 (60k - 100k): 40,000 * 0.055 = 2,200
    // Bracket 2 (100k - 150k): 50,000 * 0.08 = 4,000
    // Bracket 3 (150k - 200k): 50,000 * 0.12 = 6,000
    // Bracket 4 (> 200k): (250,000 - 200,000) * 0.15 = 50,000 * 0.15 = 7,500
    // Total Tax = 2,200 + 4,000 + 6,000 + 7,500 = 19,700.00
    const result = calculateMonthlyEwt({
      grossRemunerationMvr: 260000,
      employeeMrpsDeductionMvr: 10000,
      payDate: '2026-09-30',
    });

    expect(result.taxableRemunerationBaseMvr).toBe(250000);
    expect(result.ewtAmountMvr).toBe(19700);
    expect(result.effectiveRatePercent).toBe(Math.round((19700 / 260000) * 10000) / 100);
  });

  it('validates input boundaries and rejects negative or inverted arguments', () => {
    expect(() =>
      calculateMonthlyEwt({
        grossRemunerationMvr: -100,
        employeeMrpsDeductionMvr: 0,
        payDate: '2026-09-30',
      }),
    ).toThrow(EwtValidationError);

    expect(() =>
      calculateMonthlyEwt({
        grossRemunerationMvr: 50000,
        employeeMrpsDeductionMvr: 60000, // Pension > Gross
        payDate: '2026-09-30',
      }),
    ).toThrow(/cannot exceed/);

    expect(() =>
      calculateMonthlyEwt({
        grossRemunerationMvr: 50000,
        employeeMrpsDeductionMvr: 3500,
        payDate: 'invalid-date',
      }),
    ).toThrow(EwtValidationError);

    expect(() =>
      calculateMonthlyEwt({
        grossRemunerationMvr: 50000,
        employeeMrpsDeductionMvr: 3500,
        payDate: '2026-09-30',
        registrationThresholdMvr: -500,
      }),
    ).toThrow(EwtValidationError);
  });
});
