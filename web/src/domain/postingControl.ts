/**
 * STARQ ERP — Posting control (SERP-345)
 *
 * One gate every journal must pass before it reaches the ledger.
 *
 * WHY THIS FILE EXISTS. domain/periods.ts has carried a correct, well-written
 * assertPeriodNotLocked() since SERP-295. It was imported into AccountsView.tsx
 * and CALLED ZERO TIMES. The unit tests passed because they invoked it directly,
 * so the suite was green while the production path posted freely into CLOSED
 * periods. That is this codebase's signature defect — written but never in
 * effect — and it is why the check now lives behind a single function that the
 * UI cannot post without.
 *
 * It mirrors, in the client, what migration 202608300035 enforces in the
 * database. Two layers, one rule. If they ever disagree, the database wins and
 * this file is the bug.
 *
 * AUTHORITY: docs/specs/CHART_OF_ACCOUNTS_SPECIFICATION.md v1.1 §3.
 */

import { AccountRecord } from './accounts';
import { JournalEntry } from './journals';
import { AccountingPeriod, assertPeriodNotLocked } from './periods';

/**
 * The five posting-control classes from the specification.
 *
 * header   — a grouping. Holds no balance. Rejects every journal.
 * control  — backed by a subledger that owns the detail. Engine only.
 * system   — written by one defined process, e.g. the year-end close.
 * postable — ordinary.
 * archived — retired. Historic balances remain visible; nothing new lands.
 */
export type PostingControl = 'header' | 'control' | 'system' | 'postable' | 'archived';

/** Accounts the specification names as control or system, by code. */
const CONTROL_CODES = new Set([
  '1115', '1210', '1310', '1330', '1410',
  '2110', '2121', '2122', '2123', '2124', '2125', '2126', '2130', '2140', '2150',
  '5110',
]);

const SYSTEM_CODES = new Set([
  '1590', '3200', '4310', '5230', '5240', '6410', '6910', '6920',
]);

/**
 * Classify an account. Derived the same way as the seed in migration
 * 202608300035: explicit control/system lists, anything with children is a
 * header, everything else is postable.
 */
export function postingControlFor(account: AccountRecord, accounts: AccountRecord[]): PostingControl {
  if (account.status === 'ARCHIVED') return 'archived';
  if (CONTROL_CODES.has(account.code)) return 'control';
  if (SYSTEM_CODES.has(account.code)) return 'system';
  const hasChildren = accounts.some((a) => a.parentId === account.id);
  if (hasChildren || account.level === 0) return 'header';
  return 'postable';
}

/**
 * Who is posting. A user may only touch postable accounts; the engines that own
 * control and system accounts declare themselves explicitly.
 *
 * This is the client-side twin of the service_role check in the database
 * trigger. It is deliberately NOT a boolean — 'system' has to be spelled out at
 * every call site, so that granting it is a visible decision rather than a
 * default that quietly widens.
 */
export type PostingActor = 'user' | 'system';

export class PostingRejected extends Error {
  constructor(message: string, readonly accountCode?: string) {
    super(message);
    this.name = 'PostingRejected';
  }
}

/**
 * The single gate. Throws PostingRejected if the entry must not reach the ledger.
 *
 * Checks, in order:
 *   1. the entry balances;
 *   2. its date does not fall in a LOCKED or CLOSED period;
 *   3. every line targets an account that exists;
 *   4. no line targets a header or archived account, ever;
 *   5. no USER line targets a control or system account.
 */
export function assertJournalPostable(params: {
  entry: JournalEntry;
  periods: AccountingPeriod[];
  accounts: AccountRecord[];
  actor?: PostingActor;
}): void {
  const { entry, periods, accounts, actor = 'user' } = params;

  // 1. Balance. An unbalanced entry is not a posting, it is a mistake.
  const debit = entry.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(debit - credit) >= 0.005) {
    throw new PostingRejected(
      `Journal ${entry.entryNumber || entry.id} does not balance: debits ${debit.toFixed(2)} against credits ${credit.toFixed(2)}.`,
    );
  }

  // 2. Period lock. The year-end close is the one process allowed to write into
  //    the period it is closing — that is the whole point of a closing entry.
  const isClosingEntry = actor === 'system' && entry.source === 'YEAR_END_CLOSE';
  if (!isClosingEntry) {
    assertPeriodNotLocked(entry.date, periods);
  }

  // 3-5. Account existence and control class.
  for (const line of entry.lines) {
    const account = accounts.find((a) => a.code === line.accountCode);
    if (!account) {
      throw new PostingRejected(
        `Account ${line.accountCode} does not exist in the chart of accounts.`,
        line.accountCode,
      );
    }

    const control = postingControlFor(account, accounts);

    if (control === 'header') {
      throw new PostingRejected(
        `Account ${account.code} (${account.name}) is a header and holds no balance. Post to one of its children.`,
        account.code,
      );
    }

    if (control === 'archived') {
      throw new PostingRejected(
        `Account ${account.code} (${account.name}) is archived and cannot receive new postings.`,
        account.code,
      );
    }

    if (actor === 'user' && (control === 'control' || control === 'system')) {
      throw new PostingRejected(
        `Account ${account.code} (${account.name}) is a ${control} account. It is written by its owning process, not by manual journal.`,
        account.code,
      );
    }
  }
}

/**
 * Convenience wrapper for UI call sites: returns the rejection message rather
 * than throwing, so a view can surface it without a try/catch at every button.
 * Returns null when the entry is postable.
 */
export function describePostingRejection(params: {
  entry: JournalEntry;
  periods: AccountingPeriod[];
  accounts: AccountRecord[];
  actor?: PostingActor;
}): string | null {
  try {
    assertJournalPostable(params);
    return null;
  } catch (err) {
    if (err instanceof PostingRejected || err instanceof Error) return err.message;
    return 'Posting rejected.';
  }
}
