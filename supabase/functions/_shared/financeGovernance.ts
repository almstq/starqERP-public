/** SERP-339 Item 5: shared provenance and explicit HOLD results for beta finance. */
export type SourceTier = 'PRIMARY' | 'SECONDARY' | 'INTERNAL';
export type FinanceDecisionStatus = 'READY' | 'HOLD';

export interface RuleProvenance {
  sourceUrl: string;
  sourceTier: SourceTier;
  sourceReference: string;
  snapshotDate: string;
  ruleVersion: string;
}

export interface FinanceDecision<T> {
  status: FinanceDecisionStatus;
  value: T | null;
  reason: string;
  provenance: RuleProvenance[];
}

export function ready<T>(value: T, provenance: RuleProvenance[], reason: string): FinanceDecision<T> {
  return { status: 'READY', value, reason, provenance: [...provenance] };
}

export function hold<T>(reason: string, provenance: RuleProvenance[] = []): FinanceDecision<T> {
  return { status: 'HOLD', value: null, reason, provenance: [...provenance] };
}

export function validateProvenance(provenance: RuleProvenance): void {
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(provenance.sourceUrl);
  } catch {
    throw new Error('sourceUrl must be an absolute HTTP(S) URL');
  }
  if (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:') {
    throw new Error('sourceUrl must be an absolute HTTP(S) URL');
  }
  if (!provenance.sourceReference.trim()) throw new Error('sourceReference is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(provenance.snapshotDate)) throw new Error('snapshotDate must be YYYY-MM-DD');
  if (!provenance.ruleVersion.trim()) throw new Error('ruleVersion is required');
}
