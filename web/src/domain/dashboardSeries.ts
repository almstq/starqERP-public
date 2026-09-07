/**
 * SERP-288 — the dashboard series, derived from the tenant's own records.
 *
 * WHAT WAS THERE BEFORE. Two hard-coded arrays in data/mockData.ts:
 *
 *   MONTHLY_SALES_CHART_DATA  six months ending 'Aug (MTD)', MVR 1,051,700 of
 *                             revenue, rendered under the heading "Financial
 *                             Performance (MVR)".
 *   SERVICE_BREAKDOWN_DATA    a car-workshop service mix — 42% Full Body
 *                             Repaint, 28% Vinyl Wraps — shown to every tenant
 *                             whatever business they are in.
 *
 * AND THE PART THAT MADE IT DANGEROUS RATHER THAN MERELY UNTIDY: the dashboard
 * showed the invented series ONLY ONCE THE TENANT HAD REAL DATA —
 * `invoices.length > 0 ? MONTHLY_SALES_CHART_DATA : [six zero months]`. A tenant
 * with an empty book correctly saw zeroes. A tenant who entered ONE invoice saw
 * MVR 1.05m of somebody else's trading, gated on their own activity so that it
 * looked earned. That is the SERP-237 defect again in a different costume: the
 * system substituting a plausible value instead of saying what it knows. A
 * revenue chart is the kind of thing that gets screenshotted into a bank
 * application.
 *
 * THE RULE, SAME AS SERP-237: derive it, or say there is nothing to show. Never
 * synthesise a number that a reader would take as a measurement.
 */

import type { Expense, Invoice, JobOrder } from '../types/erp';

export interface MonthlyPerformancePoint {
  /** 'Mar', or 'Mar (MTD)' for the current, incomplete month. */
  month: string;
  /** ISO year-month, so a caller can sort or drill down without parsing a label. */
  periodCode: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface ServiceMixSlice {
  name: string;
  /** Whole-percent share of recognised job value. */
  value: number;
  color: string;
  /** The underlying money, so a caller can show it rather than only the share. */
  amount: number;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Invoices that are NOT revenue.
 *
 * A DRAFT has not been issued to anybody, and a CANCELLED invoice was withdrawn.
 * Counting either would overstate the top line — the most common way a
 * management dashboard flatters a business without anybody lying.
 */
const NON_REVENUE_INVOICE_STATUSES = new Set(['Draft', 'Cancelled']);

/**
 * Jobs that have not reached a state where their value is real.
 * A quoted job that was never approved is a hope, not a service mix.
 */
const NON_EARNED_JOB_STATUSES = new Set(['Draft', 'Awaiting Approval', 'Cancelled']);

/** Deterministic palette: the same service keeps the same colour between renders. */
const MIX_PALETTE = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

function monthKey(iso: string): string | null {
  // Accepts '2026-08-14' and '2026-08-14T09:00:00Z'. Anything else is refused
  // rather than coerced, because Date parsing of an unknown shape is how a
  // transaction silently lands in the wrong month.
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}`;
}

function labelFor(periodCode: string, currentPeriod: string): string {
  const short = MONTH_LABELS[Number(periodCode.slice(5, 7)) - 1];
  return periodCode === currentPeriod ? `${short} (MTD)` : short;
}

/**
 * The last `months` calendar months ending with the month containing `asOf`,
 * with revenue, expenses and surplus taken from the tenant's own records.
 *
 * REVENUE EXCLUDES GST. `subtotal` is used, never `totalAmount`. GST collected
 * on a sale is money held for MIRA — it is a liability, not turnover — and a
 * chart that includes it overstates revenue by 8% (16% or 17% on tourism
 * supplies) on a screen labelled "Financial Performance". This is the single
 * most likely thing an accountant reviewing the surface would catch first.
 *
 * MONTHS WITH NO ACTIVITY ARE KEPT, at zero. Dropping them would compress the
 * axis and turn a quiet quarter into a smooth upward line.
 */
export function buildMonthlyPerformance(
  invoices: readonly Invoice[],
  expenses: readonly Expense[],
  asOf: Date = new Date(),
  months = 6,
): MonthlyPerformancePoint[] {
  const buckets = new Map<string, { revenue: number; expenses: number }>();

  const year = asOf.getFullYear();
  const monthIndex = asOf.getMonth();
  const codes: string[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(year, monthIndex - back, 1));
    const code = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    codes.push(code);
    buckets.set(code, { revenue: 0, expenses: 0 });
  }
  const currentPeriod = codes[codes.length - 1];

  for (const inv of invoices) {
    if (NON_REVENUE_INVOICE_STATUSES.has(inv.status)) continue;
    const key = monthKey(inv.date);
    const bucket = key ? buckets.get(key) : undefined;
    if (!bucket) continue; // outside the window, or an unparseable date
    bucket.revenue += Number(inv.subtotal) || 0;
  }

  for (const exp of expenses) {
    const key = monthKey(exp.date);
    const bucket = key ? buckets.get(key) : undefined;
    if (!bucket) continue;
    bucket.expenses += Number(exp.amount) || 0;
  }

  return codes.map((code) => {
    const b = buckets.get(code)!;
    return {
      month: labelFor(code, currentPeriod),
      periodCode: code,
      revenue: b.revenue,
      expenses: b.expenses,
      profit: b.revenue - b.expenses,
    };
  });
}

/**
 * Share of earned job value by service type, largest first.
 *
 * WEIGHTED BY VALUE, NOT BY COUNT. Twenty scratch repairs and two full repaints
 * are not a mix in which scratch repair is the dominant service — the money says
 * otherwise, and the money is what the reader is deciding on.
 *
 * Returns [] when there is nothing earned yet. The caller MUST render an empty
 * state rather than a placeholder mix; that is the whole point of this task.
 */
export function buildServiceMix(jobs: readonly JobOrder[], maxSlices = 6): ServiceMixSlice[] {
  const totals = new Map<string, number>();

  for (const job of jobs) {
    if (NON_EARNED_JOB_STATUSES.has(job.status)) continue;
    const value = Number(job.quotedAmount) || 0;
    if (value <= 0) continue;
    const name = job.serviceType || 'Unclassified';
    totals.set(name, (totals.get(name) ?? 0) + value);
  }

  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  if (grand <= 0) return [];

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Everything past maxSlices is collapsed into 'Other' rather than dropped.
  // Dropping the tail would leave the percentages summing to less than 100 and
  // silently understate how diversified the book is.
  const head = ranked.slice(0, maxSlices);
  const tail = ranked.slice(maxSlices);
  if (tail.length > 0) {
    head.push(['Other', tail.reduce((sum, [, v]) => sum + v, 0)]);
  }

  return head.map(([name, amount], i) => ({
    name,
    amount,
    value: Math.round((amount / grand) * 100),
    color: MIX_PALETTE[i % MIX_PALETTE.length],
  }));
}
