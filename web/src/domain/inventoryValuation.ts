/**
 * SERP-309 — perpetual inventory valuation and the COGS posting that follows it.
 *
 * THE DEFECT THIS REPLACES, WHICH IS A REAL MISSTATEMENT AND NOT A TIDINESS
 * COMPLAINT. `receiveStock` carried the line:
 *
 *     unitCost: cost !== undefined ? cost : i.unitCost
 *
 * Receiving stock REPLACED the unit cost of everything on hand with the price
 * of the latest delivery. Hold 100 filters bought at MVR 10, take in 10 more at
 * MVR 50 because the cheap supplier was out, and all 110 are instantly carried
 * at 50 — the inventory asset jumps by MVR 4,000 on a purchase that cost 500,
 * and the same error runs straight into cost of sales the moment any of it is
 * issued. Nothing in the system would report it, because every individual
 * number involved is correct.
 *
 * WEIGHTED AVERAGE, AND IT IS A CHOICE WORTH STATING. FIFO would need cost
 * layers, which need batch identity, which does not exist in this data model
 * (that is SERP-313). Moving weighted average is the standard permitted
 * alternative under IAS 2, and it is what the records can actually support
 * today. Choosing it because the schema allows it is legitimate; pretending it
 * is FIFO would not be. If the business needs FIFO — and for imported stock
 * with volatile landed costs it may — that is a schema change, not a formula
 * change, and this module should be replaced rather than bent.
 *
 * THE INVARIANT THAT MAKES IT A VALUATION RATHER THAN A RUNNING GUESS: the
 * average moves ONLY when stock arrives at a cost. Issuing, wasting, or
 * adjusting a quantity leaves it untouched. An issue that changed the average
 * would let the act of selling something alter what the remainder is worth,
 * which is circular and unauditable.
 */

/** Codes come from the seeded chart; see data/defaultChartOfAccounts.ts. */
export const VALUATION_ACCOUNTS = {
  inventory: '1310',      // Merchandise & Spare Parts Inventory
  cogs: '5110',           // Cost of Parts & Materials Consumed
  scrap: '5220',          // Manufacturing Scrap & Waste
  /**
   * An adjustment that is neither a sale nor scrap — a stocktake difference.
   * It goes to COGS rather than to a suspense account because an unexplained
   * shrinkage IS a cost of trading; parking it in suspense is how a real loss
   * gets deferred indefinitely.
   */
  adjustment: '5110',
} as const;

export type MovementKind = 'receipt' | 'issue' | 'waste' | 'adjustment';

export interface ValuationMovement {
  /** Positive for a receipt, positive for the magnitude of an issue. */
  quantity: number;
  kind: MovementKind;
  /** Required for a receipt. Ignored for every other kind — see the invariant. */
  unitCost?: number;
  /** Signed for an adjustment: +5 found, -5 missing. */
  signedQuantity?: number;
  reference?: string;
}

export interface ValuationState {
  quantityOnHand: number;
  /** Weighted average cost per unit. */
  averageCost: number;
  /** quantityOnHand * averageCost, carried explicitly so rounding cannot drift. */
  value: number;
}

export interface ValuationEffect {
  state: ValuationState;
  /** The cost charged out by this movement. Zero for a receipt. */
  costRecognised: number;
  /** Account the cost is charged to. Null when nothing is charged. */
  expenseAccount: string | null;
}

