import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Mail,
  Printer,
  FileText,
  Building2,
  Lock,
  UserCheck,
  Send,
  Eye,
  CheckCircle2,
  Clock,
  Ban
} from 'lucide-react';
import {
  evaluateCustomerCredit,
  generateDunningNotice,
  CustomerCreditProfile,
  DunningNotice,
  CreditEvaluationResult,
} from '../../domain/creditDunning';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const CreditDunningView: React.FC = () => {
  const { formatMVR, currentTenant } = useERP();

  // Sample Customer Credit Profiles
  const [profiles, setProfiles] = useState<CustomerCreditProfile[]>([
    {
      customerId: 'cust-01',
      customerName: 'Island Horizon Transport Pvt Ltd',
      creditLimit: 50000,
      enforcementMode: 'HARD_BLOCK',
      currentArBalance: 42000,
      pendingOrderBalance: 5000,
    },
    {
      customerId: 'cust-02',
      customerName: 'Dhivehi Marine Supply & Engineering',
      creditLimit: 100000,
      enforcementMode: 'SOFT_WARNING',
      currentArBalance: 85000,
      pendingOrderBalance: 12000,
    },
    {
      customerId: 'cust-03',
      customerName: 'Male Yacht Charters',
      creditLimit: 200000,
      enforcementMode: 'UNLIMITED',
      currentArBalance: 30000,
      pendingOrderBalance: 0,
    },
  ]);

  // Credit Simulator State
  const [selectedProfileId, setSelectedProfileId] = useState<string>('cust-01');
  const [simInvoiceAmt, setSimInvoiceAmt] = useState<number>(8000);

  // Dunning Notices State
  const [selectedNotice, setSelectedNotice] = useState<DunningNotice | null>(null);

  const activeProfile = profiles.find((p) => p.customerId === selectedProfileId) || profiles[0];
  const evalResult: CreditEvaluationResult = evaluateCustomerCredit(activeProfile, simInvoiceAmt);

  // Generate Sample Dunning Notices
  const dunningNotices: DunningNotice[] = [
    generateDunningNotice({
      customer: { id: 'cust-01', name: 'Island Horizon Transport Pvt Ltd', email: 'accounts@islandhorizon.mv' },
      invoices: [
        { id: 'inv-401', invoiceNumber: 'INV-2026-0041', dueDate: '2026-08-01', amount: 25000, amountPaid: 0 },
        { id: 'inv-402', invoiceNumber: 'INV-2026-0042', dueDate: '2026-08-10', amount: 17000, amountPaid: 0 },
      ],
      currentDate: '2026-08-28',
    })!,
    generateDunningNotice({
      customer: { id: 'cust-02', name: 'Dhivehi Marine Supply & Engineering', email: 'finance@dhivehimarine.mv' },
      invoices: [
        { id: 'inv-301', invoiceNumber: 'INV-2026-0012', dueDate: '2026-05-15', amount: 85000, amountPaid: 0 },
      ],
      currentDate: '2026-08-28',
    })!,
  ].filter(Boolean);

  return (
    <div className="space-y-6" data-testid="credit-dunning-view">
      {/* Header */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Credit Limit Enforcement & Automated Dunning</h2>
                <Badge variant="warning">AR Risk Control</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Automated customer exposure monitoring, credit blocking, and 3-tier statutory dunning notices.
              </p>
            </div>
          </div>
        </div>
      </Surface>

      {/* Credit Limits & Evaluation Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Credit Directory */}
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock size={16} className="text-rose-400" />
              <span>Customer Credit Limits & Exposure</span>
            </h3>
          </div>

          <div className="space-y-3">
            {profiles.map((p) => {
              const exposure = p.currentArBalance + p.pendingOrderBalance;
              const pct = p.creditLimit > 0 ? Math.min(100, Math.round((exposure / p.creditLimit) * 100)) : 0;
              const isOver = exposure > p.creditLimit && p.enforcementMode !== 'UNLIMITED';

              return (
                <div
                  key={p.customerId}
                  onClick={() => setSelectedProfileId(p.customerId)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer ${
                    selectedProfileId === p.customerId
                      ? 'bg-slate-900 border-rose-500/50 shadow-md'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{p.customerName}</span>
                    <Badge variant={p.enforcementMode === 'HARD_BLOCK' ? 'destructive' : p.enforcementMode === 'SOFT_WARNING' ? 'warning' : 'neutral'}>
                      {p.enforcementMode}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[11px]">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase">Limit</span>
                      <div className="font-bold text-slate-300">
                        {p.enforcementMode === 'UNLIMITED' ? 'Unlimited' : formatMVR(p.creditLimit)}
                      </div>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase">Exposure</span>
                      <div className={`font-bold ${isOver ? 'text-rose-400' : 'text-slate-200'}`}>
                        {formatMVR(exposure)}
                      </div>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase">Utilization</span>
                      <div className={`font-bold ${pct >= 90 ? 'text-rose-400' : pct >= 75 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {pct}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>

        {/* Real-Time Credit Evaluation Simulator */}
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-sky-400" />
            <h3 className="text-sm font-bold text-white">Invoice Credit Evaluator</h3>
          </div>
          <p className="text-xs text-slate-400">
            Simulate new order amount to verify automated credit approval or hard-block enforcement.
          </p>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span>Customer:</span>
              <span className="text-white font-bold">{activeProfile.customerName}</span>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400">Simulate New Invoice Amount</label>
              <input
                type="number"
                value={simInvoiceAmt}
                onChange={(e) => setSimInvoiceAmt(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="flex justify-between text-slate-400">
                <span>Current Exposure:</span>
                <span>{formatMVR(evalResult.currentExposure)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Projected Total Exposure:</span>
                <span className="text-white font-bold">{formatMVR(evalResult.projectedExposure)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Available Credit Balance:</span>
                <span className="text-emerald-400 font-bold">{formatMVR(evalResult.availableCredit)}</span>
              </div>
            </div>

            {/* Verdict Box */}
            <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-sans font-bold ${
              evalResult.isHardBlocked
                ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                : evalResult.excessAmount > 0
                ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
            }`}>
              {evalResult.isHardBlocked ? (
                <>
                  <Ban size={16} className="shrink-0 text-rose-400" />
                  <span>TRANSACTION HARD BLOCKED: Exceeds limit by {formatMVR(evalResult.excessAmount)}</span>
                </>
              ) : evalResult.excessAmount > 0 ? (
                <>
                  <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                  <span>SOFT WARNING: Over limit by {formatMVR(evalResult.excessAmount)} (Manager approval required)</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                  <span>CREDIT APPROVED: Transaction within allowable credit limit</span>
                </>
              )}
            </div>
          </div>
        </Surface>
      </div>

      {/* Automated 3-Tier Dunning Notices */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">Automated Dunning Notices Queue</h3>
          </div>
          <Badge variant="neutral">Overdue AR Queue</Badge>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-mono text-slate-400 uppercase">
                <th className="py-2.5 px-3">Notice ID</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Dunning Escalation Tier</th>
                <th className="py-2.5 px-3 text-right">Overdue Invoices</th>
                <th className="py-2.5 px-3 text-right">Total Overdue</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {dunningNotices.map((n) => (
                <tr key={n.noticeId} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-3 text-slate-400">{n.noticeId}</td>
                  <td className="py-2.5 px-3 font-sans font-medium text-white">{n.customerName}</td>
                  <td className="py-2.5 px-3">
                    <Badge variant={n.tier === 'TIER_3_FINAL_LEGAL' ? 'destructive' : n.tier === 'TIER_2_FORMAL_DEMAND' ? 'warning' : 'neutral'}>
                      {n.tierLabel}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-300">{n.overdueInvoices.length}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-rose-400">{formatMVR(n.totalOverdueAmount)}</td>
                  <td className="py-2.5 px-3 text-center font-sans">
                    <button
                      type="button"
                      onClick={() => setSelectedNotice(n)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Eye size={12} />
                      <span>Preview Notice</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Dunning Notice Preview Modal */}
      {selectedNotice && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedNotice(null)}
        >
          <div
            className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5 text-xs font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">{selectedNotice.tierLabel}</h3>
                <span className="text-xs text-rose-400 font-serif" dir="rtl">{selectedNotice.tierLabelDhivehi}</span>
              </div>
              <Button variant="filled" size="sm" onClick={() => window.print()} icon={<Printer size={14} />}>
                <span>Print Notice</span>
              </Button>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">English Subject & Demand:</span>
                <div className="font-bold text-slate-200">{selectedNotice.subjectEnglish}</div>
                <p className="text-slate-400 text-xs">{selectedNotice.bodyEnglish}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-right" dir="rtl">
                <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">ދިވެހި ބަޔާން (Dhivehi Statutory Demand):</span>
                <div className="font-bold text-slate-200 font-serif text-sm">{selectedNotice.subjectDhivehi}</div>
                <p className="text-slate-300 text-xs font-serif leading-relaxed">{selectedNotice.bodyDhivehi}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedNotice(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
