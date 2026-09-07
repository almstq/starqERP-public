/**
 * SERP-310 — landed cost allocation for container imports.
 *
 * WHY THIS IS NOT OPTIONAL IN THIS MARKET. Almost nothing sold in the Maldives
 * is made here. A container of spare parts arrives with ocean freight, MACL
 * harbour handling, customs duty and inland transport attached, and those costs
 * routinely run 20-40% of the supplier invoice. Value the stock at the supplier
 * price alone — which is exactly what SERP-309 does today, and says so — and
 * the inventory asset is understated by that margin, gross profit is overstated
 * on every sale out of that container, and the business believes it is making
 * money it is not making. This is the single largest valuation error available
 * to an importer, and it is invisible because the supplier invoice is correct.
 *
 * IAS 2 is unambiguous: cost includes purchase price, import duties and
 * irrecoverable taxes, transport, handling, and other costs directly
 * attributable to acquisition. Freight is not an expense of the month it was
 * paid in — it is part of what the goods cost, and it belongs in inventory
 * until they are sold.
 *
 * WHAT IS RECOVERABLE AND WHAT IS NOT, WHICH IS WHERE THIS GOES WRONG IN
 * PRACTICE. Import GST is recoverable input tax for a registered business: it
 * is NOT a cost and must never be capitalised into stock. Customs DUTY is
 * irrecoverable and must be. Getting these two the wrong way round overstates
 * inventory by the GST and loses a real input credit at the same time — an
 * error in both directions at once. `recoverable` on each charge is therefore
 * required rather than defaulted, because a default here is a silent
 * accounting decision.
 */

export type AllocationBasis = 'value' | 'quantity' | 'weight';

export interface ShipmentLine {
  lineKey: string;
  description?: string;
  quantity: number;
  /** Supplier price per unit, excluding GST. */
  unitCost: number;
  /** Total weight for the line, in a consistent unit. Needed only for 'weight'. */
  weight?: number;
}

export interface LandedCharge {
  /** 'Ocean freight', 'MACL handling', 'Customs duty'. */
  label: string;
  amount: number;
  basis: AllocationBasis;
  /**
   * TRUE for import GST, which is reclaimable input tax and NEVER part of
   * inventory cost. FALSE for freight, duty and handling. Required, not
   * defaulted — a default is a silent accounting decision, and the two
   * possibilities are wrong in opposite directions.
   */
  recoverable: boolean;
  /** Where a recoverable charge goes instead of inventory. */
  accountCode?: string;
}

export interface AllocatedLine {
  lineKey: string;
  quantity: number;
  /** Supplier price only. */
  goodsValue: number;
  /** Capitalised charges apportioned to this line. */
  allocatedCost: number;
  /** goodsValue + allocatedCost. */
  landedValue: number;
  /** landedValue / quantity — what the stock is actually worth per unit. */
  landedUnitCost: number;
}

export interface LandedCostResult {
  lines: AllocatedLine[];
  /** Charges capitalised into stock. */
  capitalised: number;
  /** Charges deliberately kept out of stock, e.g. recoverable import GST. */
  notCapitalised: number;
  /** Uplift over the supplier invoice, as a fraction. The number to sanity-check. */
  upliftRatio: number;
}

