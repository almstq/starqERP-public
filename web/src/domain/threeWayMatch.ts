/**
 * SERP-311 — three-way matching: purchase order vs goods receipt vs supplier bill.
 *
 * THE CONTROL THIS IS. Before money leaves, three independent records must
 * agree: what we ORDERED, what we RECEIVED, and what we are BEING BILLED FOR.
 * Each is created by a different person at a different moment, and that is the
 * whole point — it is the oldest and cheapest control in procurement, and the
 * one whose absence is the most common way a business quietly overpays.
 *
 * WHAT WAS THERE. Nothing. `receivePurchaseOrder(poId)` set the entire order to
 * 'Received & Stocked' without reading or writing `receivedQuantity` on a single
 * line. The system therefore could not represent a partial delivery, a short
 * delivery, or an over-delivery — every receipt was total by construction — and
 * there was no bill step to match against at all. A supplier could invoice for
 * ten units of something they delivered six of and nothing in the software would
 * have an opinion.
 *
 * THE ASYMMETRY, WHICH IS THE PART WORTH ARGUING ABOUT.
 *
 *   OVER-BILLING IS BLOCKED. Being invoiced for more than arrived is the
 *   failure this control exists to catch. No tolerance makes that acceptable.
 *
 *   UNDER-BILLING IS ALLOWED. A supplier billing less than they delivered costs
 *   us nothing and blocking it would stall a payment over the supplier's own
 *   generosity. It is reported, not refused.
 *
 *   OVER-RECEIPT WARNS BUT DOES NOT BLOCK. The goods are physically on the
 *   floor. Refusing to record them does not send them back — it makes the stock
 *   ledger wrong, which is worse than the variance it was protecting against.
 *   It needs a human to accept it; it does not need the receipt suppressed.
 *
 * COMPARISONS ARE MADE NET OF GST. GST on a purchase is recoverable input tax,
 * not cost, and a PO may be quoted either way. Matching gross against net
 * produces an 8% variance on every correct bill in the country, which teaches
 * people to approve variances without reading them — the precise habit this
 * control exists to prevent.
 *
 * SHAPES ARE STRUCTURAL, ON PURPOSE. This module takes plain readonly inputs
 * rather than the app's `PurchaseOrder` type, because goods receipts and
 * supplier bills do not exist as entities in this codebase yet. The control can
 * be specified and proven now, and bound to whatever those entities turn out to
 * be later, without this file having to change.
 */

export interface MatchLine {
  /** Stable key that identifies the same item across all three documents. */
  lineKey: string;
  description?: string;
}

export interface OrderedLine extends MatchLine {
  quantity: number;
  /** Unit cost EXCLUDING GST. */
  unitCost: number;
}

export interface ReceivedLine extends MatchLine {
  quantity: number;
}

export interface BilledLine extends MatchLine {
  quantity: number;
  /** Unit cost EXCLUDING GST. */
  unitCost: number;
}

export interface MatchTolerance {
  /**
   * Fractional price tolerance, e.g. 0.02 for 2%.
   *
   * DEFAULT IS ZERO, DELIBERATELY. A tolerance is a decision about how much
   * money the business will hand over without asking, and nobody but the
   * business can make it. A convenient non-zero default would be that decision
   * taken quietly on their behalf, and it would be wrong for somebody.
   */
  pricePercent: number;
  /** Absolute per-line price tolerance in MVR, for rounding on small values. */
  priceAbsolute: number;
  /** Fractional over-receipt tolerance against the ordered quantity. */
  overReceiptPercent: number;
}

export const DEFAULT_TOLERANCE: MatchTolerance = {
  pricePercent: 0,
  priceAbsolute: 0,
  overReceiptPercent: 0,
};

export type MatchVerdict = 'matched' | 'review' | 'blocked';

export type ExceptionCode =
  | 'billed_more_than_received'
  | 'billed_item_not_ordered'
  | 'billed_item_not_received'
  | 'price_above_order'
  | 'over_receipt'
  | 'short_receipt'
  | 'under_billed'
  | 'received_item_not_ordered'
  | 'nothing_received';

