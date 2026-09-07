/**
 * SERP-288 — no synthetic business figures on a tenant surface.
 *
 * WHY A TEST AND NOT JUST THE FIX. The fabricated statutory identifier of
 * SERP-237 was removed twice and came back twice. A cleanup does not survive
 * contact with the next feature; a test does.
 *
 * THE DEFECTS IT LOCKS OUT.
 *   MONTHLY_SALES_CHART_DATA — six months of invented trading totalling
 *   MVR 1,051,700 — was rendered under the heading "Financial Performance (MVR)"
 *   as soon as a tenant entered ONE invoice. Gating it on the tenant's own
 *   activity is what made it dangerous rather than obviously fake: it looked
 *   earned. SERVICE_BREAKDOWN_DATA showed a car-workshop service mix to every
 *   tenant whatever business they were in. Eleven more demo datasets sat imported
 *   into the live context, unreferenced but in scope. And one AI recommendation
 *   claimed statement reminders "accelerate settlement turnaround by up to 40%",
 *   a figure nothing in this system has ever measured.
 *
 * THE RULE: a number a reader would take as a measurement of their business is
 * derived from their records, or it is not shown.
 *
 * EVERY ASSERTION BELOW WAS MUTATION-TESTED — the defect was reintroduced into
 * the source and each one watched to go red. Two did NOT, first time round, and
 * the reason is recorded inline rather than tidied away. An assertion nobody has
 * watched fail is not evidence.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = sourceFiles(SRC);
const read = (f: string) => fs.readFileSync(f, 'utf8');
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');

/** Surfaces that present business performance to a tenant. */
const ANALYTICS = /^components\/(dashboard|reports)\//;

