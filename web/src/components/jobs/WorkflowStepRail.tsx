import React from 'react';
import { CheckCircle2, Lock, UserCheck, ArrowRight } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { COMMAND_SEATS, CommandName, SeatCode } from '../../../../contracts/commands';

export interface JourneyStep {
  readonly code: CommandName;
  readonly name: string;
  readonly requiredSeats: readonly SeatCode[];
  readonly roleLabel: string;
}

// Exactly 13 canonical operational garage steps derived from contracts/commands.ts
export const CANONICAL_JOURNEY_STEPS: readonly JourneyStep[] = [
  { code: 'CALL', name: '1. Customer Call & Inquiry', requiredSeats: COMMAND_SEATS.CALL, roleLabel: 'Counter Staff' },
  { code: 'BOOKING', name: '2. Bay & Slot Booking', requiredSeats: COMMAND_SEATS.BOOKING, roleLabel: 'Counter Staff' },
  { code: 'INTAKE', name: '3. Vehicle Intake & Inspection', requiredSeats: COMMAND_SEATS.INTAKE, roleLabel: 'Counter Staff' },
  { code: 'ESTIMATE', name: '4. Parts & Labor Estimation', requiredSeats: COMMAND_SEATS.ESTIMATE, roleLabel: 'Counter Staff' },
  { code: 'AUTHORISATION', name: '5. Customer Work Authorisation', requiredSeats: COMMAND_SEATS.AUTHORISATION, roleLabel: 'Counter Staff' },
  { code: 'JOB_CARD', name: '6. Work Order / Job Card', requiredSeats: COMMAND_SEATS.JOB_CARD, roleLabel: 'Counter Staff' },
  { code: 'PARTS_PROCUREMENT', name: '7. Parts Allocation & Procurement', requiredSeats: COMMAND_SEATS.PARTS_PROCUREMENT, roleLabel: 'Technician' },
  { code: 'WORK', name: '8. Workshop Execution & Paint', requiredSeats: COMMAND_SEATS.WORK, roleLabel: 'Technician' },
  { code: 'QC', name: '9. Quality Control & Sign-Off', requiredSeats: COMMAND_SEATS.QC, roleLabel: 'QC Inspector' },
  { code: 'HANDOVER', name: '10. Vehicle Handover & Gate Pass', requiredSeats: COMMAND_SEATS.HANDOVER, roleLabel: 'Counter Staff' },
  { code: 'INVOICE', name: '11. MIRA Tax Invoice Generation', requiredSeats: COMMAND_SEATS.INVOICE, roleLabel: 'Counter / Finance' },
  { code: 'INVOICE_PAYMENT', name: '12. Payment Receipt & Settlement', requiredSeats: COMMAND_SEATS.INVOICE_PAYMENT, roleLabel: 'Counter Staff' },
  { code: 'CLOSE', name: '13. Final Job Closure & Archival', requiredSeats: COMMAND_SEATS.CLOSE, roleLabel: 'Counter Staff' },
] as const;

// Explicit canonical mapping from operational garage & legacy workflow statuses to canonical command step codes
export const LEGACY_STATUS_MAP: Record<string, CommandName> = {
  // Call & Booking
  'call': 'CALL',
  'inquiry': 'CALL',
  'booking': 'BOOKING',
  'booked': 'BOOKING',
  'draft': 'BOOKING',

  // Intake
  'intake': 'INTAKE',
  'check-in & inspection': 'INTAKE',
  'check_in': 'INTAKE',
  'check in': 'INTAKE',
  'inspection': 'INTAKE',

  // Estimate & Authorisation & Job Card
  'estimate': 'ESTIMATE',
  'estimation': 'ESTIMATE',
  'awaiting approval': 'AUTHORISATION',
  'authorisation': 'AUTHORISATION',
  'authorization': 'AUTHORISATION',
  'approved': 'JOB_CARD',
  'job_card': 'JOB_CARD',
  'job card': 'JOB_CARD',

  // Parts & Work
  'waiting for material': 'PARTS_PROCUREMENT',
  'parts_procurement': 'PARTS_PROCUREMENT',
  'procurement': 'PARTS_PROCUREMENT',
  'in progress': 'WORK',
  'work': 'WORK',
  'in_progress': 'WORK',
  'surface prep & sanding': 'WORK',
  'surface_prep': 'WORK',
  'spray booth / wrap studio': 'WORK',
  'paint_booth': 'WORK',

  // QC & Handover
  'qc': 'QC',
  'qc_detail': 'QC',
  'detailing, qc & assembly': 'QC',
  'quality control': 'QC',
  'ready for customer delivery': 'HANDOVER',
  'ready_delivery': 'HANDOVER',
  'handover': 'HANDOVER',

  // Invoicing, Payment & Settlement
  'invoiced': 'INVOICE',
  'invoice': 'INVOICE',
  'completed': 'INVOICE',
  'tax invoiced & settled': 'INVOICE_PAYMENT',
  'invoiced_settled': 'INVOICE_PAYMENT',
  'invoice_payment': 'INVOICE_PAYMENT',
  'paid': 'INVOICE_PAYMENT',
  'settled': 'INVOICE_PAYMENT',
  'close': 'CLOSE',
  'closed': 'CLOSE',
  'archived': 'CLOSE',
};

