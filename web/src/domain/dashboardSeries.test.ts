/**
 * SERP-288 — the dashboard series must come from the tenant's records.
 *
 * The first test is the one that matters: a tenant with ONE invoice must see
 * that one invoice, not the MVR 1,051,700 of invented trading that the previous
 * `invoices.length > 0 ? MOCK : zeroes` ternary switched on at exactly that
 * moment.
 */

import { describe, it, expect } from 'vitest';
import { buildMonthlyPerformance, buildServiceMix } from './dashboardSeries';
import type { Expense, Invoice, JobOrder } from '../types/erp';

const ASOF = new Date(Date.UTC(2026, 7, 30)); // 30 Aug 2026

const invoice = (over: Partial<Invoice>): Invoice =>
  ({
    id: 'i', invoiceNumber: 'INV-1', customerId: 'c', customerName: 'C',
    customerPhone: '', customerIsland: '', date: '2026-08-10', dueDate: '2026-09-10',
    items: [], subtotal: 1000, gstRate: 8, gstAmount: 80, totalAmount: 1080,
    amountPaid: 0, balanceDue: 1080, status: 'Sent', bankDetails: '',
    ...over,
  }) as Invoice;

const expense = (over: Partial<Expense>): Expense =>
  ({
    id: 'e', expenseNumber: 'EXP-1', category: 'Consumables & Tools' as Expense['category'],
    payee: 'P', description: '', amount: 400, date: '2026-08-12',
    paymentMethod: 'Cash' as Expense['paymentMethod'], status: 'Paid',
    ...over,
  }) as Expense;

const job = (over: Partial<JobOrder>): JobOrder =>
  ({
    id: 'j', jobId: 'JOB-1', customerId: 'c', customerName: 'C', customerPhone: '',
    vehicle: {} as JobOrder['vehicle'], serviceType: 'Full Body Repaint' as JobOrder['serviceType'],
    requestedWork: '', quotedAmount: 1000, depositPaid: 0, balanceDue: 1000,
    assignedStaff: [], status: 'In Progress' as JobOrder['status'], priority: 'Normal',
    startDate: '2026-08-01', expectedCompletionDate: '2026-08-20', materialsUsed: [],
    estimatedMaterialCost: 0, actualMaterialCost: 0, laborCostEstimate: 0,
    targetMarginPercentage: 0, actualProfit: 0, bayNumber: '1',
    ...over,
  }) as JobOrder;

describe('buildMonthlyPerformance', () => {
  it('a tenant with ONE invoice sees that one invoice — the SERP-288 defect', () => {
    const series = buildMonthlyPerformance([invoice({ subtotal: 1000 })], [], ASOF);
    const august = series.find((p) => p.periodCode === '2026-08')!;

    expect(august.revenue).toBe(1000);
    // The invented series peaked at 215,000 in a single month and totalled
    // 1,051,700. Nothing anywhere near it may appear from one MVR 1,000 sale.
    expect(series.reduce((s, p) => s + p.revenue, 0)).toBe(1000);
  });

  it('an empty book is all zeroes and still has an axis', () => {
    const series = buildMonthlyPerformance([], [], ASOF);
    expect(series).toHaveLength(6);
    expect(series.every((p) => p.revenue === 0 && p.expenses === 0 && p.profit === 0)).toBe(true);
  });

  it('REVENUE EXCLUDES GST — subtotal, never totalAmount', () => {
    // GST collected is money held for MIRA, not turnover. Using totalAmount
    // would overstate this chart by 8%, on a screen labelled "Financial
    // Performance (MVR)".
    const series = buildMonthlyPerformance(
      [invoice({ subtotal: 10000, gstAmount: 800, totalAmount: 10800 })], [], ASOF,
    );
    expect(series.find((p) => p.periodCode === '2026-08')!.revenue).toBe(10000);
  });

  it('drafts and cancelled invoices are not revenue', () => {
    const series = buildMonthlyPerformance(
      [
        invoice({ id: 'a', subtotal: 5000, status: 'Sent' }),
        invoice({ id: 'b', subtotal: 9000, status: 'Draft' }),
        invoice({ id: 'c', subtotal: 7000, status: 'Cancelled' }),
      ],
      [], ASOF,
    );
    expect(series.find((p) => p.periodCode === '2026-08')!.revenue).toBe(5000);
  });

  it('a quiet month stays in the series at zero rather than being dropped', () => {
    // Omitting empty months compresses the axis and turns a bad quarter into a
    // smooth line.
    const series = buildMonthlyPerformance(
      [invoice({ date: '2026-04-05', subtotal: 3000 }), invoice({ id: 'z', date: '2026-08-05', subtotal: 3000 })],
      [], ASOF,
    );
    expect(series.map((p) => p.periodCode)).toEqual([
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
    ]);
    expect(series.find((p) => p.periodCode === '2026-06')!.revenue).toBe(0);
  });

  it('surplus is revenue less expenses, and may be negative', () => {
    const series = buildMonthlyPerformance(
      [invoice({ subtotal: 1000 })], [expense({ amount: 2500 })], ASOF,
    );
    const august = series.find((p) => p.periodCode === '2026-08')!;
    expect(august.expenses).toBe(2500);
    expect(august.profit).toBe(-1500);
  });

  it('records outside the window do not leak in', () => {
    const series = buildMonthlyPerformance([invoice({ date: '2025-11-01', subtotal: 99999 })], [], ASOF);
    expect(series.reduce((s, p) => s + p.revenue, 0)).toBe(0);
  });

  it('an unparseable date is dropped, not coerced into the current month', () => {
    // Date parsing of an unknown shape is how a transaction silently lands in
    // the wrong period.
    const series = buildMonthlyPerformance([invoice({ date: 'not a date', subtotal: 4000 })], [], ASOF);
    expect(series.reduce((s, p) => s + p.revenue, 0)).toBe(0);
  });

  it('only the current month is labelled MTD', () => {
    const series = buildMonthlyPerformance([], [], ASOF);
    expect(series.filter((p) => p.month.includes('MTD'))).toHaveLength(1);
    expect(series[series.length - 1].month).toBe('Aug (MTD)');
  });

  it('the window crosses a year boundary correctly', () => {
    const series = buildMonthlyPerformance([], [], new Date(Date.UTC(2027, 0, 15)));
    expect(series.map((p) => p.periodCode)).toEqual([
      '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01',
    ]);
  });
});