export interface MatchException {
  code: ExceptionCode;
  lineKey: string;
  /** 'blocked' stops payment. 'review' needs a human but does not stop stock. */
  severity: 'blocked' | 'review';
  ordered: number;
  received: number;
  billed: number;
  /** Money at stake on this line, net of GST. Zero when the variance is quantity-only. */
  variance: number;
  message: string;
}

export interface MatchResult {
  verdict: MatchVerdict;
  exceptions: MatchException[];
  /** Net-of-GST totals, for the header comparison a reviewer reads first. */
  totals: { ordered: number; received: number; billed: number };
  /** Billed less the value of what actually arrived, at ORDER prices. */
  netVariance: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function index<T extends MatchLine & { quantity: number }>(lines: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const line of lines) {
    const existing = map.get(line.lineKey);
    if (!existing) {
      map.set(line.lineKey, { ...line });
      continue;
    }
    // The same item appearing twice on one document is normal — two delivery
    // notes for one order, two lines for two batches. Summing is correct;
    // taking the last would silently discard half a delivery.
    map.set(line.lineKey, { ...existing, quantity: existing.quantity + line.quantity });
  }
  return map;
}

/**
 * Match one bill against its order and the receipts recorded against it.
 *
 * Returns every exception found, not the first. A reviewer needs the whole
 * picture in one pass: stopping at the first variance means three round trips
 * with the supplier where one would have done.
 */
