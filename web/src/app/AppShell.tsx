import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useERP } from '../context/ERPContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { StarqLogomark } from '../components/brand/StarqLogo';
import { MfaSetupModal } from '../components/auth/MfaSetupModal';
import { MfaChallengeModal } from '../components/auth/MfaChallengeModal';
import { GlobalSearchModal } from '../components/common/GlobalSearchModal';
import { StarqAICopilot } from '../components/ai/StarqAICopilot';
import { CreateJobModal } from '../components/jobs/CreateJobModal';
import { CreateInvoiceModal } from '../components/invoices/CreateInvoiceModal';
import { RecordPaymentModal } from '../components/payments/RecordPaymentModal';
import { RegisterOrganisationModal } from '../components/onboarding/RegisterOrganisationModal';
import { PendingApprovalView } from '../components/onboarding/PendingApprovalView';
import { OnboardingGatewayView } from '../components/onboarding/OnboardingGatewayView';
import { Badge } from '../components/common/Badge';
import { getFormattedProductVersion } from '../../../contracts/commands';
import {
  LayoutDashboard,
  Users,
  Wrench,
  FileText,
  CreditCard,
  Receipt,
  Package,
  ShoppingCart,
  Truck,
  BarChart3,
  ShieldCheck,
  Settings as SettingsIcon,
  Search,
  Menu,
  X,
  Moon,
  Sun,
  Laptop,
  ChevronDown,
  Sparkles,
  LogOut,
  Building2,
  Image as ImageIcon,
  GitBranch,
  LifeBuoy,
  Info,
  Plus,
  ClipboardList,
  Layers,
  Activity,
  Landmark,
} from 'lucide-react';
import { StarqHQShell, PlatformTabId } from '../components/platform/StarqHQShell';

export type MaterialWindowClass = 'compact' | 'medium' | 'expanded' | 'large' | 'extra-large';

export function useMaterialWindowClass(): MaterialWindowClass {
  const [windowClass, setWindowClass] = useState<MaterialWindowClass>(() => {
    if (typeof window === 'undefined') return 'expanded';
    const w = window.innerWidth;
    if (w < 600) return 'compact';
    if (w < 840) return 'medium';
    if (w < 1200) return 'expanded';
    if (w < 1600) return 'large';
    return 'extra-large';
  });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < 600) setWindowClass('compact');
      else if (w < 840) setWindowClass('medium');
      else if (w < 1200) setWindowClass('expanded');
      else if (w < 1600) setWindowClass('large');
      else setWindowClass('extra-large');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowClass;
}

const NAV = [
  { to: '/',            label: 'Dashboard',        Icon: LayoutDashboard, end: true, section: 'workspace' as const },
  { to: '/customers',   label: 'Customers',        Icon: Users, section: 'workspace' as const },
  { to: '/jobs',        label: 'Jobs / Work Orders', Icon: Wrench, section: 'workspace' as const },
  { to: '/invoices',    label: 'Invoices',         Icon: FileText, section: 'workspace' as const },
  { to: '/payments',    label: 'Payments',         Icon: CreditCard, section: 'workspace' as const },
  { to: '/expenses',    label: 'Expenses',         Icon: Receipt, section: 'workspace' as const },
  { to: '/accounts',    label: 'Chart of Accounts', Icon: Landmark, section: 'workspace' as const },
  { to: '/inventory',   label: 'Inventory',        Icon: Package, section: 'workspace' as const },
  { to: '/purchasing',  label: 'Purchasing',       Icon: ShoppingCart, section: 'workspace' as const },
  { to: '/suppliers',   label: 'Suppliers',        Icon: Truck, section: 'workspace' as const },
  { to: '/reports',     label: 'Reports',          Icon: BarChart3, section: 'workspace' as const },
  { to: '/audit',       label: 'Audit Trail',      Icon: ShieldCheck, section: 'system' as const },
  { to: '/settings',    label: 'Settings',         Icon: SettingsIcon, section: 'system' as const },
];

const NAV_SECTION_LABEL: Record<'workspace' | 'system', string> = {
  workspace: 'Workspace',
  system: 'System / Administration',
};

export const PLATFORM_NAV: Array<{
  id: PlatformTabId;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  badgeKey?: string;
}> = [
  { id: 'overview',      label: 'Overview',              Icon: LayoutDashboard },
  { id: 'applications',  label: 'Applications',          Icon: ClipboardList, badgeKey: 'pendingApplications' },
  { id: 'tenants',       label: 'Tenants',               Icon: Building2 },
  { id: 'provisioning',  label: 'Provisioning',          Icon: Layers },
  { id: 'subscriptions', label: 'Subscriptions & Plans', Icon: Sparkles },
  { id: 'billing',       label: 'Billing',               Icon: CreditCard },
  { id: 'health',        label: 'Usage & Health',        Icon: Activity },
  { id: 'support',       label: 'Support',               Icon: LifeBuoy },
  { id: 'audit',         label: 'Audit & Security',      Icon: ShieldCheck },
  { id: 'settings',      label: 'Platform Settings',     Icon: SettingsIcon },
];

