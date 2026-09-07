import React, { useState } from 'react';
import {
  Briefcase,
  Layers,
  Wrench,
  DollarSign,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Plus,
  ArrowRight,
  ShieldCheck,
  Receipt
} from 'lucide-react';
import {
  calculateJobCostSheet,
  JobCostSheet,
} from '../../domain/jobCosting';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const JobCostingView: React.FC = () => {
  const { formatMVR, currentTenant, addJournalEntry } = useERP();

  const [jobStatus, setJobStatus] = useState<'IN_PROGRESS' | 'COMPLETED'>('IN_PROGRESS');
  const [isJournalPosted, setIsJournalPosted] = useState<boolean>(false);

  const sampleJobParams = {
    jobId: 'job-901',
    jobCode: 'WO-2026-089',
    projectName: 'Marine Propulsion Overhaul (Island Ferry 42)',
    customerName: 'Island Transport Pvt Ltd',
    startDate: '2026-08-01',
    targetCompletionDate: '2026-08-28',
    quotedPriceMvr: 120000,
    budgetedCostMvr: 85000,
    overheadAbsorptionRatePct: 15,
    materials: [
      { id: 'm1', itemId: 'item-01', itemCode: 'SEAL-01', description: 'Hydraulic Seals Kit', quantity: 4, unitCostMvr: 2500, totalCostMvr: 10000, allocatedDate: '2026-08-05' },
      { id: 'm2', itemId: 'item-02', itemCode: 'OIL-SYN', description: 'Marine Synthetic Oil 200L', quantity: 2, unitCostMvr: 8000, totalCostMvr: 16000, allocatedDate: '2026-08-10' },
    ],
    labor: [
      { id: 'l1', employeeId: 'emp-01', employeeName: 'Ahmed Hassan', taskDescription: 'Engine block disassembly & overhaul', hoursWorked: 40, hourlyRateMvr: 350, totalCostMvr: 14000, logDate: '2026-08-12' },
      { id: 'l2', employeeId: 'emp-02', employeeName: 'Ramesh Kumar', taskDescription: 'Shaft alignment & dynamic balancing', hoursWorked: 30, hourlyRateMvr: 250, totalCostMvr: 7500, logDate: '2026-08-18' },
    ],
    directExpenses: [
      { id: 'e1', description: 'Drydock heavy crane hire', vendorName: 'Male Port Heavy Lift Services', amountMvr: 12000, category: 'EQUIPMENT_HIRE' as const, expenseDate: '2026-08-15' },
    ],
    tenantId: currentTenant.id || 'tenant-starq',
  };

  const sheet: JobCostSheet = calculateJobCostSheet({
    ...sampleJobParams,
    status: jobStatus,
  });

  const handleCompleteJob = () => {
    setJobStatus('COMPLETED');
    const completedSheet = calculateJobCostSheet({
      ...sampleJobParams,
      status: 'COMPLETED',
    });
    if (completedSheet.completionJournal) {
      if (typeof (addJournalEntry as any) === 'function') {
        (addJournalEntry as any)(completedSheet.completionJournal);
      }
      setIsJournalPosted(true);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Job ${completedSheet.jobCode} marked COMPLETED. COGS recognition journal #${completedSheet.completionJournal.entryNumber} posted to GL!`);
      }
    }
  };

  return (
    <div className="space-y-6" data-testid="job-costing-view">
      {/* Header */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Briefcase size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Projects & Job-Costing Absorption Ledger</h2>
                <Badge variant={jobStatus === 'COMPLETED' ? 'positive' : 'neutral'}>
                  {jobStatus === 'COMPLETED' ? 'Completed & Capitalized' : 'Work-in-Progress (WIP)'}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                Direct Materials, Labor Hours, Subcontractors, and 15% Overhead Absorption tracking with automatic COGS realization.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {jobStatus === 'IN_PROGRESS' ? (
              <Button
                variant="filled"
                size="sm"
                onClick={handleCompleteJob}
                icon={<CheckCircle2 size={14} />}
              >
                <span>Complete Job & Post COGS to GL</span>
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
                <CheckCircle2 size={14} />
                <span>COGS Capitalized ✓</span>
              </div>
            )}
          </div>
        </div>
      </Surface>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Quoted Contract Price</span>
          <div className="text-lg font-bold text-white">{formatMVR(sheet.quotedPriceMvr)}</div>
          <span className="text-[10px] text-slate-500 font-sans">Fixed Price Contract</span>
        </Surface>

        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Total Absorbed Cost (WIP)</span>
          <div className="text-lg font-bold text-sky-400">{formatMVR(sheet.totalActualCost)}</div>
          <span className="text-[10px] text-slate-500 font-sans">
            Materials + Labor + Exp + 15% OH
          </span>
        </Surface>

        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Gross Profit Margin</span>
          <div className="text-lg font-bold text-emerald-400">
            {formatMVR(sheet.grossProfitMvr)} ({sheet.grossMarginPct}%)
          </div>
          <span className="text-[10px] text-slate-500 font-sans">Target: &gt; 35%</span>
        </Surface>

        <Surface className="p-4 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-1 font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Budget Variance</span>
          <div className={`text-lg font-bold ${sheet.costVarianceMvr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatMVR(sheet.costVarianceMvr)}
          </div>
          <span className="text-[10px] text-slate-500 font-sans">
            {sheet.costVarianceMvr >= 0 ? 'Under Budget ✓' : 'Cost Overrun ⚠️'}
          </span>
        </Surface>
      </div>

      {/* Cost Absorptions Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Materials Allocated */}
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers size={16} className="text-sky-400" />
              <span>Direct Materials Allocated</span>
            </h3>
            <span className="font-mono text-xs font-bold text-white">{formatMVR(sheet.totalMaterialCost)}</span>
          </div>

          <div className="space-y-2 font-mono text-xs">
            {sheet.materials.map((m) => (
              <div key={m.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="font-bold text-slate-200 font-sans">{m.description}</div>
                  <div className="text-[10px] text-slate-500">
                    {m.itemCode} · Qty: {m.quantity} @ {formatMVR(m.unitCostMvr)}
                  </div>
                </div>
                <div className="font-bold text-white">{formatMVR(m.totalCostMvr)}</div>
              </div>
            ))}
          </div>
        </Surface>

        {/* Direct Labor Hours */}
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock size={16} className="text-amber-400" />
              <span>Direct Labor & 15% Overhead Absorption</span>
            </h3>
            <span className="font-mono text-xs font-bold text-white">
              {formatMVR(sheet.totalLaborCost + sheet.totalOverheadAbsorbed)}
            </span>
          </div>

          <div className="space-y-2 font-mono text-xs">
            {sheet.labor.map((l) => (
              <div key={l.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="font-bold text-slate-200 font-sans">{l.employeeName}</div>
                  <div className="text-[10px] text-slate-500 font-sans">{l.taskDescription}</div>
                  <div className="text-[10px] text-slate-400">
                    {l.hoursWorked} hrs @ {formatMVR(l.hourlyRateMvr)}/hr
                  </div>
                </div>
                <div className="font-bold text-white">{formatMVR(l.totalCostMvr)}</div>
              </div>
            ))}

            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 flex justify-between items-center text-[11px] text-slate-400">
              <span>Overhead Absorption (15% on Labor):</span>
              <span className="font-bold text-amber-300">+{formatMVR(sheet.totalOverheadAbsorbed)}</span>
            </div>
          </div>
        </Surface>
      </div>

      {/* Completion COGS Journal Preview */}
      {sheet.completionJournal && (
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Receipt size={16} className="text-emerald-400" />
              <span>Job Completion & COGS Recognition Journal ({sheet.completionJournal.entryNumber})</span>
            </h3>
            <Badge variant="positive">Balanced Journal</Badge>
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
                {sheet.completionJournal.lines.map((l) => (
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
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
};
