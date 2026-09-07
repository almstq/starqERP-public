import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  CreditCard,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Globe,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Surface, Button, Badge } from '../ui';
import { BilingualInvoicePrintView } from './BilingualInvoicePrintView';
import { toInvoicePrintData } from '../../lib/invoicePrint';

export const InvoiceDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { invoices, jobs, payments, formatMVR, setIsRecordPaymentOpen, currentTenant } = useERP();

  /**
   * SERP-234 — the Dhivehi/English tax invoice was built and tested but no
   * route or component imported it, so no user could reach it. This toggle is
   * that missing door. It is read-only: it changes which body is rendered and
   * printed, and writes nothing.
   */
  const [showBilingual, setShowBilingual] = React.useState(false);

  const invoice = invoices.find(
    (inv) => inv.id === id || inv.invoiceNumber.toLowerCase() === id?.toLowerCase(),
  );

  if (!invoice) {
    return (
      <div className="space-y-6">
        <Button
          variant="text"
          size="sm"
          onClick={() => navigate('/invoices')}
          icon={<ArrowLeft size={16} />}
        >
          <span>Back to Invoices</span>
        </Button>
        <Surface variant="outlined" padding="lg" className="text-center py-12 space-y-3">
          <FileText size={40} className="mx-auto text-[var(--md-sys-color-on-surface-variant)] opacity-60" />
          <h2 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
            Invoice Not Found
          </h2>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            No commercial invoice matching ID "{id}" was found in this workspace.
          </p>
          <div className="pt-2">
            <Button variant="filled" size="sm" onClick={() => navigate('/invoices')}>
              <span>View All Invoices</span>
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  const linkedJob = jobs.find((j) => j.id === invoice.linkedJobId || j.jobId === invoice.linkedJobNumber);
  const linkedPayments = payments.filter((p) => p.invoiceId === invoice.id || p.invoiceNumber === invoice.invoiceNumber);

  return (
    <div className="space-y-6 pb-12 print:p-0 print:m-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="tonal"
            size="sm"
            onClick={() => navigate('/invoices')}
            icon={<ArrowLeft size={16} />}
            aria-label="Back to Invoices"
          />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
                {invoice.invoiceNumber}
              </h1>
              <Badge
                variant={
                  invoice.status === 'Paid'
                    ? 'positive'
                    : invoice.status === 'Overdue'
                    ? 'destructive'
                    : 'warning'
                }
                size="sm"
              >
                {invoice.status}
              </Badge>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
              Issued: {invoice.date} • Due: {invoice.dueDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {invoice.balanceDue > 0 && (
            <Button
              variant="filled"
              size="sm"
              onClick={() => setIsRecordPaymentOpen(true)}
              icon={<CreditCard size={15} />}
            >
              <span>Record Payment</span>
            </Button>
          )}
          <Button
            variant={showBilingual ? 'filled' : 'outlined'}
            size="sm"
            onClick={() => setShowBilingual((on) => !on)}
            icon={<Globe size={16} />}
            aria-label="Toggle Dhivehi and English invoice"
            aria-pressed={showBilingual}
            data-testid="toggle-bilingual-invoice"
          >
            <span>{showBilingual ? 'Standard Invoice' : 'Dhivehi / English'}</span>
          </Button>
          <Button
            variant="outlined"
            size="sm"
            onClick={() => window.print()}
            icon={<Printer size={16} />}
            aria-label="Print Invoice"
          >
            <span>Print</span>
          </Button>
        </div>
      </div>

      {showBilingual && (
        <BilingualInvoicePrintView invoice={toInvoicePrintData(invoice, currentTenant)} />
      )}

      {/* Main Content Grid */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        hidden={showBilingual}
      >
        {/* Left Column (8 cols): Line items, Customer details, Billing terms */}
        <div className="lg:col-span-8 space-y-6">
          {/* Customer & Job Links */}
          <Surface variant="outlined" padding="md" className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] block">
                Billed To Customer:
              </span>
              <Link
                to={`/customers/${invoice.customerId}`}
                className="font-bold text-sm hover:underline block text-[var(--md-sys-color-primary)]"
              >
                {invoice.customerName} →
              </Link>
              {invoice.customerPhone && (
                <span className="font-mono text-[var(--md-sys-color-on-surface-variant)] block">
                  {invoice.customerPhone}
                </span>
              )}
            </div>

            {(invoice.linkedJobId || invoice.linkedJobNumber) && (
              <div
                className="space-y-1 sm:border-l sm:pl-4"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] block">
                  Linked Work Order:
                </span>
                <Link
                  to={`/jobs/${invoice.linkedJobId || linkedJob?.id || ''}`}
                  className="font-mono font-bold text-sm hover:underline block text-[var(--md-sys-color-primary)]"
                >
                  {invoice.linkedJobNumber || linkedJob?.jobId || 'Work Order'} →
                </Link>
                {linkedJob?.vehicle && (
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block">
                    Asset: {linkedJob.vehicle.plateNumber} ({linkedJob.vehicle.model})
                  </span>
                )}
              </div>
            )}
          </Surface>

          {/* Line Items Table */}
          <Surface variant="outlined" padding="md" className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Line Items & Services
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
                    <th className="py-2.5 pr-4 font-semibold">Description</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Qty</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Unit Price</th>
                    <th className="py-2.5 pl-4 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--md-sys-color-surface-container-low)]">
                      <td className="py-3 pr-4 font-semibold text-[var(--md-sys-color-on-surface)]">
                        {item.description}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-[var(--md-sys-color-on-surface)]">
                        {item.quantity}
                      </td>
                      <td className="py-3 px-3 text-right font-mono mono-num text-[var(--md-sys-color-on-surface)]">
                        {formatMVR(item.unitPrice)}
                      </td>
                      <td className="py-3 pl-4 text-right font-mono font-bold mono-num text-[var(--md-sys-color-on-surface)]">
                        {formatMVR(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div
              className="pt-4 border-t space-y-2 text-xs"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
            >
              <div className="flex justify-between text-[var(--md-sys-color-on-surface)]">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Subtotal:</span>
                <span className="font-mono font-semibold mono-num">{formatMVR(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[var(--md-sys-color-on-surface-variant)]">
                <span>Tax Status:</span>
                <span className="font-mono">GST Exempt (Under Threshold)</span>
              </div>
              <div
                className="flex justify-between pt-2 border-t text-sm font-bold"
                style={{
                  borderColor: 'var(--md-sys-color-outline-variant)',
                  color: 'var(--md-sys-color-on-surface)',
                }}
              >
                <span>Total Amount Due:</span>
                <span className="font-mono text-[var(--md-sys-color-primary)] mono-num">
                  {formatMVR(invoice.totalAmount)}
                </span>
              </div>
            </div>
          </Surface>

          {/* Applied Payments Table */}
          <Surface variant="outlined" padding="md" className="space-y-4">
            <div
              className="flex items-center justify-between border-b pb-3"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
            >
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
                Payments Received for this Invoice
              </h2>
            </div>
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
                    <th className="py-2.5 pr-4 font-semibold">Payment #</th>
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Method / Reference</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                    <th className="py-2.5 pl-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                  {linkedPayments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-center py-6 text-[var(--md-sys-color-on-surface-variant)]"
                      >
                        No payments recorded against this invoice yet.
                      </td>
                    </tr>
                  ) : (
                    linkedPayments.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-[var(--md-sys-color-surface-container-low)] cursor-pointer"
                        onClick={() => navigate(`/payments/${p.id}`)}
                      >
                        <td className="py-3 pr-4 font-mono font-bold text-[var(--md-sys-color-primary)]">
                          {p.paymentNumber}
                        </td>
                        <td className="py-3 px-3 text-xs text-[var(--md-sys-color-on-surface)]">
                          {p.paymentDate}
                        </td>
                        <td className="py-3 px-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          {p.method} ({p.referenceNumber})
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold mono-num text-[var(--md-sys-color-primary)]">
                          {formatMVR(p.amount)}
                        </td>
                        <td className="py-3 pl-4 text-right">
                          <span className="text-xs font-semibold text-[var(--md-sys-color-primary)] hover:underline">
                            View Receipt →
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Surface>
        </div>

        {/* Right Column (4 cols): Settlement Snapshot & Balances */}
        <div className="lg:col-span-4 space-y-6">
          <Surface variant="outlined" padding="md" className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Settlement Overview
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Invoice Total:</span>
                <span className="font-mono font-bold text-[var(--md-sys-color-on-surface)] mono-num">
                  {formatMVR(invoice.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Amount Settled:</span>
                <span className="font-mono font-semibold text-[var(--md-sys-color-primary)] mono-num">
                  {formatMVR(invoice.amountPaid)}
                </span>
              </div>
              <div
                className="flex justify-between pt-2 border-t"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                  Remaining Balance:
                </span>
                <span
                  className={`font-mono font-bold text-sm mono-num ${
                    invoice.balanceDue > 0
                      ? 'text-[var(--md-sys-color-error)]'
                      : 'text-[var(--md-sys-color-primary)]'
                  }`}
                >
                  {formatMVR(invoice.balanceDue)}
                </span>
              </div>
            </div>

            {invoice.balanceDue > 0 ? (
              <div className="pt-2">
                <Button
                  variant="filled"
                  className="w-full text-xs"
                  onClick={() => setIsRecordPaymentOpen(true)}
                  icon={<CreditCard size={15} />}
                >
                  <span>Record Payment of {formatMVR(invoice.balanceDue)}</span>
                </Button>
              </div>
            ) : (
              <div
                className="p-3 rounded-[var(--md-sys-shape-corner-medium)] border flex items-center gap-2 text-xs"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-low)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                  color: 'var(--md-sys-color-primary)',
                }}
              >
                <CheckCircle2 size={16} />
                <span className="font-semibold">Fully settled and cleared.</span>
              </div>
            )}
          </Surface>
        </div>
      </div>
    </div>
  );
};
