export interface MiraGstBoxDetails {
  boxNumber: number;
  boxCode: string;
  boxTitle: string;
  taxableValue: number;
  taxAmount: number;
  notes?: string;
}

export interface MiraGst201Return {
  returnId: string;
  tin: string; // Taxpayer Identification Number. Empty when not recorded — never invented.
  legalName: string; // e.g. "Club Ignition Pvt Ltd"
  taxPeriod: string; // YYYY-MM, e.g. "2026-08"
  periodStartDate: string;
  periodEndDate: string;
  filingDueDate: string; // 28th of the month following period
  currency: 'MVR';
  isGstRegistered: boolean;
  
  // Part A: Tax on Supplies (Output Tax)
  box1_standardSupplies8Value: number;
  box2_standardSupplies8Tax: number;
  box3_tourismSupplies16Value: number;
  box4_tourismSupplies16Tax: number;
  box5_zeroRatedSuppliesValue: number;
  box6_exemptSuppliesValue: number;
  box7_totalOutputTax: number;

  // Part B: Input Tax on Purchases
  box8_standardPurchasesValue: number;
  box9_standardPurchasesTax: number;
  box10_capitalPurchasesValue: number;
  box11_capitalPurchasesTax: number;
  box12_totalInputTax: number;

  // Part C: Tax Payable / Refundable
  box13_netGstPayable: number; // Box 7 - Box 12
  isRefundable: boolean;

  // Granular audit lines
  supplyAuditLines: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    customerName: string;
    taxableAmount: number;
    gstAmount: number;
    type: 'standard' | 'tourism' | 'zero_rated' | 'exempt';
  }>;
  purchaseAuditLines: Array<{
    id: string;
    reference: string;
    date: string;
    supplierName: string;
    taxableAmount: number;
    gstAmount: number;
    isCapital: boolean;
  }>;

  generatedAt: string;
}

export interface CalculateMiraGstParams {
  invoices: Array<{
    id: string;
    invoiceNumber?: string;
    issueDate?: string;
    createdAt?: string;
    customerName?: string;
    subtotal: number;
    taxAmount?: number;
    totalAmount?: number;
    gstRate?: number;
    isZeroRated?: boolean;
    isExempt?: boolean;
    isTourismSector?: boolean;
    status?: string;
  }>;
  expenses: Array<{
    id: string;
    reference?: string;
    date?: string;
    supplierName?: string;
    vendor?: string;
    description?: string;
    category?: string;
    amount: number;
    taxAmount?: number;
    isCapitalExpense?: boolean;
    status?: string;
  }>;
  purchaseOrders?: Array<{
    id: string;
    orderNumber?: string;
    date?: string;
    supplierName?: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    isCapital?: boolean;
  }>;
  periodYear: number;
  periodMonth: number; // 1 to 12
  tin: string;
  legalEntityName: string;
  isGstRegistered: boolean;
}

/**
 * Calculates official MIRA GST-201 return schedule according to Maldivian Goods and Services Tax Act.
 */
