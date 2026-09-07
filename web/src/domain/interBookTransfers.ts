/**
 * SERP-316 — inter-book transfers, and the elimination that must follow them.
 *
 * WHAT THIS IS FOR, IN THIS GROUP SPECIFICALLY. Starq Technologies builds the
 * product; Starq Dynamics sells the service that runs on it. They are two
 * registered activities of one legal entity, keeping separate books, and they
 * charge each other. Every one of those charges is REVENUE IN ONE BOOK AND COST
 * IN THE OTHER, and neither is revenue or cost of the entity as a whole. A
 * group cannot make money selling to itself.
 *
 * Consolidate without eliminating and the entity reports revenue it never
 * earned, against a receivable it owes to itself. Both sides of the balance
 * sheet are inflated by the same fiction, so nothing looks wrong — the
 * statement balances perfectly and is simply not true.
 *
 * WHAT WAS THERE. domain/consolidatedBranches.ts eliminated inter-branch
 * amounts from the INCOME STATEMENT only, and did it with:
 *
 *     const eliminationAmount = round2(Math.min(aggIntRev, aggIntExp));
 *
 * Inter-book revenue and inter-book charges MUST be equal — the same transfer
 * seen from both ends. When they are not, something is unrecorded on one side,
 * and THAT DISCREPANCY IS THE SINGLE MOST VALUABLE THING A CONSOLIDATION
 * PRODUCES. Taking the minimum makes the number agree by discarding the
 * difference: the failure the report exists to detect is the failure it
 * silently absorbs. `reconcileInterBook` below reports it instead.
 *
 * There was also no BALANCE SHEET elimination at all, and no Due To / Due From
 * anywhere in the chart of accounts — so the receivable and payable the group
 * owed itself had nowhere to live.
 */

/** Codes added to the seeded chart by this task. */
export const INTER_BOOK_ACCOUNTS = {
  /** Asset. What this book is owed by another book of the same entity. */
  dueFrom: '1220',
  /** Liability. What this book owes another book of the same entity. */
  dueTo: '2160',
} as const;

export interface InterBookTransfer {
  reference: string;
  /** The book giving up value — goods, a service, or a paid expense. */
  fromBookId: string;
  /** The book receiving it. */
  toBookId: string;
  /** Net of GST. See the note on tax below. */
  amount: number;
  /**
   * What moved. It decides which accounts the transfer touches in each book,
   * and it is not cosmetic: recharging a paid expense is not a sale.
   */
  kind: 'goods' | 'service' | 'expense_recharge';
  /** Account the value leaves in the source book — inventory, or the expense. */
  sourceAccount: string;
  /** Account it arrives in for the destination book. */
  destinationAccount: string;
  narration?: string;
  date: string;
}

export interface BookJournalLine {
  bookId: string;
  accountCode: string;
  /** Positive debit, negative credit. */
  amount: number;
  narration: string;
}

