import { JournalEntry } from './journals';

export type CitizenshipType = 'MALDIVIAN' | 'EXPATRIATE';

/**
 * STANDARD_7_7: the ordinary MRPS split (7% employee deduction + 7% employer contribution).
 * EMPLOYER_FUNDS_FULL_14: employer absorbs the full 14% and the employee takes no deduction -
 * a documented, common practice in tourism (SERP-339 Validation Study).
 */
export type PensionFundingSplit = 'STANDARD_7_7' | 'EMPLOYER_FUNDS_FULL_14';

// Maldives Pension Act eligibility window: enrolment/contribution applies only
// between these ages (inclusive) at the pay date.
export const MRPS_MIN_ELIGIBLE_AGE = 16;
export const MRPS_MAX_ELIGIBLE_AGE = 65;

export class PayrollValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayrollValidationError';
  }
}

export interface EmployeeProfile {
  id: string;
  employeeCode: string;
  name: string;
  nidOrPassport: string;
  citizenship: CitizenshipType;
  designation: string;
  department: string;
  joinDate: string;
  /** ISO YYYY-MM-DD. Optional for backward compatibility: when absent, MRPS
   * age eligibility is not gated (existing behaviour is preserved). */
  dateOfBirth?: string;
  basicSalaryMvr: number;
  foodAllowanceMvr: number;
  housingAllowanceMvr: number;
  otherAllowanceMvr: number;
  bankName: string;
  bankAccountNumber: string;
  pensionEnrolled: boolean; // Mandatory for Maldivians (7% employee + 7% employer)
  /** Defaults to STANDARD_7_7 when omitted. */
  pensionFundingSplit?: PensionFundingSplit;
  ramadanAllowanceEligible: boolean; // MVR 3,000 statutory for Maldivian Muslim employees
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
}

export interface PayslipRecord {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  citizenship: CitizenshipType;
  
  // Earnings
  basicSalary: number;
  foodAllowance: number;
  housingAllowance: number;
  otherAllowance: number;
  ramadanAllowance: number;
  grossPay: number;

  // Deductions
  employeePension: number; // 7% of basic salary
  otherDeductions: number;
  totalDeductions: number;

  // Employer Costs
  employerPension: number; // 7% of basic salary
  totalEmployerCost: number;

  // Take-home
  netPay: number;
  bankAccountNumber: string;
}

export interface PayrollRun {
  payrollRunId: string;
  periodYear: number;
  periodMonth: number; // 1 - 12
  periodName: string;
  payDate: string;
  isRamadanMonth: boolean;
  payslips: PayslipRecord[];
  
  // Totals
  totalGrossPay: number;
  totalEmployeePension: number;
  totalEmployerPension: number;
  totalMrpsPensionPayable: number; // 14% (7% employee + 7% employer)
  totalRamadanAllowance: number;
  totalNetPayable: number;
  totalCompanyCost: number;

  status: 'DRAFT' | 'APPROVED' | 'POSTED' | 'DISBURSED';
  journalEntry?: JournalEntry;
  generatedAt: string;
}

function parseIsoDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PayrollValidationError(`${field} must be an ISO date (YYYY-MM-DD).`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new PayrollValidationError(`${field} is not a valid calendar date.`);
  }
  return date;
}

