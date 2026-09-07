import React from 'react';
import {
  LifeBuoy,
  AlertOctagon,
  Clock,
  Mail,
  Shield,
  ExternalLink,
  UserCheck,
  CheckCircle2
} from 'lucide-react';

export const SupportTab: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Support Overview Card */}
      <div className="p-6 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xs">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
              Technical Support & SLA Matrix
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
              Transparent operational support with direct executive escalation and business-hour response targets.
            </p>
          </div>
        </div>

        {/* Operating Hours Banner */}
        <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Standard Operating Hours:</strong> Sunday – Thursday, 09:00 – 18:00 MVT (UTC+5).
            </span>
          </div>
          <div className="text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] text-[11px]">
            Friday (Jumu'ah) & Weekend off-hours triaged next business day.
          </div>
        </div>
      </div>

      {/* Severity Tiers & Response Targets */}
      <div className="p-6 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xs">
        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] mb-4 flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-amber-500" />
          <span>Severity Classification & Target Response Times</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] font-semibold">
                <th className="pb-3 pr-4">Tier</th>
                <th className="pb-3 pr-4">Client Impact Definition</th>
                <th className="pb-3 pr-4">Target Initial Triage</th>
                <th className="pb-3">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              <tr>
                <td className="py-3 pr-4 font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Sev-1 (Critical)
                </td>
                <td className="py-3 pr-4 text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] font-medium">
                  <strong>System Down</strong> or <strong>Financial / Ledger Inaccuracy</strong> (invoices/settlements corrupt).
                </td>
                <td className="py-3 pr-4 font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                  &le; 4 Business Hours
                </td>
                <td className="py-3 text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                  Standard Hours + Founder Escalation
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Sev-2 (High)
                </td>
                <td className="py-3 pr-4 text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
                  Core business workflow blocked with no viable workaround (POS payment lock, checkout failure).
                </td>
                <td className="py-3 pr-4 font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                  &le; 12 Business Hours
                </td>
                <td className="py-3 text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                  Standard Business Hours
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Sev-3 (Medium)
                </td>
                <td className="py-3 pr-4 text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
                  Non-critical workflow degraded; operational workaround available (reporting filter defect, non-blocking UI glitch).
                </td>
                <td className="py-3 pr-4 font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                  &le; 24 Business Hours
                </td>
                <td className="py-3 text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                  Next Sprint Deployment
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-bold text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  Sev-4 (Low)
                </td>
                <td className="py-3 pr-4 text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
                  General queries, styling requests, feature improvements.
                </td>
                <td className="py-3 pr-4 font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                  &le; 48 Business Hours
                </td>
                <td className="py-3 text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                  Standard Backlog
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Escalation Ladder & Contact Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Support Routing */}
        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
            <Mail className="w-4 h-4 text-blue-600" />
            <span>Direct Support Inboxes</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/40 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]/60 flex items-center justify-between">
              <div>
                <div className="font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">General Support & Inquiries</div>
                <div className="text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] text-[11px]">Triage and ticket creation</div>
              </div>
              <a
                href="mailto:support@starq.mv"
                className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-mono font-bold hover:underline text-[11px]"
              >
                support@starq.mv
              </a>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 flex items-center justify-between">
              <div>
                <div className="font-bold text-rose-900 dark:text-rose-200">Critical Incident Escalation (Sev-1)</div>
                <div className="text-rose-700 dark:text-rose-300 text-[11px]">Direct executive triage</div>
              </div>
              <a
                href="mailto:urgent@starq.mv"
                className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-mono font-bold hover:underline text-[11px]"
              >
                urgent@starq.mv
              </a>
            </div>
          </div>
        </div>

        {/* Named Escalation Target */}
        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
            <UserCheck className="w-4 h-4 text-indigo-600" />
            <span>Named Escalation Authority</span>
          </div>
          <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-900 dark:text-indigo-200">Ali Musthaq</span>
              <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                Founder & Managing Director
              </span>
            </div>
            <p className="text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] text-[11px]">
              Every unresolved Sev-1 or escalated customer ticket terminates with the founder by name, ensuring decisions and hotfixes have direct executive ownership.
            </p>
            <div className="pt-1 flex items-center justify-between text-[11px]">
              <span className="text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">Escalation Channel:</span>
              <a href="mailto:founder@starq.mv" className="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                founder@starq.mv
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Security & RFC 9116 Policy Link */}
      <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/40 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]/60 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
          <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Security vulnerability or coordinated disclosure? Review our RFC 9116 security policy and safe harbor.
          </span>
        </div>
        <a
          href="/.well-known/security.txt"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold hover:underline shrink-0"
        >
          <span>security.txt</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