export const SETTINGS_SUBNAV = [
  { id: 'profile',   label: 'Profile & Tax',       Icon: Building2 },
  { id: 'branding',  label: 'Branding & Logo',     Icon: ImageIcon },
  { id: 'roles',     label: 'Roles & Permissions', Icon: ShieldCheck },
  { id: 'users',     label: 'Users & Staff',       Icon: Users },
  { id: 'workflows', label: 'Workflows',           Icon: GitBranch },
  { id: 'support',   label: 'Support & Help',      Icon: LifeBuoy },
  { id: 'about',     label: 'About starqERP',      Icon: Info },
];

const MODULE_SUBNAV: Record<string, typeof SETTINGS_SUBNAV> = {
  '/settings': SETTINGS_SUBNAV,
  '/accounts': [
    { id: 'chart_of_accounts', label: 'Chart of Accounts', Icon: Landmark },
    { id: 'general_ledger', label: 'General Ledger', Icon: FileText },
    { id: 'periods', label: 'Period Lock & Year-End', Icon: ShieldCheck },
    { id: 'bank_reconciliation', label: 'Bank Reconciliation', Icon: CreditCard },
    { id: 'multi_currency', label: 'Multi-Currency & FX', Icon: Sparkles },
  ],
  '/reports': [
    { id: 'statements', label: 'Financial Statements', Icon: FileText },
    { id: 'aging', label: 'AR / AP Aging', Icon: CreditCard },
    { id: 'analytics', label: 'Operational Analytics', Icon: BarChart3 },
    { id: 'mira_gst_201', label: 'MIRA GST-201', Icon: Receipt },
    { id: 'mira_tgst_16', label: '16% TGST & Green Tax', Icon: Building2 },
    { id: 'cash_flow', label: 'Cash Flow (IFRS)', Icon: Activity },
  ],
  '/invoices': [
    { id: 'invoices', label: 'Commercial Invoices', Icon: FileText },
    { id: 'credits_advances', label: 'Credit Notes & Advances', Icon: Receipt },
    { id: 'allocations', label: 'Settlement Allocations', Icon: Sparkles },
  ],
};

