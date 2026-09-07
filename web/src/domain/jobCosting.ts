import { accountClassForCode } from './accounts';
import { JournalEntry } from './journals';

export interface MaterialCostItem {
  id: string;
  itemId: string;
  itemCode: string;
  description: string;
  quantity: number;
  unitCostMvr: number;
  totalCostMvr: number;
  allocatedDate: string;
}

export interface LaborCostItem {
  id: string;
  employeeId: string;
  employeeName: string;
  taskDescription: string;
  hoursWorked: number;
  hourlyRateMvr: number;
  totalCostMvr: number;
  logDate: string;
}

export interface ExpenseCostItem {
  id: string;
  description: string;
  vendorName: string;
  amountMvr: number;
  category: 'SUBCONTRACTOR' | 'EQUIPMENT_HIRE' | 'PERMITS_LOGISTICS' | 'OTHER';
  expenseDate: string;
}

export interface JobCostSheet {
  jobId: string;
  jobCode: string;
  projectName: string;
  customerName: string;
  startDate: string;
  targetCompletionDate: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  
  // Financial Contract
  quotedPriceMvr: number;
  budgetedCostMvr: number;
  overheadAbsorptionRatePct: number; // e.g. 15% on direct labor

  // Cost Ledger
  materials: MaterialCostItem[];
  labor: LaborCostItem[];
  directExpenses: ExpenseCostItem[];

  // Computed Totals
  totalMaterialCost: number;
  totalLaborCost: number;
  totalDirectExpenseCost: number;
  totalOverheadAbsorbed: number;
  totalActualCost: number;
  
  // Profitability Metrics
  grossProfitMvr: number;
  grossMarginPct: number;
  costVarianceMvr: number; // positive = under budget, negative = cost overrun

  completionJournal?: JournalEntry;
}

/**
 * Computes a live Job Cost Sheet calculating actual cost absorption and profit margins.
 */
export function calculateJobCostSheet(params: {
  jobId: string;
  jobCode: string;
  projectName: string;
  customerName: string;
  startDate: string;
  targetCompletionDate: string;
  status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  quotedPriceMvr: number;
  budgetedCostMvr: number;
  overheadAbsorptionRatePct?: number;
  materials?: MaterialCostItem[];
  labor?: LaborCostItem[];
  directExpenses?: ExpenseCostItem[];
  tenantId: string;
}): JobCostSheet {
  const {
    jobId,
    jobCode,
    projectName,
    customerName,
    startDate,
    targetCompletionDate,
    status = 'IN_PROGRESS',
    quotedPriceMvr,
    budgetedCostMvr,
    overheadAbsorptionRatePct = 15,
    materials = [],
    labor = [],
    directExpenses = [],
    tenantId,
  } = params;

  const totalMaterialCost = round2(materials.reduce((s, m) => s + (m.quantity * m.unitCostMvr), 0));
  const totalLaborCost = round2(labor.reduce((s, l) => s + (l.hoursWorked * l.hourlyRateMvr), 0));
  const totalDirectExpenseCost = round2(directExpenses.reduce((s, e) => s + e.amountMvr, 0));
  const totalOverheadAbsorbed = round2(totalLaborCost * (overheadAbsorptionRatePct / 100));

  const totalActualCost = round2(
    totalMaterialCost + totalLaborCost + totalDirectExpenseCost + totalOverheadAbsorbed
  );

  const grossProfitMvr = round2(quotedPriceMvr - totalActualCost);
  const grossMarginPct = quotedPriceMvr > 0 ? round2((grossProfitMvr / quotedPriceMvr) * 100) : 0;
  const costVarianceMvr = round2(budgetedCostMvr - totalActualCost);

  const sheet: JobCostSheet = {
    jobId,
    jobCode,
    projectName,
    customerName,
    startDate,
    targetCompletionDate,
    status,
    quotedPriceMvr,
    budgetedCostMvr,
    overheadAbsorptionRatePct,
    materials,
    labor,
    directExpenses,
    totalMaterialCost,
    totalLaborCost,
    totalDirectExpenseCost,
    totalOverheadAbsorbed,
    totalActualCost,
    grossProfitMvr,
    grossMarginPct,
    costVarianceMvr,
  };

  if (status === 'COMPLETED') {
    sheet.completionJournal = createJobCompletionCogsJournal(sheet, tenantId);
  }

  return sheet;
}

/**
 * Creates balanced double-entry General Ledger journal recognizing COGS and clearing Work-in-Progress (WIP).
 */
export function createJobCompletionCogsJournal(sheet: JobCostSheet, tenantId: string): JournalEntry {
  const lines = [
    // 1. Debit COGS - Job Costs (Account 5000)
    {
      id: 'cogs-01',
      accountCode: '5110',
      accountId: 'acc-5110',
      accountClass: accountClassForCode('5110'),
      accountName: 'Cost of Parts & Materials Consumed',
      debit: sheet.totalActualCost,
      credit: 0,
      narration: `Capitalized Job Cost Realization for ${sheet.jobCode} (${sheet.projectName})`,
    },
    // 2. Credit Work-in-Progress WIP (Account 1400)
    {
      id: 'cogs-02',
      accountCode: '1330',
      accountId: 'acc-1330',
      accountClass: accountClassForCode('1330'),
      accountName: 'Work-in-Progress (WIP)',
      debit: 0,
      credit: sheet.totalActualCost,
      narration: `Clear WIP Asset upon job completion for ${sheet.jobCode}`,
    },
  ];

  return {
    id: `je-job-${sheet.jobCode}`,
    entryNumber: `JE-JOB-${sheet.jobCode.replace(/[^a-zA-Z0-9]/g, '')}`,
    date: sheet.targetCompletionDate || new Date().toISOString().slice(0, 10),
    source: 'JOB_COMPLETION',
    reference: sheet.jobCode,
    narration: `Job Cost Realization & WIP Closure for ${sheet.jobCode} - ${sheet.customerName}`,
    lines,
    totalDebit: sheet.totalActualCost,
    totalCredit: sheet.totalActualCost,
    isBalanced: true,
    postedBy: 'System / Job Costing Engine',
    postedAt: new Date().toISOString(),
    tenantId,
    status: 'POSTED',
  };
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
