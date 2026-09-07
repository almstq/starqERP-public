import { describe, it, expect, beforeEach } from 'vitest';
import { telemetry, anonymizeTenantId, PERMITTED_ANALYTICS_EVENTS } from '../services/telemetry';

describe('SERP-280: Privacy-Preserving Product Analytics (Nothing Sensitive)', () => {
  beforeEach(() => {
    telemetry.clearBuffer();
    telemetry.setTenantId('20000000-0000-4000-8000-000000000001');
  });

  it('anonymizes tenant ID at source with anon_ prefix and deterministic hash', () => {
    const rawTenantId = '20000000-0000-4000-8000-000000000001';
    const anon = anonymizeTenantId(rawTenantId);

    expect(anon.startsWith('anon_tenant_')).toBe(true);
    expect(anon).not.toContain(rawTenantId);
    // Deterministic consistency
    expect(anonymizeTenantId(rawTenantId)).toBe(anon);
  });

  it('accepts permitted operational events with count and timing properties', () => {
    const res1 = telemetry.track('screen_viewed', { route: '/jobs' });
    expect(res1.ok).toBe(true);

    const res2 = telemetry.track('document_created_count', { documentType: 'job', count: 1 });
    expect(res2.ok).toBe(true);

    const res3 = telemetry.track('search_executed', { resultCount: 4, durationMs: 25 });
    expect(res3.ok).toBe(true);

    const buffered = telemetry.getBufferedEvents();
    expect(buffered.length).toBe(3);
    expect(buffered[0].event).toBe('screen_viewed');
    expect(buffered[0].anonymizedTenantId.startsWith('anon_tenant_')).toBe(true);
    expect(buffered[1].properties?.count).toBe(1);
  });

  it('refuses unpermitted arbitrary event names (fails closed)', () => {
    // @ts-expect-error test unpermitted event name
    const res = telemetry.track('customer_invoiced_full_data', { count: 1 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('unpermitted_event');
    expect(telemetry.getBufferedEvents().length).toBe(0);
  });

  it('strictly rejects any payload carrying known customer or financial sensitive keys', () => {
    // Attempt 1: customer_name leakage
    const res1 = telemetry.track('document_created_count', {
      documentType: 'job',
      customer_name: 'Ahmed Waheed',
    });
    expect(res1.ok).toBe(false);
    expect(res1.error).toContain('disallowed_sensitive_key: customer_name');

    // Attempt 2: financial amount leakage
    const res2 = telemetry.track('document_created_count', {
      documentType: 'invoice',
      amount: 14500,
    });
    expect(res2.ok).toBe(false);
    expect(res2.error).toContain('disallowed_sensitive_key: amount');

    // Attempt 3: phone number leakage
    const res3 = telemetry.track('error_occurred', {
      errorCode: 'API_ERROR',
      phone: '+960 778-9900',
    });
    expect(res3.ok).toBe(false);
    expect(res3.error).toContain('disallowed_sensitive_key: phone');

    // Attempt 4: AI prompt leakage
    const res4 = telemetry.track('error_occurred', {
      errorCode: 'AI_TIMEOUT',
      prompt: 'Summarize financial statements for VIP client',
    });
    expect(res4.ok).toBe(false);
    expect(res4.error).toContain('disallowed_sensitive_key: prompt');

    // Zero rejected events enter the sink buffer
    expect(telemetry.getBufferedEvents().length).toBe(0);
  });

  it('detects and rejects sensitive patterns in property values (email, phone, currency)', () => {
    const res1 = telemetry.track('error_occurred', {
      module: 'user_failed_auth_test@example.com',
    });
    expect(res1.ok).toBe(false);
    expect(res1.error).toContain('sensitive_pattern_in_value: module');

    const res2 = telemetry.track('error_occurred', {
      module: 'Call failed to +960 779-1122',
    });
    expect(res2.ok).toBe(false);
    expect(res2.error).toContain('sensitive_pattern_in_value: module');
  });

  it('rejects excessive free-text strings > 64 chars', () => {
    const res = telemetry.track('error_occurred', {
      module: 'A'.repeat(70),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('excessive_string_length: module');
  });
});
