import { describe, it, expect } from 'vitest';
import {
  calculatePayrollRun,
  createPayrollAccrualJournal,
  generateBmlPayrollCsv,
  EmployeeProfile,
  PayrollValidationError,
} from './payroll';

const baseEmployee = (overrides: Partial<EmployeeProfile> = {}): EmployeeProfile => ({
  id: 'emp-99',
  employeeCode: 'STQ-099',
  name: 'Test Employee',
  nidOrPassport: 'A000000',
  citizenship: 'MALDIVIAN',
  designation: 'Test',
  department: 'Test',
  joinDate: '2020-01-01',
  basicSalaryMvr: 20000,
  foodAllowanceMvr: 0,
  housingAllowanceMvr: 0,
  otherAllowanceMvr: 0,
  bankName: 'BML',
  bankAccountNumber: '7700000000000',
  pensionEnrolled: true,
  ramadanAllowanceEligible: false,
  status: 'ACTIVE',
  ...overrides,
});

describe('SERP-011: Maldives Employment Act & MRPS Pension Payroll Engine', () => {
  const sampleEmployees: EmployeeProfile[] = [
    {
      id: 'emp-01',
      employeeCode: 'STQ-001',
      name: 'Ahmed Hassan',
      nidOrPassport: 'A091823',
      citizenship: 'MALDIVIAN',
      designation: 'Senior Marine Engineer',
      department: 'Engineering',
      joinDate: '2024-01-15',
      basicSalaryMvr: 25000,
      foodAllowanceMvr: 3000,
      housingAllowanceMvr: 5000,
      otherAllowanceMvr: 2000,
      bankName: 'BML',
      bankAccountNumber: '7701192837101',
      pensionEnrolled: true,
      ramadanAllowanceEligible: true,
      status: 'ACTIVE',
    },
    {
      id: 'emp-02',
      employeeCode: 'STQ-002',
      name: 'Ramesh Kumar',
      nidOrPassport: 'P9901923',
      citizenship: 'EXPATRIATE',
      designation: 'Hull Technician',
      department: 'Operations',
      joinDate: '2025-03-01',
      basicSalaryMvr: 15000,
      foodAllowanceMvr: 2000,
      housingAllowanceMvr: 3000,
      otherAllowanceMvr: 0,
      bankName: 'BML',
      bankAccountNumber: '7704882710192',
      pensionEnrolled: false, // Expatriates exempt from Maldives Pension
      ramadanAllowanceEligible: false,
      status: 'ACTIVE',
    },
  ];

  it('calculates Maldives Pension (7% employee + 7% employer) for Maldivian citizens and exempts expats', () => {
    const run = calculatePayrollRun({
      employees: sampleEmployees,
      periodYear: 2026,
      periodMonth: 8,
      isRamadanMonth: false,
      tenantId: 'tenant-01',
    });

    const maldivian = run.payslips.find((p) => p.employeeCode === 'STQ-001')!;
    expect(maldivian.basicSalary).toBe(25000);
    expect(maldivian.grossPay).toBe(35000); // 25k + 3k + 5k + 2k
    expect(maldivian.employeePension).toBe(1750); // 7% of 25,000
    expect(maldivian.employerPension).toBe(1750); // 7% of 25,000
    expect(maldivian.netPay).toBe(33250); // 35k - 1,750

    const expat = run.payslips.find((p) => p.employeeCode === 'STQ-002')!;
    expect(expat.basicSalary).toBe(15000);
    expect(expat.grossPay).toBe(20000);
    expect(expat.employeePension).toBe(0); // Expat exempt
    expect(expat.netPay).toBe(20000);
  });

  it('calculates statutory Ramadan Allowance (MVR 3,000) during Ramadan month', () => {
    const run = calculatePayrollRun({
      employees: sampleEmployees,
      periodYear: 2026,
      periodMonth: 3, // Ramadan month
      isRamadanMonth: true,
      ramadanAllowanceAmount: 3000,
      tenantId: 'tenant-01',
    });

    const maldivian = run.payslips.find((p) => p.employeeCode === 'STQ-001')!;
    expect(maldivian.ramadanAllowance).toBe(3000);
    expect(maldivian.grossPay).toBe(38000); // 35k + 3k
    expect(run.totalRamadanAllowance).toBe(3000);
  });

  it('generates a balanced double-entry payroll provision journal for General Ledger', () => {
    const run = calculatePayrollRun({
      employees: sampleEmployees,
      periodYear: 2026,
      periodMonth: 8,
      isRamadanMonth: false,
      tenantId: 'tenant-01',
    });

    const je = run.journalEntry;
    expect(je).toBeDefined();
    expect(je?.isBalanced).toBe(true);
    expect(je?.totalDebit).toBe(run.totalCompanyCost);
    expect(je?.totalCredit).toBe(run.totalCompanyCost);
    expect(je?.lines.find((l) => l.accountCode === '2130')?.credit).toBe(3500); // MRPS 14% (1750 + 1750)
    expect(je?.lines.find((l) => l.accountCode === '2140')?.credit).toBe(53250); // Total Net Pay
  });

  it('generates compliant BML Bulk Payroll CSV export', () => {
    const run = calculatePayrollRun({
      employees: sampleEmployees,
      periodYear: 2026,
      periodMonth: 8,
      isRamadanMonth: false,
      tenantId: 'tenant-01',
    });

    const csv = generateBmlPayrollCsv(run);
    expect(csv).toContain('BENEFICIARY_ACCOUNT,BENEFICIARY_NAME,AMOUNT');
    expect(csv).toContain('7701192837101,Ahmed Hassan,33250.00,MVR');
    expect(csv).toContain('7704882710192,Ramesh Kumar,20000.00,MVR');
  });
});

