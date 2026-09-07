import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  Car,
  ChevronRight,
  Filter,
  DollarSign,
  Receipt,
  Wrench,
  Sparkles
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { NewCustomerModal } from './NewCustomerModal';
import { Customer } from '../../types/erp';
import {
  Button,
  Input,
  Surface,
  DataTable,
  ColumnDef,
  Badge,
  ActionGroup,
  type BadgeVariant,
} from '../ui';

export const CustomersView: React.FC = () => {
  const navigate = useNavigate();
  const {
    customers,
    setIsNewCustomerOpen,
    formatMVR,
    currentArchetype,
    currentTerms,
  } = useERP();

  const isAutomotive = currentArchetype?.terminology?.showVehicleFields ?? false;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterIsland, setFilterIsland] = useState<string>('All');

  const filtered = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (isAutomotive &&
        c.vehicles.some(
          (v) =>
            v.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.model.toLowerCase().includes(searchQuery.toLowerCase())
        ));
    const matchesType = filterType === 'All' || c.type === filterType;
    const matchesIsland = filterIsland === 'All' || c.island.includes(filterIsland);
    return matchesSearch && matchesType && matchesIsland;
  });

  const getCustomerTypeVariant = (type: string): BadgeVariant => {
    switch (type) {
      case 'VIP': return 'warning';
      case 'Fleet': return 'info';
      case 'Corporate': return 'accent';
      default: return 'neutral';
    }
  };

  const columns: ColumnDef<Customer>[] = [
    {
      key: 'name',
      header: `${currentTerms.customer} & Contact`,
      width: isAutomotive ? '28%' : '34%',
      render: (c) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-7 h-7 rounded-[var(--md-sys-shape-corner-small)] flex items-center justify-center shrink-0 overflow-hidden border border-[var(--md-sys-color-outline-variant)]"
            style={{ backgroundColor: 'var(--md-sys-color-surface-container-high)' }}
          >
            {c.logoUrl ? (
              <img src={c.logoUrl} alt="" className="max-h-full max-w-full object-contain p-0.5" />
            ) : (
              <span className="font-bold text-[10px]" style={{ color: 'var(--md-sys-color-primary)' }}>
                {c.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">{c.name}</div>
            <div className="text-[11px] mono-num truncate text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
              {c.phone} • {c.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type & Location',
      width: isAutomotive ? '18%' : '24%',
      hideOn: 'compact',
      render: (c) => (
        <div className="min-w-0">
          <Badge variant={getCustomerTypeVariant(c.type)} size="sm">
            {c.type}
          </Badge>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1 truncate">{c.island}</div>
        </div>
      ),
    },
    ...(isAutomotive
      ? [
          {
            key: 'vehicles',
            header: 'Vehicles',
            width: '22%',
            hideOn: 'medium' as const,
            render: (c: Customer) => (
              <div className="flex flex-wrap gap-1 min-w-0">
                {c.vehicles.map((v, i) => (
                  <span
                    key={i}
                    className="mono-num text-[10px] font-semibold px-1.5 py-0.5 rounded-[var(--md-sys-shape-corner-extra-small)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      color: 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    {v.plateNumber}
                  </span>
                ))}
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'activeJobsCount',
      header: 'Active',
      align: 'center',
      width: '10%',
      render: (c) =>
        c.activeJobsCount > 0 ? (
          <Badge variant="accent" size="sm">
            {c.activeJobsCount} {currentTerms.orders}
          </Badge>
        ) : (
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">0</span>
        ),
    },
    {
      key: 'totalInvoiced',
      header: 'Invoiced',
      align: 'right',
      isNumeric: true,
      width: '12%',
      hideOn: 'compact',
      render: (c) => (
        <span className="font-semibold text-xs text-[var(--md-sys-color-on-surface)]">
          {formatMVR(c.totalInvoiced, false)}
        </span>
      ),
    },
    {
      key: 'outstandingBalance',
      header: 'Balance',
      align: 'right',
      isNumeric: true,
      width: '12%',
      render: (c) => (
        <span
          className="font-semibold text-xs"
          style={{ color: c.outstandingBalance > 0 ? 'var(--md-sys-color-error)' : 'var(--positive)' }}
        >
          {c.outstandingBalance > 0 ? formatMVR(c.outstandingBalance, false) : '0.00'}
        </span>
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

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 w-full min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] truncate">
              {currentTerms.customers} & Accounts
            </h1>
            <Badge variant="neutral" size="sm">
              {customers.length} Profiles
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
            {isAutomotive
              ? 'Client directory, registered assets, job histories, and outstanding receivables'
              : 'Directory of client accounts, contracts, order histories, and outstanding balances'}
          </p>
        </div>

        <ActionGroup align="right" className="shrink-0">
          <Button
            variant="filled"
            size="sm"
            onClick={() => setIsNewCustomerOpen(true)}
            icon={<Plus size={15} />}
          >
            <span>Add {currentTerms.customer}</span>
          </Button>
        </ActionGroup>
      </div>

      {/* Filter & Search Toolbar */}
      <Surface variant="filled" level={1} padding="sm" className="flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
        <div className="relative flex-1 w-full md:max-w-md min-w-0">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isAutomotive
                ? 'Search by customer name, phone, plate # or model…'
                : `Search by ${currentTerms.customer.toLowerCase()} name, phone, email…`
            }
            icon={<Search size={14} />}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Type:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface)',
                borderColor: 'var(--md-sys-color-outline-variant)',
                borderRadius: 'var(--md-sys-shape-corner-small)',
              }}
              className="h-8 sm:h-9 px-2.5 text-xs border outline-none cursor-pointer"
            >
              <option value="All">All Types</option>
              <option value="Individual">Individual</option>
              <option value="VIP">VIP</option>
              <option value="Fleet">Fleet</option>
              <option value="Corporate">Corporate</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Island:</span>
            <select
              value={filterIsland}
              onChange={(e) => setFilterIsland(e.target.value)}
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface)',
                borderColor: 'var(--md-sys-color-outline-variant)',
                borderRadius: 'var(--md-sys-shape-corner-small)',
              }}
              className="h-8 sm:h-9 px-2.5 text-xs border outline-none cursor-pointer"
            >
              <option value="All">All Islands</option>
              <option value="Male">Male' City</option>
              <option value="Hulhumale">Hulhumale'</option>
              <option value="Villimale">Villimale'</option>
            </select>
          </div>
        </div>
      </Surface>

      {/* Canonical DataTable */}
      <DataTable
        data={filtered}
        columns={columns}
        keyExtractor={(c) => c.id}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        emptyMessage="No customer accounts matching current filter criteria."
      />

      <NewCustomerModal />
    </div>
  );
};