export class LandedCostError extends Error {
  constructor(message: string, readonly code: 'no_lines' | 'basis_unusable' | 'invalid_charge') {
    super(message);
    this.name = 'LandedCostError';
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function weightOf(line: ShipmentLine, basis: AllocationBasis): number {
  switch (basis) {
    case 'value': return line.quantity * line.unitCost;
    case 'quantity': return line.quantity;
    case 'weight': return line.weight ?? 0;
  }
}

/**
 * Apportion charges across shipment lines and return the landed value of each.
 *
 * THE LAST-LINE REMAINDER IS ASSIGNED, NOT DROPPED. Apportioning MVR 10,000 of
 * freight across three lines by value gives thirds that do not sum back to
 * 10,000 in two-decimal currency. Rounding each independently leaves a few
 * laari unallocated, and unallocated freight is freight that has silently
 * become an expense — the inventory is understated by exactly the amount nobody
 * noticed. The residue goes to the largest line, because that is where it is
 * proportionally smallest and least distorting.
 */
export function allocateLandedCost(params: {
  lines: readonly ShipmentLine[];
  charges: readonly LandedCharge[];
}): LandedCostResult {
  const { lines, charges } = params;
  if (lines.length === 0) {
    throw new LandedCostError('A shipment with no lines has nothing to allocate to.', 'no_lines');
  }
  for (const charge of charges) {
    if (!Number.isFinite(charge.amount) || charge.amount < 0) {
      throw new LandedCostError(`Charge "${charge.label}" has an invalid amount.`, 'invalid_charge');
    }
  }

  const allocated = new Map<string, number>(lines.map((l) => [l.lineKey, 0]));
  let capitalised = 0;
  let notCapitalised = 0;

  for (const charge of charges) {
    if (charge.recoverable) {
      // Import GST is reclaimable input tax. It is not a cost and never touches
      // the stock value. Capitalising it overstates inventory AND forfeits a
      // real input credit — wrong in both directions at once.
      notCapitalised = round2(notCapitalised + charge.amount);
      continue;
    }
    if (charge.amount === 0) continue;

    const weights = lines.map((l) => weightOf(l, charge.basis));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      // Allocating by weight when no line carries a weight would divide by
      // zero, or worse, spread it evenly and call that a weight basis. Refuse
      // and say which charge and which basis, so it can be fixed rather than
      // guessed at.
      throw new LandedCostError(
        `Charge "${charge.label}" is allocated by ${charge.basis}, but no line carries a ${charge.basis}.`,
        'basis_unusable',
      );
    }

    let running = 0;
    // Largest line by this basis takes the rounding residue.
    let residueIndex = 0;
    for (let i = 1; i < weights.length; i += 1) if (weights[i] > weights[residueIndex]) residueIndex = i;

    lines.forEach((line, i) => {
      if (i === residueIndex) return;
      const share = round2((weights[i] / total) * charge.amount);
      running = round2(running + share);
      allocated.set(line.lineKey, round2((allocated.get(line.lineKey) ?? 0) + share));
    });
    const residue = round2(charge.amount - running);
    const residueKey = lines[residueIndex].lineKey;
    allocated.set(residueKey, round2((allocated.get(residueKey) ?? 0) + residue));

    capitalised = round2(capitalised + charge.amount);
  }

  const out: AllocatedLine[] = lines.map((line) => {
    const goodsValue = round2(line.quantity * line.unitCost);
    const allocatedCost = round2(allocated.get(line.lineKey) ?? 0);
    const landedValue = round2(goodsValue + allocatedCost);
    return {
      lineKey: line.lineKey,
      quantity: line.quantity,
      goodsValue,
      allocatedCost,
      landedValue,
      landedUnitCost: line.quantity > 0 ? round2(landedValue / line.quantity) : 0,
    };
  });

  const goodsTotal = out.reduce((s, l) => s + l.goodsValue, 0);
  return {
    lines: out,
    capitalised,
    notCapitalised,
    upliftRatio: goodsTotal > 0 ? round2(capitalised / goodsTotal) : 0,
  };
}

export interface LandedCostJournalLine {
  accountCode: string;
  /** Positive debit, negative credit. */
  amount: number;
  narration: string;
}

/**
 * The accrual a landed-cost document posts.
 *
 * Capitalised charges move INTO inventory (1310) and out of the clearing
 * account they were parked in. Recoverable import GST goes to input tax
 * recoverable instead, and never touches stock.
 *
 * The clearing account matters: freight and duty are usually invoiced by
 * different parties at different times from the goods themselves. Posting them
 * straight against the supplier would attribute a shipping agent's bill to the
 * parts supplier, which makes both payables wrong.
 */
export function landedCostJournal(params: {
  result: LandedCostResult;
  charges: readonly LandedCharge[];
  inventoryAccount?: string;
  clearingAccount?: string;
  reference: string;
}): LandedCostJournalLine[] {
  const inventory = params.inventoryAccount ?? '1310';
  // 1320 Goods in Transit (Sea Freight & Clearing) — the account the seeded
  // chart already provides for exactly this.
  const clearing = params.clearingAccount ?? '1320';
  const lines: LandedCostJournalLine[] = [];

  if (params.result.capitalised > 0) {
    lines.push(
      { accountCode: inventory, amount: params.result.capitalised, narration: `Landed cost ${params.reference}` },
      { accountCode: clearing, amount: -params.result.capitalised, narration: `Landed cost ${params.reference}` },
    );
  }

  for (const charge of params.charges) {
    if (!charge.recoverable || charge.amount === 0) continue;
    // 1400 Input GST Recoverable is not on every chart yet, so the caller may
    // name the account. Defaulting silently to an account that might not exist
    // would post into thin air.
    const account = charge.accountCode;
    if (!account) {
      throw new LandedCostError(
        `Recoverable charge "${charge.label}" needs an account; it must not be capitalised into stock.`,
        'invalid_charge',
      );
    }
    lines.push(
      { accountCode: account, amount: charge.amount, narration: `${charge.label} ${params.reference}` },
      { accountCode: clearing, amount: -charge.amount, narration: `${charge.label} ${params.reference}` },
    );
  }

  return lines;
}