export function resolveCanonicalStepIndex(currentStatus: string): number {
  if (!currentStatus) return 0;
  const normalized = currentStatus.trim().toLowerCase();

  // 1. Direct match on command code
  const directIdx = CANONICAL_JOURNEY_STEPS.findIndex(
    (s) => s.code.toLowerCase() === normalized
  );
  if (directIdx >= 0) return directIdx;

  // 2. Direct match on canonical full name or label
  const nameIdx = CANONICAL_JOURNEY_STEPS.findIndex(
    (s) => s.name.toLowerCase() === normalized ||
           s.name.toLowerCase().replace(/^\d+\.\s*/, '') === normalized
  );
  if (nameIdx >= 0) return nameIdx;

  // 3. Exact dictionary mapping
  const mappedCode = LEGACY_STATUS_MAP[normalized];
  if (mappedCode) {
    const mappedIdx = CANONICAL_JOURNEY_STEPS.findIndex((s) => s.code === mappedCode);
    if (mappedIdx >= 0) return mappedIdx;
  }

  // 4. Substring fallback match on dictionary keys
  for (const [key, code] of Object.entries(LEGACY_STATUS_MAP)) {
    if (normalized.includes(key)) {
      const idx = CANONICAL_JOURNEY_STEPS.findIndex((s) => s.code === code);
      if (idx >= 0) return idx;
    }
  }

  return 0;
}

export interface WorkflowStepRailProps {
  currentStatus: string;
  onAdvance?: (stageName: string) => void;
}

export const WorkflowStepRail: React.FC<WorkflowStepRailProps> = ({ currentStatus, onAdvance }) => {
  const { currentUser, roles, hasPermission } = useERP();

  const userRole = roles.find((r) => r.id === currentUser?.roleId);
  const isSuperAdmin = currentUser?.roleName === 'Super Admin' || !!userRole?.isSystemAdmin;

  const safeIdx = resolveCanonicalStepIndex(currentStatus);
  const currentStep = CANONICAL_JOURNEY_STEPS[safeIdx];
  const nextStep = CANONICAL_JOURNEY_STEPS[safeIdx + 1];

  // Validate if active user holds any authorized seat from COMMAND_SEATS
  const userHoldsSeat = isSuperAdmin || (
    (currentStep.requiredSeats.includes('counter') && hasPermission('jobs', 'create')) ||
    (currentStep.requiredSeats.includes('technician') && (hasPermission('inventory', 'view') || hasPermission('jobs', 'edit'))) ||
    (currentStep.requiredSeats.includes('qc_signer') && (hasPermission('jobs', 'approve') || hasPermission('audit', 'view'))) ||
    (currentStep.requiredSeats.includes('financial_controller') && (hasPermission('invoices', 'view') || hasPermission('payments', 'view')))
  );

  const primaryRequiredSeat = currentStep.requiredSeats[0] || 'counter';

  return (
    <div className="space-y-4 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Work Order Journey (13-Step Pipeline)
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-bold text-slate-900">
              Current: {currentStep.name}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
              Step {safeIdx + 1} of {CANONICAL_JOURNEY_STEPS.length}
            </span>
          </div>
        </div>

        {/* Seat Signpost Badge (SERP-146 / SERP-145) */}
        <div className="flex items-center gap-2">
          {userHoldsSeat ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>You Hold Required Seat: <strong className="font-bold">{primaryRequiredSeat}</strong></span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                Seat Required: <strong className="font-bold">{primaryRequiredSeat}</strong> ({currentStep.roleLabel}) — <span className="font-normal text-amber-900">Ask an administrator to assign the required role in Settings &gt; Users</span>
              </span>
            </div>
          )}

          {nextStep && onAdvance && userHoldsSeat && (
            <button
              onClick={() => onAdvance(nextStep.name)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors"
            >
              <span>Advance to {nextStep.name}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Stepper Grid Rail: 13 Steps */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 xl:grid-cols-13 gap-1.5 pt-1">
        {CANONICAL_JOURNEY_STEPS.map((step, idx) => {
          const isPassed = safeIdx > idx;
          const isCurrent = safeIdx === idx;

          return (
            <div
              key={step.code}
              className={`p-2 rounded-xl border flex flex-col justify-between transition-all ${
                isCurrent
                  ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                  : isPassed
                  ? 'bg-slate-50 border-slate-200 opacity-90'
                  : 'bg-white border-slate-100 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="font-mono text-[9px] font-bold text-slate-500">
                  #{idx + 1}
                </span>
                {isPassed ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                ) : isCurrent ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                ) : null}
              </div>

              <div className="text-[10px] font-semibold text-slate-900 line-clamp-2 leading-tight">
                {step.name.replace(/^\d+\.\s*/, '')}
              </div>

              <div className="mt-1.5 pt-1 border-t border-slate-100 flex items-center justify-between text-[9px]">
                <span className="font-mono text-slate-500 truncate" title={step.roleLabel}>
                  {step.requiredSeats[0]}
                </span>
                <span className={`px-1 py-0.2 rounded text-[8px] font-bold uppercase ${
                  isCurrent ? 'bg-blue-200 text-blue-900' : isPassed ? 'text-emerald-700' : 'text-slate-400'
                }`}>
                  {isCurrent ? 'Active' : isPassed ? 'Done' : 'Next'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
