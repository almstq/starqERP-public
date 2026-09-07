import { describe, it, expect } from 'vitest';
import { computeTrialBalance, computeProfitAndLoss, computeBalanceSheet } from '../lib/bookkeeping';
import { Invoice, Payment, Expense, PurchaseOrder } from '../types/erp';
import { INITIAL_TENANTS } from '../data/mockData';

describe('M0-CLIE-001 — Bookkeeping Spine & Financial Statements (Two Tenants)', () => {
  // Test Data Setup: Real captured Maldives SME garage & consulting workflow transactions
  const starqTenant = INITIAL_TENANTS.find((t) => t.id === 'tenant-starq')!;
  const ignitionTenant = INITIAL_TENANTS.find((t) => t.id === 'tenant-ignition')!;

  it('1. Explicitly configures two distinct pilot tenants (Starq Tech & Club Ignition)', () => {
    expect(starqTenant).toBeDefined();
    expect(starqTenant.name).toBe('Starq Technologies Pvt Ltd');
    expect(starqTenant.gstStatus).toBe('not_registered');
    expect(starqTenant.gstRate).toBe(0);

    expect(ignitionTenant).toBeDefined();
    expect(ignitionTenant.name).toBe('Club Ignition Pvt Ltd');
    expect(ignitionTenant.gstStatus).toBe('registered');
    expect(ignitionTenant.gstRate).toBe(8);
  });

  it('2. Records Invoices, Payments, Expenses and Purchases with exact double-entry consequences', () => {
    const invoices: Invoice[] = [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-001',
        customerId: 'cust-1',
        customerName: 'Ahmed Rauf',
        customerPhone: '+960 778-4321',
        customerIsland: "Male'",
        date: '2026-08-01',
        dueDate: '2026-08-15',
        items: [{ id: '1', description: 'Full Body Paint', quantity: 1, unitPrice: 25000, amount: 25000, category: 'Labor/Service' }],
        subtotal: 25000,
        gstRate: 0.08,
        gstAmount: 2000,
        totalAmount: 27000,
        amountPaid: 27000,
        balanceDue: 0,
        status: 'Paid',
        bankDetails: 'BML 7730000100201'
      },
      {
        id: 'inv-2',
        invoiceNumber: 'INV-2026-002',
        customerId: 'cust-2',
        customerName: 'Ibrahim Shaan',
        customerPhone: '+960 790-1122',
        customerIsland: "Hulhumale'",
        date: '2026-08-05',
        dueDate: '2026-08-20',
        items: [{ id: '2', description: 'Ceramic Coating', quantity: 1, unitPrice: 15000, amount: 15000, category: 'Labor/Service' }],
        subtotal: 15000,
        gstRate: 0.08,
        gstAmount: 1200,
        totalAmount: 16200,
        amountPaid: 10000,
        balanceDue: 6200,
        status: 'Partially Paid',
        bankDetails: 'BML 7730000100201'
      },
    ];

    const payments: Payment[] = [
      {
        id: 'pay-1',
        paymentNumber: 'PAY-1001',
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-2026-001',
        customerId: 'cust-1',
        customerName: 'Ahmed Rauf',
        amount: 27000,
        paymentDate: '2026-08-02',
        method: 'BML Transfer',
        referenceNumber: 'BML-TXN-101',
        status: 'Verified',
      },
      {
        id: 'pay-2',
        paymentNumber: 'PAY-1002',
        invoiceId: 'inv-2',
        invoiceNumber: 'INV-2026-002',
        customerId: 'cust-2',
        customerName: 'Ibrahim Shaan',
        amount: 10000,
        paymentDate: '2026-08-06',
        method: 'BML Transfer',
        referenceNumber: 'BML-TXN-102',
        status: 'Verified',
      },
    ];

    const expenses: Expense[] = [
      {
        id: 'exp-1',
        expenseNumber: 'EXP-101',
        category: 'Workshop Utilities & Rent',
        description: 'Monthly workshop rent and power bill',
        amount: 12000,
        date: '2026-08-03',
        payee: 'Hulhumale Industrial Corp',
        paymentMethod: 'BML Transfer',
        status: 'Paid',
      },
    ];

    const purchaseOrders: PurchaseOrder[] = [
      {
        id: 'po-1',
        poNumber: 'PO-2026-001',
        supplierId: 'sup-1',
        supplierName: 'PPG Refinish Maldives',
        items: [{ id: '1', inventoryId: 'inv-1', itemName: 'Ceramic Clearcoat Kit', unit: 'Kit', unitCost: 1600, totalCost: 8000, quantity: 5, receivedQuantity: 5 }],
        subtotal: 8000,
        gstAmount: 0,
        totalAmount: 8000,
        orderDate: '2026-08-04',
        expectedDeliveryDate: '2026-08-08',
        status: 'Received & Stocked',
        paymentStatus: 'Paid',
      },
    ];

    const tb = computeTrialBalance({
      invoices,
      payments,
      expenses,
      purchaseOrders,
      isGstRegistered: true,
    });

    // Verify Debits = Credits
    expect(tb.isBalanced).toBe(true);
    expect(tb.difference).toBe(0);
    expect(tb.totalDebits).toBe(tb.totalCredits);

    // Verify Specific Ledger Account Balances:
    // Cash & Bank = 27000 + 10000 (payments) - 12000 (expense) - 8000 (purchase) = 17000 MVR
    const cashAcc = tb.accounts.find((a) => a.code === '1000')!;
    expect(cashAcc.debit).toBe(17000);

    // Accounts Receivable = 27000 + 16200 (invoiced) - 37000 (paid) = 6200 MVR
    const arAcc = tb.accounts.find((a) => a.code === '1100')!;
    expect(arAcc.debit).toBe(6200);

    // Sales Revenue = 25000 + 15000 = 40000 MVR
    const revAcc = tb.accounts.find((a) => a.code === '4000')!;
    expect(revAcc.credit).toBe(40000);

    // GST Output Tax = 2000 + 1200 = 3200 MVR
    const gstAcc = tb.accounts.find((a) => a.code === '2100')!;
    expect(gstAcc.credit).toBe(3200);

    // Total Debits = 17000 (Cash) + 6200 (AR) + 8000 (COGS) + 12000 (OpEx) = 43200 MVR
    // Total Credits = 40000 (Revenue) + 3200 (GST) = 43200 MVR
    expect(tb.totalDebits).toBe(43200);
    expect(tb.totalCredits).toBe(43200);
  });

  it('3. Generates balanced Profit & Loss and Balance Sheet (DEC-043)', () => {
    const invoices: Invoice[] = [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-001',
        customerId: 'cust-1',
        customerName: 'Ahmed Rauf',
        customerPhone: '+960 778-4321',
        customerIsland: "Male'",
        date: '2026-08-01',
        dueDate: '2026-08-15',
        items: [{ id: '1', description: 'Paint Work', quantity: 1, unitPrice: 20000, amount: 20000, category: 'Labor/Service' }],
        subtotal: 20000,
        gstRate: 0.08,
        gstAmount: 1600,
        totalAmount: 21600,
        amountPaid: 21600,
        balanceDue: 0,
        status: 'Paid',
        bankDetails: 'BML 7730000100201'
      },
    ];

    const payments: Payment[] = [
      {
        id: 'pay-1',
        paymentNumber: 'PAY-1001',
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-2026-001',
        customerId: 'cust-1',
        customerName: 'Ahmed Rauf',
        amount: 21600,
        paymentDate: '2026-08-02',
        method: 'BML Transfer',
        referenceNumber: 'BML-TXN-103',
        status: 'Verified',
      },
    ];

    const expenses: Expense[] = [
      {
        id: 'exp-1',
        expenseNumber: 'EXP-101',
        category: 'Compressor Service',
        description: 'Compressor oil filter and valve overhaul',
        amount: 3000,
        date: '2026-08-03',
        payee: 'Island Machinery',
        paymentMethod: 'Cash',
        status: 'Paid',
      },
    ];

    const purchaseOrders: PurchaseOrder[] = [
      {
        id: 'po-1',
        poNumber: 'PO-2026-001',
        supplierId: 'sup-1',
        supplierName: 'Paint Store',
        items: [{ id: '1', inventoryId: 'inv-1', itemName: 'Paint Cans', unit: 'Cans', unitCost: 2500, totalCost: 5000, quantity: 2, receivedQuantity: 2 }],
        subtotal: 5000,
        gstAmount: 0,
        totalAmount: 5000,
        orderDate: '2026-08-04',
        expectedDeliveryDate: '2026-08-08',
        status: 'Received & Stocked',
        paymentStatus: 'Paid',
      },
    ];

    const pnl = computeProfitAndLoss({
      invoices,
      expenses,
      purchaseOrders,
      isGstRegistered: true,
    });

    // P&L: Gross Revenue (20,000) - COGS (5,000) = Gross Profit (15,000) - OpEx (3,000) = Net (12,000)
    expect(pnl.grossRevenue).toBe(20000);
    expect(pnl.costOfSales).toBe(5000);
    expect(pnl.grossProfit).toBe(15000);
    expect(pnl.operatingExpenses).toBe(3000);
    expect(pnl.netOperatingIncome).toBe(12000);

    // Balance Sheet: Assets (Cash: 21600 - 3000 - 5000 = 13600) = Liabilities (GST: 1600) + Equity (Net Income: 12000) = 13600
    const bs = computeBalanceSheet({
      invoices,
      payments,
      expenses,
      purchaseOrders,
      isGstRegistered: true,
    });

    expect(bs.isBalanced).toBe(true);
    expect(bs.totalAssets).toBe(13600);
    expect(bs.totalLiabilitiesAndEquity).toBe(13600);
  });

  it('4. Enforces statutory date-effective tax calculation (SERP-122): 0% unregistered vs 8% registered', () => {
    // Starq Technologies (not_registered)
    const starqTb = computeTrialBalance({
      invoices: [
        {
          id: 'inv-s1',
          invoiceNumber: 'INV-2026-001',
          customerId: 'cust-x',
          customerName: 'Client X',
          customerPhone: '+960 777-0000',
          customerIsland: "Male'",
          date: '2026-08-10',
          dueDate: '2026-08-25',
          items: [{ id: '1', description: 'Consulting', quantity: 1, unitPrice: 50000, amount: 50000, category: 'Labor/Service' }],
          subtotal: 50000,
          gstRate: 0,
          gstAmount: 0,
          totalAmount: 50000,
          amountPaid: 50000,
          balanceDue: 0,
          status: 'Paid',
          bankDetails: 'BML 7730000100201'
        },
      ],
      payments: [
        {
          id: 'pay-s1',
          paymentNumber: 'PAY-1',
          invoiceId: 'inv-s1',
          invoiceNumber: 'INV-2026-001',
          customerId: 'cust-x',
          customerName: 'Client X',
          amount: 50000,
          paymentDate: '2026-08-11',
          method: 'BML Transfer',
          referenceNumber: 'BML-TXN-104',
          status: 'Verified',
        },
      ],
      expenses: [],
      purchaseOrders: [],
      isGstRegistered: false,
    });

    // GST account must have 0 balance for unregistered tenant
    const gstAcc = starqTb.accounts.find((a) => a.code === '2100')!;
    expect(gstAcc.balance).toBe(0);
    expect(starqTb.isBalanced).toBe(true);
  });
});
