export interface BusinessBranch {
  id: string;
  code: string;
  name: string;
  island: string;
  managerName: string;
  isHeadOffice: boolean;
}

export interface BranchIncomeStatement {
  branchId: string;
  branchCode: string;
  branchName: string;
  externalRevenue: number;
  internalInterBranchRevenue: number;
  totalRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingExpenses: number;
  internalInterBranchCharges: number;
  netIncome: number;
}

export interface ConsolidatedFinancialReport {
  periodName: string;
  branches: BranchIncomeStatement[];
  
  // Aggregated Pre-Elimination Totals
  aggregatedExternalRevenue: number;
  aggregatedInternalRevenue: number;
  aggregatedTotalRevenue: number;
  aggregatedCogs: number;
  aggregatedGrossProfit: number;
  aggregatedOperatingExpenses: number;
  aggregatedInternalCharges: number;
  aggregatedNetIncome: number;

  // Inter-Company Elimination Adjustments
  eliminatedInterBranchRevenue: number;
  eliminatedInterBranchCharges: number;
  /**
   * Inter-branch revenue less inter-branch charges. MUST BE ZERO — the same
   * transfer seen from both ends. Anything else means a transfer was recorded
   * in one branch and not the other, and this is how much. Surfaced rather than
   * absorbed; see the note in generateConsolidatedReport.
   */
  interBranchImbalance: number;
  interBranchReconciled: boolean;

  // Final Consolidated Figures
  consolidatedRevenue: number;
  consolidatedCogs: number;
  consolidatedGrossProfit: number;
  consolidatedOperatingExpenses: number;
  consolidatedNetIncome: number;
  consolidatedNetMarginPct: number;

  generatedAt: string;
}

export const STARQ_BUSINESS_BRANCHES: BusinessBranch[] = [
  {
    id: 'br-hq',
    code: 'BR-HQ',
    name: 'Corporate Head Office',
    island: 'Male',
    managerName: 'Ali Musthaq',
    isHeadOffice: true,
  },
  {
    id: 'br-mar',
    code: 'BR-MAR',
    name: 'Male Marine & Dock Services',
    island: 'Male',
    managerName: 'Ahmed Hassan',
    isHeadOffice: false,
  },
  {
    id: 'br-hul',
    code: 'BR-HUL',
    name: 'Hulhumale Commercial Logistics',
    island: 'Hulhumale',
    managerName: 'Ibrahim Rasheed',
    isHeadOffice: false,
  },
  {
    id: 'br-thl',
    code: 'BR-THL',
    name: 'Thilafushi Heavy Engineering Yard',
    island: 'Thilafushi',
    managerName: 'Naeem Shareef',
    isHeadOffice: false,
  },
];

/**
 * Calculates consolidated financial statements across business units with automated inter-branch eliminations.
 */
export function generateConsolidatedReport(params: {
  periodName: string;
  branchData: BranchIncomeStatement[];
}): ConsolidatedFinancialReport {
  const { periodName, branchData } = params;

  let aggExtRev = 0;
  let aggIntRev = 0;
  let aggCogs = 0;
  let aggOpex = 0;
  let aggIntExp = 0;
  let aggNetInc = 0;

  for (const b of branchData) {
    aggExtRev += b.externalRevenue;
    aggIntRev += b.internalInterBranchRevenue;
    aggCogs += b.costOfGoodsSold;
    aggOpex += b.operatingExpenses;
    aggIntExp += b.internalInterBranchCharges;
    aggNetInc += b.netIncome;
  }

  /**
   * SERP-316 — the imbalance is REPORTED, not absorbed.
   *
   * This read `Math.min(aggIntRev, aggIntExp)` under a comment asserting that
   * the two "cancel out exactly". They must, because every inter-branch charge
   * is one branch's revenue and another's cost — the same transfer seen from
   * both ends. WHEN THEY DO NOT, SOMETHING IS RECORDED ON ONE SIDE ONLY, and
   * that discrepancy is the single most valuable thing a consolidation
   * produces. Taking the smaller of the two made the number agree by discarding
   * the difference: the failure the report exists to detect was the failure it
   * silently absorbed, and the statement balanced perfectly while being untrue.
   *
   * The elimination is still the matched portion — that part is honest — but
   * the residue now travels with the report so a reader cannot fail to see it.
   */
  const eliminationAmount = round2(Math.min(aggIntRev, aggIntExp));
  const interBranchImbalance = round2(aggIntRev - aggIntExp);

  const consolidatedRevenue = round2(aggExtRev);
  const consolidatedCogs = round2(aggCogs);
  const consolidatedGrossProfit = round2(consolidatedRevenue - consolidatedCogs);
  const consolidatedOperatingExpenses = round2(aggOpex);
  const consolidatedNetIncome = round2(consolidatedGrossProfit - consolidatedOperatingExpenses);

  const consolidatedNetMarginPct = consolidatedRevenue > 0
    ? round2((consolidatedNetIncome / consolidatedRevenue) * 100)
    : 0;

  return {
    periodName,
    branches: branchData,
    aggregatedExternalRevenue: round2(aggExtRev),
    aggregatedInternalRevenue: round2(aggIntRev),
    aggregatedTotalRevenue: round2(aggExtRev + aggIntRev),
    aggregatedCogs: round2(aggCogs),
    aggregatedGrossProfit: round2((aggExtRev + aggIntRev) - aggCogs),
    aggregatedOperatingExpenses: round2(aggOpex),
    aggregatedInternalCharges: round2(aggIntExp),
    aggregatedNetIncome: round2(aggNetInc),
    eliminatedInterBranchRevenue: eliminationAmount,
    eliminatedInterBranchCharges: eliminationAmount,
    interBranchImbalance,
    interBranchReconciled: interBranchImbalance === 0,
    consolidatedRevenue,
    consolidatedCogs,
    consolidatedGrossProfit,
    consolidatedOperatingExpenses,
    consolidatedNetIncome,
    consolidatedNetMarginPct,
    generatedAt: new Date().toISOString(),
  };
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
