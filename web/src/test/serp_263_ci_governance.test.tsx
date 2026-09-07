import { describe, it, expect } from 'vitest';
import {
  CI_MANDATORY_GATES,
  validateCiGateRegistry,
} from '../../../contracts/commands';

describe('SERP-263: Remote Git and CI Control Plane Governance', () => {
  it('verifies CI_MANDATORY_GATES registers all required governance, secret, migration, and build gates', () => {
    const res = validateCiGateRegistry(CI_MANDATORY_GATES);
    expect(res.valid).toBe(true);
    expect(res.missingMandatoryGates.length).toBe(0);

    const gateNames = CI_MANDATORY_GATES.map((g) => g.name);
    expect(gateNames).toContain('Secret & Credential Sweep');
    expect(gateNames).toContain('Migration Lineage & Compatibility Linter');
    expect(gateNames).toContain('Migration 0021 Synthetic UUID Rehearsal');
    expect(gateNames).toContain('Tenant Hardcoding Sweep');
    expect(gateNames).toContain('Deno Contract Test Suite');
    expect(gateNames).toContain('Web Vitest Suite');
    expect(gateNames).toContain('Web Production Build');
  });

  it('fails closed when mandatory merge-blocking gates are missing', () => {
    const invalidRegistry = [
      {
        name: 'Web Production Build',
        command: 'npm run build',
        isMandatory: false,
        failureImpact: 'WARN_ONLY' as const,
      },
    ];

    const res = validateCiGateRegistry(invalidRegistry);
    expect(res.valid).toBe(false);
    expect(res.missingMandatoryGates.length).toBeGreaterThan(0);
  });
});
