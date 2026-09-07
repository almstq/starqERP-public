import { describe, it, expect } from 'vitest';
import {
  evaluateRoleVisibility,
  evaluateSodPolicy,
  ScmStep,
} from '../../../contracts/commands';

describe('SERP-030: Role, Seat & SoD Policy Engine', () => {
  const ORG = '20000000-0000-4000-8000-000000000001';
  const PERSON_A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const PERSON_B = 'bbbbbbbb-0000-4000-8000-000000000002';

  it('distinguishes role visibility (what you SEE) per role', () => {
    const admin = evaluateRoleVisibility('administrator');
    expect(admin.canViewReports).toBe(true);
    expect(admin.canViewAuditLogs).toBe(true);

    const counter = evaluateRoleVisibility('counter');
    expect(counter.canViewReports).toBe(false);
    expect(counter.canViewAuditLogs).toBe(false);
    expect(counter.canViewCommercialDocuments).toBe(true);

    const tech = evaluateRoleVisibility('technician');
    expect(tech.canViewCommercialDocuments).toBe(false);
    expect(tech.canViewInventoryStock).toBe(true);
  });

  it('permits clean segregated execution when different actors perform pair steps', () => {
    const history = [{ step: 'quote' as ScmStep, personId: PERSON_A }];
    const res = evaluateSodPolicy({
      organisationId: ORG,
      actorPersonId: PERSON_B,
      actingSeat: 'financial_controller',
      targetStep: 'award',
      history,
      capacity: 'segregated',
    });

    expect(res.allowed).toBe(true);
    expect(res.action).toBe('allow');
    expect(res.auditRecord?.disposition).toBe('allowed_cleanly');
  });

  it('compensates in solo capacity with recorded exception evidence', () => {
    const history = [{ step: 'quote' as ScmStep, personId: PERSON_A }];
    const res = evaluateSodPolicy({
      organisationId: ORG,
      actorPersonId: PERSON_A,
      actingSeat: 'financial_controller',
      targetStep: 'award',
      history,
      capacity: 'solo',
    });

    expect(res.allowed).toBe(true);
    expect(res.action).toBe('record_exception');
    expect(res.auditRecord?.disposition).toBe('exception_recorded');
  });

  it('blocks SoD conflict in segregated capacity when no override exists', () => {
    const history = [{ step: 'quote' as ScmStep, personId: PERSON_A }];
    const res = evaluateSodPolicy({
      organisationId: ORG,
      actorPersonId: PERSON_A,
      actingSeat: 'financial_controller',
      targetStep: 'award',
      history,
      capacity: 'segregated',
    });

    expect(res.allowed).toBe(false);
    expect(res.action).toBe('block');
    expect(res.auditRecord?.disposition).toBe('blocked_sod_violation');
  });

  it('honors valid temporary override and rejects expired override', () => {
    const history = [{ step: 'quote' as ScmStep, personId: PERSON_A }];

    const validOverride = evaluateSodPolicy({
      organisationId: ORG,
      actorPersonId: PERSON_A,
      actingSeat: 'financial_controller',
      targetStep: 'award',
      history,
      capacity: 'segregated',
      override: {
        overrideId: 'ovr-100',
        approvedByPersonId: PERSON_B,
        reason: 'Authorized emergency procurement for vehicle breakdown',
        grantedAt: '2026-08-26T08:00:00Z',
        expiresAt: '2026-08-26T20:00:00Z',
      },
      nowIso: '2026-08-26T10:00:00Z',
    });
    expect(validOverride.allowed).toBe(true);
    expect(validOverride.action).toBe('record_exception');

    const expiredOverride = evaluateSodPolicy({
      organisationId: ORG,
      actorPersonId: PERSON_A,
      actingSeat: 'financial_controller',
      targetStep: 'award',
      history,
      capacity: 'segregated',
      override: {
        overrideId: 'ovr-100',
        approvedByPersonId: PERSON_B,
        reason: 'Authorized emergency procurement for vehicle breakdown',
        grantedAt: '2026-08-26T08:00:00Z',
        expiresAt: '2026-08-26T09:00:00Z',
      },
      nowIso: '2026-08-26T10:00:00Z',
    });
    expect(expiredOverride.allowed).toBe(false);
    expect(expiredOverride.error).toBe('sod_override_expired');
  });
});