export class InterBookError extends Error {
  constructor(message: string, readonly code: 'same_book' | 'invalid_amount') {
    super(message);
    this.name = 'InterBookError';
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The paired journal an inter-book transfer implies: one in each book, each
 * balanced on its own.
 *
 * TWO SEPARATE BALANCED ENTRIES, NOT ONE ENTRY SPANNING TWO BOOKS. Each book is
 * a complete set of records that must stand alone — a trial balance for one
 * book has to balance without reference to the other, or neither book can be
 * audited independently, which is the whole reason for keeping them apart.
 *
 * NO GST. A transfer between two books of ONE legal entity is not a supply:
 * the entity cannot supply itself, so there is no output tax and no input
 * credit. Charging GST on an internal transfer would create a liability to MIRA
 * on a transaction that never left the company. `amount` is therefore net, and
 * this function deliberately has no tax parameter to pass.
 */
export function interBookJournal(transfer: InterBookTransfer): BookJournalLine[] {
  if (transfer.fromBookId === transfer.toBookId) {
    throw new InterBookError('A book cannot transfer to itself.', 'same_book');
  }
  if (!Number.isFinite(transfer.amount) || transfer.amount <= 0) {
    throw new InterBookError('An inter-book transfer must have a positive amount.', 'invalid_amount');
  }

  const amount = round2(transfer.amount);
  const narration = transfer.narration ?? `Inter-book transfer ${transfer.reference}`;

  return [
    // SOURCE BOOK: it is owed the value, and gives up the thing.
    { bookId: transfer.fromBookId, accountCode: INTER_BOOK_ACCOUNTS.dueFrom, amount, narration },
    { bookId: transfer.fromBookId, accountCode: transfer.sourceAccount, amount: -amount, narration },
    // DESTINATION BOOK: it receives the thing, and owes for it.
    { bookId: transfer.toBookId, accountCode: transfer.destinationAccount, amount, narration },
    { bookId: transfer.toBookId, accountCode: INTER_BOOK_ACCOUNTS.dueTo, amount: -amount, narration },
  ];
}

export interface InterBookBalance {
  bookId: string;
  dueFrom: number;
  dueTo: number;
}

export interface ReconciliationResult {
  /** Total receivable between books across the entity. */
  totalDueFrom: number;
  /** Total payable between books across the entity. */
  totalDueTo: number;
  /**
   * dueFrom less dueTo. MUST BE ZERO. Anything else means a transfer was
   * recorded in one book and not the other, and the amount is how much.
   */
  imbalance: number;
  balanced: boolean;
  /** The amount that may honestly be eliminated: the matched portion. */
  eliminable: number;
}

/**
 * Reconcile the inter-book accounts across every book of one entity.
 *
 * THE IMBALANCE IS REPORTED, NEVER ABSORBED. This is the correction to
 * `Math.min(aggIntRev, aggIntExp)`: a consolidation that quietly takes the
 * smaller of two figures that are supposed to be identical has converted its
 * most valuable finding into a rounding step. If one book recorded a MVR 20,000
 * recharge and the other never did, the entity's books are out by 20,000 and
 * somebody needs to know tonight, not at year end.
 *
 * `eliminable` is still returned so a consolidated statement can be produced
 * from a partially-reconciled position — but the caller is now holding a number
 * that says the books disagree, and cannot claim it did not know.
 */
export function reconcileInterBook(balances: readonly InterBookBalance[]): ReconciliationResult {
  const totalDueFrom = round2(balances.reduce((s, b) => s + b.dueFrom, 0));
  const totalDueTo = round2(balances.reduce((s, b) => s + b.dueTo, 0));
  const imbalance = round2(totalDueFrom - totalDueTo);

  return {
    totalDueFrom,
    totalDueTo,
    imbalance,
    balanced: imbalance === 0,
    eliminable: round2(Math.min(totalDueFrom, totalDueTo)),
  };
}

export interface EliminationEntry {
  accountCode: string;
  amount: number;
  narration: string;
}

/**
 * The consolidation elimination for the BALANCE SHEET.
 *
 * Removes the receivable and the payable the entity owes itself. It does not
 * touch either book — an elimination is a CONSOLIDATION-ONLY adjustment and
 * must never be posted back, because each book's own statutory position is
 * correct as it stands. Posting eliminations into the books is how a group
 * loses the ability to report a single subsidiary.
 *
 * THROWS when the books do not reconcile, unless the caller explicitly accepts
 * the imbalance. Producing a clean consolidated balance sheet over books that
 * disagree is precisely the outcome this task exists to prevent, so it takes a
 * deliberate act rather than a default.
 */
export function eliminateInterBookBalances(params: {
  balances: readonly InterBookBalance[];
  /** Set only when the imbalance is known, accepted, and recorded elsewhere. */
  acceptImbalance?: boolean;
}): { entries: EliminationEntry[]; reconciliation: ReconciliationResult; residual: number } {
  const reconciliation = reconcileInterBook(params.balances);

  if (!reconciliation.balanced && !params.acceptImbalance) {
    throw new InterBookError(
      `Inter-book accounts are out by ${reconciliation.imbalance}. A transfer is recorded in one ` +
        `book and not the other. Consolidating over this hides the discrepancy rather than the ` +
        `discrepancy being found.`,
      'invalid_amount',
    );
  }

  const amount = reconciliation.eliminable;
  const entries: EliminationEntry[] = amount > 0
    ? [
        { accountCode: INTER_BOOK_ACCOUNTS.dueTo, amount, narration: 'Consolidation: eliminate inter-book payable' },
        { accountCode: INTER_BOOK_ACCOUNTS.dueFrom, amount: -amount, narration: 'Consolidation: eliminate inter-book receivable' },
      ]
    : [];

  return {
    entries,
    reconciliation,
    // What survives elimination BECAUSE THE BOOKS DISAGREE. It stays on the
    // consolidated balance sheet as an unreconciled inter-book item rather than
    // being written off — an entity that cannot explain a balance should show
    // it, not lose it.
    residual: round2(Math.abs(reconciliation.imbalance)),
  };
}
