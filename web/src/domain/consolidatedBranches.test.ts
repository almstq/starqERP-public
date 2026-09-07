import { describe, it, expect } from 'vitest';
import {
  generateConsolidatedReport,
  STARQ_BUSINESS_BRANCHES,
  BranchIncomeStatement,
} from './consolidatedBranches';

describe('SERP-010: Business Units, Branches & Consolidated Reporting Engine', () => {
  const sampleBranchData: BranchIncomeStatement[] = [
    {
      branchId: 'br-hq',
      branchCode: 'BR-HQ',
      branchName: 'Corporate Head Office',
      externalRevenue: 50000,
      internalInterBranchRevenue: 25000, // Management fees charged to branches
      totalRevenue: 75000,
      costOfGoodsSold: 10000,
      grossProfit: 65000,
      operatingExpenses: 30000,
      internalInterBranchCharges: 0,
      netIncome: 35000,
    },
    {
      branchId: 'br-mar',
      branchCode: 'BR-MAR',
      branchName: 'Male Marine & Dock Services',
      externalRevenue: 200000,
      internalInterBranchRevenue: 0,
      totalRevenue: 200000,
      costOfGoodsSold: 90000,
      grossProfit: 110000,
      operatingExpenses: 35000,
      internalInterBranchCharges: 15000, // Management fee paid to HQ
      netIncome: 60000,
    },
    {
      branchId: 'br-thl',
      branchCode: 'BR-THL',
      branchName: 'Thilafushi Heavy Engineering Yard',
      externalRevenue: 350000,
      internalInterBranchRevenue: 0,
      totalRevenue: 350000,
      costOfGoodsSold: 160000,
      grossProfit: 190000,
      operatingExpenses: 65000,
      internalInterBranchCharges: 10000, // Management fee paid to HQ
      netIncome: 115000,
    },
  ];

  it('aggregates branch revenues and automatically eliminates internal inter-branch cross-charges', () => {
    const report = generateConsolidatedReport({
      periodName: '2026-Q3',
      branchData: sampleBranchData,
    });

    // Aggregated revenue before elimination: 50k + 200k + 350k + 25k internal = 625,000
    expect(report.aggregatedTotalRevenue).toBe(625000);
    expect(report.eliminatedInterBranchRevenue).toBe(25000);
    expect(report.eliminatedInterBranchCharges).toBe(25000);

    // Consolidated external revenue: 50k + 200k + 350k = 600,000
    expect(report.consolidatedRevenue).toBe(600000);
    expect(report.consolidatedCogs).toBe(260000); // 10k + 90k + 160k
    expect(report.consolidatedGrossProfit).toBe(340000); // 600k - 260k
    expect(report.consolidatedOperatingExpenses).toBe(130000); // 30k + 35k + 65k

    // Consolidated Net Income: 340k - 130k = 210,000
    // Mathematical proof: Sum of branch net incomes: 35k + 60k + 115k = 210,000
    expect(report.consolidatedNetIncome).toBe(210000);
    expect(report.consolidatedNetMarginPct).toBe(35); // 210k / 600k = 35%
  });
});