describe('SERP-288 — synthetic business figures', () => {
  it('the two removed chart constants are gone by name, everywhere', () => {
    // Two files NAME them in prose — the tombstone in mockData.ts and the
    // rationale atop dashboardSeries.ts. Both explain why they were removed,
    // which is the record this task exists to leave. So they are exempt from
    // the mention check and subject to a stricter one: neither may DECLARE such
    // a constant.
    const EXPLAINS = /^(data\/mockData\.ts|domain\/dashboardSeries\.ts)$/;
    for (const known of ['MONTHLY_SALES_CHART_DATA', 'SERVICE_BREAKDOWN_DATA']) {
      const offenders = files
        .filter((f) => !EXPLAINS.test(rel(f)) && read(f).includes(known))
        .map(rel);
      expect(offenders, `${known} was removed by SERP-288 and came back`).toEqual([]);
    }
    for (const f of files.filter((x) => EXPLAINS.test(rel(x)))) {
      expect(read(f), `${rel(f)} may explain the removal, not undo it`)
        .not.toMatch(/export const (MONTHLY_SALES_CHART_DATA|SERVICE_BREAKDOWN_DATA)/);
    }
  });

  it('no analytics surface imports from mockData at all', () => {
    // The narrow fix would be to ban the two names. The defect is the CHANNEL:
    // any constant reachable from a dashboard becomes a number on a screen a
    // founder reads as a measurement.
    const offenders = files
      .filter((f) => ANALYTICS.test(rel(f)) && /from\s+['"][^'"]*data\/mockData['"]/.test(read(f)))
      .map(rel);
    expect(
      offenders,
      'An analytics surface may only render figures derived from the tenant records.',
    ).toEqual([]);
  });

  it('no analytics surface carries an inline month-series literal', () => {
    // Catches a reintroduction that renames the constant or inlines it to dodge
    // the two checks above.
    const pattern = /\{\s*month\s*:\s*['"][A-Za-z]{3}[^'"]*['"]\s*,[^}]*\b(revenue|sales|turnover)\b\s*:\s*\d{3,}/;
    const offenders = files.filter((f) => ANALYTICS.test(rel(f)) && pattern.test(read(f))).map(rel);
    expect(
      offenders,
      'A month-keyed revenue literal on a dashboard is invented trading history.',
    ).toEqual([]);
  });

  it('the derivation module is what the analytics surfaces actually use', () => {
    // A positive assertion, not only prohibitions: a suite that can pass by
    // deleting the charts has proven nothing.
    for (const surface of ['components/dashboard/DashboardView.tsx', 'components/reports/ReportsView.tsx']) {
      const body = read(path.join(SRC, surface));
      expect(body, `${surface} must derive its series`).toMatch(/from\s+['"][^'"]*domain\/dashboardSeries['"]/);
      expect(body).toMatch(/buildMonthlyPerformance\(/);
      expect(body).toMatch(/buildServiceMix\(/);
    }
  });

  it('revenue on those surfaces is taken net of GST', () => {
    // GST collected is held for MIRA. buildMonthlyPerformance sums `subtotal`;
    // this pins it so nobody "fixes" it to totalAmount later, which would
    // overstate the chart by 8% — 16-17% on tourism supplies — with no visible
    // symptom at all.
    const domain = read(path.join(SRC, 'domain/dashboardSeries.ts'));
    expect(domain).toMatch(/inv\.subtotal/);
    expect(domain, 'totalAmount includes GST and is not revenue').not.toMatch(/inv\.totalAmount/);
  });

  it('the live context does not hold another business’s transactional data in scope', () => {
    // ELEVEN transactional demo datasets were imported into ERPContext and none
    // was referenced. Dead — but dead in the worst possible place: in scope, in
    // the live context, one keystroke from being wired back in by anyone who saw
    // INITIAL_INVOICES available and reasonably assumed it was meant to be used.
    // Leaving them unused is not the same as removing the channel.
    const importBlock =
      /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*data\/mockData['"]/.exec(
        read(path.join(SRC, 'context/ERPContext.tsx')),
      )?.[1] ?? '';

    const banned = [
      'INITIAL_CUSTOMERS', 'INITIAL_JOBS', 'INITIAL_INVOICES', 'INITIAL_PAYMENTS',
      'INITIAL_EXPENSES', 'INITIAL_INVENTORY', 'INITIAL_STOCK_MOVEMENTS',
      'INITIAL_SUPPLIERS', 'INITIAL_PURCHASE_ORDERS', 'INITIAL_ALERTS',
      'INITIAL_AI_INSIGHTS',
    ];

    // A PLAIN SUBSTRING TEST, DELIBERATELY. The block is a comma-separated
    // identifier list, so nothing else there can contain these names. This was
    // first written as new RegExp(`\b${n}\b`) — and inside a TEMPLATE LITERAL
    // \b is the BACKSPACE CHARACTER, not a word boundary, so the regex matched
    // nothing and the assertion passed happily against a source with
    // INITIAL_INVOICES put back. Only mutating the source exposed it. Recorded
    // rather than quietly corrected, because a green assertion that tests
    // nothing is the exact failure this file exists to prevent.
    const present = banned.filter((n) => importBlock.includes(n));
    expect(present, 'transactional demo data must not be in scope in the live context').toEqual([]);
  });

  it('no recommendation carries a statistic the system cannot measure', () => {
    // One AI insight read "accelerates settlement turnaround by up to 40%".
    // Nothing here measures settlement turnaround; the figure was invented and
    // shown under the label "High Impact" to any tenant with a single overdue
    // invoice. SERP-237 again — a plausible number the reader takes as a
    // finding.
    //
    // Scanned across the whole tree and scoped to `description:` VALUES in all
    // three quote styles: the comment that quotes the removed claim verbatim
    // does not trip it, and a future fabricated figure in a template literal
    // does not slip past. The earlier version sliced the file from an anchor
    // string and searched single quotes only, which is how it stayed green
    // against a reintroduced claim.
    const claims: string[] = [];
    for (const f of files) {
      for (const m of read(f).matchAll(
        /description:\s*(['"`])((?:(?!\1)[\s\S])*?(?:up to |by )\d+\s*%(?:(?!\1)[\s\S])*?)\1/g,
      )) {
        claims.push(`${rel(f)}: ${m[2]}`);
      }
    }
    expect(
      claims,
      'A recommendation may state what the records show, not an effect size nobody measured.',
    ).toEqual([]);
  });
});
