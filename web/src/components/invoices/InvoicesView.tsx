import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Receipt,
  Search,
  Plus,
  Filter,
  CreditCard,
  Printer,
  ChevronRight,
  Clock,
  AlertCircle,
  FileCheck,
  Building2,
  DollarSign,
  FileText,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { RecordPaymentModal } from '../payments/RecordPaymentModal';
import { CreditNoteModal } from './CreditNoteModal';
import { SettlementAllocationModal } from './SettlementAllocationModal';
import { Invoice } from '../../types/erp';
import { CreditNote, CustomerAdvance, SettlementAllocation } from '../../domain/creditNotes';
import {
  Button,
  Input,
  Surface,
  DataTable,
  ColumnDef,
  Badge,
  ActionGroup,
  ResponsiveGrid,
  type BadgeVariant,
} from '../ui';

export const InvoicesView: React.FC = () => {
  const navigate = useNavigate();
  const {
    invoices,
    customers,
    setIsCreateInvoiceOpen,
    setIsRecordPaymentOpen,
    setPrefilledInvoiceId,
    formatMVR,
    totalOutstandingInvoices,
    currentTenant,
  } = useERP();

  type InvoiceSection = 'invoices' | 'credits_advances' | 'allocations';
  const INVOICE_TAB_HEADERS: Record<InvoiceSection, { title: string; subtitle: string }> = {
    invoices: {
      title: 'Commercial Invoices & Credit Notes',
      subtitle: 'Customer billings, credit notes, advance deposits, and settlement allocation',
    },
    credits_advances: {
      title: 'Credit Notes & Advances',
      subtitle: 'Customer credit balances and advance deposits available for invoice settlement',
    },
    allocations: {
      title: 'Settlement Allocations',
      subtitle: 'Audit history of credit notes and advances allocated against invoices',
    },
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('tab') as InvoiceSection | null;
  const activeTab: InvoiceSection = ['invoices', 'credits_advances', 'allocations'].includes(requestedSection || '')
    ? requestedSection as InvoiceSection
    : 'invoices';
  const setActiveTab = (section: InvoiceSection) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', section);
    setSearchParams(next);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [isCreditNoteModalOpen, setIsCreditNoteModalOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [selectedTargetInvoice, setSelectedTargetInvoice] = useState<Invoice | null>(null);

  // Credit Notes State with Local Storage Persistence
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>(() => {
    const saved = localStorage.getItem('starq:credit_notes:v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Customer Advances State
  const [advances, setAdvances] = useState<CustomerAdvance[]>(() => {
    const saved = localStorage.getItem('starq:customer_advances:v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Settlement Allocations State
  const [allocations, setAllocations] = useState<SettlementAllocation[]>(() => {
    const saved = localStorage.getItem('starq:settlement_allocations:v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  const saveCreditNotes = (data: CreditNote[]) => {
    setCreditNotes(data);
    localStorage.setItem('starq:credit_notes:v1', JSON.stringify(data));
  };

  const saveAdvances = (data: CustomerAdvance[]) => {
    setAdvances(data);
    localStorage.setItem('starq:customer_advances:v1', JSON.stringify(data));
  };

  const saveAllocations = (data: SettlementAllocation[]) => {
    setAllocations(data);
    localStorage.setItem('starq:settlement_allocations:v1', JSON.stringify(data));
  };

  const handleCreditNoteCreated = (cn: CreditNote) => {
    const next = [cn, ...creditNotes];
    saveCreditNotes(next);
  };

  const handleAllocationCompleted = (result: {
    allocation: SettlementAllocation;
    updatedSource: CreditNote | CustomerAdvance;
    updatedInvoice: Invoice;
  }) => {
    const nextAlloc = [result.allocation, ...allocations];
    saveAllocations(nextAlloc);

    if (result.allocation.sourceType === 'CREDIT_NOTE') {
      const nextCNs = creditNotes.map((c) =>
        c.id === result.updatedSource.id ? (result.updatedSource as CreditNote) : c
      );
      saveCreditNotes(nextCNs);
    } else {
      const nextAdvs = advances.map((a) =>
        a.id === result.updatedSource.id ? (result.updatedSource as CustomerAdvance) : a
      );
      saveAdvances(nextAdvs);
    }
  };

  const isGstRegistered = currentTenant.gstStatus === 'registered';
  const gstRate = currentTenant.gstRate ?? 8;

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.linkedJobNumber && inv.linkedJobNumber.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalInvoicedSum = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalPaidSum = invoices.reduce((sum, i) => sum + i.amountPaid, 0);
  const totalCreditNotesSum = creditNotes.reduce((s, c) => s + c.totalAmount, 0);
  const totalAvailableCreditSum = creditNotes.reduce((s, c) => s + c.remainingBalance, 0) + advances.reduce((s, a) => s + a.remainingBalance, 0);

  const getStatusBadgeVariant = (status: string): BadgeVariant => {
    switch (status) {
      case 'Paid': return 'positive';
      case 'Overdue': return 'destructive';
      case 'Partially Paid': return 'warning';
      default: return 'neutral';
    }
  };

  const invoiceColumns: ColumnDef<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      align: 'left',
      width: '16%',
      render: (inv) => (
        <div className="flex flex-col min-w-0">
          <span className="font-mono font-bold text-xs" style={{ color: 'var(--md-sys-color-primary)' }}>
            {inv.invoiceNumber}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {inv.date}
          </span>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      align: 'left',
      width: '28%',
      render: (inv) => (
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-xs text-[var(--md-sys-color-on-surface)] truncate">
            {inv.customerName}
          </span>
          {inv.linkedJobNumber && (
            <span className="text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)] truncate">
              Ref: {inv.linkedJobNumber}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total (MVR)',
      align: 'right',
      isNumeric: true,
      width: '16%',
      render: (inv) => (
        <span className="font-mono font-bold text-xs text-[var(--md-sys-color-on-surface)]">
          {formatMVR(inv.totalAmount)}
        </span>
      ),
    },
    {
      key: 'balanceDue',
      header: 'Balance Due',
      align: 'right',
      isNumeric: true,
      width: '16%',
      render: (inv) => (
        <span
          className="font-mono font-bold text-xs"
          style={{ color: inv.balanceDue > 0 ? 'var(--md-sys-color-error)' : 'var(--positive)' }}
        >
          {inv.balanceDue > 0 ? formatMVR(inv.balanceDue) : '0.00'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '12%',
      render: (inv) => (
        <Badge variant={getStatusBadgeVariant(inv.status)} size="sm">
          {inv.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      width: '12%',
      render: (inv) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedTargetInvoice(inv);
            setIsCreditNoteModalOpen(true);
          }}
          className="text-[11px] font-bold text-purple-400 hover:text-purple-300 hover:underline cursor-pointer"
        >
          + Credit Note
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 w-full min-w-0" data-testid="invoices-view">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] truncate">
              {INVOICE_TAB_HEADERS[activeTab].title}
            </h1>
            <Badge variant="neutral" size="sm">
              {invoices.length} Invoices · {creditNotes.length} Credit Notes
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
            {INVOICE_TAB_HEADERS[activeTab].subtitle}
          </p>
        </div>

        <ActionGroup align="right" className="shrink-0 flex-wrap gap-2">
          <Button
            variant="tonal"
            size="sm"
            onClick={() => setIsSettlementModalOpen(true)}
            icon={<Sparkles size={14} className="text-emerald-400" />}
            data-testid="open-settlement-modal-btn"
          >
            <span>Settle & Allocate</span>
          </Button>

          <Button
            variant="tonal"
            size="sm"
            onClick={() => {
              setSelectedTargetInvoice(null);
              setIsCreditNoteModalOpen(true);
            }}
            icon={<FileText size={14} className="text-purple-400" />}
            data-testid="open-credit-note-modal-btn"
          >
            <span>Issue Credit Note</span>
          </Button>

          <Button
            variant="filled"
            size="sm"
            onClick={() => setIsCreateInvoiceOpen(true)}
            icon={<Plus size={15} />}
          >
            <span>New Invoice</span>
          </Button>
        </ActionGroup>
      </div>


      {/* KPI Cards */}
      <ResponsiveGrid columns="auto" minItemWidth="200px" gap="sm">
        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
            Total Invoiced (MTD)
          </span>
          <div className="text-base sm:text-lg font-bold tabular-nums text-[var(--md-sys-color-on-surface)] truncate font-mono">
            {formatMVR(totalInvoicedSum, false)}
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
            Outstanding Receivables
          </span>
          <div
            className="text-base sm:text-lg font-bold tabular-nums truncate font-mono"
            style={{ color: totalOutstandingInvoices > 0 ? 'var(--md-sys-color-error)' : 'var(--positive)' }}
          >
            {formatMVR(totalOutstandingInvoices, false)}
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
            Total Credit Notes Issued
          </span>
          <div className="text-base sm:text-lg font-bold tabular-nums truncate font-mono text-purple-400">
            {formatMVR(totalCreditNotesSum, false)}
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
            Unallocated Customer Funds
          </span>
          <div className="text-base sm:text-lg font-bold tabular-nums truncate font-mono text-emerald-400">
            {formatMVR(totalAvailableCreditSum, false)}
          </div>
        </Surface>
      </ResponsiveGrid>

      {activeTab === 'invoices' ? (
        <>
          {/* Filter & Search Toolbar */}
          <Surface variant="filled" level={1} padding="sm" className="flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
            <div className="relative flex-1 w-full md:max-w-md min-w-0">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by invoice #, customer name, job ID…"
                icon={<Search size={14} />}
              />
            </div>

            <div className="flex items-center gap-2 text-xs shrink-0 min-w-0">
              <span className="text-xs font-medium shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                Status:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-high)',
                  color: 'var(--md-sys-color-on-surface)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                  borderRadius: 'var(--md-sys-shape-corner-small)',
                }}
                className="h-8 sm:h-9 px-2.5 text-xs border outline-none cursor-pointer"
              >
                <option value="All">All Invoices</option>
                <option value="Paid">Paid</option>
                <option value="Partially Paid">Partially Paid</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>
          </Surface>

          {/* Canonical Invoices DataTable */}
          <DataTable
            data={filteredInvoices}
            columns={invoiceColumns}
            keyExtractor={(inv) => inv.id}
            onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
            emptyMessage="No commercial invoices matching filter criteria."
          />
        </>
      ) : activeTab === 'credits_advances' ? (
        /* Credit Notes & Advances Table */
        <Surface variant="filled" level={1} padding="md" className="space-y-4" data-testid="credits-advances-table">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
                Credit Notes & Customer Advance Deposits
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Authoritative customer credit balances available for invoice settlement
              </p>
            </div>
            <Button
              variant="filled"
              size="sm"
              onClick={() => {
                setSelectedTargetInvoice(null);
                setIsCreditNoteModalOpen(true);
              }}
              icon={<Plus size={14} />}
              className="shrink-0 whitespace-nowrap self-start sm:self-auto"
            >
              <span>Issue Credit Note</span>
            </Button>
          </div>

          <div className="erp-scroll-region overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--md-sys-color-outline-variant)]">
                <tr>
                  <th className="py-2.5 px-4">Document #</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Issue Date</th>
                  <th className="py-2.5 px-4 text-right">Total Amount</th>
                  <th className="py-2.5 px-4 text-right">Remaining Balance</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                {creditNotes.length === 0 && advances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[var(--md-sys-color-on-surface-variant)]">
                      No credit notes or advance deposits issued yet. Click "Issue Credit Note" to create one.
                    </td>
                  </tr>
                ) : (
                  <>
                    {creditNotes.map((cn) => (
                      <tr key={cn.id} className="hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors">
                        <td className="py-2 px-4 font-mono font-bold text-purple-400">
                          {cn.creditNoteNumber}
                        </td>
                        <td className="py-2 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            Credit Note
                          </span>
                        </td>
                        <td className="py-2 px-4 font-semibold text-[var(--md-sys-color-on-surface)]">
                          {cn.customerName}
                          {cn.invoiceNumber && (
                            <span className="text-[10px] block font-mono text-slate-500">Ref: {cn.invoiceNumber}</span>
                          )}
                        </td>
                        <td className="py-2 px-4 font-mono text-slate-400">
                          {cn.issueDate}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-[var(--md-sys-color-on-surface)]">
                          {formatMVR(cn.totalAmount)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-emerald-400">
                          {formatMVR(cn.remainingBalance)}
                        </td>
                        <td className="py-2 px-4 text-center">
                          <Badge variant={cn.remainingBalance <= 0.005 ? 'positive' : 'info'} size="sm">
                            {cn.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {advances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors">
                        <td className="py-2 px-4 font-mono font-bold text-emerald-400">
                          {adv.receiptNumber}
                        </td>
                        <td className="py-2 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Advance Deposit
                          </span>
                        </td>
                        <td className="py-2 px-4 font-semibold text-[var(--md-sys-color-on-surface)]">
                          {adv.customerName}
                        </td>
                        <td className="py-2 px-4 font-mono text-slate-400">
                          {adv.paymentDate}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-[var(--md-sys-color-on-surface)]">
                          {formatMVR(adv.amount)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-emerald-400">
                          {formatMVR(adv.remainingBalance)}
                        </td>
                        <td className="py-2 px-4 text-center">
                          <Badge variant={adv.remainingBalance <= 0.005 ? 'positive' : 'info'} size="sm">
                            {adv.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : (
        /* Settlement Allocations Log Table */
        <Surface variant="filled" level={1} padding="md" className="space-y-4" data-testid="allocations-table">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
                Settlement Allocations Ledger
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Audit history of credit notes and advances allocated against invoices
              </p>
            </div>
            <Button
              variant="filled"
              size="sm"
              onClick={() => setIsSettlementModalOpen(true)}
              icon={<Sparkles size={14} />}
              className="shrink-0 whitespace-nowrap self-start sm:self-auto"
            >
              <span>New Allocation</span>
            </Button>
          </div>

          <div className="erp-scroll-region overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--md-sys-color-outline-variant)]">
                <tr>
                  <th className="py-2.5 px-4">Allocation #</th>
                  <th className="py-2.5 px-4">Source Fund</th>
                  <th className="py-2.5 px-4">Target Invoice</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Allocated Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                {allocations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[var(--md-sys-color-on-surface-variant)]">
                      No settlement allocations recorded yet. Click "Settle & Allocate" to apply available credits.
                    </td>
                  </tr>
                ) : (
                  allocations.map((alloc) => (
                    <tr key={alloc.id} className="hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors font-mono">
                      <td className="py-2 px-4 font-bold text-[var(--md-sys-color-primary)]">
                        {alloc.allocationNumber}
                      </td>
                      <td className="py-2 px-4 font-bold text-purple-400">
                        {alloc.sourceNumber}
                      </td>
                      <td className="py-2 px-4 font-bold text-sky-400">
                        {alloc.targetInvoiceNumber}
                      </td>
                      <td className="py-2 px-4 font-sans font-semibold text-[var(--md-sys-color-on-surface)]">
                        {alloc.customerName}
                      </td>
                      <td className="py-2 px-4 text-slate-400">
                        {alloc.allocationDate}
                      </td>
                      <td className="py-2 px-4 text-right font-bold text-emerald-400">
                        +{formatMVR(alloc.allocatedAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {/* Credit Note Modal */}
      <CreditNoteModal
        isOpen={isCreditNoteModalOpen}
        onClose={() => {
          setIsCreditNoteModalOpen(false);
          setSelectedTargetInvoice(null);
        }}
        customers={customers}
        invoices={invoices}
        targetInvoice={selectedTargetInvoice}
        onCreditNoteCreated={handleCreditNoteCreated}
        formatMVR={formatMVR}
        isGstRegistered={isGstRegistered}
        gstRate={gstRate}
      />

      {/* Settlement Allocation Modal */}
      <SettlementAllocationModal
        isOpen={isSettlementModalOpen}
        onClose={() => setIsSettlementModalOpen(false)}
        customers={customers}
        invoices={invoices}
        creditNotes={creditNotes}
        advances={advances}
        onAllocationCompleted={handleAllocationCompleted}
        formatMVR={formatMVR}
      />
    </div>
  );
};
