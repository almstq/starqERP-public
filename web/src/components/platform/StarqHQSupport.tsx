import React from 'react';
import {
  LifeBuoy,
  MessageSquare,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  Building2
} from 'lucide-react';
import { Badge } from '../common/Badge';

export const StarqHQSupport: React.FC = () => {
  const tickets = [
    {
      id: 'TCK-2026-0801',
      tenantName: 'Club Ignition Pvt Ltd',
      subject: 'Inquiry on adding second spray paint bay location in Hulhumale Phase 2',
      category: 'Onboarding & Multi-Location',
      status: 'Open',
      priority: 'Normal',
      createdAt: '2026-08-27 10:15',
    },
    {
      id: 'TCK-2026-0802',
      tenantName: 'Starq Technologies Pvt Ltd',
      subject: 'BML Direct Gateway webhook certificate renewal validation',
      category: 'Technical / Gateway',
      status: 'Resolved',
      priority: 'High',
      createdAt: '2026-08-26 14:20',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <div>
          <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
            Tenant Assistance & Helpdesk Tickets
          </h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            Support requests and technical inquiries submitted by tenant administrators.
          </p>
        </div>

        <Badge variant="accent" size="sm">
          1 Active Ticket
        </Badge>
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        {tickets.map((t) => (
          <div
            key={t.id}
            className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[var(--md-sys-color-primary)]">{t.id}</span>
                <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{t.tenantName}</span>
                <Badge variant={t.status === 'Open' ? 'warning' : 'positive'} size="sm">
                  {t.status}
                </Badge>
              </div>
              <div className="text-[var(--md-sys-color-on-surface)] font-medium">
                {t.subject}
              </div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-3">
                <span>Category: <strong>{t.category}</strong></span>
                <span>Submitted: <strong>{t.createdAt}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                className="px-3 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-semibold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                Respond to Admin
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
