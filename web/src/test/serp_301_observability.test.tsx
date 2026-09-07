/**
 * SERP-301 — production observability, structured logging, and alerts.
 *
 * THREE ACCEPTANCE CRITERIA, THREE GROUPS BELOW.
 *
 * The most useful thing found while doing this task was not missing logging —
 * it was that the boundary ALREADY HAD a security_events table and a
 * securityEvent() helper, and the highest-signal events it can observe never
 * reached them. `csrf_mismatch` was returned from THIRTEEN places and recorded
 * from none. So were origin_denied, seat_not_granted,
 * organisation_access_denied and book_access_denied. Somebody probing the
 * boundary left no trace at all, in a system that had been built to record
 * exactly that. Built, never wired — the signature defect here.
 *
 * The last group is a RATCHET over the edge function source. Thirteen silent
 * returns became fourteen once; a helper alone will not stop the fifteenth.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { ErrorBoundary, installGlobalErrorReporting } from '../app/ErrorBoundary';
import { telemetry } from '../services/telemetry';

const EDGE = path.resolve(__dirname, '../../../supabase/functions/starq-api/index.ts');
const OBS = path.resolve(__dirname, '../../../supabase/functions/_shared/observability.ts');
const edgeSource = fs.readFileSync(EDGE, 'utf8');

function Explodes(): React.ReactElement {
  throw new TypeError('customer Ahmed Waheed owes MVR 42,000 — a message full of business data');
}

describe('SERP-301 #3 — frontend errors captured without exposing stack traces', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    telemetry.clearBuffer();
    // React logs the caught error itself; silencing keeps the run readable.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('a render error shows a calm screen instead of unmounting the tree', () => {
    render(
      <ErrorBoundary boundary="test">
        <Explodes />
      </ErrorBoundary>,
    );
    // Before this task there was NO boundary anywhere: React's default is to
    // unmount the whole tree, so this case produced a white page.
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/could not be displayed/i)).toBeTruthy();
  });

  it('the user is shown a correlation id and NOT a stack trace', () => {
    const { container } = render(
      <ErrorBoundary boundary="test">
        <Explodes />
      </ErrorBoundary>,
    );
    const text = container.textContent ?? '';

    // A stack trace in a support screenshot leaks file paths, route names and
    // sometimes the values that were in scope.
    expect(text).not.toMatch(/\bat\s+\w+\s+\(/);
    expect(text).not.toMatch(/\.tsx?:\d+/);
    // ...and the thrown message itself, which here carries a customer name and
    // an amount, must not reach the screen either.
    expect(text).not.toMatch(/Ahmed Waheed/);
    expect(text).not.toMatch(/42,000/);

    const buffered = telemetry.getBufferedEvents();
    const id = buffered[0]?.properties?.correlation_id;
    expect(id, 'the report must carry an id').toBeTruthy();
    expect(text, 'and the user must be shown the same id').toContain(String(id));
  });

  it('the report carries the error KIND and never its message', () => {
    render(
      <ErrorBoundary boundary="test">
        <Explodes />
      </ErrorBoundary>,
    );
    const [event] = telemetry.getBufferedEvents();
    expect(event.event).toBe('error_occurred');
    expect(event.properties?.error_kind).toBe('TypeError');
    // A thrown message routinely interpolates whatever was being processed.
    for (const value of Object.values(event.properties ?? {})) {
      expect(String(value)).not.toMatch(/Ahmed Waheed|42,000/);
    }
  });

  it('the report survives telemetry’s own redaction rules', () => {
    // telemetry.track REFUSES a property key containing 'name' or 'stack'. A
    // report that is silently refused is no report at all, so this asserts the
    // event actually made it into the buffer rather than being rejected.
    render(
      <ErrorBoundary boundary="test">
        <Explodes />
      </ErrorBoundary>,
    );
    expect(telemetry.getBufferedEvents()).toHaveLength(1);
  });

  it('errors outside the render cycle are reported too', () => {
    // A boundary alone leaves the largest category of production errors —
    // handlers, timers, unawaited promises — completely unobserved.
    const teardown = installGlobalErrorReporting(window);
    window.dispatchEvent(
      new ErrorEvent('error', { error: new RangeError('boom'), message: 'boom' }),
    );
    teardown();

    const events = telemetry.getBufferedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].properties?.error_kind).toBe('RangeError');
    expect(events[0].properties?.boundary).toBe('window.onerror');
  });

  it('teardown removes the listeners rather than leaking them', () => {
    const teardown = installGlobalErrorReporting(window);
    teardown();
    // NO `error` PAYLOAD, deliberately. Dispatching an ErrorEvent that carries a
    // real Error makes jsdom rethrow it as an uncaught exception once no
    // listener remains to consume it — which is the correct behaviour, and it
    // turned this assertion into a CI failure while the assertion itself passed:
    // vitest reported `419 passed | 1 error` and exited 1. A test that proves
    // its point and reddens the build has not proved its point.
    //
    // The assertion is unweakened. If the listener were still attached it would
    // report `error_kind: 'Error'` via the ?? fallback in installGlobalErrorReporting
    // and this buffer would not be empty.
    window.dispatchEvent(new ErrorEvent('error', { message: 'after teardown' }));
    expect(telemetry.getBufferedEvents()).toHaveLength(0);
  });
});

describe('SERP-301 #1 — the edge function emits structured, correlated logs', () => {
  it('every response is logged, by wrapping rather than by threading', () => {
    // The handler has some sixty return sites. Adding a log call to each is
    // sixty chances to miss one, and the one missed is always the failure path
    // nobody exercised.
    expect(edgeSource).toMatch(/async function handleRequest\(/);
    expect(edgeSource).toMatch(/logRequest\(\{/);
    expect(edgeSource, 'latency must be measured across the whole request')
      .toMatch(/latency_ms:\s*Date\.now\(\) - startedAt/);
  });

  it('the log line carries request_id, person_uuid and latency', () => {
    for (const field of ['request_id:', 'person_uuid:', 'latency_ms:']) {
      expect(edgeSource, `${field} is required by the acceptance criterion`).toContain(field);
    }
  });

  it('the request id reaches the security_events row, so the two can be joined', () => {
    // A request_id was minted per request and returned to callers in error
    // bodies, but never passed to securityEvent(). The operator had rows with no
    // request id and the user had an id with no row: a correlation id that
    // correlates nothing invites a support process that cannot work.
    expect(edgeSource).toMatch(/metadata:\s*requestId\s*\?/);
  });

  it('a throw outside the handler’s own try is still observed', () => {
    // Previously that produced a bare 500 with no record anywhere.
    expect(edgeSource).toMatch(/outcome:\s*"unhandled_exception"/);
  });
});

describe('SERP-301 #2 — security violations are recorded, not silently refused', () => {
  const SECURITY_CODES = [
    'csrf_mismatch',
    'origin_denied',
    'seat_not_granted',
    'organisation_access_denied',
    'book_access_denied',
    'platform_admin_required',
    'platform_entitlement_required',
    'invitation_admin_required',
  ];

  it('no security-relevant refusal returns without being recorded', () => {
    // THE RATCHET. Thirteen silent `csrf_mismatch` returns became fourteen once;
    // a helper alone will not stop the fifteenth. Any `json(4xx, ... error:
    // "<security code>")` that is not routed through deny() fails this.
    const offenders: string[] = [];
    for (const m of edgeSource.matchAll(/json\((4\d\d),\s*\{\s*ok:\s*false,\s*error:\s*"([a-z_]+)"/g)) {
      if (SECURITY_CODES.includes(m[2])) offenders.push(m[2]);
    }
    expect(
      offenders,
      'These refusals return directly instead of going through deny(), so nothing is recorded. ' +
        'An attacker probing the boundary would leave no trace.',
    ).toEqual([]);
  });

  it('deny() records the event AND sets the outcome for the log line', () => {
    const deny = /const deny = async \([\s\S]*?\n  \};/.exec(edgeSource)?.[0] ?? '';
    expect(deny, 'deny() must exist').not.toBe('');
    expect(deny).toMatch(/observed\.outcome = code/);
    expect(deny).toMatch(/await securityEvent\(/);
    expect(deny, 'the row must carry the request id').toMatch(/requestId\)/);
  });

  it('every one of the eight security codes is actually reached through deny()', () => {
    // A positive assertion. The prohibition above would also pass if somebody
    // deleted the checks entirely.
    for (const code of SECURITY_CODES) {
      expect(edgeSource, `${code} must be refused through deny()`)
        .toContain(`deny(`);
      expect(
        new RegExp(`deny\\(\\d{3}, "${code}"`).test(edgeSource),
        `${code} is no longer refused through deny()`,
      ).toBe(true);
    }
  });

  it('security outcomes are classified for alerting, separately from ordinary 400s', () => {
    const obs = fs.readFileSync(OBS, 'utf8');
    // A 400 for a malformed email is noise. A rejected CSRF token is somebody
    // running a stale tab or probing the boundary. Recording every malformed
    // field at the same severity buries the signal.
    for (const code of SECURITY_CODES) {
      expect(obs, `${code} must be classified as a security outcome`).toContain(`'${code}'`);
    }
    expect(obs).toMatch(/severity === 'security'/);
  });
});

describe('SERP-301 — a log line must not become an incident of its own', () => {
  it('the redactor removes credential-shaped keys and values', async () => {
    const { redactDetail } = await import(
      /* @vite-ignore */ '../../../supabase/functions/_shared/observability.ts'
    );
    const out = redactDetail({
      seat: 'ledger_poster',
      csrf_token: 'abc123',
      contact_email: 'someone@example.com',
      bearer: 'eyJhbGciOiJIUzI1NiJ9.payload',
      count: 3,
    });
    expect(out.seat).toBe('ledger_poster');
    expect(out.count).toBe(3);
    expect(out.csrf_token).toBe('[redacted:key]');
    expect(out.contact_email).toBe('[redacted:key]');
    expect(out.bearer).toBe('[redacted:value]');
  });

  it('an unserialisable field does not cost us the response', async () => {
    const { logRequest } = await import(
      /* @vite-ignore */ '../../../supabase/functions/_shared/observability.ts'
    );
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    // Observability failing must not take down the request it was observing.
    // That turns a logging bug into an outage.
    expect(() =>
      logRequest({
        request_id: 'r', person_uuid: null, method: 'POST', path: '/x', status: 200,
        outcome: 'ok', latency_ms: 1, severity: 'info',
        detail: circular as Record<string, string>,
      }),
    ).not.toThrow();
  });
});
