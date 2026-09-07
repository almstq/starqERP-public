import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Folder,
  FolderOpen,
  FileText,
  Lock,
  Edit2,
  Eye,
  TrendingUp,
  TrendingDown,
  Scale,
  DollarSign,
  Layers,
  BookOpen,
  Sparkles,
  Landmark,
  Globe
} from 'lucide-react';
import {
  AccountRecord,
  AccountClass,
  AccountCurrency,
  AccountStatus,
  AccountHierarchyNode,
  CLASS_LABELS,
  SUBTYPE_LABELS,
  buildAccountTree,
  flattenAccountTree,
  filterAccountTree,
} from '../../domain/accounts';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../data/defaultChartOfAccounts';
import { NewAccountModal } from './NewAccountModal';
import { AccountDetailModal } from './AccountDetailModal';
import { ManualJournalModal } from './ManualJournalModal';
import { GeneralLedgerView } from './GeneralLedgerView';
import { PeriodManagementView } from './PeriodManagementView';
import { BankReconciliationView } from './BankReconciliationView';
import { MultiCurrencyView } from './MultiCurrencyView';
import { AccountingPeriod, generateFiscalPeriods } from '../../domain/periods';
import { assertJournalPostable, PostingActor } from '../../domain/postingControl';
import { Badge, Surface, Button } from '../ui';
import { useERP } from '../../context/ERPContext';
import {
  JournalEntry,
  deriveOperationalJournals,
} from '../../domain/journals';

type AccountSection = 'chart_of_accounts' | 'general_ledger' | 'periods' | 'bank_reconciliation' | 'multi_currency';

export const ACCOUNTS_TAB_HEADERS: Record<AccountSection, { title: string; subtitle: string }> = {
  chart_of_accounts: {
    title: 'Chart of Accounts',
    subtitle: 'Authoritative account hierarchy for Maldivian commerce and IFRS reporting',
  },
  general_ledger: {
    title: 'General Ledger',
    subtitle: 'Double-entry journal postings, account balances, and transaction drilldowns',
  },
  periods: {
    title: 'Period Management',
    subtitle: 'Fiscal period lock, close, and year-end closing journal workflows',
  },
  bank_reconciliation: {
    title: 'Bank Reconciliation',
    subtitle: 'Match bank statement lines to ledger entries and post adjustment journals',
  },
  multi_currency: {
    title: 'Multi-Currency',
    subtitle: 'Foreign exchange rate management, revaluation, and realised gain/loss tracking',
  },
};

