import { describe, it, expect } from 'vitest';
import {
  evaluateRateLimit,
  sanitizeLogMetadata,
  evaluateSystemAlertSignals,
} from '../../../contracts/commands';

describe('SERP-036: Observability, Rate-Limiting & Alerting Baseline', () => {
  const ORG = '20000000-0000-4000-8000-000000000001';

  it('enforces sliding window rate limit and fails closed when threshold exceeded', () => {
    const store = new Map<string, number[]>();
    const clientKey = 'client_10.0.0.1';
    const now = 5000000;

    const r1 = evaluateRateLimit({ key: clientKey, maxRequests: 2, windowMs: 10000, store, nowMs: now });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = evaluateRateLimit({ key: clientKey, maxRequests: 2, windowMs: 10000, store, nowMs: now + 100 });
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = evaluateRateLimit({ key: clientKey, maxRequests: 2, windowMs: 10000, store, nowMs: now + 200 });
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('scrubs sensitive credentials, tokens, customer phone and bank accounts from logs', () => {
    const payload = {
      endpoint: '/api/v1/auth/signin',
      token: 'jwt.token.string',
      password: 'MyPassword',
      customer_phone: '7779999',
      bml_account: '7730000998811',
      details: {
        nested_secret: 'secret123',
        safe_info: 'OK',
      },
    };

    const sanitized = sanitizeLogMetadata(payload);
    expect(sanitized.token).toBe('[REDACTED_SENSITIVE_PAYLOAD]');
    expect(sanitized.password).toBe('[REDACTED_SENSITIVE_PAYLOAD]');
    expect(sanitized.customer_phone).toBe('[REDACTED_SENSITIVE_PAYLOAD]');
    expect(sanitized.bml_account).toBe('[REDACTED_SENSITIVE_PAYLOAD]');
    expect((sanitized.details as any).nested_secret).toBe('[REDACTED_SENSITIVE_PAYLOAD]');
    expect((sanitized.details as any).safe_info).toBe('OK');
  });

  it('triggers structured anomaly alerts when metrics exceed thresholds', () => {
    const alerts = evaluateSystemAlertSignals({
      tenantId: ORG,
      failedAuthAttemptsInWindow: 8,
      crossTenantAttemptsInWindow: 2,
      outboxDeadLetterCount: 1,
      sodOverridesInWindow: 0,
    });

    expect(alerts.length).toBe(3);
    const severities = alerts.map((a) => a.severity);
    expect(severities).toContain('SEV1_CRITICAL'); // Cross tenant
    expect(severities).toContain('SEV2_HIGH');     // Brute force & dead letter
  });
});
