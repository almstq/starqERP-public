import { describe, it, expect } from 'vitest';
import {
  calculateJobCostSheet,
  createJobCompletionCogsJournal,
} from './jobCosting';

describe('SERP-012: Projects & Job-Costing Absorption Engine', () => {
  const sampleParams = {
    jobId: 'job-901',
    jobCode: 'WO-2026-089',
    projectName: 'Marine Propulsion Overhaul (Island Ferry 42)',
    customerName: 'Island Transport Pvt Ltd',
    startDate: '2026-08-01',
    targetCompletionDate: '2026-08-28',
    quotedPriceMvr: 120000,
    budgetedCostMvr: 85000,
    overheadAbsorptionRatePct: 15,
    materials: [
      { id: 'm1', itemId: 'item-01', itemCode: 'SEAL-01', description: 'Hydraulic Seals', quantity: 4, unitCostMvr: 2500, totalCostMvr: 10000, allocatedDate: '2026-08-05' },
      { id: 'm2', itemId: 'item-02', itemCode: 'OIL-SYN', description: 'Marine Synthetic Oil 200L', quantity: 2, unitCostMvr: 8000, totalCostMvr: 16000, allocatedDate: '2026-08-10' },
    ],
    labor: [
      { id: 'l1', employeeId: 'emp-01', employeeName: 'Ahmed Hassan', taskDescription: 'Engine disassembly & block inspection', hoursWorked: 40, hourlyRateMvr: 350, totalCostMvr: 14000, logDate: '2026-08-12' },
      { id: 'l2', employeeId: 'emp-02', employeeName: 'Ramesh Kumar', taskDescription: 'Hull mounting & shaft alignment', hoursWorked: 30, hourlyRateMvr: 250, totalCostMvr: 7500, logDate: '2026-08-18' },
    ],
    directExpenses: [
      { id: 'e1', description: 'Drydock crane rental', vendorName: 'Male Port Crane Services', amountMvr: 12000, category: 'EQUIPMENT_HIRE' as const, expenseDate: '2026-08-15' },
    ],
    tenantId: 'tenant-starq',
  };

  it('accurately computes total absorbed job cost and profit margin metrics', () => {
    const sheet = calculateJobCostSheet(sampleParams);

    expect(sheet.totalMaterialCost).toBe(26000); // 10k + 16k
    expect(sheet.totalLaborCost).toBe(21500); // 14k + 7.5k
    expect(sheet.totalDirectExpenseCost).toBe(12000);
    expect(sheet.totalOverheadAbsorbed).toBe(3225); // 15% on 21,500 labor

    // Total actual cost: 26000 + 21500 + 12000 + 3225 = 62,725
    expect(sheet.totalActualCost).toBe(62725);
    expect(sheet.grossProfitMvr).toBe(57275); // 120,000 - 62,725
    expect(sheet.grossMarginPct).toBe(47.73);
    expect(sheet.costVarianceMvr).toBe(22275); // 85,000 budget - 62,725 actual (Under budget)
  });

  it('generates a balanced COGS recognition & WIP closure journal on job completion', () => {
    const sheet = calculateJobCostSheet({
      ...sampleParams,
      status: 'COMPLETED',
    });

    const je = sheet.completionJournal;
    expect(je).toBeDefined();
    expect(je?.isBalanced).toBe(true);
    expect(je?.totalDebit).toBe(62725);
    expect(je?.totalCredit).toBe(62725);
    expect(je?.lines.find((l) => l.accountCode === '5110')?.debit).toBe(62725);
    expect(je?.lines.find((l) => l.accountCode === '1330')?.credit).toBe(62725);
  });
});
