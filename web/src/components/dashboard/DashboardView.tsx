import { resolveFavaraAccountNumber } from '../invoices/FavaraPaymentModal';
import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  DollarSign,
  CreditCard,
  Receipt,
  Truck,
  Wrench,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Clock,
  Car,
  Package,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
  ChevronRight,
  ShieldCheck,
  Zap
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { useERP } from '../../context/ERPContext';
import { useAuth } from '../../context/AuthContext';
import { buildMonthlyPerformance, buildServiceMix } from '../../domain/dashboardSeries';
import { StarqHQShell } from '../platform/StarqHQShell';
import {
  Button,
  Surface,
  Badge,
  DataTable,
  ColumnDef,
  ActionGroup,
  ResponsiveGrid,
} from '../ui';

export const DashboardView: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const {
    activePlane,
    currentUser,
    currentTenant,
    currentBook,
    currentArchetype,
    currentTerms,
    totalSalesToday,
    totalCashReceived,
    totalOutstandingInvoices,
    totalAccountsPayable,
    activeJobsCount,
    lowStockItemsCount,
    alerts,
    dismissAlert,
    aiInsights,
    triggerAIInsightAction,
    jobs,
    invoices,
    // SERP-288: the dashboard never had expenses in scope, which is precisely
    // why its "Operating Surplus" line could only ever have been fabricated.
    expenses,
    payments,
    suppliers,
    formatMVR,
    setIsCreateJobOpen,
    setIsCreateInvoiceOpen,
    setIsAICopilotOpen,
  } = useERP();

  if (activePlane === 'platform') {
    return <StarqHQShell />;
  }

  // SERP-288 — this chart used to switch to a hard-coded six-month series the
  // moment the tenant had one invoice, so somebody else's MVR 1.05m appeared to
  // be theirs. It is now their own invoices and expenses, and stays flat when
  // they are flat.
  const monthlyPerformance = buildMonthlyPerformance(invoices, expenses);
  const serviceMix = buildServiceMix(jobs);
  const payableSuppliersCount = suppliers.filter((s) => s.outstandingPayable > 0).length;

  const activeJobs = jobs.filter((j) => !['Completed', 'Paid'].includes(j.status));

  const recentJobColumns: ColumnDef<any>[] = [
    {
      key: 'jobId',
      header: `${currentTerms.order} / ${currentTerms.facility}`,
      width: '16%',
      render: (job) => (
        <div className="min-w-0">
          <div className="mono-num text-xs font-semibold" style={{ color: 'var(--md-sys-color-primary)' }} title={job.jobId}>
            {job.jobId}
          </div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
            {job.bayNumber || job.location || currentTerms.facility}
          </div>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: `${currentTerms.customer} & ${currentTerms.primaryAsset}`,
      width: '26%',
      render: (job) => (
        <div className="min-w-0">
          <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">{job.customerName}</div>
          <div className="text-[11px] mono-num truncate text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            {job.vehicle?.plateNumber ? `${job.vehicle.plateNumber} (${job.vehicle.model})` : (job.projectRef || job.serviceType || 'Standard Scope')}
          </div>
        </div>
      ),
    },
    {
      key: 'serviceType',
      header: 'Scope / Service',
      width: '16%',
      hideOn: 'compact',
      render: (job) => (
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
          {job.serviceType}
        </span>
      ),
    },
    {
      key: 'assignedStaff',
      header: 'Staff',
      width: '16%',
      hideOn: 'medium',
      render: (job) => (
        <div className="flex flex-wrap gap-1 min-w-0">
          {job.assignedStaff.map((s: any) => (
            <Badge key={s.id} variant="neutral" size="sm">
              {s.name}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'quotedAmount',
      header: 'Quoted',
      align: 'right',
      isNumeric: true,
      width: '14%',
      render: (job) => (
        <div className="text-right">
          <div className="font-semibold text-xs tabular-nums text-[var(--md-sys-color-on-surface)]">
            {formatMVR(job.quotedAmount)}
          </div>
          <div className="text-[10px] tabular-nums" style={{ color: 'var(--positive)' }}>
            Est: {formatMVR(job.actualProfit)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '12%',
      render: (job) => (
        <Badge variant="neutral" size="sm">
          {job.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      width: '8%',
      render: () => (
        <span className="text-xs font-semibold hover:underline" style={{ color: 'var(--md-sys-color-primary)' }}>
          Inspect →
        </span>
      ),
    },
  ];

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const rawUserName = session?.name || currentUser?.name || 'User';
  const preferredName = rawUserName.includes(' ') ? rawUserName.split(' ')[1] : rawUserName;

  const companyName = currentTenant.legalName || currentTenant.name || 'Enterprise';
  const bookCode = currentBook?.code || (currentTenant.name ? currentTenant.name.slice(0, 3).toUpperCase() : 'STQ');
  const attentionCount = alerts.length;

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 w-full min-w-0">
      {/* Welcome card: greeting, operating context, attention summary and actions reflow independently. */}
      <Surface variant="filled" level={1} padding="md" className="grid gap-5 min-w-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 space-y-4">
          <section className="flex items-start gap-3.5 min-w-0" aria-labelledby="welcome-greeting">
            {currentTenant.logoUrl ? (
              <img
                src={currentTenant.logoUrl}
                alt={currentTenant.name}
                className="w-12 h-12 rounded-xl object-contain p-1 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shrink-0"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border border-[var(--md-sys-color-outline-variant)]"
                style={{ backgroundColor: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
              >
                {(currentBook?.code || currentTenant.name.slice(0, 2)).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">Your workspace</p>
              <h1 id="welcome-greeting" className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] break-words">
                {greeting}, {preferredName}
              </h1>
            </div>
          </section>

          <section className="border-l-2 border-[var(--md-sys-color-primary)]/35 pl-3.5 min-w-0" aria-labelledby="book-context-heading">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="book-context-heading" className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">Open operating context</h2>
              <Badge variant="positive" size="sm">Live Book</Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2 min-w-0">
              {currentTenant.books.slice(0, 3).map((book) => (
                <div
                  key={book.id}
                  className={`min-w-0 max-w-full rounded-[var(--md-sys-shape-corner-small)] px-2.5 py-1.5 text-xs ${
                    book.id === currentBook?.id
                      ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                      : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
                  }`}
                >
                  <span className="font-semibold break-words">{companyName} · {book.name}</span>
                  <span className="ml-1.5 font-mono text-[10px] opacity-75">{book.code}</span>
                </div>
              ))}
            </div>
            {currentTenant.books.length > 3 && (
              <p className="mt-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">+{currentTenant.books.length - 3} more available book{currentTenant.books.length === 4 ? '' : 's'}</p>
            )}
          </section>

          <section className="flex items-start gap-2 border-t border-[var(--md-sys-color-outline-variant)] pt-3 min-w-0" aria-live="polite">
            {attentionCount > 0 ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--md-sys-color-error)]" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--positive)]" />}
            <p className={`text-xs leading-relaxed ${attentionCount > 0 ? 'font-medium text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
              {attentionCount === 0
                ? 'No items require your attention right now.'
                : `${attentionCount} ${attentionCount === 1 ? 'item requires' : 'items require'} your attention today.`}
            </p>
          </section>
        </div>

        <section className="border-t border-[var(--md-sys-color-outline-variant)] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 min-w-0" aria-label="Quick actions">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">Quick actions</p>
          <ActionGroup align="right" className="shrink-0">
          <Button
            variant="filled"
            size="sm"
            onClick={() => setIsCreateJobOpen(true)}
            icon={<Plus size={15} />}
          >
            <span>New {currentTerms.order}</span>
          </Button>
          <Button
            variant="tonal"
            size="sm"
            onClick={() => setIsCreateInvoiceOpen(true)}
            icon={<Receipt size={15} />}
          >
            <span>New Invoice</span>
          </Button>
          <Button
            variant="outlined"
            size="sm"
            onClick={() => setIsAICopilotOpen(true)}
            icon={<Sparkles size={15} style={{ color: 'var(--md-sys-color-primary)' }} />}
          >
            <span>starqAI</span>
          </Button>
          </ActionGroup>
        </section>
      </Surface>

      {/* Primary KPI Grid (Fluid auto-fit, container-safe, never forced 2 cols) */}
      <ResponsiveGrid columns="auto" minItemWidth="160px" gap="sm">
        <Surface variant="filled" level={2} padding="sm" container className="flex flex-col justify-between h-[100px] min-w-0">
          <span className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4">
            Sales Today
          </span>
          <div className="text-base sm:text-lg font-bold mono-num text-[var(--md-sys-color-on-surface)] truncate leading-none my-auto">
            {formatMVR(totalSalesToday, false)}
          </div>
          <span className="text-[10px] sm:text-[11px] text-[var(--md-sys-color-on-surface-variant)] block truncate h-3.5 leading-none">
            {invoices.filter((inv) => inv.date === new Date().toISOString().split('T')[0]).length} invoices logged
          </span>
        </Surface>

        <Surface
          variant="filled"
          level={2}
          padding="sm"
          container
          onClick={() => navigate('/payments')}
          className="flex flex-col justify-between h-[100px] min-w-0 cursor-pointer hover:border-[var(--md-sys-color-primary)] transition-all"
        >
          <span className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4">
            Cash Received
          </span>
          <div className="text-base sm:text-lg font-bold mono-num truncate leading-none my-auto" style={{ color: 'var(--positive)' }}>
            {formatMVR(totalCashReceived, false)}
          </div>
          <span className="text-[10px] sm:text-[11px] text-[var(--md-sys-color-on-surface-variant)] block truncate h-3.5 leading-none">
            Month-to-date collections
          </span>
        </Surface>

        <Surface
          variant="filled"
          level={2}
          padding="sm"
          container
          onClick={() => navigate('/invoices')}
          className="flex flex-col justify-between h-[100px] min-w-0 cursor-pointer hover:border-[var(--md-sys-color-primary)] transition-all"
        >
          <span className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4">
            Receivables Due
          </span>
          <div className="text-base sm:text-lg font-bold mono-num truncate leading-none my-auto" style={{ color: 'var(--md-sys-color-error)' }}>
            {formatMVR(totalOutstandingInvoices, false)}
          </div>
          <span className="text-[10px] sm:text-[11px] text-[var(--md-sys-color-on-surface-variant)] block truncate h-3.5 leading-none">
            Outstanding invoices
          </span>
        </Surface>

        <Surface
          variant="filled"
          level={2}
          padding="sm"
          container
          onClick={() => navigate('/purchasing')}
          className="flex flex-col justify-between h-[100px] min-w-0 cursor-pointer hover:border-[var(--md-sys-color-primary)] transition-all"
        >
          <span className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4">
            Accounts Payable
          </span>
          <div className="text-base sm:text-lg font-bold mono-num truncate leading-none my-auto" style={{ color: 'var(--warning)' }}>
            {formatMVR(totalAccountsPayable, false)}
          </div>
          <span className="text-[10px] sm:text-[11px] text-[var(--md-sys-color-on-surface-variant)] block truncate h-3.5 leading-none">
            {payableSuppliersCount > 0
              ? `Vendor dues (${payableSuppliersCount} ${payableSuppliersCount === 1 ? 'supplier' : 'suppliers'})`
              : 'No outstanding dues'}
          </span>
        </Surface>

        <Surface
          variant="filled"
          level={2}
          padding="sm"
          container
          onClick={() => navigate('/jobs')}
          className="flex flex-col justify-between h-[100px] min-w-0 cursor-pointer hover:border-[var(--md-sys-color-primary)] transition-all"
        >
          <span className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4">
            {currentTerms.orders}
          </span>
          <div className="text-base sm:text-lg font-bold mono-num truncate leading-none my-auto" style={{ color: 'var(--md-sys-color-primary)' }}>
            {activeJobsCount} {currentArchetype.id === 'automotive_workshop' ? 'In Bay' : 'Active'}
          </div>
          <span className="text-[10px] sm:text-[11px] text-[var(--md-sys-color-on-surface-variant)] block truncate h-3.5 leading-none">
            {currentArchetype.id === 'automotive_workshop' ? 'Floor work orders' : 'In progress'}
          </span>
        </Surface>

        {/* Capability-driven KPI: Only show Inventory if physical stock is enabled / applicable */}
        {currentArchetype.id !== 'software_services' && currentArchetype.id !== 'professional_services' && (
          <Surface
            variant="filled"
            level={2}
            padding="sm"
            container
            onClick={() => navigate('/inventory')}
            className="flex flex-col justify-between h-[100px] min-w-0 cursor-pointer hover:border-[var(--md-sys-color-primary)] transition-all"
          >
            <span className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] truncate h-4">
              Low Stock Items
            </span>
            <div
              className="text-base sm:text-lg font-bold mono-num truncate leading-none my-auto"
              style={{ color: lowStockItemsCount > 0 ? 'var(--md-sys-color-error)' : 'var(--positive)' }}
            >
              {lowStockItemsCount} Items
            </div>
            <span className="text-[10px] sm:text-[11px] text-[var(--md-sys-color-on-surface-variant)] block truncate h-3.5 leading-none">
              Threshold triggers
            </span>
          </Surface>
        )}
      </ResponsiveGrid>

      {/* 2-Column Section: Needs Attention + starqAI Assistant Layer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 w-full min-w-0">
        {/* Needs Attention Panel (7 cols) */}
        <Surface variant="filled" level={1} padding="md" className="lg:col-span-7 space-y-3.5 min-w-0">
          <div
            className="flex items-center justify-between pb-3 min-w-0"
            style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
          >
            <div className="flex items-center gap-2 min-w-0 truncate">
              <AlertCircle size={17} style={{ color: 'var(--md-sys-color-error)' }} className="shrink-0" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
                Needs Attention
              </h2>
            </div>
            <Badge variant={alerts.length > 0 ? "destructive" : "neutral"} size="sm">
              {alerts.length > 0 ? `${alerts.length} Action Required` : '0 Actions Required'}
            </Badge>
          </div>

          {alerts.length === 0 ? (
            <div
              className="p-6 rounded-[var(--md-sys-shape-corner-medium)] flex flex-col items-center justify-center text-center gap-3 min-w-0"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                border: '1px dashed var(--md-sys-color-outline-variant)',
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-highest)',
                  color: 'var(--positive)',
                }}
              >
                <CheckCircle2 size={20} />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                  No Operational Issues Pending
                </p>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                  All receivables, stock levels, and work orders are currently clear. Real-time alerts and exceptions will appear here as operational activity occurs.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  variant="tonal"
                  size="xs"
                  onClick={() => setIsCreateJobOpen(true)}
                  icon={<Plus size={12} />}
                >
                  <span>New Work Order</span>
                </Button>
                <Button
                  variant="outlined"
                  size="xs"
                  onClick={() => setIsCreateInvoiceOpen(true)}
                  icon={<Receipt size={12} />}
                >
                  <span>Create Invoice</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 min-w-0">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 rounded-[var(--md-sys-shape-corner-medium)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0 transition-all"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                  }}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertTriangle
                      size={16}
                      className="shrink-0 mt-0.5"
                      style={{ color: alert.urgency === 'critical' ? 'var(--md-sys-color-error)' : 'var(--warning)' }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] truncate">{alert.title}</p>
                        {alert.amount && (
                          <span className="mono-num text-xs font-bold" style={{ color: 'var(--md-sys-color-error)' }}>
                            {formatMVR(alert.amount)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5 line-clamp-2">
                        {alert.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Button
                      variant="filled"
                      size="xs"
                      onClick={() => {
                        if (alert.targetTab === 'invoices' && alert.targetId) {
                          navigate(`/invoices/${alert.targetId}`);
                        } else if (alert.targetTab === 'jobs' && alert.targetId) {
                          navigate(`/jobs/${alert.targetId}`);
                        } else if (alert.targetTab === 'purchasing' && alert.targetId) {
                          navigate(`/purchasing/${alert.targetId}`);
                        } else {
                          navigate(`/${alert.targetTab}`);
                        }
                      }}
                    >
                      <span>{alert.actionLabel}</span>
                      <ArrowRight size={12} />
                    </Button>
                    <Button
                      variant="text"
                      size="xs"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>

        {/* starqAI Insights Widget (5 cols) */}
        <Surface variant="filled" level={1} padding="md" className="lg:col-span-5 space-y-3.5 flex flex-col justify-between min-w-0">
          <div>
            <div
              className="flex items-center justify-between pb-3 min-w-0"
              style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
            >
              <div className="flex items-center gap-2 min-w-0 truncate">
                <Sparkles size={17} style={{ color: 'var(--md-sys-color-primary)' }} className="shrink-0" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
                  starqAI Insights
                </h2>
              </div>
              <button
                onClick={() => setIsAICopilotOpen(true)}
                className="text-xs font-semibold hover:underline shrink-0"
                style={{ color: 'var(--md-sys-color-primary)' }}
              >
                Open Copilot →
              </button>
            </div>

            {aiInsights.length === 0 ? (
              <div
                className="p-6 rounded-[var(--md-sys-shape-corner-medium)] flex flex-col items-center justify-center text-center gap-3 min-w-0 mt-3.5"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-high)',
                  border: '1px dashed var(--md-sys-color-outline-variant)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-highest)',
                    color: 'var(--md-sys-color-primary)',
                  }}
                >
                  <Sparkles size={20} />
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                    starqAI (Preview / Standby)
                  </p>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                    Contextual recommendations and cash-flow insights will appear here when connected to active business activity.
                  </p>
                </div>
                <Button
                  variant="tonal"
                  size="xs"
                  onClick={() => setIsAICopilotOpen(true)}
                  icon={<Sparkles size={12} />}
                >
                  <span>Open starqAI</span>
                </Button>
              </div>
            ) : (
              <div className="mt-3.5 space-y-3 min-w-0">
                {aiInsights.slice(0, 2).map((insight) => (
                  <div
                    key={insight.id}
                    className="p-3 rounded-[var(--md-sys-shape-corner-medium)] text-xs space-y-1.5 min-w-0"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div className="flex items-center justify-between min-w-0">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider truncate"
                        style={{ color: 'var(--md-sys-color-primary)' }}
                      >
                        {insight.category}
                      </span>
                      <Badge variant="neutral" size="sm">
                        {insight.impact}
                      </Badge>
                    </div>
                    <p className="font-semibold text-[var(--md-sys-color-on-surface)] truncate">{insight.title}</p>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed line-clamp-2">
                      {insight.description}
                    </p>
                    <div
                      className="pt-2 flex items-center justify-between min-w-0"
                      style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}
                    >
                      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[160px]">
                        {insight.recommendedAction}
                      </span>
                      <Button
                        variant="tonal"
                        size="xs"
                        onClick={() => triggerAIInsightAction(insight)}
                      >
                        {insight.actionButtonLabel}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {jobs.length > 0 && (
            <div
              className="p-3 rounded-[var(--md-sys-shape-corner-small)] text-xs flex items-center justify-between mt-3 min-w-0"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                border: '1px solid var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0 truncate">
                <Zap size={14} style={{ color: 'var(--md-sys-color-primary)' }} className="shrink-0" />
                <span className="truncate text-[var(--md-sys-color-on-surface)]">
                  Job {jobs[0].jobId}: {jobs[0].serviceType || 'Work Order in Progress'}
                </span>
              </div>
              <Link
                to={`/jobs/${jobs[0].id}`}
                className="font-bold hover:underline shrink-0 ml-2"
                style={{ color: 'var(--md-sys-color-primary)' }}
              >
                View
              </Link>
            </div>
          )}
        </Surface>
      </div>

      {/* Active Work Orders in Floor Module */}
      <Surface variant="filled" level={1} padding="md" className="space-y-4 min-w-0">
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 min-w-0"
          style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
        >
          <div className="min-w-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
              {currentTerms.activeOrdersHeader}
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">{currentTerms.activeOrdersSubtitle}</p>
          </div>

          <Link
            to="/jobs"
            className="text-xs font-semibold hover:underline flex items-center gap-1 shrink-0"
            style={{ color: 'var(--md-sys-color-primary)' }}
          >
            <span>View All {currentTerms.orders}</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        {/* Jobs Table in Canonical DataTable */}
        <DataTable
          data={activeJobs}
          columns={recentJobColumns}
          keyExtractor={(j) => j.id}
          onRowClick={(j) => navigate(`/jobs/${j.id}`)}
          emptyMessage={`No active ${currentTerms.orders.toLowerCase()} in progress.`}
        />
      </Surface>

      {/* Financial Performance Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 w-full min-w-0">
        <Surface variant="filled" level={1} padding="md" className="lg:col-span-8 space-y-4 min-w-0">
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 min-w-0"
            style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
          >
            <div className="min-w-0">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
                Financial Performance (MVR)
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">Revenue (excl. GST) &amp; Operating Surplus &middot; last 6 months</p>
            </div>
            <div className="flex items-center gap-3 text-xs shrink-0">
              <span className="flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)]">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--md-sys-color-primary)' }} /> Revenue
              </span>
              <span className="flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)]">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--positive)' }} /> Surplus
              </span>
            </div>
          </div>

          <div className="h-56 sm:h-60 w-full pt-2 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyPerformance}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" opacity={0.6} />
                <XAxis dataKey="month" stroke="var(--md-sys-color-on-surface-variant)" fontSize={11} />
                <YAxis stroke="var(--md-sys-color-on-surface-variant)" fontSize={11} tickFormatter={(val) => `${val / 1000}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                    color: 'var(--md-sys-color-on-surface)',
                    borderRadius: 'var(--md-sys-shape-corner-medium)',
                    fontSize: '12px'
                  }}
                  formatter={(val: any) => [formatMVR(Number(val || 0)), '']}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--md-sys-color-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="profit" stroke="var(--positive)" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="md" className="lg:col-span-4 space-y-4 flex flex-col justify-between min-w-0">
          <div>
            <h2
              className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] pb-3"
              style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
            >
              Service Mix Distribution
            </h2>
            <div className="mt-3.5 space-y-2.5 text-xs min-w-0">
              {serviceMix.length > 0 ? (
                serviceMix.map((srv, i) => (
                  <div key={i} className="space-y-1 min-w-0">
                    <div className="flex items-center justify-between text-xs min-w-0">
                      <span className="font-medium text-[var(--md-sys-color-on-surface)] truncate">{srv.name}</span>
                      <span className="mono-num font-bold shrink-0">{srv.value}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${srv.value}%`, backgroundColor: srv.color }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  No service value recorded yet. Approve a job order to track service categories.
                </div>
              )}
            </div>
          </div>

          <div
            className="p-3.5 rounded-[var(--md-sys-shape-corner-small)] space-y-1.5 mt-3 text-xs min-w-0"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              border: '1px solid var(--md-sys-color-outline-variant)',
            }}
          >
            <div className="flex items-center justify-between min-w-0">
              <span className="text-[var(--md-sys-color-on-surface-variant)]">BML Settlement:</span>
              <span className="mono-num font-semibold text-[var(--md-sys-color-on-surface)]">
                {resolveFavaraAccountNumber(currentTenant?.bmlAccount) ?? 'Not Configured'}
              </span>
            </div>
            <div className="flex items-center justify-between min-w-0">
              <span className="text-[var(--md-sys-color-on-surface-variant)]">Tax Status:</span>
              <span
                className={`font-semibold ${
                  currentTenant?.gstStatus === 'registered' ? 'text-[var(--md-sys-color-primary)]' : 'text-emerald-600'
                }`}
              >
                {currentTenant?.gstStatus === 'registered'
                  ? (currentTenant.tinNumber ? `8% GST (${currentTenant.tinNumber})` : '8% GST — TIN not recorded')
                  : 'Non-GST Registered'}
              </span>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
};
