import {
  hold,
  ready,
  validateProvenance,
  type FinanceDecision,
  type RuleProvenance,
} from './financeGovernance.ts';

export interface InvoiceTaxLineResult {
  readonly is_taxable: boolean;
  readonly tax_rate: number | null;
  readonly base_amount: number;
  readonly tax_amount: number;
  readonly gross_amount: number;
  readonly err_msg: string | null;
}

export interface InvoiceFinanceValue {
  readonly gstRate: number;
  readonly gstAmount: number;
  readonly subtotal: number;
  readonly totalAmount: number;
  readonly taxMode: 'inclusive' | 'exclusive' | 'zero_rated' | 'exempt';
  readonly lines: readonly InvoiceTaxLineResult[];
}

export interface InvoiceFinanceInput {
  readonly items: readonly { quantity: number; unitPrice: number }[];
  readonly taxMode: InvoiceFinanceValue['taxMode'];
  readonly snapshotDate: string;
}

export type InvoiceTaxResolver = (lineAmount: number) => Promise<InvoiceTaxLineResult | null>;

const MIRA_GST_SOURCE_URL =
  'https://www.mira.gov.mv/Legislations/View/Goods-and-Services-Tax-Regulation-consolidated';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function provenance(snapshotDate: string): RuleProvenance[] {
  const source: RuleProvenance = {
    sourceUrl: MIRA_GST_SOURCE_URL,
    sourceTier: 'PRIMARY',
    sourceReference: 'app_private.calculate_line_tax backed by tax_registrations and tax_rate_schedules',
    snapshotDate,
    ruleVersion: 'MIRA-GST-REG-CONSOLIDATED',
  };
  validateProvenance(source);
  return [source];
}

export async function resolveInvoiceFinanceDecision(
  input: InvoiceFinanceInput,
  resolveLineTax: InvoiceTaxResolver,
): Promise<FinanceDecision<InvoiceFinanceValue>> {
  const sources = provenance(input.snapshotDate);
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return hold('Invoice requires at least one line item before authoritative tax resolution.', sources);
  }

  const lines: InvoiceTaxLineResult[] = [];
  for (const item of input.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      return hold('Invoice contains an invalid line item.', sources);
    }

    const lineAmount = round2(item.quantity * item.unitPrice);
    let result: InvoiceTaxLineResult | null;
    try {
      result = await resolveLineTax(lineAmount);
    } catch {
      return hold('Authoritative tax calculation is unavailable; invoice posting is on HOLD.', sources);
    }

    if (!result) {
      return hold('Authoritative tax calculation returned no result; invoice posting is on HOLD.', sources);
    }
    if (result.err_msg) {
      return hold(`Authoritative tax calculation failed: ${result.err_msg}`, sources);
    }
    if (!Number.isFinite(result.base_amount) || !Number.isFinite(result.tax_amount) ||
        !Number.isFinite(result.gross_amount) || result.tax_amount < 0) {
      return hold('Authoritative tax calculation returned unusable amounts; invoice posting is on HOLD.', sources);
    }
    if (input.taxMode !== 'zero_rated' && input.taxMode !== 'exempt' &&
        (!result.is_taxable || result.tax_rate === null || !Number.isFinite(result.tax_rate) || result.tax_rate <= 0)) {
      return hold('Tenant tax registration or effective tax rate is unresolved; invoice posting is on HOLD.', sources);
    }
    lines.push(result);
  }

  const rates = lines.map((line) => line.tax_rate ?? 0);
  if (rates.length > 1 && !rates.every((rate) => rate === rates[0])) {
    return hold('Mixed tax rates across invoice lines are not supported by this boundary; invoice posting is on HOLD.', sources);
  }
  const gstRate = rates[0] ?? 0;
  const subtotal = round2(lines.reduce((sum, line) => sum + line.base_amount, 0));
  const gstAmount = round2(lines.reduce((sum, line) => sum + line.tax_amount, 0));
  const totalAmount = round2(lines.reduce((sum, line) => sum + line.gross_amount, 0));
  const value: InvoiceFinanceValue = {
    gstRate,
    gstAmount,
    subtotal,
    totalAmount,
    taxMode: input.taxMode,
    lines,
  };

  return ready(value, sources, `Authoritative tax resolved for ${input.items.length} invoice line(s).`);
}