describe('SERP-339 beta: employer-funds-full-14% pension option', () => {
  it('defaults to the 7/7 split when pensionFundingSplit is omitted', () => {
    const run = calculatePayrollRun({
      employees: [baseEmployee()],
      periodYear: 2026,
      periodMonth: 8,
      tenantId: 'tenant-01',
    });
    const p = run.payslips[0];
    expect(p.employeePension).toBe(1400); // 7% of 20,000
    expect(p.employerPension).toBe(1400);
    expect(p.netPay).toBe(18600);
  });

  it('lets the employer fund the full 14% with no employee deduction', () => {
    const run = calculatePayrollRun({
      employees: [baseEmployee({ pensionFundingSplit: 'EMPLOYER_FUNDS_FULL_14' })],
      periodYear: 2026,
      periodMonth: 8,
      tenantId: 'tenant-01',
    });
    const p = run.payslips[0];
    expect(p.employeePension).toBe(0);
    expect(p.employerPension).toBe(2800); // 14% of 20,000
    expect(p.netPay).toBe(p.grossPay); // no deduction taken from the employee
    expect(run.totalMrpsPensionPayable).toBe(2800); // still 14% total liability
    expect(run.totalCompanyCost).toBe(p.grossPay + 2800);
  });
});

describe('SERP-339 beta: MRPS age eligibility window (16-65 inclusive)', () => {
  it('excludes an employee below the minimum age at pay date', () => {
    const run = calculatePayrollRun({
      employees: [baseEmployee({ dateOfBirth: '2011-01-01' })], // 15 on 2026-08-31
      periodYear: 2026,
      periodMonth: 8,
      tenantId: 'tenant-01',
    });
    const p = run.payslips[0];
    expect(p.employeePension).toBe(0);
    expect(p.employerPension).toBe(0);
  });

  it('excludes an employee above the maximum age at pay date', () => {
    const run = calculatePayrollRun({
      employees: [baseEmployee({ dateOfBirth: '1960-01-01' })], // 66 on 2026-08-31
      periodYear: 2026,
      periodMonth: 8,
      tenantId: 'tenant-01',
    });
    const p = run.payslips[0];
    expect(p.employeePension).toBe(0);
    expect(p.employerPension).toBe(0);
  });

  it('includes an employee exactly at the 16-year-old lower boundary', () => {
    const run = calculatePayrollRun({
      employees: [baseEmployee({ dateOfBirth: '2010-08-31' })], // turns 16 on pay date
      periodYear: 2026,
      periodMonth: 8,
      tenantId: 'tenant-01',
    });
    expect(run.payslips[0].employeePension).toBe(1400);
  });

  it('includes an employee exactly at the 65-year-old upper boundary', () => {
    const run = calculatePayrollRun({
      employees: [baseEmployee({ dateOfBirth: '1961-08-31' })], // turns 65 on pay date
      periodYear: 2026,
      periodMonth: 8,
      tenantId: 'tenant-01',
    });
    expect(run.payslips[0].employeePension).toBe(1400);
  });

  it('preserves existing behaviour when dateOfBirth is not provided', () => {
    const run = calculatePayrollRun({
      employees: [baseEmployee()],
      periodYear: 2026,
      periodMonth: 8,
      tenantId: 'tenant-01',
    });
    expect(run.payslips[0].employeePension).toBe(1400);
  });

  it('rejects a malformed dateOfBirth', () => {
    expect(() =>
      calculatePayrollRun({
        employees: [baseEmployee({ dateOfBirth: 'not-a-date' })],
        periodYear: 2026,
        periodMonth: 8,
        tenantId: 'tenant-01',
      }),
    ).toThrow(PayrollValidationError);
  });

  it('rejects a dateOfBirth after the pay date', () => {
    expect(() =>
      calculatePayrollRun({
        employees: [baseEmployee({ dateOfBirth: '2027-01-01' })],
        periodYear: 2026,
        periodMonth: 8,
        tenantId: 'tenant-01',
      }),
    ).toThrow(/cannot be after/);
  });
});
