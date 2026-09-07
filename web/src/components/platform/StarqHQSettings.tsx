import React from 'react';
import {
  Settings,
  ShieldCheck,
  Globe,
  Lock,
  Database,
  CheckCircle2,
  Info
} from 'lucide-react';
import { Badge } from '../common/Badge';

export const StarqHQSettings: React.FC = () => {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-3 border-b" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
          Platform Configuration & Infrastructure Status
        </h2>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
          Global platform parameters, authentication authorities, and infrastructure health. Secrets remain encrypted in environment vaults.
        </p>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div
          className="p-5 rounded-[var(--md-sys-shape-corner-medium)] border space-y-3"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-[var(--md-sys-color-on-surface)]">
              <Globe size={16} className="text-[var(--md-sys-color-primary)]" />
              <span>Production Origin & Domains</span>
            </div>
            <Badge variant="warning" size="sm">Pending Production Verification (SERP-299)</Badge>
          </div>
          <div className="space-y-1.5 text-[var(--md-sys-color-on-surface-variant)]">
            <div className="flex justify-between">
              <span>Primary Web Domain:</span>
              <span className="font-mono font-semibold text-[var(--md-sys-color-on-surface)]">starqerp.mv</span>
            </div>
            <div className="flex justify-between">
              <span>Local Dev Instance:</span>
              <span className="font-mono font-semibold text-[var(--md-sys-color-on-surface)]">localhost:3000</span>
            </div>
            <div className="flex justify-between">
              <span>SSL / TLS Certificate:</span>
              <span className="font-semibold text-amber-600">Pending Verification</span>
            </div>
          </div>
        </div>

        <div
          className="p-5 rounded-[var(--md-sys-shape-corner-medium)] border space-y-3"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-[var(--md-sys-color-on-surface)]">
              <Lock size={16} className="text-emerald-500" />
              <span>Google OAuth Identity Authority</span>
            </div>
            <Badge variant="positive" size="sm">Configured</Badge>
          </div>
          <div className="space-y-1.5 text-[var(--md-sys-color-on-surface-variant)]">
            <div className="flex justify-between">
              <span>Client ID:</span>
              <span className="font-mono text-[11px] text-[var(--md-sys-color-on-surface)]">901212915429-***.apps.googleusercontent.com</span>
            </div>
            <div className="flex justify-between">
              <span>Identity Provider:</span>
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">Google Identity Services (GIS)</span>
            </div>
            <div className="flex justify-between">
              <span>Secret Storage:</span>
              <span className="font-semibold text-emerald-600">Encrypted in Supabase Vault</span>
            </div>
          </div>
        </div>

        <div
          className="p-5 rounded-[var(--md-sys-shape-corner-medium)] border space-y-3"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-[var(--md-sys-color-on-surface)]">
              <Database size={16} className="text-indigo-500" />
              <span>Database & Disaster Recovery</span>
            </div>
            <Badge variant="warning" size="sm">Verification Pending</Badge>
          </div>
          <div className="space-y-1.5 text-[var(--md-sys-color-on-surface-variant)]">
            <div className="flex justify-between">
              <span>Continuous WAL Archiving:</span>
              <span className="font-semibold text-amber-600">Restore Drill Pending</span>
            </div>
            <div className="flex justify-between">
              <span>Snapshot Frequency:</span>
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">Daily at 02:00 MVT</span>
            </div>
            <div className="flex justify-between">
              <span>Retention Period:</span>
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">30 Days</span>
            </div>
          </div>
        </div>

        <div
          className="p-5 rounded-[var(--md-sys-shape-corner-medium)] border space-y-3"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-[var(--md-sys-color-on-surface)]">
              <ShieldCheck size={16} className="text-amber-500" />
              <span>Maldives Regulatory Defaults</span>
            </div>
            <Badge variant="accent" size="sm">MIRA 2026</Badge>
          </div>
          <div className="space-y-1.5 text-[var(--md-sys-color-on-surface-variant)]">
            <div className="flex justify-between">
              <span>General Goods GST Rate:</span>
              <span className="font-mono font-bold text-[var(--md-sys-color-on-surface)]">8.0%</span>
            </div>
            <div className="flex justify-between">
              <span>Tourism Sector TGST Rate:</span>
              <span className="font-mono font-bold text-[var(--md-sys-color-on-surface)]">16.0%</span>
            </div>
            <div className="flex justify-between">
              <span>Default Currency:</span>
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">MVR (Maldivian Rufiyaa)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
