import { describe, it, expect } from 'vitest';
import { computeARAging, computeAPAging } from './aging';
import { Invoice, Payment, PurchaseOrder } from '../types/erp';

describe('Authoritative AR & AP Aging Matrix Engine (SERP-293)', () => {
  const asOfDate = '2026-08-31';

  const mockInvoices: Invoice[] = [
    // 1. Current (Due 2026-08-31 / 0 days overdue)
    {
      id: 'inv-1',
      invoiceNumber: 'INV-001',
      linkedJobId: 'job-1',
      customerId: 'cust-1',
      customerName: 'Crown Resorts Maldives',
      customerPhone: '7777777',
      customerIsland: 'Male',
      gstRate: 8,
      bankDetails: 'BML 7701192837101',
      date: '2026-08-15',
      dueDate: '2026-08-31',
      items: [],
      subtotal: 10000,
      gstAmount: 800,
      totalAmount: 10800,
      status: 'Sent',
      paymentStatus: 'Unpaid',
      amountPaid: 0,
      balanceDue: 10800,
      payments: [],
    },
    // 2. 1–30 Days Overdue (Due 2026-08-10 / 21 days overdue)
    {
      id: 'inv-2',
      invoiceNumber: 'INV-002',
      linkedJobId: 'job-2',
      customerId: 'cust-1',
      customerName: 'Crown Resorts Maldives',
      customerPhone: '7777777',
      customerIsland: 'Male',
      gstRate: 8,
      bankDetails: 'BML 7701192837101',
      date: '2026-07-25',
      dueDate: '2026-08-10',
      items: [],
      subtotal: 20000,
      gstAmount: 1600,
      totalAmount: 21600,
      status: 'Sent',
      paymentStatus: 'Partial',
      amountPaid: 0,
      balanceDue: 21600,
      payments: [],
    },
    // 3. 31–60 Days Overdue (Due 2026-07-15 / 47 days overdue)
    {
      id: 'inv-3',
      invoiceNumber: 'INV-003',
      linkedJobId: 'job-3',
      customerId: 'cust-2',
      customerName: 'Soneva Fushi Logistics',
      customerPhone: '7777777',
      customerIsland: 'Male',
      gstRate: 8,
      bankDetails: 'BML 7701192837101',
      date: '2026-06-30',
      dueDate: '2026-07-15',
      items: [],
      subtotal: 15000,
      gstAmount: 1200,
      totalAmount: 16200,
      status: 'Sent',
      paymentStatus: 'Unpaid',
      amountPaid: 0,
      balanceDue: 16200,
      payments: [],
    },
    // 4. 90+ Days Overdue (Due 2026-04-30 / 123 days overdue)
    {
      id: 'inv-4',
      invoiceNumber: 'INV-004',
      linkedJobId: 'job-4',
      customerId: 'cust-3',
      customerName: 'Villa Shipping & Trading',
      customerPhone: '7777777',
      customerIsland: 'Male',
      gstRate: 8,
      bankDetails: 'BML 7701192837101',
      date: '2026-04-15',
      dueDate: '2026-04-30',
      items: [],
      subtotal: 30000,
      gstAmount: 2400,
      totalAmount: 32400,
      status: 'Sent',
      paymentStatus: 'Unpaid',
      amountPaid: 0,
      balanceDue: 32400,
      payments: [],
    },
    // 5. Fully Paid Invoice (Excluded from aging balance)
    {
      id: 'inv-5',
      invoiceNumber: 'INV-005',
      linkedJobId: 'job-5',
      customerId: 'cust-4',
      customerName: 'Bandos Island Resort',
      customerPhone: '7777777',
      customerIsland: 'Male',
      gstRate: 8,
      bankDetails: 'BML 7701192837101',
      date: '2026-08-01',
      dueDate: '2026-08-20',
      items: [],
      subtotal: 5000,
      gstAmount: 400,
      totalAmount: 5400,
      status: 'Paid',
      paymentStatus: 'Paid',
      amountPaid: 5400,
      balanceDue: 0,
      payments: [],
    },
  ];

  const mockPayments: Payment[] = [
    // Partial payment of 6,600 towards INV-002 (Balance = 21,600 - 6,600 = 15,000)
    {
      id: 'pay-1',
      invoiceId: 'inv-2',
      invoiceNumber: 'INV-002',
      customerId: 'cust-1',
      paymentNumber: 'PAY-INV-002',
      status: 'Verified',
      amount: 6600,
      paymentDate: '2026-08-12',
      method: 'BML Bank Transfer',
      referenceNumber: 'BML-REF-001',
      customerName: 'Crown Resorts Maldives',
    },
  ];

  it('correctly calculates AR Aging buckets with partial payments deducted', () => {
    const report = computeARAging({
      invoices: mockInvoices,
      payments: mockPayments,
      asOfDate,
    });

    // Summary checks
    expect(report.asOfDate).toBe('2026-08-31');
    expect(report.summary.current).toBe(10800); // INV-001 (10,800)
    expect(report.summary.days1_30).toBe(15000); // INV-002 (21,600 - 6,600 = 15,000)
    expect(report.summary.days31_60).toBe(16200); // INV-003 (16,200)
    expect(report.summary.days61_90).toBe(0);
    expect(report.summary.days90Plus).toBe(32400); // INV-004 (32,400)

    // Total Receivables = 10,800 + 15,000 + 16,200 + 32,400 = 74,400
    expect(report.totalReceivables).toBe(74400);
    expect(report.summary.total).toBe(74400);

    // Customer grouping
    expect(report.customers.length).toBe(3); // Crown Resorts (25,800), Villa Shipping (32,400), Soneva (16,200)
    const crown = report.customers.find((c) => c.customerId === 'cust-1');
    expect(crown).toBeDefined();
    expect(crown?.totalBalanceDue).toBe(25800); // 10,800 + 15,000
    expect(crown?.invoices.length).toBe(2);
  });

  it('correctly calculates AP Aging buckets for supplier bills', () => {
    const mockPOs: PurchaseOrder[] = [
      {
        id: 'po-1',
        poNumber: 'PO-2026-001',
        supplierId: 'sup-1',
        supplierName: 'Majeed Marine Spares',
        orderDate: '2026-08-20',
        expectedDeliveryDate: '2026-08-30',
        items: [],
        totalAmount: 18500,
        subtotal: 17129.63,
        gstAmount: 1370.37,
        status: 'Sent',
        paymentStatus: 'Unpaid',
      },
      {
        id: 'po-2',
        poNumber: 'PO-2026-002',
        supplierId: 'sup-2',
        supplierName: 'State Trading Organization (STO)',
        orderDate: '2026-07-01',
        expectedDeliveryDate: '2026-07-15',
        items: [],
        totalAmount: 45000,
        subtotal: 41666.67,
        gstAmount: 3333.33,
        status: 'Received & Stocked',
        paymentStatus: 'Unpaid',
      },
    ];

    const apReport = computeAPAging({
      purchaseOrders: mockPOs,
      asOfDate,
    });

    // PO-1: Due 2026-08-30 (1 day overdue) -> 1_30 bucket
    expect(apReport.summary.days1_30).toBe(18500);

    // PO-2: Due 2026-07-15 (47 days overdue) -> 31_60 bucket
    expect(apReport.summary.days31_60).toBe(45000);

    expect(apReport.totalPayables).toBe(63500);
    expect(apReport.suppliers.length).toBe(2);
  });
});
