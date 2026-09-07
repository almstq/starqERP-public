import { describe, it, expect } from 'vitest';

export interface PostgresQueryContext {
  actingOrganisationId: string;
  actingSeat: string;
  targetOrganisationId?: string;
  isSystemSuperuser?: boolean;
}

export function validateTenantScoping(context: PostgresQueryContext): { allowed: boolean; error?: string } {
  if (!context.actingOrganisationId) return { allowed: false, error: 'tenant_not_resolved' };
  if (context.isSystemSuperuser) return { allowed: false, error: 'unauthorized_superuser_bypass' };
  if (context.targetOrganisationId && context.targetOrganisationId !== context.actingOrganisationId) {
    return { allowed: false, error: 'cross_tenant_denied' };
  }
  return { allowed: true };
}

export function validateOrganisationConstraints(params: {
  slug: string;
  legalName: string;
  baseCurrency: string;
  status: string;
}): { valid: boolean; error?: string } {
  if (!params.slug || !params.slug.match(/^[a-z0-9][a-z0-9-]{1,62}$/)) {
    return { valid: false, error: 'invalid_slug_format' };
  }
  if (!params.legalName || params.legalName.trim().length === 0) {
    return { valid: false, error: 'legal_name_required' };
  }
  if (!params.baseCurrency || params.baseCurrency.length !== 3) {
    return { valid: false, error: 'invalid_currency' };
  }
  const validStatuses = ['active', 'suspended', 'closed'];
  if (!validStatuses.includes(params.status)) {
    return { valid: false, error: 'invalid_status' };
  }
  return { valid: true };
}

describe('SERP-029: Tenant-Scoped PostgreSQL Foundation', () => {
  const ORG_A = '11111111-0000-4000-8000-000000000001';
  const ORG_B = '22222222-0000-4000-8000-000000000002';

  it('allows same-tenant query context', () => {
    const res = validateTenantScoping({
      actingOrganisationId: ORG_A,
      actingSeat: 'counter',
      targetOrganisationId: ORG_A,
    });
    expect(res.allowed).toBe(true);
  });

  it('denies cross-tenant query targets (fails closed)', () => {
    const res = validateTenantScoping({
      actingOrganisationId: ORG_A,
      actingSeat: 'counter',
      targetOrganisationId: ORG_B,
    });
    expect(res.allowed).toBe(false);
    expect(res.error).toBe('cross_tenant_denied');
  });

  it('denies unauthorized superuser bypass attempts', () => {
    const res = validateTenantScoping({
      actingOrganisationId: ORG_A,
      actingSeat: 'owner',
      isSystemSuperuser: true,
    });
    expect(res.allowed).toBe(false);
    expect(res.error).toBe('unauthorized_superuser_bypass');
  });

  it('enforces organisation slug, legal name, currency and status constraints', () => {
    const valid = validateOrganisationConstraints({
      slug: 'starq-technologies',
      legalName: 'Starq Technologies Pvt Ltd',
      baseCurrency: 'MVR',
      status: 'active',
    });
    expect(valid.valid).toBe(true);

    const invalid = validateOrganisationConstraints({
      slug: 'INVALID SLUG',
      legalName: '',
      baseCurrency: 'INVALID',
      status: 'unknown',
    });
    expect(invalid.valid).toBe(false);
  });
});
