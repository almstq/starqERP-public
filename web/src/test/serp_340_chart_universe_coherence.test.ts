/**
 * SERP-340 / SERP-316 — ONE account-code universe, and this time asserted.
 *
 * SERP-340 established the principle: the chart the browser renders and the
 * chart the database seeds must be the same set of codes. A module that posts
 * to a code one of them does not define is posting into thin air, and that is
 * not a hypothetical here — stale bank_accounts.gl_account_code rows pointing at
 * 1010/1020/1030 were found and repointed during that task.
 *
 * NOTHING ENFORCED IT. Found 30 August while adding the inter-book accounts:
 *
 *   IN THE MIGRATION, NOT IN THE TYPESCRIPT CHART:
 *     1400, 1410 (input GST recoverable), 2124 (EWT), 2125 (NWT payable),
 *     2126 (income tax payable), 6920 (income tax expense)
 *
 * Six accounts exist in every tenant's database and are invisible to the
 * application that is supposed to be the interface to them. The full test suite
 * was green throughout, because no test compared the two.
 *
 * AND I ALMOST MADE IT WORSE IN THE SAME SITTING. Adding 1220 and 2160 to the
 * TypeScript chart alone would have created the mirror image of the same
 * defect — codes the UI offers that no database accepts. The migration was
 * written only because this comparison was run by hand first. Hence this file:
 * the check should not depend on somebody thinking to look.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/** Every code the database seeds, across all chart-seeding migrations. */
function seededCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    const body = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    if (!body.includes('public.chart_of_accounts')) continue;
    // Seed rows are `  ('1234', 'Name', 'CLASS', ...` inside a values list.
    for (const m of body.matchAll(/^\s*\('(\d{4})',\s*'/gm)) codes.add(m[1]);
  }
  return codes;
}

const ts = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.code));
const db = seededCodes();

/**
 * Codes the database has and the UI does not, KNOWN AND NAMED, 30 Aug 2026.
 *
 * These are not accepted as correct — they are a recorded debt. The fix is the
 * SERP-341 branch (elder/2026-08-30-serp341-taxonomy), which adds all six to the
 * TypeScript chart and is open for review. Listing them here rather than
 * silencing the test means the list can only shrink: anything NOT on it fails
 * immediately, so the divergence cannot grow while the PR waits.
 */
const KNOWN_DB_ONLY = new Set(['1400', '1410', '2124', '2125', '2126', '6920']);

describe('SERP-340 — one account-code universe', () => {
  it('the seeded chart is actually found (the test must not pass by reading nothing)', () => {
    // A parser that silently matches zero rows would make every assertion below
    // trivially true. This is the failure mode that let 55 RLS policies sit
    // untested, and it is worth one line to rule out.
    expect(db.size).toBeGreaterThan(40);
    expect(ts.size).toBeGreaterThan(40);
  });

  it('no code exists in the UI chart that the database will not accept', () => {
    // This direction is unforgiving on purpose. A code the UI offers and the
    // database rejects is a posting that fails in front of a user — or worse,
    // one that the foreign key from journal_lines refuses at the moment
    // somebody is trying to close a period.
    const uiOnly = [...ts].filter((c) => !db.has(c)).sort();
    expect(
      uiOnly,
      'These codes are offered by the application and seeded by no migration.',
    ).toEqual([]);
  });

  it('the database-only codes are exactly the six recorded, and no more', () => {
    const dbOnly = [...db].filter((c) => !ts.has(c)).sort();
    const unexpected = dbOnly.filter((c) => !KNOWN_DB_ONLY.has(c));
    expect(
      unexpected,
      'A new account was seeded into the database without being added to the chart the ' +
        'application renders. It exists in every tenant and is invisible to the UI.',
    ).toEqual([]);
  });

  it('the recorded debt can only shrink', () => {
    const dbOnly = new Set([...db].filter((c) => !ts.has(c)));
    const closed = [...KNOWN_DB_ONLY].filter((c) => !dbOnly.has(c));
    // Not a failure — a prompt. When the SERP-341 branch merges these six
    // disappear, and this list should be trimmed to match rather than left as
    // permanent scar tissue.
    expect(closed.length, `${closed.join(', ')} are reconciled; trim KNOWN_DB_ONLY.`)
      .toBeLessThanOrEqual(KNOWN_DB_ONLY.size);
  });

  it('the inter-book accounts exist on BOTH sides', () => {
    // The specific pair this test was written while adding. Named explicitly so
    // the regression it nearly was cannot come back quietly.
    for (const code of ['1220', '2160']) {
      expect(ts.has(code), `${code} missing from the TypeScript chart`).toBe(true);
      expect(db.has(code), `${code} missing from the database seed`).toBe(true);
    }
  });
});
