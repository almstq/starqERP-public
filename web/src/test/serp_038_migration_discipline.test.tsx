import { describe, it, expect } from 'vitest';
import {
  CANONICAL_MIGRATION_LINEAGE,
  validateMigrationLineage,
} from '../../../contracts/commands';

describe('SERP-038: Ordered Migration, Rollback and Compatibility Discipline', () => {
  it('validates canonical migration lineage has exactly 22 sequential entries', () => {
    expect(CANONICAL_MIGRATION_LINEAGE.length).toBe(22);
    const validation = validateMigrationLineage(CANONICAL_MIGRATION_LINEAGE);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it('verifies migration 0011 is strictly designated as REVIEWER_GATED', () => {
    const m0011 = CANONICAL_MIGRATION_LINEAGE.find((m) => m.version === '202608220011');
    expect(m0011).toBeDefined();
    expect(m0011?.status).toBe('REVIEWER_GATED');
    expect(m0011?.requiresReviewerApproval).toBe(true);
  });

  it('verifies migrations 0021 and 0022 are designated as UNAPPLIED_FORWARD_ONLY', () => {
    const m0021 = CANONICAL_MIGRATION_LINEAGE.find((m) => m.version === '202608260021');
    expect(m0021?.status).toBe('UNAPPLIED_FORWARD_ONLY');

    const m0022 = CANONICAL_MIGRATION_LINEAGE.find((m) => m.version === '202608260022');
    expect(m0022?.status).toBe('UNAPPLIED_FORWARD_ONLY');
  });

  it('fails validation on out-of-order migration entries', () => {
    const invalidLineage = [
      { version: '202608250002', filename: '202608250002_two.sql', status: 'APPLIED' as const, description: '' },
      { version: '202608250001', filename: '202608250001_one.sql', status: 'APPLIED' as const, description: '' },
    ];
    const validation = validateMigrationLineage(invalidLineage);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });
});
