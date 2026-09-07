import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAlertBody, explicitlyEscalatesToFounder, readRelayCursor, selectNewEvents } from '../scripts/serp-301-alert-relay.mjs';

const first = {
  id: 41,
  event_type: 'auth.session',
  outcome: 'rejected',
  request_id: '11111111-1111-4111-8111-111111111111',
  occurred_at: '2026-09-07T00:00:00.000Z',
  metadata: {},
};

test('room cursor extracts prior relay IDs and latest event time', () => {
  const room = JSON.stringify({ event: { body: '[SERP-301 SECURITY ALERT] security_event_id=40 occurred_at=2026-09-06T23:59:00.000Z' } });
  const cursor = readRelayCursor(room);
  assert.deepEqual([...cursor.seenIds], ['40']);
  assert.equal(cursor.latestOccurredAt, '2026-09-06T23:59:00.000Z');
});

test('event selection deduplicates by event ID and orders oldest first', () => {
  const selected = selectNewEvents([
    { ...first, id: 42, occurred_at: '2026-09-07T00:02:00.000Z' },
    first,
    { ...first, id: 40 },
    { ...first, id: 42 },
  ], new Set(['40']));
  assert.deepEqual(selected.map((event) => event.id), [41, 42]);
});

test('ordinary events do not infer Founder escalation', () => {
  assert.equal(explicitlyEscalatesToFounder(first), false);
  assert.equal(explicitlyEscalatesToFounder({ ...first, metadata: { severity: 'critical' } }), false);
  assert.equal(explicitlyEscalatesToFounder({ ...first, metadata: { founder_escalation: true } }), true);
});

test('alert body carries bounded identifiers and no event metadata', () => {
  const body = buildAlertBody({ ...first, metadata: { email: 'do-not-forward@example.com', founder_escalation: true } });
  assert.match(body, /security_event_id=41/);
  assert.match(body, /@claude @nexus @ali/);
  assert.doesNotMatch(body, /do-not-forward|metadata|example\.com/);
});