export const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentTenant,
    currentBook,
    activePlane,
    tenants,
    switchActiveContext,
    setIsGlobalSearchOpen,
    isRegisterOrgModalOpen,
    setIsRegisterOrgModalOpen
  } = useERP();
  const { session, isLoading, logout } = useAuth();
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [collapsedModuleMenus, setCollapsedModuleMenus] = useState<Set<string>>(() => new Set());
  const [mobileExpandedModuleMenus, setMobileExpandedModuleMenus] = useState<Set<string>>(
    () => new Set(MODULE_SUBNAV[location.pathname] ? [location.pathname] : []),
  );
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const [platformTab, setPlatformTab] = useState<PlatformTabId>('overview');
  const { pendingApplications } = useERP();

  const isPlatformOperator = Boolean(session?.platform_entitlement);

  // Safeguard: Automatically fallback to tenant plane if active user lacks platform entitlement
  useEffect(() => {
    if (!isPlatformOperator && activePlane === 'platform') {
      switchActiveContext({ plane: 'tenant' });
    }
  }, [isPlatformOperator, activePlane, switchActiveContext]);

  const workspace = activePlane === 'platform'
    ? 'Starq HQ'
    : currentBook
      ? `${currentTenant?.name} (${currentBook.name})`
      : currentTenant?.name || 'No organisation';

  const initials = activePlane === 'platform'
    ? 'HQ'
    : (currentTenant?.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const hasSessionOrgs = (session?.organisations?.length ?? 0) > 0 || (session?.allowed_entities?.length ?? 0) > 0;
  const applicantPending =
    session?.application?.status === 'pending' ||
    session?.application?.status === 'info_requested' ||
    pendingApplications.some((a) => a.status === 'pending_approval');

  // Safeguard: Operator without tenant orgs defaults directly to platform plane (Starq HQ)
  const effectivePlane = isPlatformOperator && !hasSessionOrgs ? 'platform' : activePlane;

  useEffect(() => {
    if (isPlatformOperator && !hasSessionOrgs && activePlane === 'tenant') {
      switchActiveContext({ plane: 'platform' });
    }
  }, [isPlatformOperator, hasSessionOrgs, activePlane, switchActiveContext]);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname, activePlane, platformTab]);

  const isMoreActive = [
    '/inventory',
    '/purchasing',
    '/suppliers',
    '/expenses',
    '/payments',
    '/reports',
    '/audit',
    '/settings',
  ].some((path) => location.pathname.startsWith(path));

  // SERP-401 (Reference Route-Guard Isolation):
  // When an authenticated user has zero organisations and is not operating in the platform plane,
  // hard-block access to the operational shell, navigation rails, header, and dashboard.
  if (session && !hasSessionOrgs && effectivePlane !== 'platform') {
    if (applicantPending) {
      return <PendingApprovalView />;
    }
    return <OnboardingGatewayView />;
  }

  return (
    <div
      className="flex min-h-screen w-full"
      style={{
        backgroundColor: 'var(--md-sys-color-surface)',
        color: 'var(--md-sys-color-on-surface)',
      }}
    >
      {/* Accessible skip-link for keyboard navigation (SERP-035) */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* ── 1. MATERIAL 3 NAVIGATION RAIL & PERSISTENT DRAWER (>= 1024px) ── */}
      <aside
        className="hidden lg:flex shrink-0 flex-col w-60 lg:w-64 sticky top-0 h-screen overflow-y-auto"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-low)',
          borderRight: '1px solid var(--md-sys-color-outline-variant)',
        }}
        aria-label="Main Navigation Rail"
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-4 shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[var(--md-sys-shape-corner-medium)] shrink-0"
            style={{
              backgroundColor: activePlane === 'platform' ? '#4338ca' : 'var(--md-sys-color-primary)',
              color: '#ffffff',
            }}
          >
            <StarqLogomark size={18} />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[16px] font-semibold tracking-tight truncate" style={{ color: 'var(--md-sys-color-on-surface)' }}>
              <span>starq</span>
              <span
                className="mono-num text-[11px] font-bold ml-1 px-1.5 py-0.5 rounded-[var(--md-sys-shape-corner-small)]"
                style={{
                  backgroundColor: activePlane === 'platform' ? '#4338ca' : 'var(--md-sys-color-primary-container)',
                  color: activePlane === 'platform' ? '#ffffff' : 'var(--md-sys-color-on-primary-container)',
                }}
              >
                {activePlane === 'platform' ? 'HQ' : 'ERP'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2 overflow-y-auto" aria-label="Modules">
          {activePlane === 'platform' ? (
            PLATFORM_NAV.map(({ id, label, Icon, badgeKey }) => {
              const isActive = platformTab === id;
              const badgeCount =
                badgeKey === 'pendingApplications'
                  ? pendingApplications.filter((a) => a.status === 'pending_approval').length
                  : 0;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlatformTab(id)}
                  className={`group relative overflow-hidden flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--md-sys-shape-corner-full)] text-xs font-medium transition-all duration-150 text-left w-full cursor-pointer ${
                    isActive ? 'font-semibold' : ''
                  }`}
                  style={
                    isActive
                      ? {
                          backgroundColor: 'var(--md-sys-color-secondary-container)',
                          color: 'var(--md-sys-color-on-secondary-container)',
                        }
                      : {
                          color: 'var(--md-sys-color-on-surface-variant)',
                        }
                  }
                >
                  <span
                    className="absolute inset-0 pointer-events-none rounded-[inherit] transition-opacity duration-150 opacity-0 group-hover:opacity-[var(--md-sys-state-hover-opacity)] group-active:opacity-[var(--md-sys-state-pressed-opacity)] bg-current"
                    aria-hidden="true"
                  />
                  <Icon size={17} strokeWidth={1.9} aria-hidden="true" className="relative z-10 shrink-0" />
                  <span className="relative z-10 truncate flex-1">{label}</span>
                  {badgeCount > 0 && (
                    <span className="relative z-10 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            NAV.map(({ to, label, Icon, end, section }, index) => {
              const subnav = MODULE_SUBNAV[to];
              const inModule = location.pathname.startsWith(to);
              const searchParams = new URLSearchParams(location.search);
              const currentTab = searchParams.get('tab') || subnav?.[0]?.id;
              const isExpanded = Boolean(subnav && inModule && !collapsedModuleMenus.has(to));
              const showSectionDivider = index > 0 && NAV[index - 1].section !== section;

              return (
                <React.Fragment key={to}>
                  {showSectionDivider && (
                    <div
                      className="mt-3 mb-1 pt-3 px-3.5"
                      style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}
                      aria-hidden="true"
                    >
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: 'var(--md-sys-color-on-surface-variant)', opacity: 0.7 }}
                      >
                        {NAV_SECTION_LABEL[section]}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col">
                  <NavLink
                    to={to}
                    end={end}
                    aria-expanded={subnav ? isExpanded : undefined}
                    onClick={(event) => {
                      if (!subnav) return;
                      if (inModule) {
                        event.preventDefault();
                        setCollapsedModuleMenus((current) => {
                          const next = new Set(current);
                          if (next.has(to)) next.delete(to); else next.add(to);
                          return next;
                        });
                      } else {
                        setCollapsedModuleMenus((current) => {
                          const next = new Set(current);
                          next.delete(to);
                          return next;
                        });
                      }
                    }}
                    className={({ isActive }) =>
                      `group relative overflow-hidden flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--md-sys-shape-corner-full)] text-xs font-medium transition-all duration-150 ${
                        isActive ? 'font-semibold' : ''
                      } ${section === 'system' && !isActive ? 'opacity-80' : ''}`
                    }
                    style={({ isActive }) =>
                      isActive
                        ? {
                            backgroundColor: 'var(--md-sys-color-secondary-container)',
                            color: 'var(--md-sys-color-on-secondary-container)',
                          }
                        : {
                            color: 'var(--md-sys-color-on-surface-variant)',
                          }
                    }
                  >
                    {/* State Layer */}
                    <span
                      className="absolute inset-0 pointer-events-none rounded-[inherit] transition-opacity duration-150 opacity-0 group-hover:opacity-[var(--md-sys-state-hover-opacity)] group-active:opacity-[var(--md-sys-state-pressed-opacity)] bg-current"
                      aria-hidden="true"
                    />
                    <Icon size={17} strokeWidth={section === 'system' ? 1.7 : 1.9} aria-hidden="true" className="relative z-10 shrink-0" />
                    <span className="relative z-10 truncate flex-1">{label}</span>
                    {subnav && (
                      <ChevronDown
                        size={14}
                        className={`relative z-10 transition-transform duration-200 ${
                          isExpanded
                            ? 'rotate-180 text-[var(--md-sys-color-primary)]'
                            : 'text-[var(--md-sys-color-on-surface-variant)]/60'
                        }`}
                      />
                    )}
                  </NavLink>

                  {/* Persistent module destinations use the same nested sidebar language. */}
                  {subnav && isExpanded && (
                    <div className="ml-5 pl-3 my-1 flex flex-col gap-0.5 border-l-2 border-[var(--md-sys-color-outline-variant)]/70 animate-in fade-in duration-150" aria-label={`${label} sections`}>
                      {subnav.map((sub) => {
                        const isSubActive = currentTab === sub.id;
                        return (
                          <NavLink
                            key={sub.id}
                            to={`${to}?tab=${sub.id}`}
                            aria-current={isSubActive ? 'page' : undefined}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] ${
                              isSubActive
                                ? 'font-bold bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] shadow-xs'
                                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]'
                            }`}
                          >
                            <sub.Icon size={13} strokeWidth={1.8} className="shrink-0" />
                            <span className="truncate">{sub.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </React.Fragment>
              );
            })
          )}
        </nav>

        {/* System Footer */}
        <div
          className="px-5 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}
        >
          <div
            className="flex items-center justify-between text-[11px]"
            style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
          >
            <span
              className="mono-num font-medium"
              title={typeof __BUILD_TIME__ !== 'undefined' ? `Built: ${__BUILD_TIME__}` : undefined}
            >
              {activePlane === 'platform'
                ? `Starq HQ v2026.08 (${typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'})`
                : `starqERP ${getFormattedProductVersion()} (${typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'})`}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--positive)' }} />
              <span>{activePlane === 'platform' ? 'Control Plane' : 'Online'}</span>
            </span>
          </div>
        </div>
      </aside>

      {/* ── 2. MOBILE / TABLET SLIDE-OVER DRAWER (< 1024px) ── */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-low)',
              borderRight: '1px solid var(--md-sys-color-outline-variant)',
            }}
            className="relative flex flex-col w-72 max-w-[80vw] h-full shadow-2xl z-10"
          >
            <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-[var(--md-sys-color-outline-variant)]">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--md-sys-shape-corner-small)] shrink-0"
                  style={{
                    backgroundColor: activePlane === 'platform' ? '#4338ca' : 'var(--md-sys-color-primary)',
                    color: '#ffffff',
                  }}
                >
                  <StarqLogomark size={16} />
                </div>
                <div className="text-[15px] font-semibold tracking-tight text-[var(--md-sys-color-on-surface)]">
                  <span>starq</span>
                  <span
                    className="mono-num text-[10px] font-bold ml-1 px-1.5 py-0.5 rounded-[var(--md-sys-shape-corner-small)]"
                    style={{
                      backgroundColor: activePlane === 'platform' ? '#4338ca' : 'var(--md-sys-color-primary-container)',
                      color: activePlane === 'platform' ? '#ffffff' : 'var(--md-sys-color-on-primary-container)',
                    }}
                  >
                    {activePlane === 'platform' ? 'HQ' : 'ERP'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2 overflow-y-auto" aria-label="Modules">
              {activePlane === 'platform' ? (
                PLATFORM_NAV.map(({ id, label, Icon, badgeKey }) => {
                  const isActive = platformTab === id;
                  const badgeCount =
                    badgeKey === 'pendingApplications'
                      ? pendingApplications.filter((a) => a.status === 'pending_approval').length
                      : 0;

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setPlatformTab(id);
                        setMobileDrawerOpen(false);
                      }}
                      className={`group relative overflow-hidden flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--md-sys-shape-corner-full)] text-xs font-medium transition-all duration-150 text-left w-full cursor-pointer ${
                        isActive ? 'font-semibold' : ''
                      }`}
                      style={
                        isActive
                          ? {
                              backgroundColor: 'var(--md-sys-color-secondary-container)',
                              color: 'var(--md-sys-color-on-secondary-container)',
                            }
                          : {
                              color: 'var(--md-sys-color-on-surface-variant)',
                            }
                      }
                    >
                      <span
                        className="absolute inset-0 pointer-events-none rounded-[inherit] transition-opacity duration-150 opacity-0 group-hover:opacity-[var(--md-sys-state-hover-opacity)] group-active:opacity-[var(--md-sys-state-pressed-opacity)] bg-current"
                        aria-hidden="true"
                      />
                      <Icon size={17} strokeWidth={1.9} aria-hidden="true" className="relative z-10 shrink-0" />
                      <span className="relative z-10 truncate flex-1">{label}</span>
                      {badgeCount > 0 && (
                        <span className="relative z-10 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                          {badgeCount}
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                NAV.map(({ to, label, Icon, end, section }, index) => {
                  const subnav = MODULE_SUBNAV[to];
                  const inModule = location.pathname.startsWith(to);
                  const searchParams = new URLSearchParams(location.search);
                  const currentTab = searchParams.get('tab') || subnav?.[0]?.id;
                  const isExpanded = Boolean(subnav && mobileExpandedModuleMenus.has(to));
                  const showSectionDivider = index > 0 && NAV[index - 1].section !== section;

                  return (
                    <React.Fragment key={to}>
                      {showSectionDivider && (
                        <div
                          className="mt-3 mb-1 pt-3 px-3.5"
                          style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}
                          aria-hidden="true"
                        >
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: 'var(--md-sys-color-on-surface-variant)', opacity: 0.7 }}
                          >
                            {NAV_SECTION_LABEL[section]}
                          </span>
                        </div>
                      )}
                      <div className="flex flex-col">
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        aria-expanded={subnav ? isExpanded : undefined}
                        onClick={(event) => {
                          if (!subnav) {
                            setMobileDrawerOpen(false);
                            return;
                          }
                          event.preventDefault();
                          setMobileExpandedModuleMenus((current) => {
                            const next = new Set(current);
                            if (next.has(to)) next.delete(to); else next.add(to);
                            return next;
                          });
                        }}
                        className={({ isActive }) =>
                          `group relative overflow-hidden flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--md-sys-shape-corner-full)] text-xs font-medium transition-all duration-150 ${
                            isActive ? 'font-semibold' : ''
                          } ${section === 'system' && !isActive ? 'opacity-80' : ''}`
                        }
                        style={({ isActive }) =>
                          isActive
                            ? {
                                backgroundColor: 'var(--md-sys-color-secondary-container)',
                                color: 'var(--md-sys-color-on-secondary-container)',
                              }
                            : {
                                color: 'var(--md-sys-color-on-surface-variant)',
                              }
                        }
                      >
                        {/* State Layer */}
                        <span
                          className="absolute inset-0 pointer-events-none rounded-[inherit] transition-opacity duration-150 opacity-0 group-hover:opacity-[var(--md-sys-state-hover-opacity)] group-active:opacity-[var(--md-sys-state-pressed-opacity)] bg-current"
                          aria-hidden="true"
                        />
                        <Icon size={17} strokeWidth={section === 'system' ? 1.7 : 1.9} aria-hidden="true" className="relative z-10 shrink-0" />
                        <span className="relative z-10 truncate flex-1">{label}</span>
                        {subnav && (
                          <ChevronDown
                            size={14}
                            className={`relative z-10 transition-transform duration-200 ${
                              isExpanded
                                ? 'rotate-180 text-[var(--md-sys-color-primary)]'
                                : 'text-[var(--md-sys-color-on-surface-variant)]/60'
                            }`}
                          />
                        )}
                      </NavLink>

                      {/* Persistent module destinations use the same nested sidebar language. */}
                      {subnav && isExpanded && (
                        <div className="ml-5 pl-3 my-1 flex flex-col gap-0.5 border-l-2 border-[var(--md-sys-color-outline-variant)]/70 animate-in fade-in duration-150" aria-label={`${label} sections`}>
                          {subnav.map((sub) => {
                            const isSubActive = currentTab === sub.id;
                            return (
                              <NavLink
                                key={sub.id}
                              to={`${to}?tab=${sub.id}`}
                              onClick={() => setMobileDrawerOpen(false)}
                              aria-current={isSubActive ? 'page' : undefined}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] ${
                                isSubActive
                                  ? 'font-bold bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] shadow-xs'
                                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]'
                                }`}
                              >
                                <sub.Icon size={13} strokeWidth={1.8} className="shrink-0" />
                                <span className="truncate">{sub.label}</span>
                              </NavLink>
                            );
                          })}
                        </div>
                      )}
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </nav>

            <div
              className="px-5 py-3 shrink-0 border-t border-[var(--md-sys-color-outline-variant)]"
            >
              <div
                className="flex items-center justify-between text-[11px]"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                <span
                  className="mono-num font-medium"
                  title={typeof __BUILD_TIME__ !== 'undefined' ? `Built: ${__BUILD_TIME__}` : undefined}
                >
                  {activePlane === 'platform'
                    ? `Starq HQ v2026.08 (${typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'})`
                    : `starqERP ${getFormattedProductVersion()} (${typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'})`}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--positive)' }} />
                  <span>{activePlane === 'platform' ? 'Control Plane' : 'Online'}</span>
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Column Area ── */}
      <div className="flex min-w-0 flex-1 flex-col w-full">
        {/* TopAppBar */}
        <header
          className="sticky top-0 z-40 flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 shrink-0 h-14 sm:h-16 w-full shadow-sm"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderBottom: '1px solid var(--md-sys-color-outline-variant)',
          }}
          role="banner"
        >
          {/* Hamburger Menu & Brand on Mobile / Compact (< lg) */}
          <div className="flex items-center gap-1.5 lg:hidden shrink-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="p-2 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer"
              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              aria-label="Open navigation menu"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div
              className="flex h-7 w-7 items-center justify-center rounded-[var(--md-sys-shape-corner-small)] shrink-0"
              style={{
                backgroundColor: 'var(--md-sys-color-primary)',
                color: 'var(--md-sys-color-on-primary)',
              }}
            >
              <StarqLogomark size={16} />
            </div>
          </div>

          {/* Search Bar Trigger */}
          <div className="relative flex-1 max-w-xs sm:max-w-md min-w-0">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => setIsGlobalSearchOpen(true)}
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface)',
                borderColor: 'var(--md-sys-color-outline-variant)',
                borderRadius: 'var(--md-sys-shape-corner-full)',
              }}
              className="w-full h-8 sm:h-9 pl-9 pr-3 text-xs border outline-none transition-colors flex items-center justify-between cursor-pointer hover:border-[var(--md-sys-color-primary)] text-left"
              aria-label="Search across customers, jobs, invoices (⌘K)"
            >
              <span className="text-[var(--md-sys-color-on-surface-variant)] truncate">
                Search workspace...
              </span>
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface-variant)]">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Theme Toggle Button */}
            <div
              className="flex items-center rounded-[var(--md-sys-shape-corner-full)] p-0.5 border"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
              role="group"
              aria-label="Theme mode"
            >
              <button
                type="button"
                onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light')}
                className="p-1.5 rounded-[var(--md-sys-shape-corner-full)] transition-colors cursor-pointer hover:bg-[var(--md-sys-color-surface-container)]"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                title={`Theme: ${themeMode} (${resolvedTheme})`}
                aria-label={`Theme: ${themeMode} (${resolvedTheme})`}
              >
                {themeMode === 'system' ? (
                  <Laptop size={14} aria-hidden="true" />
                ) : themeMode === 'dark' ? (
                  <Moon size={14} aria-hidden="true" />
                ) : (
                  <Sun size={14} aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Tenant Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setTenantMenuOpen(!tenantMenuOpen)}
                className="flex items-center gap-2 px-2.5 py-1 rounded-[var(--md-sys-shape-corner-full)] border transition-all cursor-pointer text-xs"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-high)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                  color: 'var(--md-sys-color-on-surface)',
                }}
                aria-expanded={tenantMenuOpen}
                aria-haspopup="true"
                aria-label="Organization switcher"
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                  }}
                >
                  {initials}
                </div>
                <span className="font-medium max-w-[90px] sm:max-w-[140px] truncate hidden xs:inline">
                  {workspace}
                </span>
                <ChevronDown size={13} style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />
              </button>

              {tenantMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setTenantMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute right-0 mt-1 w-72 rounded-[var(--md-sys-shape-corner-medium)] shadow-xl border py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                    role="menu"
                  >
                    {/* Section 1: STARQ PLATFORM (Visible for Platform Operator / Founder) */}
                    {isPlatformOperator && (
                      <div className="pb-2 mb-1.5 border-b" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-primary)] flex items-center gap-1.5">
                          <ShieldCheck size={13} />
                          <span>Starq Platform</span>
                        </div>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setTenantMenuOpen(false);
                            switchActiveContext({ plane: 'platform' });
                          }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between hover:bg-[var(--md-sys-color-surface-container-high)] ${
                            activePlane === 'platform' ? 'bg-[var(--md-sys-color-primary-container)]/20' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0"
                              style={{
                                backgroundColor: 'var(--md-sys-color-primary)',
                                color: 'var(--md-sys-color-on-primary)',
                              }}
                            >
                              HQ
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">
                                Starq HQ
                              </div>
                              <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                                Platform Administration & Telemetry
                              </div>
                            </div>
                          </div>
                          {activePlane === 'platform' && (
                            <Badge variant="accent" size="sm">Active</Badge>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Section 2: MY ORGANISATIONS */}
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                      <Building2 size={13} />
                      <span>My Organisations</span>
                    </div>

                    <div className="space-y-1.5 mt-1 max-h-64 overflow-y-auto px-1">
                      {session && tenants.length === 0 && (
                        <div className="px-2.5 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          {applicantPending
                            ? 'Application pending Starq HQ approval. No organisation is assigned yet.'
                            : 'No organisation on this session. Register to apply.'}
                        </div>
                      )}
                      {tenants.map((t) => {
                        const isTenantActive = activePlane === 'tenant' && currentTenant.id === t.id;
                        return (
                          <div
                            key={t.id}
                            className="rounded-[var(--md-sys-shape-corner-small)] p-1.5"
                            style={{
                              backgroundColor: isTenantActive
                                ? 'var(--md-sys-color-surface-container-high)'
                                : 'transparent',
                            }}
                          >
                            <div className="px-1.5 py-0.5 flex items-center justify-between text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                              <span className="truncate">{t.name}</span>
                              {isTenantActive && (
                                <span
                                  className="text-[9px] font-mono px-1.5 py-0.2 rounded font-bold"
                                  style={{
                                    backgroundColor: 'var(--md-sys-color-primary-container)',
                                    color: 'var(--md-sys-color-on-primary-container)',
                                  }}
                                >
                                  Active Org
                                </span>
                              )}
                            </div>

                            {/* Books / Business Activities */}
                            {t.books && t.books.length > 0 ? (
                              <div className="pl-2 space-y-0.5 mt-1">
                                {t.books.map((b) => {
                                  const isBookActive = isTenantActive && currentBook?.id === b.id;
                                  return (
                                    <button
                                      key={b.id}
                                      role="menuitem"
                                      onClick={() => {
                                        setTenantMenuOpen(false);
                                        switchActiveContext({ plane: 'tenant', tenantId: t.id, bookId: b.id });
                                      }}
                                      className={`w-full text-left px-2 py-1 rounded-[var(--md-sys-shape-corner-small)] text-xs transition-colors flex items-center justify-between hover:bg-[var(--md-sys-color-surface-container-highest)] ${
                                        isBookActive
                                          ? 'font-semibold'
                                          : 'text-[var(--md-sys-color-on-surface-variant)]'
                                      }`}
                                      style={{
                                        color: isBookActive
                                          ? 'var(--md-sys-color-primary)'
                                          : 'var(--md-sys-color-on-surface-variant)',
                                      }}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="mono-num text-[10px] opacity-60 font-bold">[{b.code}]</span>
                                        <span className="truncate">{b.name}</span>
                                      </div>
                                      {isBookActive && (
                                        <span
                                          className="w-1.5 h-1.5 rounded-full shrink-0"
                                          style={{ backgroundColor: 'var(--md-sys-color-primary)' }}
                                        />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <button
                                role="menuitem"
                                onClick={() => {
                                  setTenantMenuOpen(false);
                                  switchActiveContext({ plane: 'tenant', tenantId: t.id });
                                }}
                                className="w-full text-left px-2 py-1 rounded-[var(--md-sys-shape-corner-small)] text-xs transition-colors flex items-center justify-between hover:bg-[var(--md-sys-color-surface-container-highest)]"
                                style={{
                                  color: isTenantActive
                                    ? 'var(--md-sys-color-primary)'
                                    : 'var(--md-sys-color-on-surface-variant)',
                                }}
                              >
                                <span className="truncate">{t.name}</span>
                                {isTenantActive && (
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: 'var(--md-sys-color-primary)' }}
                                  />
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Register New Organisation */}
                    <div className="px-2 pt-1 pb-1 border-t" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setTenantMenuOpen(false);
                          setIsRegisterOrgModalOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-semibold text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]/20 transition-colors flex items-center gap-1.5 border border-dashed border-[var(--md-sys-color-primary)]/40 cursor-pointer"
                      >
                        <Plus size={13} />
                        <span>Register New Business</span>
                      </button>
                    </div>

                    <div className="mx-2 my-1 border-t" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }} />
                    <div className="px-3 py-1 text-[10px]" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                      {session?.name ?? 'Not signed in'}
                      {session?.seat_label && (
                        <span className="block text-[9px] opacity-70">{session.seat_label}</span>
                      )}
                    </div>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setTenantMenuOpen(false);
                        logout().then(() => navigate('/login'));
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors flex items-center gap-2 cursor-pointer"
                      style={{ color: 'var(--md-sys-color-error, #b3261e)' }}
                    >
                      <LogOut size={14} aria-hidden="true" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* View Content Area */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-3 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8 pb-24 lg:pb-8 focus:outline-none overflow-y-auto w-full"
          style={{ backgroundColor: 'var(--md-sys-color-surface)' }}
        >
          <div className="w-full max-w-7xl mx-auto min-w-0">
            {activePlane === 'platform' ? (
              <StarqHQShell activeTab={platformTab} onSelectTab={setPlatformTab} />
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>

      {/* ── 3. MATERIAL 3 BOTTOM NAVIGATION BAR (< 1024px) ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 lg:hidden flex items-center justify-around h-16 border-t px-2 shadow-lg"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
        aria-label="Mobile Bottom Navigation"
      >
        {activePlane === 'platform' ? (
          <>
            {PLATFORM_NAV.slice(0, 4).map(({ id, label, Icon, badgeKey }) => {
              const isActive = platformTab === id;
              const badgeCount =
                badgeKey === 'pendingApplications'
                  ? pendingApplications.filter((a) => a.status === 'pending_approval').length
                  : 0;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlatformTab(id)}
                  className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors group cursor-pointer relative ${
                    isActive ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)]'
                  }`}
                >
                  <div
                    className={`w-12 h-7 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                        : 'group-hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
                    }`}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2.4 : 1.9} />
                  </div>
                  <span className={`text-[10px] tracking-tight mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
                    {label.split(' ')[0]}
                  </span>
                  {badgeCount > 0 && (
                    <span className="absolute top-1 right-2 px-1 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-white">
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors group cursor-pointer text-[var(--md-sys-color-on-surface-variant)]"
            >
              <div className="w-12 h-7 rounded-full flex items-center justify-center group-hover:bg-[var(--md-sys-color-surface-container-high)]">
                <Menu size={18} strokeWidth={1.9} />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 font-medium">
                More
              </span>
            </button>
          </>
        ) : (
          <>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors group cursor-pointer ${
                  isActive ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`w-12 h-7 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                        : 'group-hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
                    }`}
                  >
                    <LayoutDashboard size={18} strokeWidth={isActive ? 2.4 : 1.9} />
                  </div>
                  <span className={`text-[10px] tracking-tight mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
                    Dashboard
                  </span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/jobs"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors group cursor-pointer ${
                  isActive ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`w-12 h-7 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                        : 'group-hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
                    }`}
                  >
                    <Wrench size={18} strokeWidth={isActive ? 2.4 : 1.9} />
                  </div>
                  <span className={`text-[10px] tracking-tight mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
                    Orders
                  </span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/invoices"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors group cursor-pointer ${
                  isActive ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`w-12 h-7 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                        : 'group-hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
                    }`}
                  >
                    <FileText size={18} strokeWidth={isActive ? 2.4 : 1.9} />
                  </div>
                  <span className={`text-[10px] tracking-tight mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
                    Invoices
                  </span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/customers"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors group cursor-pointer ${
                  isActive ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`w-12 h-7 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                        : 'group-hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
                    }`}
                  >
                    <Users size={18} strokeWidth={isActive ? 2.4 : 1.9} />
                  </div>
                  <span className={`text-[10px] tracking-tight mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
                    Customers
                  </span>
                </>
              )}
            </NavLink>

            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors group cursor-pointer ${
                isMoreActive ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)]'
              }`}
            >
              <div
                className={`w-12 h-7 rounded-full flex items-center justify-center transition-all ${
                  isMoreActive
                    ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                    : 'group-hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
                }`}
              >
                <Menu size={18} strokeWidth={isMoreActive ? 2.4 : 1.9} />
              </div>
              <span className={`text-[10px] tracking-tight mt-0.5 ${isMoreActive ? 'font-bold' : 'font-medium'}`}>
                More
              </span>
            </button>
          </>
        )}
      </nav>

      {/* Global Modals & Operational Drawers */}
      <GlobalSearchModal />
      <StarqAICopilot />
      <CreateJobModal />
      <CreateInvoiceModal />
      <RecordPaymentModal />

      {/* Security & Authentication Modals (SERP-268) */}
      <MfaSetupModal />
      <MfaChallengeModal />

      {/* Organisation Registration Modal */}
      <RegisterOrganisationModal
        isOpen={isRegisterOrgModalOpen}
        onClose={() => setIsRegisterOrgModalOpen(false)}
      />
    </div>
  );
};
