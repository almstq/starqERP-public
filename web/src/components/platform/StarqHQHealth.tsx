import React from 'react';
import {
  Activity,
  Server,
  HardDrive,
  Cpu,
  AlertCircle,
  Database,
  Radio,
  CheckCircle2
} from 'lucide-react';
import { Badge } from '../common/Badge';

export const StarqHQHealth: React.FC = () => {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-3 border-b" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
          Platform Usage & Infrastructure Health
        </h2>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
          Multi-tenant resource consumption, database storage quotas, and edge API health.
        </p>
      </div>

      {/* Disconnected Telemetry Notice */}
      <div
        className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border flex items-start gap-3 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
      >
        <Radio size={18} className="shrink-0 mt-0.5 animate-pulse text-amber-500" />
        <div>
          <strong className="block font-bold">Live Telemetry Daemon Pending Deployment</strong>
          <p className="mt-0.5 leading-relaxed text-[11px]">
            Real-time aggregate metric streaming (PostgreSQL <code>pg_stat_database</code>, storage bucket quotas, and edge response latency) will be wired in <strong>SERP-301</strong> (Production Observability).
          </p>
        </div>
      </div>

      {/* Resource Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div
          className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border space-y-3"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            <span>Database Storage Quota</span>
            <Database size={16} className="text-indigo-500" />
          </div>
          <div className="text-2xl font-black mono-num text-[var(--md-sys-color-on-surface)]">
            4.8 MB / 10 GB
          </div>
          <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-indigo-500 h-full w-[2%]" />
          </div>
          <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
            Total schema, indexes & attachments
          </div>
        </div>

        <div
          className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border space-y-3"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            <span>Active Tenant Connections</span>
            <Cpu size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black mono-num text-[var(--md-sys-color-on-surface)]">
            2 Tenants
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 size={12} />
            <span>Connection pool healthy</span>
          </div>
        </div>

        <div
          className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border space-y-3"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            <span>Edge API Latency (Male')</span>
            <Activity size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black mono-num text-[var(--md-sys-color-on-surface)]">
            ~18 ms
          </div>
          <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
            Direct routing to Singapore / Dhiraagu CDN
          </div>
        </div>
      </div>
    </div>
  );
};
