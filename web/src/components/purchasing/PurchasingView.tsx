import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ArrowUpDown,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Surface, Button, Badge, DataTable, ColumnDef, ResponsiveGrid } from '../ui';
import { CreatePOModal } from './CreatePOModal';
import { PurchaseOrder } from '../../types/erp';

export const PurchasingView: React.FC = () => {
  const navigate = useNavigate();
  const { purchaseOrders, suppliers, formatMVR, setIsCreatePOOpen } = useERP();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const filteredPOs = purchaseOrders.filter((po) => {
    const matchesSearch =
      searchQuery === '' ||
      po.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.items.some((i) => i.itemName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || po.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalAccountsPayable = suppliers.reduce((sum, s) => sum + s.outstandingPayable, 0);

  const columns: ColumnDef<PurchaseOrder>[] = [
    {
      key: 'poNumber',
      header: 'PO #',
      render: (po) => <span className="font-mono font-bold text-[var(--md-sys-color-primary)]">{po.poNumber}</span>,
    },
    {
      key: 'supplierName',
      header: 'Supplier / Vendor',
      render: (po) => <span className="font-bold text-xs text-[var(--md-sys-color-on-surface)]">{po.supplierName}</span>,
    },
    {
      key: 'orderDate',
      header: 'Order Date',
      render: (po) => <span className="text-xs text-[var(--md-sys-color-on-surface)]">{po.orderDate}</span>,
    },
    {
      key: 'expectedDeliveryDate',
      header: 'Expected Delivery',
      render: (po) => <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{po.expectedDeliveryDate}</span>,
    },
    {
      key: 'items',
      header: 'Items Ordered',
      render: (po) => (
        <div>
          <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)]">{po.items.length} line items</div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-xs">
            {po.items.map((i) => `${i.itemName} (${i.quantity})`).join(', ')}
          </div>
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total Amount',
      align: 'right',
      render: (po) => (
        <span className="font-mono font-bold mono-num text-[var(--md-sys-color-on-surface)]">
          {formatMVR(po.totalAmount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (po) => (
        <Badge
          variant={
            po.status === 'Received & Stocked'
              ? 'positive'
              : po.status === 'Sent'
              ? 'warning'
              : 'neutral'
          }
          size="sm"
        >
          {po.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
            Purchasing & Material Procurement
          </h1>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            Procure raw paint, clearcoat, and workshop supplies from accredited suppliers
          </p>
        </div>

        <Button
          variant="filled"
          size="sm"
          onClick={() => setIsCreatePOOpen(true)}
          icon={<Plus size={15} />}
        >
          <span>New Purchase Order</span>
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Surface variant="outlined" padding="sm" className="space-y-1">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
            Total Accounts Payable
          </span>
          <div
            className={`text-2xl font-bold font-mono mono-num mt-1 ${
              totalAccountsPayable > 0
                ? 'text-[var(--md-sys-color-error)]'
                : 'text-[var(--md-sys-color-primary)]'
            }`}
          >
            {formatMVR(totalAccountsPayable, false)}
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            Unpaid supplier dues
          </span>
        </Surface>

        <Surface variant="outlined" padding="sm" className="space-y-1">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
            Open Purchase Orders
          </span>
          <div className="text-2xl font-bold font-mono mono-num mt-1 text-[var(--md-sys-color-primary)]">
            {purchaseOrders.filter((p) => p.status === 'Sent').length} Active
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            Awaiting delivery & check-in
          </span>
        </Surface>

        <Surface variant="outlined" padding="sm" className="space-y-1">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
            Approved Suppliers
          </span>
          <div className="text-2xl font-bold font-mono mono-num mt-1 text-[var(--md-sys-color-on-surface)]">
            {suppliers.length} Vendors
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            Paints, vinyls, abrasives
          </span>
        </Surface>
      </div>

      {/* Toolbar & Filter */}
      <Surface variant="outlined" padding="sm" className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="text-[var(--md-sys-color-on-surface-variant)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by PO #, supplier name, item..."
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface)',
              borderColor: 'var(--md-sys-color-outline-variant)',
              borderRadius: 'var(--md-sys-shape-corner-small)',
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs border outline-none focus:border-[var(--md-sys-color-primary)]"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--md-sys-color-on-surface-variant)]">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface)',
              borderColor: 'var(--md-sys-color-outline-variant)',
              borderRadius: 'var(--md-sys-shape-corner-small)',
            }}
            className="h-8 px-2.5 text-xs border outline-none cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="Sent">Sent (In Transit)</option>
            <option value="Received & Stocked">Received & Stocked</option>
            <option value="Draft">Draft</option>
          </select>
        </div>
      </Surface>

      {/* Orders Table */}
      <DataTable
        data={filteredPOs}
        columns={columns}
        keyExtractor={(po) => po.id}
        onRowClick={(po) => navigate(`/purchasing/${po.id}`)}
        emptyMessage="No purchase orders found matching criteria."
      />

      <CreatePOModal />
    </div>
  );
};
