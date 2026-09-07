import { accountClassForCode } from './accounts';
import { JournalEntry } from './journals';

export interface BomComponent {
  rawMaterialItemId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  quantityRequired: number;
  unitCostMvr: number;
  scrapAllowancePct: number; // e.g. 5%
}

export interface BillOfMaterials {
  id: string;
  finishedGoodItemId: string;
  finishedGoodCode: string;
  finishedGoodName: string;
  yieldQuantity: number;
  components: BomComponent[];
  laborCostPerUnitMvr: number;
  overheadAbsorptionRatePct: number; // e.g. 15% on direct labor
}

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  bomId: string;
  finishedGoodCode: string;
  finishedGoodName: string;
  plannedQuantity: number;
  completedQuantity: number;
  scrapQuantity: number;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startDate?: string;
  completedDate?: string;
  totalRawMaterialCostMvr: number;
  totalLaborCostMvr: number;
  totalOverheadCostMvr: number;
  totalWipCostMvr: number;
  finishedGoodsUnitCostMvr: number;
  scrapExpenseMvr: number;
  issueJournal?: JournalEntry;
  completionJournal?: JournalEntry;
}

export const SAMPLE_BOMS: BillOfMaterials[] = [
  {
    id: 'bom-fib-01',
    finishedGoodItemId: 'fg-boat-01',
    finishedGoodCode: 'FG-BOAT-28',
    finishedGoodName: '28ft Fiberglass Passenger Launch Hull',
    yieldQuantity: 1,
    components: [
      {
        rawMaterialItemId: 'rm-res-01',
        rawMaterialCode: 'RM-RESIN-ISO',
        rawMaterialName: 'Isophthalic Marine Resin (200kg Drum)',
        quantityRequired: 3,
        unitCostMvr: 8500,
        scrapAllowancePct: 2,
      },
      {
        rawMaterialItemId: 'rm-mat-02',
        rawMaterialCode: 'RM-MAT-600',
        rawMaterialName: 'Fiberglass Chopped Strand Mat 600g (Roll)',
        quantityRequired: 6,
        unitCostMvr: 1800,
        scrapAllowancePct: 5,
      },
      {
        rawMaterialItemId: 'rm-gel-03',
        rawMaterialCode: 'RM-GEL-WHT',
        rawMaterialName: 'Marine Gelcoat Pure White (25kg Pail)',
        quantityRequired: 4,
        unitCostMvr: 3200,
        scrapAllowancePct: 3,
      },
    ],
    laborCostPerUnitMvr: 25000,
    overheadAbsorptionRatePct: 15,
  },
];

/**
 * Creates a Production Order from a Bill of Materials.
 */
export function createProductionOrder(params: {
  id: string;
  orderNumber: string;
  bom: BillOfMaterials;
  plannedQuantity: number;
}): ProductionOrder {
  const { id, orderNumber, bom, plannedQuantity } = params;

  let rawMaterialCost = 0;
  for (const c of bom.components) {
    const rawQty = (c.quantityRequired / bom.yieldQuantity) * plannedQuantity;
    rawMaterialCost += rawQty * c.unitCostMvr;
  }

  const directLaborCost = (bom.laborCostPerUnitMvr / bom.yieldQuantity) * plannedQuantity;
  const overheadCost = directLaborCost * (bom.overheadAbsorptionRatePct / 100);
  const totalWip = round2(rawMaterialCost + directLaborCost + overheadCost);
  const unitCost = plannedQuantity > 0 ? round2(totalWip / plannedQuantity) : 0;

  return {
    id,
    orderNumber,
    bomId: bom.id,
    finishedGoodCode: bom.finishedGoodCode,
    finishedGoodName: bom.finishedGoodName,
    plannedQuantity,
    completedQuantity: 0,
    scrapQuantity: 0,
    status: 'PLANNED',
    totalRawMaterialCostMvr: round2(rawMaterialCost),
    totalLaborCostMvr: round2(directLaborCost),
    totalOverheadCostMvr: round2(overheadCost),
    totalWipCostMvr: totalWip,
    finishedGoodsUnitCostMvr: unitCost,
    scrapExpenseMvr: 0,
  };
}

/**
 * Starts production, issuing raw materials to Work-in-Progress (Account 1400).
 */
