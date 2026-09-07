import { accountClassForCode } from './accounts';
import { JournalEntry } from './journals';

export interface WarehouseLocation {
  id: string;
  code: string;
  name: string;
  island: string;
  atoll: string;
  isMainHub: boolean;
  contactPerson: string;
  phone: string;
}

export interface WarehouseStockItem {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  warehouseId: string;
  warehouseCode: string;
  quantityOnHand: number;
  reorderPoint: number;
  safetyStock: number;
  unitCostMvr: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface StockTransferOrder {
  id: string;
  transferNumber: string;
  sourceWarehouseId: string;
  sourceWarehouseCode: string;
  destinationWarehouseId: string;
  destinationWarehouseCode: string;
  vesselNameOrSeaRoute: string; // e.g. "MV Horizon Trader - Sea Transfer"
  carrierReference?: string;
  items: Array<{
    itemId: string;
    itemCode: string;
    itemName: string;
    quantity: number;
    unitCostMvr: number;
    totalValueMvr: number;
    batchNumber?: string;
  }>;
  totalTransferValueMvr: number;
  status: 'DRAFT' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';
  dispatchedDate?: string;
  receivedDate?: string;
  dispatchJournal?: JournalEntry;
  receiptJournal?: JournalEntry;
}

export const MALDIVES_DEFAULT_WAREHOUSES: WarehouseLocation[] = [
  {
    id: 'wh-male',
    code: 'WH-MLE',
    name: 'Male Central Hub Warehouse',
    island: 'Male',
    atoll: 'Kaafu',
    isMainHub: true,
    contactPerson: 'Moosa Ali',
    phone: '+960 7791234',
  },
  {
    id: 'wh-hulhumale',
    code: 'WH-HUL',
    name: 'Hulhumale Phase 2 Logistics Depot',
    island: 'Hulhumale',
    atoll: 'Kaafu',
    isMainHub: false,
    contactPerson: 'Ibrahim Rasheed',
    phone: '+960 7812345',
  },
  {
    id: 'wh-thilafushi',
    code: 'WH-THL',
    name: 'Thilafushi Heavy Marine Yard',
    island: 'Thilafushi',
    atoll: 'Kaafu',
    isMainHub: false,
    contactPerson: 'Naeem Shareef',
    phone: '+960 7903456',
  },
];

/**
 * Creates and evaluates a Stock Transfer Order between inter-island warehouses.
 */
export function createStockTransferOrder(params: {
  id: string;
  transferNumber: string;
  sourceWarehouse: WarehouseLocation;
  destinationWarehouse: WarehouseLocation;
  vesselNameOrSeaRoute: string;
  items: Array<{
    itemId: string;
    itemCode: string;
    itemName: string;
    quantity: number;
    unitCostMvr: number;
    batchNumber?: string;
  }>;
  tenantId: string;
}): StockTransferOrder {
  const {
    id,
    transferNumber,
    sourceWarehouse,
    destinationWarehouse,
    vesselNameOrSeaRoute,
    items,
    tenantId,
  } = params;

  const enrichedItems = items.map((it) => ({
    ...it,
    totalValueMvr: round2(it.quantity * it.unitCostMvr),
  }));

  const totalValue = round2(enrichedItems.reduce((s, it) => s + it.totalValueMvr, 0));

  const order: StockTransferOrder = {
    id,
    transferNumber,
    sourceWarehouseId: sourceWarehouse.id,
    sourceWarehouseCode: sourceWarehouse.code,
    destinationWarehouseId: destinationWarehouse.id,
    destinationWarehouseCode: destinationWarehouse.code,
    vesselNameOrSeaRoute,
    items: enrichedItems,
    totalTransferValueMvr: totalValue,
    status: 'DRAFT',
  };

  return order;
}

/**
 * Dispatches the transfer order, moving inventory to Goods-in-Transit (Account 1350).
 */
export function dispatchStockTransfer(
  order: StockTransferOrder,
  dispatchDate: string,
  tenantId: string
): StockTransferOrder {
  const dispatchJournal: JournalEntry = {
    id: `je-disp-${order.transferNumber}`,
    entryNumber: `JE-DISP-${order.transferNumber.replace(/[^a-zA-Z0-9]/g, '')}`,
    date: dispatchDate,
    source: 'STOCK_TRANSFER_DISPATCH',
    reference: order.transferNumber,
    narration: `Stock Transfer Dispatch ${order.transferNumber} from ${order.sourceWarehouseCode} to In-Transit via ${order.vesselNameOrSeaRoute}`,
    lines: [
      {
        id: 'std-01',
        accountCode: '1320',
        accountId: 'acc-1320',
        accountClass: accountClassForCode('1320'),
        accountName: 'Goods in Transit (Sea Freight & Clearing)',
        debit: order.totalTransferValueMvr,
        credit: 0,
        narration: `In-Transit inventory moving to ${order.destinationWarehouseCode}`,
      },
      {
        id: 'std-02',
        accountCode: '1310',
        accountId: 'acc-1310',
        accountClass: accountClassForCode('1310'),
        accountName: 'Merchandise & Spare Parts Inventory',
        debit: 0,
        credit: order.totalTransferValueMvr,
        narration: `Relieve inventory from ${order.sourceWarehouseCode}`,
      },
    ],
    totalDebit: order.totalTransferValueMvr,
    totalCredit: order.totalTransferValueMvr,
    isBalanced: true,
    postedBy: 'System / Warehouse Engine',
    postedAt: new Date().toISOString(),
    tenantId,
    status: 'POSTED',
  };

  return {
    ...order,
    status: 'DISPATCHED',
    dispatchedDate: dispatchDate,
    dispatchJournal,
  };
}

/**
 * Receives the transfer order at the destination warehouse, clearing Goods-in-Transit.
 */
export function receiveStockTransfer(
  order: StockTransferOrder,
  receiveDate: string,
  tenantId: string
): StockTransferOrder {
  const receiptJournal: JournalEntry = {
    id: `je-recv-${order.transferNumber}`,
    entryNumber: `JE-RECV-${order.transferNumber.replace(/[^a-zA-Z0-9]/g, '')}`,
    date: receiveDate,
    source: 'STOCK_TRANSFER_RECEIPT',
    reference: order.transferNumber,
    narration: `Stock Transfer Receipt ${order.transferNumber} at ${order.destinationWarehouseCode} from In-Transit`,
    lines: [
      {
        id: 'str-01',
        accountCode: '1310',
        accountId: 'acc-1310',
        accountClass: accountClassForCode('1310'),
        accountName: 'Merchandise & Spare Parts Inventory',
        debit: order.totalTransferValueMvr,
        credit: 0,
        narration: `Receive stock into ${order.destinationWarehouseCode}`,
      },
      {
        id: 'str-02',
        accountCode: '1320',
        accountId: 'acc-1320',
        accountClass: accountClassForCode('1320'),
        accountName: 'Goods in Transit (Sea Freight & Clearing)',
        debit: 0,
        credit: order.totalTransferValueMvr,
        narration: `Clear In-Transit inventory upon dock verification`,
      },
    ],
    totalDebit: order.totalTransferValueMvr,
    totalCredit: order.totalTransferValueMvr,
    isBalanced: true,
    postedBy: 'System / Warehouse Engine',
    postedAt: new Date().toISOString(),
    tenantId,
    status: 'POSTED',
  };

  return {
    ...order,
    status: 'RECEIVED',
    receivedDate: receiveDate,
    receiptJournal,
  };
}

/**
 * Evaluates low-stock reorder triggers across all warehouse locations.
 */
export function evaluateWarehouseStockReorders(
  items: WarehouseStockItem[]
): Array<WarehouseStockItem & { deficitQuantity: number }> {
  return items
    .filter((it) => it.quantityOnHand <= it.reorderPoint)
    .map((it) => ({
      ...it,
      deficitQuantity: it.reorderPoint + it.safetyStock - it.quantityOnHand,
    }));
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