export function threeWayMatch(params: {
  ordered: readonly OrderedLine[];
  received: readonly ReceivedLine[];
  billed: readonly BilledLine[];
  tolerance?: MatchTolerance;
}): MatchResult {
  const tol = params.tolerance ?? DEFAULT_TOLERANCE;
  const ordered = index(params.ordered);
  const received = index(params.received);
  const billed = index(params.billed);

  const exceptions: MatchException[] = [];
  const keys = new Set<string>([...ordered.keys(), ...received.keys(), ...billed.keys()]);

  for (const key of [...keys].sort()) {
    const o = ordered.get(key);
    const r = received.get(key);
    const b = billed.get(key);

    const oQty = o?.quantity ?? 0;
    const rQty = r?.quantity ?? 0;
    const bQty = b?.quantity ?? 0;
    const oCost = o?.unitCost ?? 0;
    const bCost = b?.unitCost ?? 0;

    const push = (
      code: ExceptionCode,
      severity: 'blocked' | 'review',
      variance: number,
      message: string,
    ) =>
      exceptions.push({
        code, lineKey: key, severity,
        ordered: oQty, received: rQty, billed: bQty,
        variance: round2(variance), message,
      });

    // 1. BILLED FOR MORE THAN ARRIVED. The failure this control exists for.
    //    No tolerance applies: paying for goods that are not here is not a
    //    rounding question.
    if (bQty > rQty) {
      const excess = bQty - rQty;
      push(
        r ? 'billed_more_than_received' : 'billed_item_not_received',
        'blocked',
        excess * (bCost || oCost),
        r
          ? `Billed ${bQty} but only ${rQty} received — ${excess} not delivered.`
          : `Billed ${bQty} of an item with no goods receipt at all.`,
      );
    }

    // 2. BILLED FOR SOMETHING NEVER ORDERED. Separate from the above because
    //    the remedy differs: this is not a short delivery, it is a line nobody
    //    authorised, and it is how padding enters an invoice.
    if (b && !o) {
      push('billed_item_not_ordered', 'blocked', bQty * bCost,
        `Billed for an item that appears on no purchase order.`);
    }

    // 3. PRICE ABOVE THE ORDER. Only when billed price EXCEEDS the agreed one —
    //    a supplier charging less than quoted is not a control failure.
    if (o && b && bCost > oCost) {
      const perUnit = bCost - oCost;
      const allowed = Math.max(oCost * tol.pricePercent, tol.priceAbsolute);
      if (perUnit > allowed) {
        push('price_above_order', 'blocked', perUnit * bQty,
          `Billed at ${bCost} against an agreed ${oCost} — ${round2(perUnit)} per unit above order.`);
      }
    }

    // 4. OVER-RECEIPT. Warns, never blocks. The goods are on the floor; refusing
    //    to record them makes the stock ledger wrong, which is worse than the
    //    variance it was guarding.
    if (o && rQty > oQty) {
      const excess = rQty - oQty;
      if (excess > oQty * tol.overReceiptPercent) {
        push('over_receipt', 'review', excess * oCost,
          `Received ${rQty} against ${oQty} ordered — ${excess} more than authorised.`);
      }
    }

    // 5. RECEIVED SOMETHING NEVER ORDERED.
    if (r && !o) {
      push('received_item_not_ordered', 'review', 0,
        `Goods received for an item that appears on no purchase order.`);
    }

    // 6. SHORT RECEIPT — reported so the order is not closed while goods are
    //    outstanding, but never blocking: the bill for what DID arrive is
    //    perfectly payable.
    if (o && rQty < oQty) {
      push('short_receipt', 'review', (oQty - rQty) * oCost,
        `Received ${rQty} of ${oQty} ordered — ${oQty - rQty} outstanding.`);
    }

    // 7. UNDER-BILLED. Costs us nothing; blocking a payment over the supplier's
    //    own generosity would be absurd. Reported so it is not mistaken for a
    //    settled balance.
    if (r && rQty > 0 && bQty < rQty) {
      push('under_billed', 'review', (rQty - bQty) * oCost,
        `Billed ${bQty} against ${rQty} received — ${rQty - bQty} not yet invoiced.`);
    }
  }

  const sum = <T extends { quantity: number }>(m: Map<string, T>, cost: (k: string) => number) =>
    [...m.entries()].reduce((acc, [k, v]) => acc + v.quantity * cost(k), 0);

  const orderCost = (k: string) => ordered.get(k)?.unitCost ?? 0;
  const totals = {
    ordered: round2(sum(ordered, orderCost)),
    // Receipts valued AT ORDER PRICE, not bill price. Valuing what arrived at
    // the price being charged for it would make every overcharge self-
    // justifying — the comparison would agree with itself.
    received: round2(sum(received, orderCost)),
    billed: round2([...billed.values()].reduce((a, l) => a + l.quantity * l.unitCost, 0)),
  };

  // 8. A BILL AGAINST NOTHING RECEIVED AT ALL. Called out at the header, because
  //    per-line it reads as several unrelated exceptions when it is really one
  //    fact: this delivery has not happened.
  if (billed.size > 0 && received.size === 0) {
    exceptions.unshift({
      code: 'nothing_received', lineKey: '*', severity: 'blocked',
      ordered: 0, received: 0, billed: 0, variance: totals.billed,
      message: 'A bill was presented with no goods receipt of any kind against this order.',
    });
  }

  const verdict: MatchVerdict = exceptions.some((e) => e.severity === 'blocked')
    ? 'blocked'
    : exceptions.length > 0
      ? 'review'
      : 'matched';

  return {
    verdict,
    exceptions,
    totals,
    netVariance: round2(totals.billed - totals.received),
  };
}

/**
 * The PO status implied by what has actually been received.
 *
 * `receivePurchaseOrder` set every order to 'Received & Stocked' whatever
 * arrived, so a half-delivered order and a complete one were indistinguishable
 * and nobody could tell what was still outstanding from a supplier.
 */
export function receiptStatus(
  ordered: readonly OrderedLine[],
  received: readonly ReceivedLine[],
): 'Sent' | 'Partially Received' | 'Received & Stocked' {
  const o = index(ordered);
  const r = index(received);
  if ([...r.values()].every((line) => line.quantity <= 0)) return 'Sent';
  const complete = [...o.entries()].every(([k, line]) => (r.get(k)?.quantity ?? 0) >= line.quantity);
  return complete ? 'Received & Stocked' : 'Partially Received';
}
