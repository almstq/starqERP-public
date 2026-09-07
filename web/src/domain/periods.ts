/**
 * STARQ ERP — Accounting Period Lifecycle & Lock Engine (SERP-295)
 *
 * Implements:
 * 1. Accounting period definition (monthly & fiscal year)
 * 2. Hard lock assertions preventing backdated journal edits
 * 3. Audited unlocking workflow
 * 4. Year-end roll-forward to Retained Earnings (Account 3200)
 */

import { JournalEntry, JournalLine } from './journals';
import { AccountRecord } from './accounts';

export type PeriodStatus = 'OPEN' | 'LOCKED' | 'CLOSED';

export interface PeriodUnlockAuditLog {
  id: string;
  unlockedAt: string;
  unlockedBy: string;
  reason: string;
  previousStatus: PeriodStatus;
}

export interface AccountingPeriod {
  id: string;
  periodName: string; // e.g. "January 2026"
  fiscalYear: number;
  month: number; // 1-12
  startDate: string; // "2026-01-01"
  endDate: string; // "2026-01-31"
  status: PeriodStatus;
  lockedAt?: string | null;
  lockedBy?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  unlockHistory?: PeriodUnlockAuditLog[];
}

/**
 * Generates standard 12-month accounting periods for a fiscal year.
 */
export function generateFiscalPeriods(fiscalYear: number): AccountingPeriod[] {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return monthNames.map((name, idx) => {
    const monthNum = idx + 1;
    const monthStr = String(monthNum).padStart(2, '0');
    const lastDay = new Date(fiscalYear, monthNum, 0).getDate();

    return {
      id: `period-${fiscalYear}-${monthStr}`,
      periodName: `${name} ${fiscalYear}`,
      fiscalYear,
      month: monthNum,
      startDate: `${fiscalYear}-${monthStr}-01`,
      endDate: `${fiscalYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
      status: 'OPEN',
      unlockHistory: [],
    };
  });
}

/**
 * Asserts that a transaction date does not fall within a locked or closed accounting period.
 * Throws a domain error if the period is locked.
 */
export function assertPeriodNotLocked(date: string, periods: AccountingPeriod[]): void {
  const targetPeriod = periods.find(
    (p) => date >= p.startDate && date <= p.endDate
  );

  if (!targetPeriod) {
    return; // Date outside managed periods
  }

  if (targetPeriod.status === 'LOCKED') {
    throw new Error(
      `Transaction posting rejected: Accounting period "${targetPeriod.periodName}" is LOCKED by ${targetPeriod.lockedBy || 'Controller'}. Unlock period to post edits.`
    );
  }

  if (targetPeriod.status === 'CLOSED') {
    throw new Error(
      `Transaction posting rejected: Accounting period "${targetPeriod.periodName}" is permanently CLOSED. Year-end roll-forward has been executed.`
    );
  }
}

/**
 * Locks an accounting period.
 */
export function lockPeriod(
  periodId: string,
  periods: AccountingPeriod[],
  lockedBy: string = 'Financial Controller'
): AccountingPeriod[] {
  return periods.map((p) => {
    if (p.id === periodId) {
      if (p.status === 'CLOSED') {
        throw new Error(`Period ${p.periodName} is already closed and cannot be re-locked.`);
      }
      return {
        ...p,
        status: 'LOCKED',
        lockedAt: new Date().toISOString(),
        lockedBy,
      };
    }
    return p;
  });
}

/**
 * Unlocks a locked accounting period with an audit reason.
 */
export function unlockPeriod(
  periodId: string,
  periods: AccountingPeriod[],
  reason: string,
  unlockedBy: string = 'Financial Controller'
): AccountingPeriod[] {
  if (!reason || reason.trim().length < 5) {
    throw new Error('An audit reason of at least 5 characters is required to unlock an accounting period.');
  }

  return periods.map((p) => {
    if (p.id === periodId) {
      if (p.status === 'CLOSED') {
        throw new Error(`Permanently closed period ${p.periodName} cannot be unlocked.`);
      }
      const auditEntry: PeriodUnlockAuditLog = {
        id: `unlock-${Date.now()}`,
        unlockedAt: new Date().toISOString(),
        unlockedBy,
        reason: reason.trim(),
        previousStatus: p.status,
      };

      return {
        ...p,
        status: 'OPEN',
        lockedAt: null,
        lockedBy: null,
        unlockHistory: [...(p.unlockHistory || []), auditEntry],
      };
    }
    return p;
  });
}
