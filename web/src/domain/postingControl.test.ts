import { describe, it, expect } from 'vitest';
import {
  assertJournalPostable,
  describePostingRejection,
  postingControlFor,
  PostingRejected,
} from './postingControl';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';
import { generateFiscalPeriods } from './periods';
import { JournalEntry } from './journals';

const accounts = DEFAULT_CHART_OF_ACCOUNTS;
const openPeriods = generateFiscalPeriods(2026);
const closedPeriods = generateFiscalPeriods(2026).map((p) => ({ ...p, status: 'CLOSED' as const }));
const lockedMarch = generateFiscalPeriods(2026).map((p) =>
  p.month === 3 ? { ...p, status: 'LOCKED' as const, lockedBy: 'Controller' } : p,
);

function entry(lines: Array<[string, number, number]>, date = '2026-06-15', source?: string): JournalEntry {
  return {
    id: 'je-test',
    entryNumber: 'JE-TEST-1',
    date,
    narration: 'posting control test',
    source: source as JournalEntry['source'],
    lines: lines.map(([accountCode, debit, credit], i) => ({
      id: `l${i}`,
      accountCode,
      accountName: accountCode,
      debit,
      credit,
    })) as JournalEntry['lines'],
    totalDebit: lines.reduce((s, l) => s + l[1], 0),
    totalCredit: lines.reduce((s, l) => s + l[2], 0),
    isBalanced: true,
    status: 'POSTED',
  } as JournalEntry;
}

describe('SERP-345: posting control gate', () => {
  describe('account classification matches the specification', () => {
    it('classifies the class roots and grouping accounts as headers', () => {
      for (const code of ['1000', '1100', '2000', '2120', '4000', '5000', '6000']) {
        const a = accounts.find((x) => x.code === code)!;
        expect(postingControlFor(a, accounts), `${code} should be a header`).toBe('header');
      }
    });

    it('classifies subledger-backed accounts as control', () => {
      for (const code of ['1210', '2110', '1310', '2121', '2130']) {
        const a = accounts.find((x) => x.code === code)!;
        expect(postingControlFor(a, accounts), `${code} should be control`).toBe('control');
      }
    });

    it('classifies retained earnings and the engine-written accounts as system', () => {
      for (const code of ['3200', '1590', '4310', '6410']) {
        const a = accounts.find((x) => x.code === code)!;
        expect(postingControlFor(a, accounts), `${code} should be system`).toBe('system');
      }
    });

    it('leaves ordinary expense and bank accounts postable', () => {
      for (const code of ['6210', '6220', '1111', '1114']) {
        const a = accounts.find((x) => x.code === code)!;
        expect(postingControlFor(a, accounts), `${code} should be postable`).toBe('postable');
      }
    });
  });

  describe('period locks are actually in effect', () => {
    it('accepts a balanced entry in an open period', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['1114', 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts }),
      ).not.toThrow();
    });

    it('REJECTS a posting into a CLOSED period', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['1114', 100, 0], ['6210', 0, 100]]), periods: closedPeriods, accounts }),
      ).toThrow(/CLOSED/i);
    });

    it('REJECTS a posting into a LOCKED period', () => {
      expect(() =>
        assertJournalPostable({
          entry: entry([['1114', 100, 0], ['6210', 0, 100]], '2026-03-15'),
          periods: lockedMarch,
          accounts,
        }),
      ).toThrow(/LOCKED/i);
    });

    it('still accepts a posting into an open month of a partly locked year', () => {
      expect(() =>
        assertJournalPostable({
          entry: entry([['1114', 100, 0], ['6210', 0, 100]], '2026-04-01'),
          periods: lockedMarch,
          accounts,
        }),
      ).not.toThrow();
    });

    it('lets the year-end close write into the period it is closing, and only it', () => {
      const closing = entry([['4110', 100, 0], ['3200', 0, 100]], '2026-12-31', 'YEAR_END_CLOSE');
      expect(() =>
        assertJournalPostable({ entry: closing, periods: closedPeriods, accounts, actor: 'system' }),
      ).not.toThrow();
      // the same entry offered by a user is refused
      expect(() =>
        assertJournalPostable({ entry: closing, periods: closedPeriods, accounts, actor: 'user' }),
      ).toThrow();
    });
  });

  describe('control classes are enforced against a user', () => {
    it('REJECTS a manual line to a header account', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['1000', 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts }),
      ).toThrow(/header/i);
    });

    it('REJECTS a manual line to a control account', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['1210', 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts }),
      ).toThrow(/control account/i);
    });

    it('REJECTS a manual line to Retained Earnings', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['3200', 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts }),
      ).toThrow(/system account/i);
    });

    it('REJECTS an account that is not in the chart', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['9999', 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts }),
      ).toThrow(/does not exist/i);
    });

    it('permits the owning engine to write its own control accounts', () => {
      expect(() =>
        assertJournalPostable({
          entry: entry([['1210', 100, 0], ['4110', 0, 100]]),
          periods: openPeriods,
          accounts,
          actor: 'system',
        }),
      ).not.toThrow();
    });
  });

  describe('balance', () => {
    it('REJECTS an unbalanced entry before anything else', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['1114', 100, 0], ['6210', 0, 90]]), periods: openPeriods, accounts }),
      ).toThrow(/does not balance/i);
    });
  });

  describe('describePostingRejection', () => {
    it('returns null when the entry is postable', () => {
      expect(
        describePostingRejection({ entry: entry([['1114', 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts }),
      ).toBeNull();
    });

    it('returns the reason instead of throwing', () => {
      const msg = describePostingRejection({
        entry: entry([['3200', 100, 0], ['6210', 0, 100]]),
        periods: openPeriods,
        accounts,
      });
      expect(msg).toMatch(/Retained Earnings/);
    });
  });

  describe('the rejection carries the offending account', () => {
    it('names the code on the error', () => {
      try {
        assertJournalPostable({ entry: entry([['1000', 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts });
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PostingRejected);
        expect((e as PostingRejected).accountCode).toBe('1000');
      }
    });
  });
});