export class InventoryValuationError extends Error {
  constructor(
    message: string,
    readonly code: 'negative_stock' | 'missing_receipt_cost' | 'invalid_quantity',
  ) {
    super(message);
    this.name = 'InventoryValuationError';
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const EMPTY: ValuationState = { quantityOnHand: 0, averageCost: 0, value: 0 };

/**
 * Apply one movement and return the new state plus the cost it recognises.
 *
 * THROWS rather than clamping. A valuation that silently absorbs an impossible
 * movement produces a plausible number from a broken input, and the caller has
 * no way to know. `assertJournalPostable` takes the same position on the ledger
 * and for the same reason.
 */
export function applyMovement(state: ValuationState, movement: ValuationMovement): ValuationEffect {
  const qty = Math.abs(Number(movement.quantity) || 0);

  switch (movement.kind) {
    case 'receipt': {
      if (qty <= 0) {
        throw new InventoryValuationError('A receipt must have a positive quantity.', 'invalid_quantity');
      }
      if (movement.unitCost === undefined || !Number.isFinite(movement.unitCost)) {
        // Receiving stock without a cost is what forces a system to invent one,
        // and inventing one is the whole defect this module replaces.
        throw new InventoryValuationError(
          'A receipt must carry a unit cost; inventory cannot be valued from a quantity alone.',
          'missing_receipt_cost',
        );
      }
      const inValue = qty * movement.unitCost;
      const quantityOnHand = state.quantityOnHand + qty;
      const value = round2(state.value + inValue);
      return {
        state: {
          quantityOnHand,
          // THE AVERAGE, recomputed from VALUE and QUANTITY rather than by
          // blending the two averages. Blending averages weights each delivery
          // equally regardless of size, which is a different and wrong number.
          averageCost: quantityOnHand > 0 ? round2(value / quantityOnHand) : 0,
          value,
        },
        costRecognised: 0,
        expenseAccount: null,
      };
    }

    case 'issue':
    case 'waste': {
      if (qty <= 0) {
        throw new InventoryValuationError('An issue must have a positive quantity.', 'invalid_quantity');
      }
      if (qty > state.quantityOnHand) {
        // Negative stock makes the average meaningless: dividing a negative
        // value by a negative quantity yields a positive cost that means
        // nothing, and every subsequent number inherits it.
        throw new InventoryValuationError(
          `Cannot issue ${qty} when ${state.quantityOnHand} is on hand.`,
          'negative_stock',
        );
      }
      const cost = round2(qty * state.averageCost);
      const quantityOnHand = state.quantityOnHand - qty;
      return {
        state: {
          quantityOnHand,
          // UNCHANGED. Issuing must not move the average — see the invariant.
          averageCost: quantityOnHand > 0 ? state.averageCost : 0,
          // Floored at zero on the last unit so accumulated rounding cannot
          // leave value behind on an empty bin.
          value: quantityOnHand > 0 ? round2(state.value - cost) : 0,
        },
        costRecognised: cost,
        // Scrap is NOT cost of sales. Mixing them makes a wasteful month look
        // like a busy one, which is the opposite of what the reader needs.
        expenseAccount: movement.kind === 'waste' ? VALUATION_ACCOUNTS.scrap : VALUATION_ACCOUNTS.cogs,
      };
    }

    case 'adjustment': {
      const signed = Number(movement.signedQuantity ?? movement.quantity) || 0;
      if (signed === 0) {
        throw new InventoryValuationError('An adjustment of zero is not a movement.', 'invalid_quantity');
      }
      if (signed > 0) {
        // Stock FOUND is taken in at the CURRENT average, not at a new cost.
        // There is no purchase behind it, so there is no new price to learn —
        // and letting a stocktake set a cost would be a way to revalue
        // inventory upward without buying anything.
        const quantityOnHand = state.quantityOnHand + signed;
        const value = round2(quantityOnHand * state.averageCost);
        return {
          state: { quantityOnHand, averageCost: state.averageCost, value },
          costRecognised: round2(-(signed * state.averageCost)),
          expenseAccount: VALUATION_ACCOUNTS.adjustment,
        };
      }
      const shortfall = Math.abs(signed);
      if (shortfall > state.quantityOnHand) {
        throw new InventoryValuationError(
          `Cannot write off ${shortfall} when ${state.quantityOnHand} is on hand.`,
          'negative_stock',
        );
      }
      const cost = round2(shortfall * state.averageCost);
      const quantityOnHand = state.quantityOnHand - shortfall;
      return {
        state: {
          quantityOnHand,
          averageCost: quantityOnHand > 0 ? state.averageCost : 0,
          value: quantityOnHand > 0 ? round2(state.value - cost) : 0,
        },
        costRecognised: cost,
        expenseAccount: VALUATION_ACCOUNTS.adjustment,
      };
    }
  }
}

/** Replay a whole movement history. Used to rebuild a balance and to audit one. */
export function replay(
  movements: readonly ValuationMovement[],
  opening: ValuationState = EMPTY,
): { state: ValuationState; totalCostRecognised: number } {
  let state = opening;
  let total = 0;
  for (const m of movements) {
    const effect = applyMovement(state, m);
    state = effect.state;
    total = round2(total + effect.costRecognised);
  }
  return { state, totalCostRecognised: total };
}

export interface ValuationJournalLine {
  accountCode: string;
  /** Signed: positive debit, negative credit — the convention used by the ledger. */
  amount: number;
  narration: string;
}

/**
 * The double entry a movement implies.
 *
 * A receipt posts nothing here. It is the SUPPLIER BILL that creates the
 * liability and debits inventory; posting the receipt as well would record the
 * purchase twice. This function is deliberately silent on receipts rather than
 * helpfully posting something.
 */
export function journalFor(effect: ValuationEffect, reference: string): ValuationJournalLine[] {
  if (!effect.expenseAccount || effect.costRecognised === 0) return [];

  const amount = effect.costRecognised;
  return [
    {
      accountCode: effect.expenseAccount,
      amount,
      narration: `Stock movement ${reference}`,
    },
    {
      accountCode: VALUATION_ACCOUNTS.inventory,
      amount: -amount,
      narration: `Stock movement ${reference}`,
    },
  ];
}