describe('buildServiceMix', () => {
  it('returns nothing when nothing is earned — the caller must show an empty state', () => {
    expect(buildServiceMix([])).toEqual([]);
    expect(buildServiceMix([job({ status: 'Draft' as JobOrder['status'] })])).toEqual([]);
  });

  it('is weighted by VALUE, not by count', () => {
    // Twenty small jobs and two large ones are not a mix dominated by the small
    // ones. The money is what the reader is deciding on.
    const jobs = [
      ...Array.from({ length: 20 }, (_, i) =>
        job({ id: `s${i}`, serviceType: 'Panel Repaint' as JobOrder['serviceType'], quotedAmount: 500 })),
      job({ id: 'b1', serviceType: 'Full Body Repaint' as JobOrder['serviceType'], quotedAmount: 45000 }),
    ];
    const mix = buildServiceMix(jobs);
    expect(mix[0].name).toBe('Full Body Repaint');
    expect(mix[0].amount).toBe(45000);
  });

  it('shares are whole percents of the earned total', () => {
    const mix = buildServiceMix([
      job({ id: 'a', serviceType: 'Full Body Repaint' as JobOrder['serviceType'], quotedAmount: 7500 }),
      job({ id: 'b', serviceType: 'Ceramic & Detailing' as JobOrder['serviceType'], quotedAmount: 2500 }),
    ]);
    expect(mix.map((s) => [s.name, s.value])).toEqual([
      ['Full Body Repaint', 75], ['Ceramic & Detailing', 25],
    ]);
  });

  it('the tail is collapsed into Other, not dropped', () => {
    // Dropping it leaves the percentages summing to under 100 and understates
    // how diversified the book is.
    const jobs = Array.from({ length: 9 }, (_, i) =>
      job({ id: `j${i}`, serviceType: `Service ${i}` as JobOrder['serviceType'], quotedAmount: 1000 }));
    const mix = buildServiceMix(jobs, 6);
    expect(mix).toHaveLength(7);
    expect(mix[mix.length - 1]).toMatchObject({ name: 'Other', amount: 3000 });
  });

  it('a service keeps the same colour across renders', () => {
    const jobs = [job({ quotedAmount: 1000 })];
    expect(buildServiceMix(jobs)[0].color).toBe(buildServiceMix(jobs)[0].color);
  });

  it('zero-value and cancelled jobs contribute nothing', () => {
    const mix = buildServiceMix([
      job({ id: 'a', quotedAmount: 1000 }),
      job({ id: 'b', serviceType: 'Ceramic & Detailing' as JobOrder['serviceType'], quotedAmount: 0 }),
      job({ id: 'c', serviceType: 'Panel Repaint' as JobOrder['serviceType'], quotedAmount: 5000, status: 'Cancelled' as JobOrder['status'] }),
    ]);
    expect(mix).toHaveLength(1);
    expect(mix[0].value).toBe(100);
  });
});