function calculateAgeAt(dateOfBirthIso: string, asOfIso: string): number {
  const dob = parseIsoDate(dateOfBirthIso, 'dateOfBirth');
  const asOf = parseIsoDate(asOfIso, 'payDate');
  if (dob > asOf) throw new PayrollValidationError('dateOfBirth cannot be after the pay date.');
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    asOf.getUTCMonth() > dob.getUTCMonth() ||
    (asOf.getUTCMonth() === dob.getUTCMonth() && asOf.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

/** DOB is optional; absent DOB preserves prior behaviour rather than excluding the employee. */
function isPensionAgeEligible(emp: EmployeeProfile, payDate: string): boolean {
  if (!emp.dateOfBirth) return true;
  const age = calculateAgeAt(emp.dateOfBirth, payDate);
  return age >= MRPS_MIN_ELIGIBLE_AGE && age <= MRPS_MAX_ELIGIBLE_AGE;
}

/**
 * Calculates a complete Monthly Payroll Run for all active employees
 * strictly adhering to the Maldives Employment Act & Pension Act.
 */
export function calculatePayrollRun(params: {
  employees: EmployeeProfile[];
  periodYear: number;
  periodMonth: number;
  isRamadanMonth?: boolean;
  ramadanAllowanceAmount?: number; // Statutory default MVR 3,000
  tenantId: string;
}): PayrollRun {
  const {
    employees,
    periodYear,
    periodMonth,
    isRamadanMonth = false,
    ramadanAllowanceAmount = 3000,
    tenantId,
  } = params;

  const monthPadded = String(periodMonth).padStart(2, '0');
  const periodName = `${periodYear}-${monthPadded}`;
  const lastDay = new Date(periodYear, periodMonth, 0).getDate();
  const payDate = `${periodYear}-${monthPadded}-${String(lastDay).padStart(2, '0')}`;

  const payslips: PayslipRecord[] = [];

  let totalGross = 0;
  let totalEmpPension = 0;
  let totalEmprPension = 0;
  let totalRamadan = 0;
  let totalNet = 0;

  for (const emp of employees) {
    if (emp.status !== 'ACTIVE') continue;

    const basic = round2(emp.basicSalaryMvr || 0);
    const food = round2(emp.foodAllowanceMvr || 0);
    const housing = round2(emp.housingAllowanceMvr || 0);
    const other = round2(emp.otherAllowanceMvr || 0);

    // Ramadan Allowance: MVR 3,000 for Maldivian Muslim employees
    const ramadan = (isRamadanMonth && emp.citizenship === 'MALDIVIAN' && emp.ramadanAllowanceEligible)
      ? round2(ramadanAllowanceAmount)
      : 0;

    const gross = round2(basic + food + housing + other + ramadan);

    // Maldives Pension Scheme (MRPS): 14% of Basic Salary for eligible, enrolled
    // Maldivian citizens aged 16-65 at the pay date, split per the employee's
    // funding arrangement (default 7% employee + 7% employer).
    let empPension = 0;
    let emprPension = 0;
    if (emp.citizenship === 'MALDIVIAN' && emp.pensionEnrolled && isPensionAgeEligible(emp, payDate)) {
      if (emp.pensionFundingSplit === 'EMPLOYER_FUNDS_FULL_14') {
        emprPension = round2(basic * 0.14);
      } else {
        empPension = round2(basic * 0.07);
        emprPension = round2(basic * 0.07);
      }
    }

    const deductions = empPension;
    const net = round2(gross - deductions);
    const compCost = round2(gross + emprPension);

    totalGross += gross;
    totalEmpPension += empPension;
    totalEmprPension += emprPension;
    totalRamadan += ramadan;
    totalNet += net;

    payslips.push({
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      designation: emp.designation,
      citizenship: emp.citizenship,
      basicSalary: basic,
      foodAllowance: food,
      housingAllowance: housing,
      otherAllowance: other,
      ramadanAllowance: ramadan,
      grossPay: gross,
      employeePension: empPension,
      otherDeductions: 0,
      totalDeductions: deductions,
      employerPension: emprPension,
      totalEmployerCost: compCost,
      netPay: net,
      bankAccountNumber: emp.bankAccountNumber,
    });
  }

  const totalMrps = round2(totalEmpPension + totalEmprPension);
  const totalCompanyCost = round2(totalGross + totalEmprPension);

  const run: PayrollRun = {
    payrollRunId: `PR-${periodName}`,
    periodYear,
    periodMonth,
    periodName,
    payDate,
    isRamadanMonth,
    payslips,
    totalGrossPay: round2(totalGross),
    totalEmployeePension: round2(totalEmpPension),
    totalEmployerPension: round2(totalEmprPension),
    totalMrpsPensionPayable: totalMrps,
    totalRamadanAllowance: round2(totalRamadan),
    totalNetPayable: round2(totalNet),
    totalCompanyCost,
    status: 'DRAFT',
    generatedAt: new Date().toISOString(),
  };

  run.journalEntry = createPayrollAccrualJournal(run, tenantId);
  return run;
}

/**
 * Creates double-entry general ledger journal entry for Monthly Payroll Provision.
 */
export function createPayrollAccrualJournal(run: PayrollRun, tenantId: string): JournalEntry {
  const lines: any[] = [
    // 1. Debit Gross Salaries Expense (Account 6200)
    {
      id: 'pl-01',
      accountCode: '6110',
      accountName: 'Staff Base Salaries & Allowances',
      debit: round2(run.totalGrossPay - run.totalRamadanAllowance),
      credit: 0,
      description: `Basic & Allowances Payroll for ${run.periodName}`,
    },
  ];

  // 2. Debit Ramadan Allowance if applicable (Account 6220)
  if (run.totalRamadanAllowance > 0) {
    lines.push({
      id: 'pl-02',
      accountCode: '6110',
      accountName: 'Staff Base Salaries & Allowances',
      debit: run.totalRamadanAllowance,
      credit: 0,
      description: `Statutory Ramadan Allowance for ${run.periodName}`,
    });
  }

  // 3. Debit Employer Pension Expense (Account 6210)
  if (run.totalEmployerPension > 0) {
    lines.push({
      id: 'pl-03',
      accountCode: '6120',
      accountName: 'Employer Pension Contribution (MRPS 7%)',
      debit: run.totalEmployerPension,
      credit: 0,
      description: `Company 7% MRPS Contribution for ${run.periodName}`,
    });
  }

  // 4. Credit Maldives Retirement Pension Scheme Payable (Account 2170 - 14% total)
  if (run.totalMrpsPensionPayable > 0) {
    lines.push({
      id: 'pl-04',
      accountCode: '2130',
      accountName: 'MPAO / MRPS Pension Contributions Payable',
      debit: 0,
      credit: run.totalMrpsPensionPayable,
      description: `MRPS Pension Liability (7% Emp + 7% Empr)`,
    });
  }

  // 5. Credit Net Salaries Payable (Account 2180)
  lines.push({
    id: 'pl-05',
    accountCode: '2140',
    accountName: 'Net Salaries & Wages Payable',
    debit: 0,
    credit: run.totalNetPayable,
    description: `Net Take-Home Pay for ${run.payslips.length} Staff`,
  });

  const totalDebit = round2(lines.reduce((s, l) => s + (l.debit || 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (l.credit || 0), 0));

  return {
    id: `je-pr-${run.periodName}`,
    entryNumber: `JE-PAYROLL-${run.periodName.replace('-', '')}`,
    date: run.payDate,
    source: 'PAYROLL_PROVISION',
    reference: run.payrollRunId,
    narration: `Monthly Payroll Provision for ${run.periodName} (${run.payslips.length} Employees)`,
    lines,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    postedBy: 'System / Payroll Engine',
    postedAt: new Date().toISOString(),
    tenantId,
    status: 'POSTED',
  };
}

/**
 * Generates BML Bulk Payroll CSV export file format.
 */
export function generateBmlPayrollCsv(run: PayrollRun): string {
  const rows = [
    ['BENEFICIARY_ACCOUNT', 'BENEFICIARY_NAME', 'AMOUNT', 'CURRENCY', 'REMARKS', 'PAYMENT_REFERENCE'],
    ...run.payslips.map((p) => [
      p.bankAccountNumber,
      p.employeeName,
      p.netPay.toFixed(2),
      'MVR',
      `Salary ${run.periodName}`,
      `${p.employeeCode}-${run.periodName}`,
    ]),
  ];

  return rows.map((r) => r.join(',')).join('\n');
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