export function startProductionOrder(
  order: ProductionOrder,
  startDate: string,
  tenantId: string
): ProductionOrder {
  const issueJournal: JournalEntry = {
    id: `je-mfg-start-${order.orderNumber}`,
    entryNumber: `JE-MFG-START-${order.orderNumber.replace(/[^a-zA-Z0-9]/g, '')}`,
    date: startDate,
    source: 'PRODUCTION_ORDER_ISSUE',
    reference: order.orderNumber,
    narration: `Raw material issue to WIP for Production Order ${order.orderNumber} (${order.finishedGoodName})`,
    lines: [
      {
        id: 'mfg-01',
        accountCode: '1330',
        accountId: 'acc-1330',
        accountClass: accountClassForCode('1330'),
        accountName: 'Work-in-Progress (WIP)',
        debit: order.totalWipCostMvr,
        credit: 0,
        narration: `WIP accumulation for ${order.plannedQuantity}x ${order.finishedGoodCode}`,
      },
      {
        id: 'mfg-02',
        accountCode: '1310',
        accountId: 'acc-1310',
        accountClass: accountClassForCode('1310'),
        accountName: 'Merchandise & Spare Parts Inventory',
        debit: 0,
        credit: order.totalRawMaterialCostMvr,
        narration: 'Relieve raw material stocks from warehouse',
      },
      {
        id: 'mfg-03',
        accountCode: '5240',
        accountId: 'acc-5240',
        accountClass: accountClassForCode('5240'),
        accountName: 'Direct Labor Absorbed',
        debit: 0,
        credit: order.totalLaborCostMvr,
        narration: 'Direct manufacturing labor allocated',
      },
      {
        id: 'mfg-04',
        accountCode: '5230',
        accountId: 'acc-5230',
        accountClass: accountClassForCode('5230'),
        accountName: 'Factory Overhead Absorbed',
        debit: 0,
        credit: order.totalOverheadCostMvr,
        narration: '15% Factory overhead absorption applied',
      },
    ],
    totalDebit: order.totalWipCostMvr,
    totalCredit: order.totalWipCostMvr,
    isBalanced: true,
    postedBy: 'System / Manufacturing Engine',
    postedAt: new Date().toISOString(),
    tenantId,
    status: 'POSTED',
  };

  return {
    ...order,
    status: 'IN_PROGRESS',
    startDate,
    issueJournal,
  };
}

/**
 * Completes production, capitalizing finished goods to inventory and accounting for scrap/waste.
 */
export function completeProductionOrder(params: {
  order: ProductionOrder;
  completedQuantity: number;
  scrapQuantity: number;
  completionDate: string;
  tenantId: string;
}): ProductionOrder {
  const { order, completedQuantity, scrapQuantity, completionDate, tenantId } = params;

  const totalProduced = completedQuantity + scrapQuantity;
  const finishedGoodsValue = round2(completedQuantity * order.finishedGoodsUnitCostMvr);
  const scrapValue = round2(order.totalWipCostMvr - finishedGoodsValue);

  const completionJournal: JournalEntry = {
    id: `je-mfg-comp-${order.orderNumber}`,
    entryNumber: `JE-MFG-COMP-${order.orderNumber.replace(/[^a-zA-Z0-9]/g, '')}`,
    date: completionDate,
    source: 'PRODUCTION_ORDER_COMPLETION',
    reference: order.orderNumber,
    narration: `Finished Goods receipt & scrap closure for ${order.orderNumber}`,
    lines: [
      {
        id: 'mfg-c01',
        accountCode: '1310',
        accountId: 'acc-1310',
        accountClass: accountClassForCode('1310'),
        accountName: 'Merchandise & Spare Parts Inventory',
        debit: finishedGoodsValue,
        credit: 0,
        narration: `Receive ${completedQuantity}x ${order.finishedGoodCode} into inventory`,
      },
      ...(scrapValue > 0
        ? [
            {
              id: 'mfg-c02',
              accountCode: '5220',
              accountId: 'acc-5220',
              accountClass: accountClassForCode('5220'),
              accountName: 'Manufacturing Scrap & Waste',
              debit: scrapValue,
              credit: 0,
              narration: `Recognize ${scrapQuantity}x defective/scrap units waste`,
            },
          ]
        : []),
      {
        id: 'mfg-c03',
        accountCode: '1330',
        accountId: 'acc-1330',
        accountClass: accountClassForCode('1330'),
        accountName: 'Work-in-Progress (WIP)',
        debit: 0,
        credit: order.totalWipCostMvr,
        narration: `Clear WIP balance upon production run completion`,
      },
    ],
    totalDebit: order.totalWipCostMvr,
    totalCredit: order.totalWipCostMvr,
    isBalanced: true,
    postedBy: 'System / Manufacturing Engine',
    postedAt: new Date().toISOString(),
    tenantId,
    status: 'POSTED',
  };

  return {
    ...order,
    status: 'COMPLETED',
    completedQuantity,
    scrapQuantity,
    completedDate: completionDate,
    scrapExpenseMvr: scrapValue,
    completionJournal,
  };
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
