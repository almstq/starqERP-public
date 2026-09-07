import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ShoppingCart,
  Package,
  Printer,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Surface, Button, Badge } from '../ui';

export const PODetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { purchaseOrders, suppliers, formatMVR, receivePurchaseOrder } = useERP();

  const po = purchaseOrders.find((p) => p.id === id || p.poNumber.toLowerCase() === id?.toLowerCase());

  if (!po) {
    return (
      <div className="space-y-6">
        <Button
          variant="text"
          size="sm"
          onClick={() => navigate('/purchasing')}
          icon={<ArrowLeft size={16} />}
        >
          <span>Back to Purchasing</span>
        </Button>
        <Surface variant="outlined" padding="lg" className="text-center py-12 space-y-3">
          <ShoppingCart size={40} className="mx-auto text-[var(--md-sys-color-on-surface-variant)] opacity-60" />
          <h2 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
            Purchase Order Not Found
          </h2>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            No purchase order matching ID "{id}" was found in this workspace.
          </p>
          <div className="pt-2">
            <Button variant="filled" size="sm" onClick={() => navigate('/purchasing')}>
              <span>View All Purchase Orders</span>
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  const supplier = suppliers.find((s) => s.id === po.supplierId || s.name === po.supplierName);

  return (
    <div className="space-y-6 pb-12 print:p-0 print:m-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="tonal"
            size="sm"
            onClick={() => navigate('/purchasing')}
            icon={<ArrowLeft size={16} />}
            aria-label="Back to Purchasing"
          />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
                {po.poNumber}
              </h1>
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
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
              Ordered: {po.orderDate} • Expected: {po.expectedDeliveryDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {po.status !== 'Received & Stocked' && (
            <Button
              variant="filled"
              size="sm"
              onClick={() => receivePurchaseOrder(po.id)}
              icon={<Package size={15} />}
            >
              <span>Receive & Stock Items</span>
            </Button>
          )}
          <Button
            variant="outlined"
            size="sm"
            onClick={() => window.print()}
            icon={<Printer size={16} />}
            aria-label="Print PO"
          >
            <span>Print PO</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left (8 cols): Ordered Items & Receiving Log */}
        <div className="lg:col-span-8 space-y-6">
          {/* Supplier Details */}
          <Surface variant="outlined" padding="md" className="space-y-2 text-xs">
            <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] block">
              Vendor / Supplier:
            </span>
            <div className="flex items-center justify-between">
              {supplier ? (
                <Link
                  to={`/suppliers/${supplier.id}`}
                  className="font-bold text-sm hover:underline text-[var(--md-sys-color-primary)]"
                >
                  {po.supplierName} →
                </Link>
              ) : (
                <span className="font-bold text-sm text-[var(--md-sys-color-on-surface)]">
                  {po.supplierName}
                </span>
              )}
              {supplier && (
                <span className="text-[var(--md-sys-color-on-surface-variant)]">
                  {supplier.phone} • {supplier.islandOrCountry}
                </span>
              )}
            </div>
          </Surface>

          {/* Ordered Line Items Table */}
          <Surface variant="outlined" padding="md" className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Ordered Items & Quantities
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
                    <th className="py-2.5 pr-4 font-semibold">Item Description</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Ordered Qty</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Unit Cost</th>
                    <th className="py-2.5 pl-4 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                  {po.items.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--md-sys-color-surface-container-low)]">
                      <td className="py-3 pr-4 font-semibold text-[var(--md-sys-color-on-surface)]">
                        {item.itemName}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-[var(--md-sys-color-on-surface)]">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-3 px-3 text-right font-mono mono-num text-[var(--md-sys-color-on-surface)]">
                        {formatMVR(item.unitCost)}
                      </td>
                      <td className="py-3 pl-4 text-right font-mono font-bold mono-num text-[var(--md-sys-color-on-surface)]">
                        {formatMVR(item.totalCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className="flex justify-between pt-4 border-t text-sm font-bold"
              style={{
                borderColor: 'var(--md-sys-color-outline-variant)',
                color: 'var(--md-sys-color-on-surface)',
              }}
            >
              <span>Total Purchase Value:</span>
              <span className="font-mono text-[var(--md-sys-color-primary)] mono-num">
                {formatMVR(po.totalAmount)}
              </span>
            </div>
          </Surface>
        </div>

        {/* Right (4 cols): Order Status & Procurement Chain */}
        <div className="lg:col-span-4 space-y-6">
          <Surface variant="outlined" padding="md" className="space-y-4 text-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Procurement Details
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Order Date:</span>
                <span className="font-mono text-[var(--md-sys-color-on-surface)]">{po.orderDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Expected Delivery:</span>
                <span className="font-mono text-[var(--md-sys-color-on-surface)]">{po.expectedDeliveryDate}</span>
              </div>
              <div
                className="flex justify-between pt-2 border-t"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Receipt Status:</span>
                <Badge
                  variant={po.status === 'Received & Stocked' ? 'positive' : 'warning'}
                  size="sm"
                >
                  {po.status}
                </Badge>
              </div>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
};
