import { describe, it, expect } from 'vitest';
import {
  authorizeCommand,
  validateSecureSession,
  validatePostgresTenantScoping,
  evaluateSodPolicy,
  evaluateRateLimit,
  sanitizeLogMetadata,
  CONTRACT_VERSION,
  Principal,
  ScmStep,
  SessionTokenRecord,
} from '../../../contracts/commands';

// Helper: narrow a Decision to its error code when ok === false
function decisionError(d: { ok: boolean; error?: unknown }): string {
  return d.error as string;
}

describe('SERP-033: Security Verification & Abuse-Resistance Suite', () => {
  const ORG_A = '20000000-0000-4000-8000-000000000001';
  const ORG_B = '10000000-0000-4000-8000-000000000001';
  const PERSON_1 = 'aaaaaaaa-0000-4000-8000-000000000001';

  it('VEC-1: Cross-tenant attack - denies commands targeting non-owned tenant data', () => {
    const princ: Principal = {
      personId: PERSON_1,
      organisationId: ORG_A,
      actingSeat: 'counter',
      heldSeats: ['counter'],
      seatVerifiedAt: new Date().toISOString(),
    };

    const targetContext = validatePostgresTenantScoping({
      actingOrganisationId: ORG_A,
      actingSeat: 'counter',
      targetOrganisationId: ORG_B,
    });
    expect(targetContext.allowed).toBe(false);
    expect(targetContext.error).toBe('cross_tenant_denied');

    const authCheck = authorizeCommand(
      princ,
      {
        contract: CONTRACT_VERSION,
        command: 'CALL',
        payload: {},
        csrf: 'token',
      },
      { tenantOfTarget: ORG_B }
    );
    expect(authCheck.ok).toBe(false);
    if (!authCheck.ok) {
      expect(decisionError(authCheck)).toBe('cross_tenant_denied');
    }
  });

  it('VEC-2: Unauthorized seat / privilege escalation - denies technician invoking financial actions', () => {
    const techPrinc: Principal = {
      personId: PERSON_1,
      organisationId: ORG_A,
      actingSeat: 'technician',
      heldSeats: ['technician'],
      seatVerifiedAt: new Date().toISOString(),
    };

    const decision = authorizeCommand(techPrinc, {
      contract: CONTRACT_VERSION,
      command: 'PURCHASE',
      step: 'pay' as ScmStep,
      payload: { amount: 5000 },
      csrf: 'token',
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decisionError(decision)).toBe('seat_not_authorized');
    }
  });

  it('VEC-3: Revoked seat authority - denies command even if seat is present in client cookie', () => {
    const payerPrinc: Principal = {
      personId: PERSON_1,
      organisationId: ORG_A,
      actingSeat: 'payer',
      heldSeats: ['payer'],
      seatVerifiedAt: new Date().toISOString(),
    };

    const decision = authorizeCommand(
      payerPrinc,
      {
        contract: CONTRACT_VERSION,
        command: 'PURCHASE',
        step: 'pay' as ScmStep,
        payload: { amount: 5000 },
        csrf: 'token',
      },
      { revokedSeats: ['payer'] }
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decisionError(decision)).toBe('seat_revoked');
    }
  });

  it('VEC-4: Session expiration & idle timeout - fails closed on stale sessions', () => {
    const expiredSession: SessionTokenRecord = {
      sessionId: 'ses_expired_1',
      token: 'tok_expired_1',
      userId: PERSON_1,
      tenantId: ORG_A,
      roleId: 'counter',
      seat: 'counter',
      issuedAt: 100000,
      expiresAt: 200000, // expired relative to now (300000)
      lastAccessedAt: 100000,
      isRevoked: false,
      mfaVerified: false,
    };
    const store: Record<string, SessionTokenRecord> = {
      tok_expired_1: expiredSession,
    };

    const check = validateSecureSession('tok_expired_1', store, 300000);
    expect(check.valid).toBe(false);
    expect(check.error).toBe('session_expired_absolute');
  });

  it('VEC-5: Segregation of Duties bypass - blocks same-person procurement ladder steps in segregated capacity', () => {
    const history = [{ step: 'quote' as ScmStep, personId: PERSON_1 }];

    const res = evaluateSodPolicy({
      organisationId: ORG_A,
      actorPersonId: PERSON_1,
      actingSeat: 'financial_controller',
      targetStep: 'award',
      history,
      capacity: 'segregated',
    });
    expect(res.allowed).toBe(false);
    expect(res.action).toBe('block');
  });

  it('VEC-6: Rate-limiting abuse - fails closed with retryAfterSeconds', () => {
    const store = new Map<string, number[]>();
    const key = 'attacker_ip_1.2.3.4';
    const now = 1000000;

    evaluateRateLimit({ key, maxRequests: 2, windowMs: 60000, store, nowMs: now });
    evaluateRateLimit({ key, maxRequests: 2, windowMs: 60000, store, nowMs: now + 500 });
    const blocked = evaluateRateLimit({ key, maxRequests: 2, windowMs: 60000, store, nowMs: now + 1000 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('VEC-7: Secret & PII leakage - sanitizes sensitive telemetry fields', () => {
    const payload = {
      secret_api_key: 'sk_live_12345',
      bml_account: '7730000998811',
      safe_domain: 'garage_jobs',
    };
    const sanitized = sanitizeLogMetadata(payload);
    expect(sanitized.secret_api_key).toBe('[REDACTED_SENSITIVE_PAYLOAD]');
    expect(sanitized.bml_account).toBe('[REDACTED_SENSITIVE_PAYLOAD]');
    expect(sanitized.safe_domain).toBe('garage_jobs');
  });
});
