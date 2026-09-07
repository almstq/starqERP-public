import React from 'react';
import {
  ShieldCheck,
  Key,
  Lock,
  UserCheck,
  AlertTriangle,
  Clock,
  Building2
} from 'lucide-react';
import { Badge } from '../common/Badge';

export const StarqHQSecurity: React.FC = () => {
  const auditLogs = [
    {
      id: 'sec-001',
      action: 'PLATFORM_OPERATOR_SIGNIN',
      actor: 'Ali Mushthaq (Founder / Superadmin)',
      target: 'Starq HQ Control Plane',
      timestamp: '2026-08-27 16:20:00',
      ip: '124.195.208.12 (Dhiraagu Male\')',
      status: 'SUCCESS',
    },
    {
      id: 'sec-002',
      action: 'TENANT_PROVISION_APPLICATION_APPROVED',
      actor: 'Ali Mushthaq',
      target: 'Club Ignition Pvt Ltd (Tenant #1)',
      timestamp: '2026-08-27 15:45:12',
      ip: '124.195.208.12 (Dhiraagu Male\')',
      status: 'SUCCESS',
    },
    {
      id: 'sec-003',
      action: 'MFA_CHALLENGE_VERIFIED',
      actor: 'Ali Mushthaq',
      target: 'Platform Operator Session',
      timestamp: '2026-08-27 15:30:00',
      ip: '124.195.208.12 (Dhiraagu Male\')',
      status: 'SUCCESS',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-3 border-b" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
          Platform Security & Operator Audit Trail
        </h2>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
          Immutable platform governance audit logging for all Starq HQ operator actions and provisioning transactions.
        </p>
      </div>

      {/* Logs Table */}
      <div
        className="rounded-[var(--md-sys-shape-corner-medium)] border overflow-hidden"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr
                className="border-b font-bold text-[var(--md-sys-color-on-surface-variant)] bg-black/5 dark:bg-white/5"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <th className="p-3">Timestamp</th>
                <th className="p-3">Governance Event</th>
                <th className="p-3">Operator Principal</th>
                <th className="p-3">Target Scope</th>
                <th className="p-3">Network Origin</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
              {auditLogs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <td className="p-3 font-mono text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {log.timestamp}
                  </td>
                  <td className="p-3 font-mono font-bold text-[var(--md-sys-color-primary)]">
                    {log.action}
                  </td>
                  <td className="p-3 font-semibold text-[var(--md-sys-color-on-surface)]">
                    {log.actor}
                  </td>
                  <td className="p-3 text-[var(--md-sys-color-on-surface)]">
                    {log.target}
                  </td>
                  <td className="p-3 text-[var(--md-sys-color-on-surface-variant)] font-mono text-[11px]">
                    {log.ip}
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="positive" size="sm">
                      {log.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
