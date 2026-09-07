/**
 * STARQ ERP — Authoritative AR / AP Aging Calculation Engine (SERP-293)
 *
 * Implements standard financial aging buckets:
 * - Current (Not overdue)
 * - 1–30 Days Overdue
 * - 31–60 Days Overdue
 * - 61–90 Days Overdue
 * - 90+ Days Overdue
 */

import { Invoice, PurchaseOrder, Payment } from '../types/erp';

export interface AgingBucketSummary {
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90Plus: number;
  total: number;
}

export interface ARAgingItem {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  daysOverdue: number;
  bucket: 'CURRENT' | '1_30' | '31_60' | '61_90' | '90_PLUS';
}

export interface CustomerARAgingSummary {
  customerId: string;
  customerName: string;
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90Plus: number;
  totalBalanceDue: number;
  invoices: ARAgingItem[];
}

export interface ARAgingReport {
  asOfDate: string;
  customers: CustomerARAgingSummary[];
  summary: AgingBucketSummary;
  totalReceivables: number;
  overduePercentage: number;
}

export interface APAgingItem {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  daysOverdue: number;
  bucket: 'CURRENT' | '1_30' | '31_60' | '61_90' | '90_PLUS';
}

export interface SupplierAPAgingSummary {
  supplierId: string;
  supplierName: string;
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90Plus: number;
  totalBalanceDue: number;
  orders: APAgingItem[];
}

export interface APAgingReport {
  asOfDate: string;
  suppliers: SupplierAPAgingSummary[];
  summary: AgingBucketSummary;
  totalPayables: number;
  overduePercentage: number;
}

/**
 * Calculates days difference between two ISO date strings (targetDate - asOfDate).
 */
