import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Truck,
  Building2,
  Phone,
  Mail,
  MapPin,
  Package,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Surface, Button, Badge } from '../ui';

export const SupplierDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { suppliers, purchaseOrders, inventory, formatMVR } = useERP();

  const supplier = suppliers.find((s) => s.id === id);

  if (!supplier) {
    return (
      <div className="space-y-6">
        <Button
          variant="text"
          size="sm"
          onClick={() => navigate('/suppliers')}
          icon={<ArrowLeft size={16} />}
        >
          <span>Back to Suppliers</span>
        </Button>
        <Surface variant="outlined" padding="lg" className="text-center py-12 space-y-3">
          <Truck size={40} className="mx-auto text-[var(--md-sys-color-on-surface-variant)] opacity-60" />
          <h2 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
            Supplier Record Not Found
          </h2>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            No supplier matching ID "{id}" was found in this workspace.
          </p>
          <div className="pt-2">
            <Button variant="filled" size="sm" onClick={() => navigate('/suppliers')}>
              <span>View All Suppliers</span>
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  const supplierPOs = purchaseOrders.filter(
    (p) => p.supplierId === supplier.id || p.supplierName === supplier.name,
  );
  const suppliedItems = inventory.filter(
    (item) => item.supplierId === supplier.id || item.supplierName === supplier.name,
  );

  return (
    <div className="space-y-6 pb-12 print:p-0 print:m-0">
      {/* Top Header */}
      <div className="flex items-center gap-3 print:hidden">
        <Button
          variant="tonal"
          size="sm"
          onClick={() => navigate('/suppliers')}
          icon={<ArrowLeft size={16} />}
          aria-label="Back to Suppliers"
        />
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
              {supplier.name}
            </h1>
            <Badge variant="neutral" size="sm">
              {supplier.category}
            </Badge>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            Contact: {supplier.contactPerson} • {supplier.phone} • {supplier.islandOrCountry}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Surface variant="outlined" padding="sm" className="space-y-1">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
            Outstanding Payable
          </span>
          <div
            className={`text-xl font-bold font-mono mono-num ${
              supplier.outstandingPayable > 0
                ? 'text-[var(--md-sys-color-error)]'
                : 'text-[var(--md-sys-color-primary)]'
            }`}
          >
            {formatMVR(supplier.outstandingPayable)}
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            Pending balance due to vendor
          </span>
        </Surface>

        <Surface variant="outlined" padding="sm" className="space-y-1">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
            Total POs Placed
          </span>
          <div className="text-xl font-bold font-mono mono-num text-[var(--md-sys-color-primary)]">
            {supplierPOs.length} Orders
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            Lifetime purchase orders
          </span>
        </Surface>

        <Surface variant="outlined" padding="sm" className="space-y-1">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] block">
            Supplied Inventory SKUs
          </span>
          <div className="text-xl font-bold font-mono mono-num text-[var(--md-sys-color-on-surface)]">
            {suppliedItems.length} Materials
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            Catalog items sourced
          </span>
        </Surface>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): PO History & Catalog */}
        <div className="lg:col-span-8 space-y-6">
          {/* Purchase Order History */}
          <Surface variant="outlined" padding="md" className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Purchase Order History
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr
                    className="border-b"
                    style={{
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    <th className="py-2.5 pr-4 font-semibold">PO #</th>
                    <th className="py-2.5 px-3 font-semibold">Order Date</th>
                    <th className="py-2.5 px-3 font-semibold">Items</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                    <th className="py-2.5 pl-4 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                  {supplierPOs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-center py-6 text-[var(--md-sys-color-on-surface-variant)]"
                      >
                        No purchase orders recorded for this supplier.
                      </td>
                    </tr>
                  ) : (
                    supplierPOs.map((po) => (
                      <tr
                        key={po.id}
                        className="hover:bg-[var(--md-sys-color-surface-container-low)] cursor-pointer"
                        onClick={() => navigate(`/purchasing/${po.id}`)}
                      >
                        <td className="py-3 pr-4 font-mono font-bold text-[var(--md-sys-color-primary)]">
                          {po.poNumber}
                        </td>
                        <td className="py-3 px-3 text-xs text-[var(--md-sys-color-on-surface)]">
                          {po.orderDate}
                        </td>
                        <td className="py-3 px-3 text-xs text-[var(--md-sys-color-on-surface)]">
                          {po.items.length} items
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold mono-num text-[var(--md-sys-color-on-surface)]">
                          {formatMVR(po.totalAmount)}
                        </td>
                        <td className="py-3 pl-4 text-center">
                          <Badge
                            variant={
                              po.status === 'Received & Stocked' ? 'positive' : 'warning'
                            }
                            size="sm"
                          >
                            {po.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Surface>

          {/* Supplied Inventory SKUs */}
          <Surface variant="outlined" padding="md" className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Supplied Inventory SKUs
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr
                    className="border-b"
                    style={{
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    <th className="py-2.5 pr-4 font-semibold">SKU</th>
                    <th className="py-2.5 px-3 font-semibold">Material Name</th>
                    <th className="py-2.5 px-3 font-semibold">Stock Qty</th>
                    <th className="py-2.5 pl-4 font-semibold text-right">Unit Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                  {suppliedItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-6 text-[var(--md-sys-color-on-surface-variant)]"
                      >
                        No catalog inventory items mapped to this supplier.
                      </td>
                    </tr>
                  ) : (
                    suppliedItems.map((item) => (
                      <tr key={item.id} className="hover:bg-[var(--md-sys-color-surface-container-low)]">
                        <td className="py-3 pr-4 font-mono text-xs font-bold text-[var(--md-sys-color-primary)]">
                          {item.sku}
                        </td>
                        <td className="py-3 px-3 text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                          {item.name}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-[var(--md-sys-color-on-surface)]">
                          {item.quantityOnHand} {item.unit}
                        </td>
                        <td className="py-3 pl-4 text-right font-mono text-xs mono-num text-[var(--md-sys-color-on-surface)]">
                          {formatMVR(item.unitCost)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Surface>
        </div>

        {/* Right Column (4 cols): Vendor Profile */}
        <div className="lg:col-span-4 space-y-6">
          <Surface variant="outlined" padding="md" className="space-y-4 text-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Vendor Profile
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Contact Person:</span>
                <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{supplier.contactPerson}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Phone:</span>
                <span className="font-mono text-[var(--md-sys-color-on-surface)]">{supplier.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Email:</span>
                <span className="text-[var(--md-sys-color-on-surface)]">{supplier.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Lead Time:</span>
                <span className="text-[var(--md-sys-color-on-surface)]">{supplier.leadTimeDays} days</span>
              </div>
              <div
                className="flex justify-between pt-2 border-t"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Address:</span>
                <span className="font-semibold text-right text-[var(--md-sys-color-on-surface)]">
                  {supplier.address}
                </span>
              </div>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
};
