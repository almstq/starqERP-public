import React, { useState } from 'react';
import {
  Users,
  DollarSign,
  Calendar,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Percent,
  Sparkles,
  Receipt
} from 'lucide-react';
import {
  calculatePayrollRun,
  generateBmlPayrollCsv,
  EmployeeProfile,
  PayrollRun,
} from '../../domain/payroll';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const PayrollManagementView: React.FC = () => {
  const { formatMVR, currentTenant, addJournalEntry } = useERP();

  const [employees, setEmployees] = useState<EmployeeProfile[]>([
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
      designation: 'Hull & Welding Specialist',
      department: 'Operations',
      joinDate: '2025-03-01',
      basicSalaryMvr: 15000,
      foodAllowanceMvr: 2000,
      housingAllowanceMvr: 3000,
      otherAllowanceMvr: 0,
      bankName: 'BML',
      bankAccountNumber: '7704882710192',
      pensionEnrolled: false,
      ramadanAllowanceEligible: false,
      status: 'ACTIVE',
    },
    {
      id: 'emp-03',
      employeeCode: 'STQ-003',
      name: 'Fathimath Shifa',
      nidOrPassport: 'A129841',
      citizenship: 'MALDIVIAN',
      designation: 'Accounts & Compliance Lead',
      department: 'Finance',
      joinDate: '2024-06-01',
      basicSalaryMvr: 20000,
      foodAllowanceMvr: 3000,
      housingAllowanceMvr: 4000,
      otherAllowanceMvr: 1000,
      bankName: 'BML',
      bankAccountNumber: '7702819237401',
      pensionEnrolled: true,
      ramadanAllowanceEligible: true,
      status: 'ACTIVE',
    },
  ]);

  const [periodYear, setPeriodYear] = useState<number>(2026);
  const [periodMonth, setPeriodMonth] = useState<number>(8);
  const [isRamadanMonth, setIsRamadanMonth] = useState<boolean>(false);
  const [isPosted, setIsPosted] = useState<boolean>(false);

  const currentRun: PayrollRun = calculatePayrollRun({
    employees,
    periodYear,
    periodMonth,
    isRamadanMonth,
    tenantId: currentTenant.id || 'tenant-starq',
  });

  const handlePostToGL = () => {
    if (currentRun.journalEntry) {
      if (typeof (addJournalEntry as any) === 'function') {
        (addJournalEntry as any)(currentRun.journalEntry);
      }
      setIsPosted(true);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Payroll provision journal #${currentRun.journalEntry.entryNumber} posted to General Ledger!`);
      }
    }
  };

  const handleDownloadCsv = () => {
    const csvContent = generateBmlPayrollCsv(currentRun);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `BML_Payroll_${currentRun.periodName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" data-testid="payroll-management-view">
      {/* Header */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Users size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">HR & Maldives Statutory Payroll</h2>
                <Badge variant="positive">Employment Act Compliant</Badge>
              </div>
              <p className="text-xs text-slate-400">
                MRPS Pension (7% + 7%), Ramadan Allowance (MVR 3,000), BML Bulk Transfer & GL Accruals.
              </p>
            </div>
          </div>

          {/* Period Selector Strip */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-950 p-2 rounded-2xl border border-slate-800 text-xs font-mono">
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Period:</span>
              <select
                value={periodMonth}
                onChange={(e) => {
                  setPeriodMonth(Number(e.target.value));
                  setIsPosted(false);
                }}
                className="bg-slate-900 border border-slate-800 text-white rounded-lg px-2 py-1 font-bold focus:outline-none"
              >
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Month {i + 1}
                  </option>
                ))}
              </select>
              <select
                value={periodYear}
                onChange={(e) => {
                  setPeriodYear(Number(e.target.value));
                  setIsPosted(false);
                }}
                className="bg-slate-900 border border-slate-800 text-white rounded-lg px-2 py-1 font-bold focus:outline-none"
              >
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-amber-300 cursor-pointer font-sans text-xs select-none">
              <input
                type="checkbox"
                checked={isRamadanMonth}
                onChange={(e) => setIsRamadanMonth(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-amber-500"
              />
              <span>Ramadan Month (MVR 3,000 Allowance)</span>
            </label>
          </div>
        </div>
      </Surface>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Total Gross Payroll</span>
          <div className="text-lg font-bold text-white">{formatMVR(currentRun.totalGrossPay)}</div>
          <span className="text-[10px] text-slate-500 font-sans">{currentRun.payslips.length} active staff</span>
        </Surface>

        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">MRPS Pension (14% Total)</span>
          <div className="text-lg font-bold text-sky-400">{formatMVR(currentRun.totalMrpsPensionPayable)}</div>
          <span className="text-[10px] text-slate-500 font-sans">
            Emp: {formatMVR(currentRun.totalEmployeePension)} | Co: {formatMVR(currentRun.totalEmployerPension)}
          </span>
        </Surface>

        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Net Take-Home Pay</span>
          <div className="text-lg font-bold text-emerald-400">{formatMVR(currentRun.totalNetPayable)}</div>
          <span className="text-[10px] text-slate-500 font-sans">Direct BML Bank Transfer</span>
        </Surface>

        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Total Company Cost</span>
          <div className="text-lg font-bold text-amber-400">{formatMVR(currentRun.totalCompanyCost)}</div>
          <span className="text-[10px] text-slate-500 font-sans">Gross + 7% Employer Pension</span>
        </Surface>
      </div>

      {/* Staff Payslip Registry Table */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-400" />
            <span>Monthly Payslips Breakdown ({currentRun.periodName})</span>
          </h3>

          <div className="flex items-center gap-2">
            <Button
              variant="outlined"
              size="sm"
              onClick={handleDownloadCsv}
              icon={<Download size={14} />}
            >
              <span>Export BML Bulk CSV</span>
            </Button>
            <Button
              variant="filled"
              size="sm"
              disabled={isPosted}
              onClick={handlePostToGL}
              icon={<BookOpen size={14} />}
            >
              <span>{isPosted ? 'Posted to GL ✓' : 'Post Payroll Accrual to GL'}</span>
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-mono text-slate-400 uppercase">
                <th className="py-2.5 px-3">Code / Employee</th>
                <th className="py-2.5 px-3">Status / Role</th>
                <th className="py-2.5 px-3 text-right">Basic Salary</th>
                <th className="py-2.5 px-3 text-right">Allowances</th>
                {isRamadanMonth && <th className="py-2.5 px-3 text-right">Ramadan</th>}
                <th className="py-2.5 px-3 text-right">Gross Pay</th>
                <th className="py-2.5 px-3 text-right">7% Emp Pension</th>
                <th className="py-2.5 px-3 text-right">Net Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {currentRun.payslips.map((p) => (
                <tr key={p.employeeId} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-white">{p.employeeName}</span>
                    <span className="block text-[10px] text-slate-500 font-mono">{p.employeeCode}</span>
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    <span className="text-slate-300">{p.designation}</span>
                    <Badge variant={p.citizenship === 'MALDIVIAN' ? 'neutral' : 'warning'} className="ml-2">
                      {p.citizenship}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{formatMVR(p.basicSalary)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {formatMVR(p.foodAllowance + p.housingAllowance + p.otherAllowance)}
                  </td>
                  {isRamadanMonth && (
                    <td className="py-2.5 px-3 text-right text-amber-300 font-bold">
                      {p.ramadanAllowance > 0 ? formatMVR(p.ramadanAllowance) : '-'}
                    </td>
                  )}
                  <td className="py-2.5 px-3 text-right font-bold text-white">{formatMVR(p.grossPay)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-400">
                    {p.employeePension > 0 ? `-${formatMVR(p.employeePension)}` : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{formatMVR(p.netPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Journal Entry Preview */}
      {currentRun.journalEntry && (
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Receipt size={16} className="text-sky-400" />
              <span>General Ledger Double-Entry Audit ({currentRun.journalEntry.entryNumber})</span>
            </h3>
            <Badge variant="positive">Balanced Provision</Badge>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-[10px] text-slate-400 uppercase">
                  <th className="py-2 px-3">Account Code</th>
                  <th className="py-2 px-3">Account Title</th>
                  <th className="py-2 px-3 text-right">Debit (MVR)</th>
                  <th className="py-2 px-3 text-right">Credit (MVR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[11px]">
                {currentRun.journalEntry.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 px-3 font-bold text-sky-400">{l.accountCode}</td>
                    <td className="py-2 px-3 text-slate-300 font-sans">{l.accountName}</td>
                    <td className="py-2 px-3 text-right text-white font-bold">
                      {l.debit > 0 ? formatMVR(l.debit) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right text-white font-bold">
                      {l.credit > 0 ? formatMVR(l.credit) : '-'}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-700 bg-slate-900/80 font-bold">
                  <td colSpan={2} className="py-2 px-3 text-right text-slate-400">
                    Total:
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400">
                    {formatMVR(currentRun.journalEntry.totalDebit)}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400">
                    {formatMVR(currentRun.journalEntry.totalCredit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
};
