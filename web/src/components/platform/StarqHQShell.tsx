import React, { useState } from 'react';
import { useERP } from '../../context/ERPContext';
import {
  LayoutDashboard,
  ClipboardList,
  Building2,
  Layers,
  Sparkles,
  CreditCard,
  Activity,
  LifeBuoy,
  ShieldCheck,
  Settings,
  Plus
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { StarqHQOverview } from './StarqHQOverview';
import { StarqHQApplications } from './StarqHQApplications';
import { StarqHQTenants } from './StarqHQTenants';
import { StarqHQProvisioning } from './StarqHQProvisioning';
import { StarqHQSubscriptions } from './StarqHQSubscriptions';
import { StarqHQBilling } from './StarqHQBilling';
import { StarqHQHealth } from './StarqHQHealth';
import { StarqHQSupport } from './StarqHQSupport';
import { StarqHQSecurity } from './StarqHQSecurity';
import { StarqHQSettings } from './StarqHQSettings';

export type PlatformTabId =
  | 'overview'
  | 'applications'
  | 'tenants'
  | 'provisioning'
  | 'subscriptions'
  | 'billing'
  | 'health'
  | 'support'
  | 'audit'
  | 'settings';

interface Props {
  activeTab?: PlatformTabId;
  onSelectTab?: (tab: PlatformTabId) => void;
}

export const StarqHQShell: React.FC<Props> = ({
  activeTab: controlledTab,
  onSelectTab: controlledOnSelectTab
}) => {
  const [internalTab, setInternalTab] = useState<PlatformTabId>('overview');
  const activeTab = controlledTab || internalTab;
  const setActiveTab = controlledOnSelectTab || setInternalTab;

  const { pendingApplications, setIsRegisterOrgModalOpen } = useERP();
  const pendingCount = pendingApplications.filter((a) => a.status === 'pending_approval').length;

  return (
    <div className="space-y-6">
      {/* Top Banner with Platform Identification */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 font-mono"
              style={{
                backgroundColor: 'var(--md-sys-color-primary)',
                color: 'var(--md-sys-color-on-primary)',
              }}
            >
              <ShieldCheck size={12} />
              Starq HQ SaaS Control Plane
            </span>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              · SaaS Provider Operating System
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--md-sys-color-on-surface)]">
            Platform Operator Console
          </h1>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            Manage customer tenant applications, provisioning pipelines, SaaS subscriptions, and platform security.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRegisterOrgModalOpen(true)}
            className="px-3.5 py-2 rounded-[var(--md-sys-shape-corner-small)] text-xs font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer"
            style={{
              backgroundColor: 'var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-on-primary)',
            }}
          >
            <Plus size={15} />
            <span>New Business Intake</span>
          </button>
        </div>
      </div>

      {/* Control Plane Tab Content */}
      <div>
        {activeTab === 'overview' && <StarqHQOverview onNavigateTab={(t) => setActiveTab(t as PlatformTabId)} />}
        {activeTab === 'applications' && <StarqHQApplications />}
        {activeTab === 'tenants' && <StarqHQTenants />}
        {activeTab === 'provisioning' && <StarqHQProvisioning />}
        {activeTab === 'subscriptions' && <StarqHQSubscriptions />}
        {activeTab === 'billing' && <StarqHQBilling />}
        {activeTab === 'health' && <StarqHQHealth />}
        {activeTab === 'support' && <StarqHQSupport />}
        {activeTab === 'audit' && <StarqHQSecurity />}
        {activeTab === 'settings' && <StarqHQSettings />}
      </div>
    </div>
  );
};