function getDaysDiff(asOfDate: string, targetDueDate: string): number {
  const asOf = new Date(asOfDate).getTime();
  const due = new Date(targetDueDate).getTime();
  const diffDays = Math.floor((asOf - due) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Categorizes days overdue into standard aging buckets.
 */
function getBucket(daysOverdue: number): 'CURRENT' | '1_30' | '31_60' | '61_90' | '90_PLUS' {
  if (daysOverdue === 0) return 'CURRENT';
  if (daysOverdue <= 30) return '1_30';
  if (daysOverdue <= 60) return '31_60';
  if (daysOverdue <= 90) return '61_90';
  return '90_PLUS';
}

/**
 * Computes authoritative Accounts Receivable (AR) aging report.
 */
export function computeARAging(params: {
  invoices: Invoice[];
  payments: Payment[];
  asOfDate?: string;
}): ARAgingReport {
  const asOf = params.asOfDate || new Date().toISOString().split('T')[0];

  // Map payments by invoice
  const paymentsByInvoice = new Map<string, number>();
  params.payments.forEach((p) => {
    paymentsByInvoice.set(p.invoiceId, (paymentsByInvoice.get(p.invoiceId) || 0) + p.amount);
  });

  const customerMap = new Map<string, CustomerARAgingSummary>();

  let summary: AgingBucketSummary = {
    current: 0,
    days1_30: 0,
    days31_60: 0,
    days61_90: 0,
    days90Plus: 0,
    total: 0,
  };

  params.invoices.forEach((inv) => {
    // Only include confirmed non-voided invoices created on or before asOfDate
    if (inv.status === 'Cancelled' || inv.status === 'Draft' || inv.date > asOf) {
      return;
    }

    const paid = paymentsByInvoice.get(inv.id) || (inv.paymentStatus === 'Paid' ? inv.totalAmount : 0);
    const balanceDue = Math.max(0, inv.totalAmount - paid);

    if (balanceDue <= 0.005) {
      return; // Fully paid invoice
    }

    const daysOverdue = getDaysDiff(asOf, inv.dueDate || inv.date);
    const bucket = getBucket(daysOverdue);

    const roundedBalance = Math.round(balanceDue * 100) / 100;

    const item: ARAgingItem = {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId,
      customerName: inv.customerName,
      issueDate: inv.date,
      dueDate: inv.dueDate || inv.date,
      totalAmount: inv.totalAmount,
      amountPaid: paid,
      balanceDue: roundedBalance,
      daysOverdue,
      bucket,
    };

    // Update global bucket summary
    if (bucket === 'CURRENT') summary.current += roundedBalance;
    else if (bucket === '1_30') summary.days1_30 += roundedBalance;
    else if (bucket === '31_60') summary.days31_60 += roundedBalance;
    else if (bucket === '61_90') summary.days61_90 += roundedBalance;
    else if (bucket === '90_PLUS') summary.days90Plus += roundedBalance;
    summary.total += roundedBalance;

    // Group by customer
    if (!customerMap.has(inv.customerId)) {
      customerMap.set(inv.customerId, {
        customerId: inv.customerId,
        customerName: inv.customerName,
        current: 0,
        days1_30: 0,
        days31_60: 0,
        days61_90: 0,
        days90Plus: 0,
        totalBalanceDue: 0,
        invoices: [],
      });
    }

    const cust = customerMap.get(inv.customerId)!;
    cust.invoices.push(item);
    if (bucket === 'CURRENT') cust.current += roundedBalance;
    else if (bucket === '1_30') cust.days1_30 += roundedBalance;
    else if (bucket === '31_60') cust.days31_60 += roundedBalance;
    else if (bucket === '61_90') cust.days61_90 += roundedBalance;
    else if (bucket === '90_PLUS') cust.days90Plus += roundedBalance;
    cust.totalBalanceDue += roundedBalance;
  });

  // Round summaries
  summary = {
    current: Math.round(summary.current * 100) / 100,
    days1_30: Math.round(summary.days1_30 * 100) / 100,
    days31_60: Math.round(summary.days31_60 * 100) / 100,
    days61_90: Math.round(summary.days61_90 * 100) / 100,
    days90Plus: Math.round(summary.days90Plus * 100) / 100,
    total: Math.round(summary.total * 100) / 100,
  };

  const totalOverdue = summary.days1_30 + summary.days31_60 + summary.days61_90 + summary.days90Plus;
  const overduePercentage = summary.total > 0 ? Math.round((totalOverdue / summary.total) * 1000) / 10 : 0;

  const customers = Array.from(customerMap.values()).map((c) => ({
    ...c,
    current: Math.round(c.current * 100) / 100,
    days1_30: Math.round(c.days1_30 * 100) / 100,
    days31_60: Math.round(c.days31_60 * 100) / 100,
    days61_90: Math.round(c.days61_90 * 100) / 100,
    days90Plus: Math.round(c.days90Plus * 100) / 100,
    totalBalanceDue: Math.round(c.totalBalanceDue * 100) / 100,
  }));

  // Sort customers by highest total balance due
  customers.sort((a, b) => b.totalBalanceDue - a.totalBalanceDue);

  return {
    asOfDate: asOf,
    customers,
    summary,
    totalReceivables: summary.total,
    overduePercentage,
  };
}

/**
 * Computes authoritative Accounts Payable (AP) aging report.
 */
export function computeAPAging(params: {
  purchaseOrders: PurchaseOrder[];
  asOfDate?: string;
}): APAgingReport {
  const asOf = params.asOfDate || new Date().toISOString().split('T')[0];
  const supplierMap = new Map<string, SupplierAPAgingSummary>();

  let summary: AgingBucketSummary = {
    current: 0,
    days1_30: 0,
    days31_60: 0,
    days61_90: 0,
    days90Plus: 0,
    total: 0,
  };

  params.purchaseOrders.forEach((po) => {
    // Only include confirmed non-cancelled purchase orders/bills
    if (po.status === 'Cancelled' || po.status === 'Draft' || po.orderDate > asOf) {
      return;
    }

    const paid = po.paymentStatus === 'Paid' ? po.totalAmount : 0;
    const balanceDue = Math.max(0, po.totalAmount - paid);

    if (balanceDue <= 0.005) {
      return; // Fully settled PO
    }

    const dueDate = po.expectedDeliveryDate || po.orderDate;
    const daysOverdue = getDaysDiff(asOf, dueDate);
    const bucket = getBucket(daysOverdue);
    const roundedBalance = Math.round(balanceDue * 100) / 100;

    const item: APAgingItem = {
      id: po.id,
      orderNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      orderDate: po.orderDate,
      dueDate,
      totalAmount: po.totalAmount,
      amountPaid: paid,
      balanceDue: roundedBalance,
      daysOverdue,
      bucket,
    };

    if (bucket === 'CURRENT') summary.current += roundedBalance;
    else if (bucket === '1_30') summary.days1_30 += roundedBalance;
    else if (bucket === '31_60') summary.days31_60 += roundedBalance;
    else if (bucket === '61_90') summary.days61_90 += roundedBalance;
    else if (bucket === '90_PLUS') summary.days90Plus += roundedBalance;
    summary.total += roundedBalance;

    if (!supplierMap.has(po.supplierId)) {
      supplierMap.set(po.supplierId, {
        supplierId: po.supplierId,
        supplierName: po.supplierName,
        current: 0,
        days1_30: 0,
        days31_60: 0,
        days61_90: 0,
        days90Plus: 0,
        totalBalanceDue: 0,
        orders: [],
      });
    }

    const sup = supplierMap.get(po.supplierId)!;
    sup.orders.push(item);
    if (bucket === 'CURRENT') sup.current += roundedBalance;
    else if (bucket === '1_30') sup.days1_30 += roundedBalance;
    else if (bucket === '31_60') sup.days31_60 += roundedBalance;
    else if (bucket === '61_90') sup.days61_90 += roundedBalance;
    else if (bucket === '90_PLUS') sup.days90Plus += roundedBalance;
    sup.totalBalanceDue += roundedBalance;
  });

  summary = {
    current: Math.round(summary.current * 100) / 100,
    days1_30: Math.round(summary.days1_30 * 100) / 100,
    days31_60: Math.round(summary.days31_60 * 100) / 100,
    days61_90: Math.round(summary.days61_90 * 100) / 100,
    days90Plus: Math.round(summary.days90Plus * 100) / 100,
    total: Math.round(summary.total * 100) / 100,
  };

  const totalOverdue = summary.days1_30 + summary.days31_60 + summary.days61_90 + summary.days90Plus;
  const overduePercentage = summary.total > 0 ? Math.round((totalOverdue / summary.total) * 1000) / 10 : 0;

  const suppliers = Array.from(supplierMap.values()).map((s) => ({
    ...s,
    current: Math.round(s.current * 100) / 100,
    days1_30: Math.round(s.days1_30 * 100) / 100,
    days31_60: Math.round(s.days31_60 * 100) / 100,
    days61_90: Math.round(s.days61_90 * 100) / 100,
    days90Plus: Math.round(s.days90Plus * 100) / 100,
    totalBalanceDue: Math.round(s.totalBalanceDue * 100) / 100,
  }));

  suppliers.sort((a, b) => b.totalBalanceDue - a.totalBalanceDue);

  return {
    asOfDate: asOf,
    suppliers,
    summary,
    totalPayables: summary.total,
    overduePercentage,
  };
}
