import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  Landmark,
  Users,
  GitBranch,
  Save,
  CheckCircle2,
  Lock,
  Globe,
  Sparkles,
  MapPin,
  LifeBuoy,
  Image as ImageIcon,
  Info,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { GstRegistrationStatus } from '../../types/erp';
import { Badge } from '../common/Badge';
import { RolesPermissionsTab } from './RolesPermissionsTab';
import { UsersManagementTab } from './UsersManagementTab';
import { WorkflowsConfigTab } from './WorkflowsConfigTab';
import { SupportTab } from './SupportTab';
import { LogoUpload } from './LogoUpload';
import { AboutTab } from './AboutTab';

type SettingsSubTab = 'profile' | 'branding' | 'roles' | 'users' | 'workflows' | 'support' | 'about';

interface TabConfig {
  id: SettingsSubTab;
  label: string;
  shortLabel: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const SETTINGS_TABS: TabConfig[] = [
  {
    id: 'profile',
    label: 'Organisation Profile & Tax',
    shortLabel: 'Profile & Tax',
    desc: 'Business identity, MIRA TIN, GST status & bank settlement',
    icon: Building2,
  },
  {
    id: 'branding',
    label: 'Branding & Logo',
    shortLabel: 'Branding & Logo',
    desc: 'Official company logo for invoices, quotations & top chrome',
    icon: ImageIcon,
  },
  {
    id: 'roles',
    label: 'Roles & Permissions',
    shortLabel: 'Roles & Permissions',
    desc: 'Segregation of duties, capabilities & access matrix',
    icon: ShieldCheck,
  },
  {
    id: 'users',
    label: 'Users & Authorizations',
    shortLabel: 'Users & Staff',
    desc: 'Active team members, seats & authentication credentials',
    icon: Users,
  },
  {
    id: 'workflows',
    label: 'Configurable Workflows',
    shortLabel: 'Workflows',
    desc: 'Multi-stage approval gates & garage workflow automation',
    icon: GitBranch,
  },
  {
    id: 'support',
    label: 'Support & Escalation',
    shortLabel: 'Support & Help',
    desc: 'Technical escalation paths & starqERP support contacts',
    icon: LifeBuoy,
  },
  {
    id: 'about',
    label: 'About starqERP',
    shortLabel: 'About starqERP',
    desc: 'System architecture, platform manifest & software release info',
    icon: Info,
  },
];

export const SettingsView: React.FC = () => {
  const { currentTenant, updateTenant, updateTenantLogo, currentBook, currentArchetype } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = (searchParams.get('tab') as SettingsSubTab) || 'profile';
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Local state for current tenant editing
  const [name, setName] = useState(currentTenant.name);
  const [legalName, setLegalName] = useState(currentTenant.legalName);
  const [tinNumber, setTinNumber] = useState(currentTenant.tinNumber);
  const [gstStatus, setGstStatus] = useState<GstRegistrationStatus>(currentTenant.gstStatus || 'not_registered');
  const [gstRate, setGstRate] = useState(currentTenant.gstRate || 8);
  const [bmlAccount, setBmlAccount] = useState(currentTenant.bmlAccount || '');
  const [address, setAddress] = useState(currentTenant.address);
  const [phone, setPhone] = useState(currentTenant.phone);
  const [email, setEmail] = useState(currentTenant.email);
  const [island, setIsland] = useState(currentTenant.island);

  useEffect(() => {
    setName(currentTenant.name);
    setLegalName(currentTenant.legalName);
    setTinNumber(currentTenant.tinNumber);
    setGstStatus(currentTenant.gstStatus || 'not_registered');
    setGstRate(currentTenant.gstRate || 8);
    setBmlAccount(currentTenant.bmlAccount || '');
    setAddress(currentTenant.address);
    setPhone(currentTenant.phone);
    setEmail(currentTenant.email);
    setIsland(currentTenant.island);
  }, [currentTenant]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateTenant({
      name,
      legalName,
      tinNumber,
      gstStatus,
      gstRate,
      bmlAccount,
      address,
      phone,
      email,
      island,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const currentTab = SETTINGS_TABS.find((t) => t.id === activeSubTab) || SETTINGS_TABS[0];

  return (
    <div className="space-y-6 max-w-7xl pb-12 w-full min-w-0">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--md-sys-color-outline-variant)]/60 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">
              Tenant & System Settings
            </h1>
            <span className="text-[var(--md-sys-color-outline-variant)] font-light">/</span>
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-bold"
              style={{
                backgroundColor: 'var(--md-sys-color-secondary-container)',
                color: 'var(--md-sys-color-on-secondary-container)',
              }}
            >
              {currentTab.label}
            </span>
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-[var(--md-sys-color-outline-variant)]"
              style={{
                backgroundColor: 'var(--md-sys-color-primary-container)',
                color: 'var(--md-sys-color-on-primary-container)',
              }}
            >
              {currentTenant.name}
            </span>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
            {currentTab.desc}
          </p>
        </div>
      </div>

      {/* Main Content Area: 100% Full Width */}
      <div className="w-full min-w-0">
        {activeSubTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-6 animate-in fade-in">
            {savedSuccess && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Organisation Settings Saved & Audited Successfully!</span>
              </div>
            )}

            {/* Legal & Invoicing Identity */}
            <div
              className="p-5 sm:p-6 rounded-[var(--md-sys-shape-corner-large)] border space-y-5"
              style={{
                backgroundColor: 'var(--md-sys-color-surface)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--md-sys-color-primary)] uppercase tracking-wider">
                <Building2 size={16} />
                <span>Organisation Identity & Invoicing Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    Tenant Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    Registered Legal Entity Name
                  </label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    Active Book & Operating Archetype
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`${currentBook ? `[${currentBook.code}] ${currentBook.name}` : currentTenant.name} — ${currentArchetype.name}`}
                    className="w-full px-3.5 py-2 text-xs border rounded-xl opacity-90 cursor-not-allowed font-medium"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  />
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    {currentTenant.books && currentTenant.books.length > 0
                      ? `Operating books: ${currentTenant.books.map((b) => `[${b.code}] ${b.name}`).join(' · ')}`
                      : `Archetype: ${currentArchetype.name}`}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    Registered Island
                  </label>
                  <select
                    value={island}
                    onChange={(e) => setIsland(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  >
                    <option value="Male'">Male'</option>
                    <option value="Hulhumale' (Phase 1 / Phase 2)">Hulhumale' (Phase 1 / Phase 2)</option>
                    <option value="Vilimale'">Vilimale'</option>
                    <option value="Addu City">Addu City</option>
                    <option value="Fuvahmulah">Fuvahmulah</option>
                    <option value="Kulhudhuffushi">Kulhudhuffushi</option>
                    <option value="Other / Atoll Site">Other / Atoll Site</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    Physical Registered Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    Official Contact Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    Accounts & Tax Inquiries Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* MIRA & Statutory Compliance */}
            <div
              className="p-5 sm:p-6 rounded-[var(--md-sys-shape-corner-large)] border space-y-5"
              style={{
                backgroundColor: 'var(--md-sys-color-surface)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--md-sys-color-primary)] uppercase tracking-wider">
                <Landmark size={16} />
                <span>MIRA Tax Compliance & Banking Settlement</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    MIRA GST Statutory Registration Status
                  </label>
                  <select
                    value={gstStatus}
                    onChange={(e) => {
                      const newStatus = e.target.value as GstRegistrationStatus;
                      setGstStatus(newStatus);
                      if (newStatus === 'not_registered') {
                        setGstRate(0);
                      } else if (newStatus === 'registered' && gstRate === 0) {
                        setGstRate(8);
                      }
                    }}
                    className="w-full px-3.5 py-2 text-xs border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  >
                    <option value="registered">Registered with MIRA (Statutory GST filing enabled)</option>
                    <option value="not_registered">Not Registered (0% GST · Threshold monitoring)</option>
                    <option value="pending">Pending Application with MIRA</option>
                  </select>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    {gstStatus === 'not_registered'
                      ? 'Organisation is not registered with MIRA. All transactions are assessed at 0% GST until statutory registration threshold is reached.'
                      : 'Statutory MIRA GST returns and tax invoice sequencing active.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    MIRA GST TIN Registration Number
                  </label>
                  <input
                    type="text"
                    value={tinNumber}
                    onChange={(e) => setTinNumber(e.target.value)}
                    placeholder="Enter registered TIN, if configured"
                    className="w-full px-3.5 py-2 text-xs font-mono font-bold text-blue-600 border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    Applicable GST Rate (%)
                  </label>
                  <select
                    value={gstStatus === 'not_registered' ? 0 : gstRate}
                    disabled={gstStatus === 'not_registered'}
                    onChange={(e) => setGstRate(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)] disabled:opacity-75 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  >
                    {gstStatus === 'not_registered' ? (
                      <option value={0}>0% (Non-Registered with MIRA)</option>
                    ) : (
                      <>
                        <option value={8}>8% General Goods & Services Tax (GGST)</option>
                        <option value={0}>0% Zero-Rated / Exempt</option>
                        <option value={16}>16% Tourism Sector (TGST)</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                    Primary Settlement Bank Account
                  </label>
                  <input
                    type="text"
                    value={bmlAccount}
                    onChange={(e) => setBmlAccount(e.target.value)}
                    placeholder="Enter configured settlement account"
                    className="w-full px-3.5 py-2 text-xs font-mono border rounded-xl outline-none focus:border-[var(--md-sys-color-primary)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface)',
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer hover:shadow-lg"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary)',
                  color: 'var(--md-sys-color-on-primary)',
                }}
              >
                <Save className="w-4 h-4" />
                <span>Save Tenant Profile</span>
              </button>
            </div>
          </form>
        )}

        {activeSubTab === 'branding' && (
          <div className="space-y-6 animate-in fade-in">
            <LogoUpload
              currentLogoUrl={currentTenant.logoUrl}
              entityName={currentTenant.name}
              onSaveLogo={(url) => updateTenantLogo(url)}
              title="Organisation / Business Logo"
              description="Upload an official business logo for invoices, quotations, top chrome, and client headers. Supports PNG, WebP, JPEG, and SVG up to 2MB."
              defaultLogoUrl="/club-ignition-logo.png"
            />
          </div>
        )}

        {activeSubTab === 'roles' && <RolesPermissionsTab />}

        {activeSubTab === 'users' && <UsersManagementTab />}

        {activeSubTab === 'workflows' && <WorkflowsConfigTab />}

        {activeSubTab === 'support' && <SupportTab />}

        {activeSubTab === 'about' && <AboutTab />}
      </div>
    </div>
  );
};
