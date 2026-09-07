import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Search,
  Plus,
  Building2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowUpRight,
  TrendingUp,
  Landmark
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { RecordPaymentModal } from './RecordPaymentModal';
import { Payment } from '../../types/erp';
import {
  Button,
  Input,
  Surface,
  DataTable,
  ColumnDef,
  Badge,
  ActionGroup,
  ResponsiveGrid,
} from '../ui';

export const PaymentsView: React.FC = () => {
  const navigate = useNavigate();
  const {
    payments,
    currentTenant,
    setIsRecordPaymentOpen,
    formatMVR,
    totalCashReceived
  } = useERP();

  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');

  const bmlReceived = payments
    .filter((p) => p.method.toLowerCase().includes('bml') || p.method.toLowerCase().includes('transfer'))
    .reduce((sum, p) => sum + p.amount, 0);

  const mibReceived = payments
    .filter((p) => p.method.toLowerCase().includes('mib') || p.method.toLowerCase().includes('islamic'))
    .reduce((sum, p) => sum + p.amount, 0);

  const cashReceived = payments
    .filter((p) => p.method.toLowerCase().includes('cash') || p.method.toLowerCase().includes('pos'))
    .reduce((sum, p) => sum + p.amount, 0);

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      p.paymentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesMethod = methodFilter === 'All' || p.method.includes(methodFilter);
    return matchesSearch && matchesMethod;
  });

  const columns: ColumnDef<Payment>[] = [
    {
      key: 'paymentNumber',
      header: 'Receipt #',
      width: '16%',
      render: (p) => (
        <span
          className="mono-num text-xs font-semibold"
          style={{ color: 'var(--md-sys-color-primary)' }}
          title={p.paymentNumber}
        >
          {p.paymentNumber}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      width: '24%',
      render: (p) => (
        <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">
          {p.customerName}
        </div>
      ),
    },
    {
      key: 'invoiceNumber',
      header: 'Matched Invoice',
      width: '14%',
      hideOn: 'compact',
      render: (p) => (
        <span className="mono-num text-xs text-[var(--md-sys-color-on-surface-variant)]" title={p.invoiceNumber}>
          {p.invoiceNumber}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Channel & Ref',
      width: '18%',
      hideOn: 'medium',
      render: (p) => (
        <div className="min-w-0">
          <div className="text-xs text-[var(--md-sys-color-on-surface)] truncate">{p.method}</div>
          <div className="text-[11px] mono-num text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
            Ref: {p.referenceNumber}
          </div>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      width: '12%',
      render: (p) => (
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{p.paymentDate}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount Received',
      align: 'right',
      isNumeric: true,
      width: '16%',
      render: (p) => (
        <span className="font-bold text-xs tabular-nums text-[var(--positive)]">
          {formatMVR(p.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '12%',
      render: (p) => (
        <Badge variant={p.status === 'Verified' ? 'positive' : 'warning'} size="sm">
          {p.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      width: '10%',
      render: () => (
        <span className="text-xs font-semibold hover:underline" style={{ color: 'var(--md-sys-color-primary)' }}>
          Receipt →
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] truncate">
              Payments & Cash Receipts
            </h1>
            <Badge variant="positive" size="sm">
              {payments.length} Transactions
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
            Customer payment receipts, bank transfers (BML, MIB), and settlement reconciliation
          </p>
        </div>

        <ActionGroup align="right" className="shrink-0">
          <Button
            variant="filled"
            size="sm"
            onClick={() => setIsRecordPaymentOpen(true)}
            icon={<Plus size={15} />}
          >
            <span>Record Payment</span>
          </Button>
        </ActionGroup>
      </div>

      {/* Account Balances Strip */}
      <ResponsiveGrid columns="auto" minItemWidth="200px" gap="sm">
        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <div className="flex items-center justify-between min-w-0">
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
              BML Main Business A/C
            </span>
            <Landmark size={15} style={{ color: 'var(--md-sys-color-primary)' }} />
          </div>
          <div className="text-base sm:text-lg font-bold tabular-nums text-[var(--md-sys-color-on-surface)] truncate">
            {formatMVR(bmlReceived)}
          </div>
          <div className="text-[11px] mono-num text-[var(--md-sys-color-on-surface-variant)] truncate">
            {currentTenant?.bmlAccount ? currentTenant.bmlAccount.split(' ')[0] : 'BML Main'}
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <div className="flex items-center justify-between min-w-0">
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
              MIB Islamic Account
            </span>
            <Landmark size={15} style={{ color: 'var(--positive)' }} />
          </div>
          <div className="text-base sm:text-lg font-bold tabular-nums text-[var(--md-sys-color-on-surface)] truncate">
            {formatMVR(mibReceived)}
          </div>
          <div className="text-[11px] mono-num text-[var(--md-sys-color-on-surface-variant)] truncate">
            {currentTenant?.mibAccount ? currentTenant.mibAccount.split(' ')[0] : 'MIB Corporate'}
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <div className="flex items-center justify-between min-w-0">
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
              Counter Cash / POS
            </span>
            <CreditCard size={15} style={{ color: 'var(--warning)' }} />
          </div>
          <div className="text-base sm:text-lg font-bold tabular-nums text-[var(--md-sys-color-on-surface)] truncate">
            {formatMVR(cashReceived)}
          </div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
            Cash in hand / counter drawer
          </div>
        </Surface>
      </ResponsiveGrid>

      {/* Search & Filter Toolbar */}
      <Surface variant="filled" level={1} padding="sm" className="flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
        <div className="relative flex-1 w-full md:max-w-md min-w-0">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by payment #, customer, reference, invoice…"
            icon={<Search size={14} />}
          />
        </div>

        <div className="flex items-center gap-2 text-xs shrink-0 min-w-0">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            Method:
          </span>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface)',
              borderColor: 'var(--md-sys-color-outline-variant)',
              borderRadius: 'var(--md-sys-shape-corner-small)',
            }}
            className="h-8 sm:h-9 px-2.5 text-xs border outline-none cursor-pointer"
          >
            <option value="All">All Channels</option>
            <option value="BML Transfer">BML Transfer</option>
            <option value="MIB Transfer">MIB Transfer</option>
            <option value="Cash">Cash</option>
            <option value="POS Card">Card Swipe</option>
          </select>
        </div>
      </Surface>

      {/* Canonical DataTable */}
      <DataTable
        data={filteredPayments}
        columns={columns}
        keyExtractor={(p) => p.id}
        onRowClick={(p) => navigate(`/payments/${p.id}`)}
        emptyMessage="No payment transactions matching search criteria."
      />
    </div>
  );
};