export function calculateMiraGst201Return(params: CalculateMiraGstParams): MiraGst201Return {
  const {
    invoices,
    expenses,
    purchaseOrders = [],
    periodYear,
    periodMonth,
    tin,
    legalEntityName,
    isGstRegistered,
  } = params;

  const monthPadded = String(periodMonth).padStart(2, '0');
  const taxPeriod = `${periodYear}-${monthPadded}`;
  const periodStartDate = `${periodYear}-${monthPadded}-01`;
  
  // Last day of month
  const lastDay = new Date(periodYear, periodMonth, 0).getDate();
  const periodEndDate = `${periodYear}-${monthPadded}-${String(lastDay).padStart(2, '0')}`;

  // Due date is the 28th of the subsequent month
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
  const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
  const filingDueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-28`;

  // If entity is not GST registered, MIRA return has zero tax liability
  if (!isGstRegistered) {
    return {
      returnId: `MIRA-201-${taxPeriod}-${tin || 'NON-REG'}`,
      tin: tin || 'NOT REGISTERED',
      legalName: legalEntityName,
      taxPeriod,
      periodStartDate,
      periodEndDate,
      filingDueDate,
      currency: 'MVR',
      isGstRegistered: false,
      box1_standardSupplies8Value: 0,
      box2_standardSupplies8Tax: 0,
      box3_tourismSupplies16Value: 0,
      box4_tourismSupplies16Tax: 0,
      box5_zeroRatedSuppliesValue: 0,
      box6_exemptSuppliesValue: 0,
      box7_totalOutputTax: 0,
      box8_standardPurchasesValue: 0,
      box9_standardPurchasesTax: 0,
      box10_capitalPurchasesValue: 0,
      box11_capitalPurchasesTax: 0,
      box12_totalInputTax: 0,
      box13_netGstPayable: 0,
      isRefundable: false,
      supplyAuditLines: [],
      purchaseAuditLines: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // 1. Process Sales Invoices (Output Tax)
  let box1_val = 0;
  let box2_tax = 0;
  let box3_val = 0;
  let box4_tax = 0;
  let box5_val = 0;
  let box6_val = 0;
  const supplyAuditLines: MiraGst201Return['supplyAuditLines'] = [];

  for (const inv of invoices) {
    if (inv.status === 'cancelled' || inv.status === 'draft') continue;
    const invDate = inv.issueDate || inv.createdAt?.slice(0, 10) || '';
    if (invDate < periodStartDate || invDate > periodEndDate) continue;

    const subtotal = Number(inv.subtotal) || 0;
    const explicitTax = Number(inv.taxAmount) || 0;

    if (inv.isZeroRated) {
      box5_val += subtotal;
      supplyAuditLines.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        date: invDate,
        customerName: inv.customerName || 'Customer',
        taxableAmount: subtotal,
        gstAmount: 0,
        type: 'zero_rated',
      });
    } else if (inv.isExempt) {
      box6_val += subtotal;
      supplyAuditLines.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        date: invDate,
        customerName: inv.customerName || 'Customer',
        taxableAmount: subtotal,
        gstAmount: 0,
        type: 'exempt',
      });
    } else if (inv.isTourismSector || inv.gstRate === 0.16) {
      const tax = explicitTax > 0 ? explicitTax : round2(subtotal * 0.16);
      box3_val += subtotal;
      box4_tax += tax;
      supplyAuditLines.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        date: invDate,
        customerName: inv.customerName || 'Customer',
        taxableAmount: subtotal,
        gstAmount: tax,
        type: 'tourism',
      });
    } else {
      // General Sector 8% Standard Rated Supply
      const tax = explicitTax > 0 ? explicitTax : round2(subtotal * 0.08);
      box1_val += subtotal;
      box2_tax += tax;
      supplyAuditLines.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        date: invDate,
        customerName: inv.customerName || 'Customer',
        taxableAmount: subtotal,
        gstAmount: tax,
        type: 'standard',
      });
    }
  }

  const box7_totalOutputTax = round2(box2_tax + box4_tax);

  // 2. Process Expenses & Purchase Orders (Input Tax)
  let box8_val = 0;
  let box9_tax = 0;
  let box10_val = 0;
  let box11_tax = 0;
  const purchaseAuditLines: MiraGst201Return['purchaseAuditLines'] = [];

  for (const exp of expenses) {
    if (exp.status === 'cancelled') continue;
    const expDate = exp.date || '';
    if (expDate < periodStartDate || expDate > periodEndDate) continue;

    const totalAmt = Number(exp.amount) || 0;
    // If taxAmount is given, use it; otherwise compute 8% GST on net if applicable
    const gstAmt = exp.taxAmount !== undefined
      ? Number(exp.taxAmount)
      : round2(totalAmt * (8 / 108)); // Back-calculate 8% GST from inclusive amount
    const taxableAmt = round2(totalAmt - gstAmt);

    if (exp.isCapitalExpense || exp.category?.toLowerCase().includes('capital') || exp.category?.toLowerCase().includes('asset')) {
      box10_val += taxableAmt;
      box11_tax += gstAmt;
      purchaseAuditLines.push({
        id: exp.id,
        reference: exp.reference || exp.category || 'EXP',
        date: expDate,
        supplierName: exp.supplierName || exp.vendor || 'Vendor',
        taxableAmount: taxableAmt,
        gstAmount: gstAmt,
        isCapital: true,
      });
    } else {
      box8_val += taxableAmt;
      box9_tax += gstAmt;
      purchaseAuditLines.push({
        id: exp.id,
        reference: exp.reference || exp.category || 'EXP',
        date: expDate,
        supplierName: exp.supplierName || exp.vendor || 'Vendor',
        taxableAmount: taxableAmt,
        gstAmount: gstAmt,
        isCapital: false,
      });
    }
  }

  for (const po of purchaseOrders) {
    const poDate = po.date || '';
    if (poDate < periodStartDate || poDate > periodEndDate) continue;

    const taxableAmt = Number(po.subtotal) || 0;
    const gstAmt = Number(po.taxAmount) || 0;

    if (po.isCapital) {
      box10_val += taxableAmt;
      box11_tax += gstAmt;
      purchaseAuditLines.push({
        id: po.id,
        reference: po.orderNumber || po.id,
        date: poDate,
        supplierName: po.supplierName || 'Supplier',
        taxableAmount: taxableAmt,
        gstAmount: gstAmt,
        isCapital: true,
      });
    } else {
      box8_val += taxableAmt;
      box9_tax += gstAmt;
      purchaseAuditLines.push({
        id: po.id,
        reference: po.orderNumber || po.id,
        date: poDate,
        supplierName: po.supplierName || 'Supplier',
        taxableAmount: taxableAmt,
        gstAmount: gstAmt,
        isCapital: false,
      });
    }
  }

  const box12_totalInputTax = round2(box9_tax + box11_tax);
  const box13_netGstPayable = round2(box7_totalOutputTax - box12_totalInputTax);
  const isRefundable = box13_netGstPayable < 0;

  return {
    returnId: `MIRA-201-${taxPeriod}-${tin}`,
    tin,
    legalName: legalEntityName,
    taxPeriod,
    periodStartDate,
    periodEndDate,
    filingDueDate,
    currency: 'MVR',
    isGstRegistered: true,
    box1_standardSupplies8Value: round2(box1_val),
    box2_standardSupplies8Tax: round2(box2_tax),
    box3_tourismSupplies16Value: round2(box3_val),
    box4_tourismSupplies16Tax: round2(box4_tax),
    box5_zeroRatedSuppliesValue: round2(box5_val),
    box6_exemptSuppliesValue: round2(box6_val),
    box7_totalOutputTax,
    box8_standardPurchasesValue: round2(box8_val),
    box9_standardPurchasesTax: round2(box9_tax),
    box10_capitalPurchasesValue: round2(box10_val),
    box11_capitalPurchasesTax: round2(box11_tax),
    box12_totalInputTax,
    box13_netGstPayable,
    isRefundable,
    supplyAuditLines,
    purchaseAuditLines,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates official MIRAconnect-compatible CSV file for electronic filing.
 */
export function generateMiraConnectCsv(ret: MiraGst201Return): string {
  const rows = [
    ['MIRA_FORM', 'GST-201'],
    ['TIN', ret.tin],
    ['LEGAL_NAME', ret.legalName],
    ['TAX_PERIOD', ret.taxPeriod],
    ['CURRENCY', ret.currency],
    ['DUE_DATE', ret.filingDueDate],
    [],
    ['BOX_NUMBER', 'BOX_DESCRIPTION', 'VALUE_MVR', 'TAX_MVR'],
    ['Box 1 & 2', 'Standard Rated Supplies (8%)', ret.box1_standardSupplies8Value.toFixed(2), ret.box2_standardSupplies8Tax.toFixed(2)],
    ['Box 3 & 4', 'Tourism Sector Supplies', ret.box3_tourismSupplies16Value.toFixed(2), ret.box4_tourismSupplies16Tax.toFixed(2)],
    ['Box 5', 'Zero-Rated Supplies', ret.box5_zeroRatedSuppliesValue.toFixed(2), '0.00'],
    ['Box 6', 'Exempt Supplies', ret.box6_exemptSuppliesValue.toFixed(2), '0.00'],
    ['Box 7', 'Total Output Tax', '', ret.box7_totalOutputTax.toFixed(2)],
    ['Box 8 & 9', 'Standard Rated Purchases (8%)', ret.box8_standardPurchasesValue.toFixed(2), ret.box9_standardPurchasesTax.toFixed(2)],
    ['Box 10 & 11', 'Capital Purchases Subject to GST', ret.box10_capitalPurchasesValue.toFixed(2), ret.box11_capitalPurchasesTax.toFixed(2)],
    ['Box 12', 'Total Input Tax Deductible', '', ret.box12_totalInputTax.toFixed(2)],
    ['Box 13', 'Net GST Payable / (Refundable)', '', ret.box13_netGstPayable.toFixed(2)],
  ];

  return rows.map(r => r.join(',')).join('\n');
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
