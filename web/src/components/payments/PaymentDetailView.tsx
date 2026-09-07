import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CreditCard,
  CheckCircle2,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Surface, Button, Badge } from '../ui';

export const PaymentDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { payments, invoices, customers, formatMVR } = useERP();

  const payment = payments.find(
    (p) => p.id === id || p.paymentNumber.toLowerCase() === id?.toLowerCase(),
  );

  if (!payment) {
    return (
      <div className="space-y-6">
        <Button
          variant="text"
          size="sm"
          onClick={() => navigate('/payments')}
          icon={<ArrowLeft size={16} />}
        >
          <span>Back to Payments</span>
        </Button>
        <Surface variant="outlined" padding="lg" className="text-center py-12 space-y-3">
          <CreditCard size={40} className="mx-auto text-[var(--md-sys-color-on-surface-variant)] opacity-60" />
          <h2 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
            Payment Receipt Not Found
          </h2>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            No payment transaction matching ID "{id}" was found in this workspace.
          </p>
          <div className="pt-2">
            <Button variant="filled" size="sm" onClick={() => navigate('/payments')}>
              <span>View All Payments</span>
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  const linkedInvoice = invoices.find(
    (inv) => inv.id === payment.invoiceId || inv.invoiceNumber === payment.invoiceNumber,
  );
  const customer = customers.find((c) => c.id === payment.customerId);

  return (
    <div className="space-y-6 pb-12 print:p-0 print:m-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="tonal"
            size="sm"
            onClick={() => navigate('/payments')}
            icon={<ArrowLeft size={16} />}
            aria-label="Back to Payments"
          />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
                {payment.paymentNumber}
              </h1>
              <Badge variant="positive" size="sm">
                <CheckCircle2 size={12} className="mr-1" />
                <span>{payment.status}</span>
              </Badge>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
              Recorded on {payment.paymentDate} • Bank Settlement Receipt
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            size="sm"
            onClick={() => window.print()}
            icon={<Printer size={16} />}
            aria-label="Print Receipt"
          >
            <span>Print Receipt</span>
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Payment Details & Transaction Proof */}
        <div className="lg:col-span-7 space-y-6">
          {/* Amount Card */}
          <Surface variant="outlined" padding="md" className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] block">
              Amount Received
            </span>
            <div className="text-3xl font-extrabold font-mono mono-num text-[var(--md-sys-color-primary)]">
              {formatMVR(payment.amount)}
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Settled via {payment.method} • Ref: <span className="font-mono font-bold">{payment.referenceNumber}</span>
            </p>
          </Surface>

          {/* Transaction Metadata */}
          <Surface variant="outlined" padding="md" className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Transaction Verification Details
            </h2>
            <div className="space-y-3 text-xs">
              <div
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Payment Reference #:</span>
                <span className="font-mono font-bold text-[var(--md-sys-color-primary)]">
                  {payment.paymentNumber}
                </span>
              </div>
              <div
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Settlement Date:</span>
                <span className="font-mono font-semibold text-[var(--md-sys-color-on-surface)]">
                  {payment.paymentDate}
                </span>
              </div>
              <div
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Payment Channel:</span>
                <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{payment.method}</span>
              </div>
              <div
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Bank Slip / Auth Ref:</span>
                <span className="font-mono font-bold text-[var(--md-sys-color-on-surface)]">
                  {payment.referenceNumber}
                </span>
              </div>
              <div
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Settlement Account:</span>
                <span className="font-mono text-[var(--md-sys-color-on-surface)]">
                  Bank of Maldives (7730000189201)
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Verification Status:</span>
                <Badge variant="positive" size="sm">
                  <ShieldCheck size={12} className="mr-1" />
                  <span>Bank Reconciled</span>
                </Badge>
              </div>
            </div>
          </Surface>
        </div>

        {/* Right Column (5 cols): Matched Invoice & Customer */}
        <div className="lg:col-span-5 space-y-6">
          {/* Matched Commercial Invoice */}
          <Surface variant="outlined" padding="md" className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Matched Invoice
            </h2>
            {linkedInvoice ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Invoice #:</span>
                  <Link
                    to={`/invoices/${linkedInvoice.id}`}
                    className="font-mono font-bold hover:underline text-[var(--md-sys-color-primary)]"
                  >
                    {linkedInvoice.invoiceNumber} →
                  </Link>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Invoice Total:</span>
                  <span className="font-mono font-semibold mono-num text-[var(--md-sys-color-on-surface)]">
                    {formatMVR(linkedInvoice.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Invoice Status:</span>
                  <Badge
                    variant={linkedInvoice.status === 'Paid' ? 'positive' : 'warning'}
                    size="sm"
                  >
                    {linkedInvoice.status}
                  </Badge>
                </div>
                <div
                  className="flex justify-between pt-2 border-t"
                  style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Remaining Balance:</span>
                  <span className="font-mono font-bold mono-num text-[var(--md-sys-color-primary)]">
                    {formatMVR(linkedInvoice.balanceDue)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Applied to Invoice <span className="font-mono font-bold">{payment.invoiceNumber}</span>
              </p>
            )}
          </Surface>

          {/* Payer Customer */}
          <Surface variant="outlined" padding="md" className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Payer Customer
            </h2>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">Customer Name:</span>
                {customer ? (
                  <Link
                    to={`/customers/${customer.id}`}
                    className="font-bold hover:underline text-[var(--md-sys-color-primary)]"
                  >
                    {payment.customerName} →
                  </Link>
                ) : (
                  <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                    {payment.customerName}
                  </span>
                )}
              </div>
              {customer && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">Phone:</span>
                    <span className="font-mono text-[var(--md-sys-color-on-surface)]">
                      {customer.phone}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">Island:</span>
                    <span className="text-[var(--md-sys-color-on-surface)]">{customer.island}</span>
                  </div>
                </>
              )}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
};
