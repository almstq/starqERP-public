/**
 * SERP-301 — structured observability for the API boundary.
 *
 * WHAT WAS THERE. Nothing. `starq-api/index.ts` is 1,385 lines and contains
 * ZERO console output. A request left no trace in the Supabase log stream at
 * all. The only record of anything was `public.security_events`, which is a
 * good table — but reaching it requires the database to be up and someone to
 * write SQL, which is precisely the situation you are not in at the moment you
 * need it.
 *
 * AND THE PART THAT MATTERS MORE. A `request_id` was minted per request and
 * returned to the caller in error bodies, but was NEVER passed to
 * securityEvent(). So the operator had rows with no request id, the user had a
 * request id with no row, and the two could not be joined. A correlation id
 * that correlates nothing is worse than none, because it invites a support
 * process that cannot work.
 *
 * THE RULE HERE, AND IT IS THE SAME ONE AS THE TELEMETRY CLIENT: instrument the
 * boundary, never the client's business. Event names, codes, counts and
 * timings. No tokens, no cookies, no CSRF values, no business payloads, no
 * customer data. A log line that leaks a session token has turned observability
 * into an incident.
 */

/** Severity drives alerting. `security` is the one a human is woken for. */
export type LogSeverity = 'info' | 'warn' | 'error' | 'security';

export interface RequestLogFields {
  request_id: string;
  /** The stable person UUID, never an email or a name. Null when anonymous. */
  person_uuid: string | null;
  organisation_id?: string | null;
  method: string;
  path: string;
  status: number;
  /** Machine code — 'csrf_mismatch', 'origin_denied'. Never a message. */
  outcome: string;
  latency_ms: number;
  severity: LogSeverity;
  /** Bounded, non-sensitive extras. Every value is checked before it is emitted. */
  detail?: Record<string, string | number | boolean | null>;
}

/**
 * Outcomes that are a SECURITY event rather than an ordinary refusal.
 *
 * A 400 for a malformed email is noise. A rejected CSRF token is somebody
 * either running a stale tab or probing the boundary, and until this task none
 * of the thirteen places that returned `csrf_mismatch` recorded anything at all
 * — the highest-signal event the system can observe, discarded at the point of
 * observation.
 */
export const SECURITY_OUTCOMES = new Set([
  'origin_denied',
  'csrf_mismatch',
  'audience_mismatch',
  'unauthenticated',
  'seat_not_granted',
  'organisation_access_denied',
  'book_access_denied',
  'platform_admin_required',
  'platform_entitlement_required',
  'invitation_admin_required',
  'rate_limited',
  'identity_binding_conflict',
  'not_allowlisted',
]);

export function severityFor(outcome: string, status: number): LogSeverity {
  if (SECURITY_OUTCOMES.has(outcome)) return 'security';
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

/**
 * Keys and value shapes that must never appear in a log line.
 *
 * Mirrors the client telemetry invariant deliberately. Two surfaces, one rule —
 * a redaction list that exists on only one of them is a list that will diverge.
 */
const FORBIDDEN_KEY_FRAGMENTS = [
  'token', 'cookie', 'csrf', 'secret', 'password', 'credential', 'authorization',
  'email', 'phone', 'name', 'address', 'tin', 'account_number', 'amount',
  'total', 'price', 'notes', 'description', 'payload', 'stack', 'query',
];

/** A value that looks like a JWT, a bearer token, or an email address. */
const SENSITIVE_VALUE = /(^ey[A-Za-z0-9_-]{10,}\.)|(\bBearer\s)|(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

export function redactDetail(
  detail: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!detail) return out;

  for (const [key, value] of Object.entries(detail)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_KEY_FRAGMENTS.some((bad) => lower.includes(bad))) {
      out[key] = '[redacted:key]';
      continue;
    }
    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    const text = String(value);
    if (SENSITIVE_VALUE.test(text)) {
      out[key] = '[redacted:value]';
      continue;
    }
    // Bounded, because an arbitrary driver message can be long and can carry
    // schema detail. The security_events table is the place for that; a log
    // line that anything can tail is not.
    out[key] = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  }
  return out;
}

/**
 * Emit one line of JSON to stdout. One line, because log aggregators split on
 * newlines and a pretty-printed object becomes a dozen unparseable fragments.
 *
 * Never throws. Observability failing must not take down the request it was
 * observing — that turns a logging bug into an outage, which is the most
 * embarrassing possible way to lose availability.
 */
export function logRequest(fields: RequestLogFields): void {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      service: 'starq-api',
      ...fields,
      detail: redactDetail(fields.detail),
    });
    if (fields.severity === 'security' || fields.severity === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  } catch {
    // A field that will not serialise must not cost us the response.
  }
}