export const AccountsView: React.FC = () => {
  const { invoices, payments, expenses, purchaseOrders, currentTenant, formatMVR } = useERP();
  // Derived from the tenant's real registration status. ERPContext exposes no
  // isGstRegistered field, so reading one returned undefined and every caller
  // silently behaved as 'not registered'.
  const isGstRegistered = currentTenant?.gstStatus === 'registered';

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('tab') as AccountSection | null;
  const activeTab: AccountSection = ['chart_of_accounts', 'general_ledger', 'periods', 'bank_reconciliation', 'multi_currency'].includes(requestedSection || '')
    ? requestedSection as AccountSection
    : 'chart_of_accounts';
  const setActiveTab = (section: AccountSection) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', section);
    setSearchParams(next);
  };

  // Accounting Periods State
  const [periods, setPeriods] = useState<AccountingPeriod[]>(() => {
    const saved = localStorage.getItem('starq:accounting_periods:v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return generateFiscalPeriods(2026);
      }
    }
    return generateFiscalPeriods(2026);
  });

  const savePeriods = (updated: AccountingPeriod[]) => {
    setPeriods(updated);
    localStorage.setItem('starq:accounting_periods:v1', JSON.stringify(updated));
  };
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState<string | null>(null);
  const [postingError, setPostingError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<AccountRecord[]>(() => {
    const saved = localStorage.getItem('starq:chart_of_accounts:v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_CHART_OF_ACCOUNTS;
      }
    }
    return DEFAULT_CHART_OF_ACCOUNTS;
  });

  // Manual Journals state
  const [manualJournals, setManualJournals] = useState<JournalEntry[]>(() => {
    const saved = localStorage.getItem('starq:manual_journals:v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Combine operational journals (from invoices, payments, expenses, bills) with manual journals
  const allJournals = useMemo(() => {
    const operational = deriveOperationalJournals({
      invoices,
      payments,
      expenses,
      purchaseOrders,
      accounts,
      isGstRegistered: isGstRegistered || true,
      tenantId: currentTenant.id,
    });
    return [...operational, ...manualJournals];
  }, [invoices, payments, expenses, purchaseOrders, accounts, isGstRegistered, currentTenant, manualJournals]);

  const [selectedClass, setSelectedClass] = useState<AccountClass | 'ALL'>('ALL');
  const [selectedCurrency, setSelectedCurrency] = useState<AccountCurrency | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<AccountStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Set of expanded parent node IDs
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    return new Set(DEFAULT_CHART_OF_ACCOUNTS.filter((a) => a.level <= 1).map((a) => a.id));
  });

  // Modal states
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isManualJournalOpen, setIsManualJournalOpen] = useState(false);
  const [selectedParentForNew, setSelectedParentForNew] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [viewingAccount, setViewingAccount] = useState<AccountRecord | null>(null);

  // Persist accounts state
  const saveAccounts = (newAccounts: AccountRecord[]) => {
    setAccounts(newAccounts);
    try {
      localStorage.setItem('starq:chart_of_accounts:v1', JSON.stringify(newAccounts));
    } catch {
      // ignore storage errors
    }
  };

  /**
   * The ONLY path by which a journal reaches state. Every caller goes through
   * here so the posting gate cannot be bypassed by adding another button.
   *
   * SERP-345: before this, assertPeriodNotLocked was imported into this file and
   * called zero times — a journal could be posted into a CLOSED period and
   * nothing stopped it. The guard existed and was never in effect.
   */
  const postJournal = (entry: JournalEntry, actor: PostingActor = 'user') => {
    try {
      assertJournalPostable({ entry, periods, accounts, actor });
    } catch (err) {
      // Surface the reason rather than throwing out of an event handler, which
      // would leave the user with a modal that silently refuses to close.
      setPostingError(err instanceof Error ? err.message : 'Posting rejected.');
      return;
    }
    setPostingError(null);
    setManualJournals((prev) => {
      const next = [entry, ...prev];
      try {
        localStorage.setItem('starq:manual_journals:v1', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleSaveManualJournal = (entry: JournalEntry) => postJournal(entry, 'user');

  // Toggle single node expansion
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(accounts.map((a) => a.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // Build full hierarchical tree
  const tree = useMemo(() => buildAccountTree(accounts), [accounts]);

  // Apply filters to tree
  const filteredTree = useMemo(() => {
    return filterAccountTree(tree, {
      accountClass: selectedClass,
      currency: selectedCurrency,
      status: selectedStatus,
      query: searchQuery,
    });
  }, [tree, selectedClass, selectedCurrency, selectedStatus, searchQuery]);

  // Flatten visible nodes according to expanded state (auto-expand during search)
  const flatNodes = useMemo(() => {
    if (searchQuery.trim()) {
      const allIds = new Set<string>();
      function collectIds(list: AccountHierarchyNode[]) {
        for (const n of list) {
          allIds.add(n.id);
          if (n.children.length > 0) collectIds(n.children);
        }
      }
      collectIds(filteredTree);
      return flattenAccountTree(filteredTree, allIds);
    }
    return flattenAccountTree(filteredTree, expandedIds);
  }, [filteredTree, expandedIds, searchQuery]);


  // Summary Metrics
  const metrics = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.status === 'ACTIVE').length;
    const assetsCount = accounts.filter((a) => a.accountClass === 'ASSET').length;
    const liabilitiesCount = accounts.filter((a) => a.accountClass === 'LIABILITY').length;
    const equityCount = accounts.filter((a) => a.accountClass === 'EQUITY').length;
    const revenueCount = accounts.filter((a) => a.accountClass === 'REVENUE').length;
    const expenseCount = accounts.filter((a) => a.accountClass === 'EXPENSE').length;

    return {
      total,
      active,
      assetsCount,
      liabilitiesCount,
      equityCount,
      revenueCount,
      expenseCount,
    };
  }, [accounts]);

  const handleSaveAccount = (accountData: Partial<AccountRecord>) => {
    if (editingAccount) {
      // Update existing account
      const updated = accounts.map((a) =>
        a.id === editingAccount.id
          ? {
              ...a,
              ...accountData,
            }
          : a
      );
      saveAccounts(updated);
    } else {
      // Create new account
      const parent = accountData.parentId ? accounts.find((a) => a.id === accountData.parentId) : null;
      const newAcc: AccountRecord = {
        id: `acc-${Date.now()}`,
        code: accountData.code || '9999',
        name: accountData.name || 'Untitled Account',
        accountClass: accountData.accountClass || 'ASSET',
        subtype: accountData.subtype || 'CURRENT_ASSET',
        parentId: accountData.parentId || null,
        level: parent ? parent.level + 1 : 0,
        currency: accountData.currency || 'MVR',
        status: accountData.status || 'ACTIVE',
        balance: 0,
        isSystem: false,
        description: accountData.description,
        taxCode: accountData.taxCode,
      };

      const updated = [...accounts, newAcc].sort((a, b) => a.code.localeCompare(b.code));
      saveAccounts(updated);

      if (newAcc.parentId) {
        setExpandedIds((prev) => new Set([...prev, newAcc.parentId!]));
      }
    }
    setIsNewModalOpen(false);
    setEditingAccount(null);
    setSelectedParentForNew(null);
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset Chart of Accounts to canonical Maldivian commerce defaults? Custom modifications will be reset.')) {
      saveAccounts(DEFAULT_CHART_OF_ACCOUNTS);
      setExpandedIds(new Set(DEFAULT_CHART_OF_ACCOUNTS.filter((a) => a.level <= 1).map((a) => a.id)));
    }
  };

  return (
    <div className="space-y-6" data-testid="chart-of-accounts-view">
      {postingError && (
        <div
          role="alert"
          data-testid="posting-rejected"
          className="flex items-start gap-3 rounded-lg border border-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)] p-4 text-[var(--md-sys-color-on-error-container)]"
        >
          <span className="font-semibold shrink-0">Posting rejected</span>
          <span className="text-sm">{postingError}</span>
          <button
            type="button"
            onClick={() => setPostingError(null)}
            className="ml-auto text-sm underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Header with View Mode Switcher and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-2.5">
            <Building2 className="w-7 h-7 text-[var(--md-sys-color-primary)]" />
            {ACCOUNTS_TAB_HEADERS[activeTab].title}
          </h1>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1">
            {ACCOUNTS_TAB_HEADERS[activeTab].subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">

          <Button
            variant="tonal"
            size="sm"
            data-testid="new-journal-btn"
            onClick={() => setIsManualJournalOpen(true)}
            icon={<Scale size={14} />}
          >
            <span>New Journal</span>
          </Button>

          {activeTab === 'chart_of_accounts' && (
            <>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] flex items-center gap-1.5 transition cursor-pointer"
                title="Reset to default Maldives template"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[var(--md-sys-color-outline)]" />
                <span>Reset</span>
              </button>

              <Button
                variant="filled"
                size="sm"
                onClick={() => {
                  setEditingAccount(null);
                  setSelectedParentForNew(null);
                  setIsNewModalOpen(true);
                }}
                data-testid="add-account-btn"
                icon={<Plus size={14} />}
              >
                <span>New Account</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'general_ledger' ? (
        <GeneralLedgerView
          accounts={accounts}
          journals={allJournals}
          selectedAccountId={selectedLedgerAccountId}
          onSelectAccount={(accId) => setSelectedLedgerAccountId(accId)}
          onOpenNewJournalModal={() => setIsManualJournalOpen(true)}
        />
      ) : activeTab === 'periods' ? (
        <PeriodManagementView
          periods={periods}
          onPeriodsUpdated={savePeriods}
          journals={allJournals}
          accounts={accounts}
          onClosingJournalPosted={(closingJe) => {
            // The close is the one process permitted to write Retained Earnings
            // and to post into the period it is closing.
            postJournal(closingJe, 'system');
          }}
          formatMVR={formatMVR}
        />
      ) : activeTab === 'bank_reconciliation' ? (
        <BankReconciliationView
          journals={allJournals}
          onAddAdjustmentJournal={(adjJe) => {
            // Bank reconciliation books fees and interest against its own
            // control accounts, so it posts as the owning engine.
            postJournal(adjJe, 'system');
          }}
        />
      ) : activeTab === 'multi_currency' ? (
        <MultiCurrencyView
          onAddJournalEntry={(fxJe) => {
            // Realised FX gain and loss are system accounts written by the
            // settlement engine.
            postJournal(fxJe, 'system');
          }}
        />
      ) : (
        <div className="space-y-6">
          {/* Metrics Row (Fixed height isometric laser-straight alignment) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] flex flex-col justify-between h-[104px]">
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center gap-1.5 h-4 truncate">
                <span className="truncate">Total Accounts</span>
              </div>
              <div className="text-2xl font-mono font-bold text-[var(--md-sys-color-on-surface)] leading-none my-auto">{metrics.total}</div>
              <div className="text-[11px] text-[var(--md-sys-color-primary)] font-medium h-3.5 truncate leading-none">{metrics.active} active</div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] flex flex-col justify-between h-[104px]">
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center gap-1.5 h-4 truncate">
                <TrendingUp className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="truncate">Assets (1000s)</span>
              </div>
              <div className="text-2xl font-mono font-bold text-[var(--md-sys-color-on-surface)] leading-none my-auto">{metrics.assetsCount}</div>
              <div className="text-[11px] text-[var(--md-sys-color-outline)] h-3.5 truncate leading-none">Cash, Bank, Stock</div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] flex flex-col justify-between h-[104px]">
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center gap-1.5 h-4 truncate">
                <TrendingDown className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="truncate">Liabilities (2000s)</span>
              </div>
              <div className="text-2xl font-mono font-bold text-[var(--md-sys-color-on-surface)] leading-none my-auto">{metrics.liabilitiesCount}</div>
              <div className="text-[11px] text-[var(--md-sys-color-outline)] h-3.5 truncate leading-none">AP, GST, TGST</div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] flex flex-col justify-between h-[104px]">
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center gap-1.5 h-4 truncate">
                <Scale className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate">Equity (3000s)</span>
              </div>
              <div className="text-2xl font-mono font-bold text-[var(--md-sys-color-on-surface)] leading-none my-auto">{metrics.equityCount}</div>
              <div className="text-[11px] text-[var(--md-sys-color-outline)] h-3.5 truncate leading-none">Capital & Retained</div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] flex flex-col justify-between h-[104px]">
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center gap-1.5 h-4 truncate">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate">Revenue (4000s)</span>
              </div>
              <div className="text-2xl font-mono font-bold text-[var(--md-sys-color-on-surface)] leading-none my-auto">{metrics.revenueCount}</div>
              <div className="text-[11px] text-[var(--md-sys-color-outline)] h-3.5 truncate leading-none">Sales & Services</div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] flex flex-col justify-between h-[104px]">
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium flex items-center gap-1.5 h-4 truncate">
                <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">Expenses (5000s)</span>
              </div>
              <div className="text-2xl font-mono font-bold text-[var(--md-sys-color-on-surface)] leading-none my-auto">{metrics.expenseCount}</div>
              <div className="text-[11px] text-[var(--md-sys-color-outline)] h-3.5 truncate leading-none">COGS & Operating</div>
            </div>
          </div>

          {/* Filter and Tab Navigation Bar */}
          <div className="p-4 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] space-y-4">
            {/* Classification Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-[var(--md-sys-color-outline-variant)]">
              {(['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const).map((cls) => {
                const isSelected = selectedClass === cls;
                return (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setSelectedClass(cls)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-sm'
                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]'
                    }`}
                  >
                    {cls === 'ALL' ? 'All Classes' : `${CLASS_LABELS[cls]} (${cls === 'ASSET' ? '1000s' : cls === 'LIABILITY' ? '2000s' : cls === 'EQUITY' ? '3000s' : cls === 'REVENUE' ? '4000s' : '5000s'})`}
                  </button>
                );
              })}
            </div>

            {/* Search and Secondary Filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-outline)]" />
                <input
                  type="text"
                  placeholder="Search by code, account name, or subtype..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 text-xs rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value as any)}
                  className="h-9 px-3 text-xs rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer"
                >
                  <option value="ALL">All Currencies</option>
                  <option value="MVR">MVR Only</option>
                  <option value="USD">USD Only</option>
                  <option value="MULTI">Multi-Currency</option>
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as any)}
                  className="h-9 px-3 text-xs rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active Only</option>
                  <option value="INACTIVE">Inactive Only</option>
                </select>

                <div className="flex items-center border border-[var(--md-sys-color-outline-variant)] rounded-xl overflow-hidden divide-x divide-[var(--md-sys-color-outline-variant)]">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition cursor-pointer"
                    title="Expand All Nodes"
                  >
                    Expand
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="px-2.5 py-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition cursor-pointer"
                    title="Collapse All Nodes"
                  >
                    Collapse
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Chart of Accounts Tree Table */}
          <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] overflow-hidden shadow-xs">
            <div className="erp-scroll-region overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[760px]">
                <thead>
                  <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider whitespace-nowrap">
                    <th className="py-3 px-4 w-24">Code</th>
                    <th className="py-3 px-4 min-w-[280px]">Account Name</th>
                    <th className="py-3 px-4 w-28">Class</th>
                    <th className="py-3 px-4 w-48 hidden md:table-cell">Subtype</th>
                    <th className="py-3 px-4 w-24 text-center">Currency</th>
                    <th className="py-3 px-4 w-32 text-right">Balance</th>
                    <th className="py-3 px-4 w-24 text-center">Status</th>
                    <th className="py-3 px-4 w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                  {flatNodes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[var(--md-sys-color-on-surface-variant)]">
                        <Building2 className="w-8 h-8 mx-auto mb-2 text-[var(--md-sys-color-outline)]" />
                        <p className="font-medium text-sm">No accounts found</p>
                        <p className="text-xs text-[var(--md-sys-color-outline)] mt-0.5">
                          Try adjusting your search query or filters.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    flatNodes.map((node) => {
                      const hasChildren = node.children && node.children.length > 0;
                      const isExpanded = expandedIds.has(node.id);
                      const indentPx = node.level * 20;

                      return (
                        <tr
                          key={node.id}
                          className="hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors group"
                          data-testid={`account-row-${node.code}`}
                        >
                          {/* Code */}
                          <td className="py-2.5 px-4 font-mono font-bold text-[var(--md-sys-color-primary)] whitespace-nowrap">
                            {node.code}
                          </td>

                          {/* Name with indentation & Expand chevron */}
                          <td className="py-2.5 px-4 min-w-[280px]">
                            <div className="flex items-center gap-1.5 whitespace-nowrap" style={{ paddingLeft: `${indentPx}px` }}>
                              {hasChildren ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(node.id)}
                                  className="p-1 rounded hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] shrink-0 cursor-pointer"
                                  title={isExpanded ? 'Collapse' : 'Expand'}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-5 shrink-0" />
                              )}

                              {hasChildren ? (
                                isExpanded ? (
                                  <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                                ) : (
                                  <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                )
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-[var(--md-sys-color-outline)] shrink-0" />
                              )}

                              <span className={`font-medium whitespace-nowrap ${node.level === 0 ? 'font-bold text-sm text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface)]'}`}>
                                {node.name}
                              </span>

                              {node.isSystem && (
                                <span title="System Locked Account">
                                  <Lock className="w-3 h-3 text-[var(--md-sys-color-outline)] shrink-0 ml-1" />
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Class */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                              {CLASS_LABELS[node.accountClass]}
                            </span>
                          </td>

                          {/* Subtype */}
                          <td className="py-2.5 px-4 hidden md:table-cell text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                            {SUBTYPE_LABELS[node.subtype]}
                          </td>

                          {/* Currency */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            <span className="font-mono px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]">
                              {node.currency}
                            </span>
                          </td>

                          {/* Balance */}
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
                            {node.currency === 'USD' ? '$' : 'MVR '} {node.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            <Badge variant={node.status === 'ACTIVE' ? 'positive' : 'neutral'}>
                              {node.status}
                            </Badge>
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* View in Ledger Drilldown */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLedgerAccountId(node.id);
                                  setActiveTab('general_ledger');
                                }}
                                className="p-1.5 rounded-lg text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container-high)] transition cursor-pointer"
                                title="View Account in General Ledger"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setViewingAccount(node);
                                  setIsDetailModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container-high)] transition cursor-pointer"
                                title="View Account Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedParentForNew(node.id);
                                  setEditingAccount(null);
                                  setIsNewModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-[var(--md-sys-color-outline)] hover:text-emerald-500 hover:bg-[var(--md-sys-color-surface-container-high)] transition cursor-pointer"
                                title="Add Sub-Account"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAccount(node);
                                  setIsNewModalOpen(true);
                                }}
                                disabled={node.isSystem}
                                className="p-1.5 rounded-lg text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container-high)] disabled:opacity-30 transition cursor-pointer"
                                title={node.isSystem ? 'System accounts cannot be edited' : 'Edit Account'}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom-nav clearance — the fixed h-16 bottom bar can clip the
          last table rows when the main scroll region's pb-24 doesn't fully
          propagate through nested flex containers. This spacer is invisible on
          desktop (lg:hidden) and provides guaranteed clearance on mobile. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      {/* Modals */}
      <NewAccountModal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setEditingAccount(null);
          setSelectedParentForNew(null);
        }}
        onSave={handleSaveAccount}
        accounts={accounts}
        initialParentId={selectedParentForNew}
        editingAccount={editingAccount}
      />

      <AccountDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setViewingAccount(null);
        }}
        account={viewingAccount}
        accounts={accounts}
        onEdit={(account) => {
          setIsDetailModalOpen(false);
          setEditingAccount(account);
          setIsNewModalOpen(true);
        }}
      />

      <ManualJournalModal
        isOpen={isManualJournalOpen}
        onClose={() => setIsManualJournalOpen(false)}
        accounts={accounts}
        onSave={handleSaveManualJournal}
      />
    </div>
  );
};
