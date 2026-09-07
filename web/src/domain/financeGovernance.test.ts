import { describe, expect, it } from 'vitest';
import { hold, ready, validateProvenance, type RuleProvenance } from './financeGovernance';

const source: RuleProvenance = { sourceUrl: 'https://www.mira.gov.mv/Legislations/View/Goods-and-Services-Tax-Regulation-consolidated', sourceTier: 'PRIMARY', sourceReference: 'GST Regulation ss.14-16', snapshotDate: '2026-09-05', ruleVersion: 'MIRA-GST-REG-CONSOLIDATED' };

describe('finance governance metadata', () => {
  it('returns an auditable READY decision with immutable-copy provenance', () => {
    const provenance = [source];
    const result = ready(17, provenance, 'Rate verified for the supplied date');
    expect(result).toMatchObject({ status: 'READY', value: 17, provenance: [source] });
    expect(result.provenance).not.toBe(provenance);
  });
  it('returns HOLD with no usable value for unresolved rules', () => {
    expect(hold('Payment amount scope is unresolved')).toEqual({ status: 'HOLD', value: null, reason: 'Payment amount scope is unresolved', provenance: [] });
  });
  it('requires traceable source metadata', () => {
    expect(() => validateProvenance(source)).not.toThrow();
    expect(() => validateProvenance({ ...source, sourceUrl: 'local-file' })).toThrow();
    expect(() => validateProvenance({ ...source, sourceUrl: 'https://' })).toThrow();
    expect(() => validateProvenance({ ...source, sourceUrl: 'ftp://mira.gov.mv/rule' })).toThrow();
    expect(() => validateProvenance({ ...source, sourceReference: '' })).toThrow();
  });
});
