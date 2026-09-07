import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Car,
  MapPin,
  Receipt,
  Wrench,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Surface, Button, Badge, DataTable, ColumnDef } from '../ui';
import { JobOrder, Invoice } from '../../types/erp';

export const CustomerDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, jobs, invoices, formatMVR, currentArchetype, currentTerms } = useERP();
  const isAutomotive = currentArchetype?.terminology?.showVehicleFields ?? false;

  const [activeTab, setActiveTab] = useState<'overview' | 'vehicles' | 'jobs' | 'invoices' | 'notes'>('overview');

  const customer = customers.find((c) => c.id === id);

  if (!customer) {
    return (
      <div className="space-y-6">
        <Button
          variant="text"
          size="sm"
          onClick={() => navigate('/customers')}
          icon={<ArrowLeft size={16} />}
        >
          <span>Back to Customers</span>
        </Button>
        <Surface variant="outlined" padding="lg" className="text-center py-12 space-y-3">
          <Users size={40} className="mx-auto text-[var(--md-sys-color-on-surface-variant)] opacity-60" />
          <h2 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
            Customer Profile Not Found
          </h2>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            No customer matching ID "{id}" was found in this workspace.
          </p>
          <div className="pt-2">
            <Button variant="filled" size="sm" onClick={() => navigate('/customers')}>
              <span>View All Customers</span>
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  const customerJobs = jobs.filter((j) => j.customerId === customer.id);
  const customerInvoices = invoices.filter((inv) => inv.customerId === customer.id);

  const jobColumns: ColumnDef<JobOrder>[] = [
    {
      key: 'jobId',
      header: 'Job ID',
      render: (j) => <span className="font-mono font-bold text-[var(--md-sys-color-primary)]">{j.jobId}</span>,
    },
    {
      key: 'serviceType',
      header: 'Service',
      render: (j) => <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{j.serviceType}</span>,
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (j) => (
        <span className="font-mono text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {j.vehicle.plateNumber} ({j.vehicle.model})
        </span>
      ),
    },
    {
      key: 'quotedAmount',
      header: 'Quoted Amount',
      align: 'right',
      render: (j) => <span className="font-mono font-bold mono-num">{formatMVR(j.quotedAmount)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (j) => (
        <Badge
          variant={j.status === 'Completed' ? 'positive' : j.status === 'In Progress' ? 'info' : 'warning'}
          size="sm"
        >
          {j.status}
        </Badge>
      ),
    },
  ];

  const invoiceColumns: ColumnDef<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (inv) => <span className="font-mono font-bold text-[var(--md-sys-color-primary)]">{inv.invoiceNumber}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (inv) => <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{inv.date}</span>,
    },
    {
      key: 'totalAmount',
      header: 'Total Amount',
      align: 'right',
      render: (inv) => <span className="font-mono font-bold mono-num">{formatMVR(inv.totalAmount)}</span>,
    },
    {
      key: 'amountPaid',
      header: 'Paid',
      align: 'right',
      render: (inv) => (
        <span className="font-mono text-[var(--md-sys-color-primary)] mono-num">
          {formatMVR(inv.amountPaid)}
        </span>
      ),
    },
    {
      key: 'balanceDue',
      header: 'Balance',
      align: 'right',
      render: (inv) => (
        <span
          className={`font-mono font-bold mono-num ${
            inv.balanceDue > 0 ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-primary)]'
          }`}
        >
          {formatMVR(inv.balanceDue)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (inv) => (
        <Badge
          variant={inv.status === 'Paid' ? 'positive' : inv.status === 'Overdue' ? 'destructive' : 'warning'}
          size="sm"
        >
          {inv.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation & Profile Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="tonal"
          size="sm"
          onClick={() => navigate('/customers')}
          icon={<ArrowLeft size={16} />}
          aria-label="Back to Customers"
        />

        {/* Customer Logo or Initials Avatar */}
        <div
          className="w-12 h-12 rounded-[var(--md-sys-shape-corner-medium)] flex items-center justify-center shrink-0 overflow-hidden border"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          {customer.logoUrl ? (
            <img
              src={customer.logoUrl}
              alt={customer.name}
              className="max-h-full max-w-full object-contain select-none p-1"
            />
          ) : (
            <span
              className="font-bold text-sm"
              style={{ color: 'var(--md-sys-color-primary)' }}
            >
              {customer.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] truncate">
              {customer.name}
            </h1>
            <Badge
              variant={customer.type === 'VIP' ? 'warning' : customer.type === 'Fleet' ? 'info' : 'neutral'}
              size="sm"
            >
              {customer.type}
            </Badge>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 flex flex-wrap items-center gap-2 sm:gap-3">
            <span>{customer.phone}</span>
            <span>•</span>
            <span>{customer.email}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} />
              <span>{customer.island}</span>
            </span>
          </p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Surface variant="outlined" padding="sm" className="space-y-1">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
            Total Invoiced
          </span>
          <div className="text-lg font-bold font-mono mono-num text-[var(--md-sys-color-on-surface)]">
            {formatMVR(customer.totalInvoiced, false)}
          </div>
        </Surface>

        <Surface variant="outlined" padding="sm" className="space-y-1">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
            Outstanding Balance
          </span>
          <div
            className={`text-lg font-bold font-mono mono-num ${
              customer.outstandingBalance > 0
                ? 'text-[var(--md-sys-color-error)]'
                : 'text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            {formatMVR(customer.outstandingBalance, false)}
          </div>
        </Surface>

        <Surface variant="outlined" padding="sm" className="space-y-1">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
            Active {currentTerms.orders}
          </span>
          <div className="text-lg font-bold font-mono mono-num text-[var(--md-sys-color-primary)]">
            {customerJobs.filter((j) => !['Completed', 'Paid'].includes(j.status)).length} Active
          </div>
        </Surface>

        {isAutomotive && (
          <Surface variant="outlined" padding="sm" className="space-y-1">
            <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
              Registered Vehicles
            </span>
            <div className="text-lg font-bold font-mono mono-num text-[var(--md-sys-color-on-surface)]">
              {customer.vehicles.length} Units
            </div>
          </Surface>
        )}
      </div>

      {/* Navigation Tabs */}
      <div
        className="w-full max-w-full overflow-x-auto no-scrollbar border-b"
        style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
      >
        <div className="flex gap-4 min-w-max">
          {[
            { id: 'overview', label: 'Overview' },
            ...(isAutomotive
              ? [{ id: 'vehicles', label: `Vehicles (${customer.vehicles.length})` }]
              : []),
            { id: 'jobs', label: `${currentTerms.orders} (${customerJobs.length})` },
            { id: 'invoices', label: `Invoices (${customerInvoices.length})` },
            { id: 'notes', label: 'Notes & Preferences' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="pb-3 text-xs sm:text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                color:
                  activeTab === tab.id
                    ? 'var(--md-sys-color-primary)'
                    : 'var(--md-sys-color-on-surface-variant)',
                borderBottom:
                  activeTab === tab.id
                    ? '2px solid var(--md-sys-color-primary)'
                    : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Surface variant="outlined" padding="md" className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
              Primary Contact & Location
            </h3>
            <div className="space-y-2.5 text-xs">
              <div
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Full Name:</span>
                <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{customer.name}</span>
              </div>
              <div
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Phone Number:</span>
                <span className="font-mono text-[var(--md-sys-color-on-surface)]">{customer.phone}</span>
              </div>
              <div
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Email Address:</span>
                <span className="text-[var(--md-sys-color-on-surface)]">{customer.email}</span>
              </div>
              <div
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Island / Atoll:</span>
                <span className="text-[var(--md-sys-color-on-surface)]">{customer.island}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Customer Since:</span>
                <span className="text-[var(--md-sys-color-on-surface)]">{customer.createdAt}</span>
              </div>
            </div>
          </Surface>

          {isAutomotive && customer.vehicles.length > 0 && (
            <Surface variant="outlined" padding="md" className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
                Registered Vehicles
              </h3>
              <div className="space-y-2">
                {customer.vehicles.map((v, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-[var(--md-sys-shape-corner-medium)] border flex items-center justify-between text-xs"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-low)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Car size={16} className="text-[var(--md-sys-color-primary)]" />
                      <div>
                        <span className="font-mono font-bold block text-[var(--md-sys-color-primary)]">
                          {v.plateNumber}
                        </span>
                        <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                          {v.make} {v.model} ({v.color})
                        </span>
                      </div>
                    </div>
                    <Badge variant="neutral" size="sm">
                      {v.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </Surface>
          )}
        </div>
      )}

      {isAutomotive && activeTab === 'vehicles' && (
        <Surface variant="outlined" padding="md" className="space-y-4">
          <div
            className="flex items-center justify-between border-b pb-3"
            style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
          >
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Registered Vehicles & Vessels
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {customer.vehicles.map((v, idx) => (
              <div
                key={idx}
                className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border space-y-2"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-low)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-[var(--md-sys-color-primary)]">
                    {v.plateNumber}
                  </span>
                  <Badge variant="neutral" size="sm">
                    {v.type}
                  </Badge>
                </div>
                <div className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                  {v.make} {v.model}
                </div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  Year: {v.year || 'N/A'} • Color: {v.color}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      )}

      {activeTab === 'jobs' && (
        <Surface variant="outlined" padding="md" className="space-y-4">
          <div
            className="flex items-center justify-between border-b pb-3"
            style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
          >
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Work Order History
            </h3>
          </div>
          <DataTable
            data={customerJobs}
            columns={jobColumns}
            keyExtractor={(j) => j.id}
            onRowClick={(j) => navigate(`/jobs/${j.id}`)}
            emptyMessage="No work orders recorded for this customer."
          />
        </Surface>
      )}

      {activeTab === 'invoices' && (
        <Surface variant="outlined" padding="md" className="space-y-4">
          <div
            className="flex items-center justify-between border-b pb-3"
            style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
          >
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Commercial Invoices
            </h3>
          </div>
          <DataTable
            data={customerInvoices}
            columns={invoiceColumns}
            keyExtractor={(inv) => inv.id}
            onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
            emptyMessage="No invoices generated for this customer."
          />
        </Surface>
      )}

      {activeTab === 'notes' && (
        <Surface variant="outlined" padding="md" className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
            Customer Operational Notes
          </h3>
          <div
            className="p-4 rounded-[var(--md-sys-shape-corner-medium)] text-xs leading-relaxed"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-low)',
              color: 'var(--md-sys-color-on-surface)',
            }}
          >
            {customer.notes || 'No customer notes recorded.'}
          </div>
        </Surface>
      )}
    </div>
  );
};
