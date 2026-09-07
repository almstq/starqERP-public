/**
 * Privacy-Preserving Product Analytics Client (SERP-280 / DEC-073)
 *
 * Invariant: Instrument the product, never the client's business.
 * Default to event names, counts and timings. No business payloads,
 * no customer names/phones, no financial numbers, no free-text.
 */

export const PERMITTED_ANALYTICS_EVENTS = [
  'screen_viewed',
  'modal_opened',
  'tab_switched',
  'theme_toggled',
  'workflow_step_advanced',
  'document_created_count',
  'search_executed',
  'error_occurred',
  'mfa_challenge_prompted',
  'mfa_challenge_completed',
] as const;

export type PermittedAnalyticsEvent = (typeof PERMITTED_ANALYTICS_EVENTS)[number];

export const DISALLOWED_SENSITIVE_KEYS = [
  'customer_name',
  'name',
  'customer',
  'email',
  'phone',
  'plate_number',
  'plateNumber',
  'vehicle_reg',
  'vehicleReg',
  'tin',
  'tinNumber',
  'bml_account',
  'bmlAccount',
  'mibAccount',
  'account_number',
  'amount',
  'subtotal',
  'total',
  'price',
  'unitPrice',
  'prompt',
  'search_query',
  'query',
  'notes',
  'details',
  'description',
  'address',
  'password',
  'secret',
  'token',
  'csrf',
  'recoveryCodes',
  'rawError',
  'stack',
  'payload',
] as const;

export interface TelemetryEvent {
  event: PermittedAnalyticsEvent;
  anonymizedTenantId: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: string;
}

export function anonymizeTenantId(tenantId: string, salt = 'starq_telemetry_salt_v1'): string {
  if (!tenantId) return 'anon_tenant_unknown';
  let hash = 0;
  const input = `${tenantId}:${salt}`;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `anon_tenant_${hex}`;
}

class TelemetryService {
  private buffer: TelemetryEvent[] = [];
  private currentTenantId: string = 'tenant-1';

  public setTenantId(tenantId: string) {
    this.currentTenantId = tenantId;
  }

  public track(
    event: PermittedAnalyticsEvent,
    properties: Record<string, string | number | boolean> = {}
  ): { ok: boolean; error?: string } {
    // 1. Assert permitted event name
    if (!PERMITTED_ANALYTICS_EVENTS.includes(event)) {
      console.warn(`[Telemetry Refused] Unpermitted event: ${event}`);
      return { ok: false, error: `unpermitted_event: ${event}` };
    }

    // 2. Assert zero sensitive keys or free text patterns in properties
    for (const key of Object.keys(properties)) {
      const lowerKey = key.toLowerCase();
      if (
        DISALLOWED_SENSITIVE_KEYS.some(
          (bad) => lowerKey === bad.toLowerCase() || lowerKey.includes(bad.toLowerCase())
        )
      ) {
        console.warn(`[Telemetry Refused] Disallowed sensitive key: ${key}`);
        return { ok: false, error: `disallowed_sensitive_key: ${key}` };
      }

      const val = properties[key];
      if (typeof val === 'string') {
        if (val.length > 64) {
          console.warn(`[Telemetry Refused] Excessive string length in key: ${key}`);
          return { ok: false, error: `excessive_string_length: ${key}` };
        }
        if (/@/.test(val) || /\+960\s?\d{3}/.test(val) || /MVR|\$|Rf\s?\d+/.test(val)) {
          console.warn(`[Telemetry Refused] Sensitive pattern in property value: ${key}`);
          return { ok: false, error: `sensitive_pattern_in_value: ${key}` };
        }
      }
    }

    // 3. Mask tenant at source
    const anonTenant = anonymizeTenantId(this.currentTenantId);

    const record: TelemetryEvent = {
      event,
      anonymizedTenantId: anonTenant,
      properties,
      timestamp: new Date().toISOString(),
    };

    this.buffer.push(record);
    return { ok: true };
  }

  public getBufferedEvents(): readonly TelemetryEvent[] {
    return [...this.buffer];
  }

  public clearBuffer(): void {
    this.buffer = [];
  }
}

export const telemetry = new TelemetryService();
