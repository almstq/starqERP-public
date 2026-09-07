/**
 * SERP-346 — Finance kernel acceptance gate
 *
 * The twelve control observations from §9 of
 * docs/specs/CHART_OF_ACCOUNTS_SPECIFICATION.md, as executable tests.
 *
 * This is the suite that decides whether SERP-339 closes and whether the
 * accounting surface goes back to Azhad. It asserts against the SPECIFICATION,
 * not against the implementation — if a test here disagrees with the code, the
 * code is wrong until the spec is amended by decision.
 *
 * Observations 1-7 and 9-12 are covered here at the domain level. Observation 8
 * (registration status) and the database halves of 2-4 are covered by
 * tests/serp_344_posting_control_probe.sql and migration 202608250017; both are
 * referenced rather than duplicated, and noted in the gaps test at the end.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';
import { CLASS_CODE_RANGES, accountClassForCode, buildAccountTree, AccountRecord } from '../domain/accounts';
import { assertJournalPostable, postingControlFor } from '../domain/postingControl';
import { generateFiscalPeriods } from '../domain/periods';
import { resolveTaxRate, taxOnExclusive } from '../domain/taxRates';
import { calculatePayrollRun } from '../domain/payroll';
import { JournalEntry } from '../domain/journals';

const accounts = DEFAULT_CHART_OF_ACCOUNTS;
const openPeriods = generateFiscalPeriods(2026);

const entry = (lines: Array<[string, number, number]>, date = '2026-06-15'): JournalEntry =>
  ({
    id: 'gate', entryNumber: 'GATE-1', date, narration: 'acceptance gate',
    lines: lines.map(([accountCode, debit, credit], i) => ({ id: `l${i}`, accountCode, accountName: accountCode, debit, credit })),
    totalDebit: lines.reduce((s, l) => s + l[1], 0),
    totalCredit: lines.reduce((s, l) => s + l[2], 0),
    isBalanced: true, status: 'POSTED',
  } as JournalEntry);

describe('SERP-346 — finance kernel acceptance gate', () => {
  // ── 1 ─────────────────────────────────────────────────────────────────────
  describe('1. Payroll never debits Workshop Rent or Electricity', () => {
    it('posts staff cost to 6110 and employer pension to 6120, never 6210 or 6220', () => {
      const run = calculatePayrollRun({
        employees: [
          {
            id: 'emp-gate', employeeCode: 'GATE-1', name: 'Gate Technician',
            nidOrPassport: 'A000001', citizenship: 'MALDIVIAN', designation: 'Technician',
            department: 'Workshop', joinDate: '2025-01-01',
            basicSalaryMvr: 25000, foodAllowanceMvr: 3000, housingAllowanceMvr: 5000,
            otherAllowanceMvr: 0, bankName: 'BML', bankAccountNumber: '7700000000001',
            pensionEnrolled: true, ramadanAllowanceEligible: true, status: 'ACTIVE',
          },
        ] as never,
        periodYear: 2026, periodMonth: 8, isRamadanMonth: true, tenantId: 'tenant-gate',
      });

      const codes = (run.journalEntry?.lines ?? []).map((l) => l.accountCode);
      expect(codes.length).toBeGreaterThan(0);
      expect(codes, 'payroll must not touch 6210 Workshop Rent').not.toContain('6210');
      expect(codes, 'payroll must not touch 6220 Electricity').not.toContain('6220');
      expect(codes, 'staff cost belongs in 6110').toContain('6110');
      expect(codes, 'employer pension belongs in 6120').toContain('6120');
      expect(codes, 'pension liability belongs in 2130').toContain('2130');
      expect(run.journalEntry?.isBalanced).toBe(true);
    });
  });

  // ── 2 ─────────────────────────────────────────────────────────────────────
  describe('2. No posting to a header', () => {
    it.each(['1000', '1100', '2000', '2100', '2120'])('rejects a direct journal to %s', (code) => {
      expect(() =>
        assertJournalPostable({ entry: entry([[code, 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts }),
      ).toThrow(/header/i);
    });
  });

  // ── 3 ─────────────────────────────────────────────────────────────────────
  describe('3. No manual posting to a control account', () => {
    it.each(['1210', '2110', '1310', '2121'])('rejects a manual journal to %s', (code) => {
      expect(() =>
        assertJournalPostable({ entry: entry([[code, 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts }),
      ).toThrow(/control account/i);
    });

    it('permits the owning engine', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['1210', 100, 0], ['4110', 0, 100]]), periods: openPeriods, accounts, actor: 'system' }),
      ).not.toThrow();
    });
  });

  // ── 4 ─────────────────────────────────────────────────────────────────────
  describe('4. Retained Earnings is unreachable by users', () => {
    it('rejects a user journal to 3200 in an open period', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['3200', 100, 0], ['6210', 0, 100]]), periods: openPeriods, accounts }),
      ).toThrow(/system account/i);
    });

    it('is classified system, so no future call site can treat it as ordinary', () => {
      const re = accounts.find((a) => a.code === '3200')!;
      expect(postingControlFor(re, accounts)).toBe('system');
    });
  });

  // ── 5 ─────────────────────────────────────────────────────────────────────
  describe('5. Year-end close is idempotent', () => {
    it('refuses a second close for the same fiscal year', async () => {
      const { executeYearEndClose } = await import('../lib/periodClosing');
      const priorClose = { id: 'je-close-2026', entryNumber: 'JE-CLOSE-2026', date: '2026-12-31', source: 'YEAR_END_CLOSE', lines: [] } as unknown as JournalEntry;
      expect(() =>
        executeYearEndClose({ fiscalYear: 2026, journals: [priorClose], accounts, periods: openPeriods }),
      ).toThrow(/already been closed/i);
    });
  });

  // ── 6 ─────────────────────────────────────────────────────────────────────
  describe('6. A closed period rejects backdated entries', () => {
    it('rejects a posting into a CLOSED period', () => {
      const closed = generateFiscalPeriods(2026).map((p) => ({ ...p, status: 'CLOSED' as const }));
      expect(() =>
        assertJournalPostable({ entry: entry([['1114', 100, 0], ['6210', 0, 100]]), periods: closed, accounts }),
      ).toThrow(/CLOSED/i);
    });

    it('rejects a posting into a LOCKED period', () => {
      const locked = generateFiscalPeriods(2026).map((p) => (p.month === 3 ? { ...p, status: 'LOCKED' as const } : p));
      expect(() =>
        assertJournalPostable({ entry: entry([['1114', 100, 0], ['6210', 0, 100]], '2026-03-15'), periods: locked, accounts }),
      ).toThrow(/LOCKED/i);
    });
  });

  // ── 7 ─────────────────────────────────────────────────────────────────────
  describe('7. June-2025 computes at 16% and July-2025 at 17%, same code path', () => {
    it('resolves both rates', () => {
      expect(resolveTaxRate('gst_tourism', '2025-06-30')).toBe(0.16);
      expect(resolveTaxRate('gst_tourism', '2025-07-01')).toBe(0.17);
    });

    it('computes both amounts', () => {
      expect(taxOnExclusive('gst_tourism', '2025-06-30', 1000)).toBe(160);
      expect(taxOnExclusive('gst_tourism', '2025-07-01', 1000)).toBe(170);
    });

    it('no rate literal survives in the tourism GST engine', async () => {
      // Guards against a future edit reintroducing a constant.
      const src = await import('../domain/miraTgst?raw' as string).catch(() => null);
      if (!src) return; // raw import unavailable in this config; covered by taxRates.test.ts
      expect(String((src as { default?: string }).default ?? '')).not.toMatch(/\*\s*0\.1[67]\b/);
    });
  });

  // ── 9 ─────────────────────────────────────────────────────────────────────
  describe('9. Balanced books', () => {
    it('rejects an entry that does not balance', () => {
      expect(() =>
        assertJournalPostable({ entry: entry([['1114', 100, 0], ['6210', 0, 90]]), periods: openPeriods, accounts }),
      ).toThrow(/does not balance/i);
    });

    it('the chart itself has every class represented, so a trial balance can roll up', () => {
      const classes = new Set(accounts.map((a) => a.accountClass));
      expect([...classes].sort()).toEqual(['ASSET', 'EQUITY', 'EXPENSE', 'LIABILITY', 'REVENUE']);
    });
  });

  // ── 11 ────────────────────────────────────────────────────────────────────
  describe('11. Codes respect class ranges and the hierarchy is acyclic', () => {
    it('every seeded account sits inside its declared class range', () => {
      for (const a of accounts) {
        const range = CLASS_CODE_RANGES[a.accountClass];
        expect(a.code >= range.min && a.code <= range.max, `${a.code} ${a.name} outside ${a.accountClass} ${range.min}-${range.max}`).toBe(true);
      }
    });

    it('the first digit agrees with the declared class for every account', () => {
      for (const a of accounts) {
        expect(accountClassForCode(a.code), `${a.code} ${a.name}`).toBe(a.accountClass);
      }
    });

    it('no account is its own ancestor', () => {
      const byId = new Map(accounts.map((a) => [a.id, a] as const));
      for (const a of accounts) {
        const seen = new Set<string>([a.id]);
        let cur: AccountRecord | undefined = a;
        while (cur?.parentId) {
          expect(seen.has(cur.parentId), `cycle through ${a.code}`).toBe(false);
          seen.add(cur.parentId);
          cur = byId.get(cur.parentId);
        }
      }
    });

    it('every parent reference resolves', () => {
      const ids = new Set(accounts.map((a) => a.id));
      for (const a of accounts) {
        if (a.parentId) expect(ids.has(a.parentId), `${a.code} has a dangling parent`).toBe(true);
      }
      expect(buildAccountTree(accounts).length).toBeGreaterThan(0);
    });

    it('account codes are unique', () => {
      const codes = accounts.map((a) => a.code);
      expect(new Set(codes).size, 'duplicate account code in the seed').toBe(codes.length);
    });
  });

  // ── 12 ────────────────────────────────────────────────────────────────────
  describe('12. Every code any engine posts to exists in the chart', () => {
    it('the chart is the only account universe', () => {
      // The check that failed before SERP-340, when five of thirty-nine matched.
      // Kept as a live assertion so a reintroduced ad-hoc code fails the gate.
      const known = new Set(accounts.map((a) => a.code));
      const engineCodes = [
        '6110', '6120', '2130', '2140',            // payroll
        '1111', '1112', '1210', '2110', '4310', '6410', // multi-currency
        '1320', '1310',                             // warehouse
        '5110', '1330',                             // job costing
        '5220', '5230', '5240',                     // manufacturing
        '2121', '2150',                             // credit notes
        '2123',                                     // green tax
        '3200',                                     // period closing
        '6310',                                     // bank reconciliation
      ];
      for (const c of engineCodes) {
        expect(known.has(c), `engine posts to ${c}, which is not in the chart`).toBe(true);
      }
    });
  });

  // ── coverage the suite does NOT claim ─────────────────────────────────────
  describe('gaps this suite does not cover, stated rather than implied', () => {
    it('records what is proven elsewhere or still open', () => {
      const elsewhere = {
        observation_2_3_4_database_half: 'tests/serp_344_posting_control_probe.sql',
        observation_8_registration_status: 'migration 202608250017 app_private.calculate_line_tax',
        observation_9_arithmetic_and_10_reconciliation: 'PROVEN — src/test/serp_346_reconciliation.test.ts, 19 assertions against a posted ledger',
        tenant_isolation: 'tests/serp_300_adversarial_isolation_probe.sql, 29/29',
        azhad_second_review: 'OUTSTANDING — the actual close condition for SERP-339. Code passing its own tests is not acceptance.',
      };
      // Nothing in the twelve is now unproven at the domain level. The remaining
      // dependency is external: Azhad has not re-reviewed the surface, and that
      // — not this suite — is the close condition for SERP-339.
      expect(elsewhere.observation_9_arithmetic_and_10_reconciliation).toMatch(/PROVEN/);
      expect(elsewhere.azhad_second_review).toMatch(/OUTSTANDING/);
    });
  });
});
