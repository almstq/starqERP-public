-- =============================================================================
-- SERP-356 — payment failure modes
--
-- The isolation matrix is done: 29/29 in serp_300_adversarial_isolation_probe.sql
-- proves tenant A cannot reach tenant B's payment rows. THIS PROBE ASKS A
-- DIFFERENT QUESTION: what happens when the PROVIDER misbehaves.
--
-- That is where payment systems actually lose money. A webhook delivered twice,
-- a settlement batch posted twice, a refund larger than the capture, a status
-- recorded without the timestamp that makes it findable — none of these need an
-- attacker. They happen on an ordinary Tuesday when a provider retries.
--
-- Migrations 0031-0034 declare constraints for several of these. DECLARED IS NOT
-- ENFORCED until something has tried to break them, which is the lesson of the
-- 55 RLS policies with zero tests. This probe tries.
--
--   psql -h localhost -p 55432 -U postgres -d <db> -f tests/serp_356_payment_failure_modes_probe.sql
--
-- A case PASSES when the database REFUSES the bad write. Everything runs inside
-- one transaction that is ROLLED BACK; the probe writes nothing.
--
-- TWO IMPLEMENTATION NOTES, both learned by getting them wrong first:
--   * psql does NOT interpolate :'VAR' inside a dollar-quoted do $$ block, so
--     every id here is a literal or a plpgsql constant.
--   * Statement-level rollback uses NESTED begin/exception, never savepoints.
--     "rollback to savepoint" also discards the result row just written, which
--     is why an earlier draft returned an empty table and looked like a pass.
-- =============================================================================

\set ON_ERROR_STOP off

begin;

create temporary table serp356_results (
  scenario text, expected text, actual text, passed boolean
) on commit drop;

-- ── Fixtures, all of them, before any assertion ─────────────────────────────
-- payment_providers.id is a CLOSED SET — MOCK, BML, MIB — which is a good
-- constraint, so the probe uses the real providers rather than inventing one.
insert into public.persons (id, person_key, display_label)
values ('35600000-0000-4000-8000-0000000000ff', 'serp356-probe', 'SERP-356 Probe Actor')
on conflict (id) do nothing;

insert into public.payment_providers (id, display_name, spec_status)
values ('MOCK', 'Mock Provider', 'IMPLEMENTED'), ('BML', 'Bank of Maldives', 'BANK_SPEC_REQUIRED')
on conflict (id) do nothing;

insert into public.payment_intents
  (id, organisation_id, provider_id, status, amount, currency, created_by)
values
  ('35600000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'MOCK', 'succeeded', 100000, 'MVR', '35600000-0000-4000-8000-0000000000ff');

insert into public.payment_attempts
  (id, organisation_id, intent_id, provider_id, status, amount, currency, provider_reference)
values
  ('35600000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '35600000-0000-4000-8000-000000000001', 'MOCK', 'succeeded', 100000, 'MVR', 'SERP356-CAPTURE-1');

-- the event a retrying provider will deliver again
insert into public.provider_events
  (id, provider_id, provider_event_id, organisation_id, signature_verified, raw_payload)
values
  ('35600000-0000-4000-8000-000000000010', 'MOCK', 'EVT-DUPLICATE-1',
   '10000000-0000-4000-8000-000000000001', true, '{"type":"payment.succeeded"}');

-- the settlement batch that will be posted twice
insert into public.payment_settlements
  (id, organisation_id, provider_id, batch_reference, gross_amount, fee_amount, net_amount, currency, settled_at)
values
  ('35600000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000001',
   'MOCK', 'BATCH-1', 100000, 500, 99500, 'MVR', now());

-- ── Assertions ──────────────────────────────────────────────────────────────
do $$
declare
  org constant uuid := '10000000-0000-4000-8000-000000000001';
  who constant uuid := '35600000-0000-4000-8000-0000000000ff';
  pint constant uuid := '35600000-0000-4000-8000-000000000001';
begin

  -- 1. DUPLICATE WEBHOOK DELIVERY. The commonest provider behaviour there is:
  --    every gateway retries on a missing or slow acknowledgement. Deduplication
  --    must be a CONSTRAINT, not application logic a new code path can skip.
  begin
    insert into public.provider_events (id, provider_id, provider_event_id, organisation_id, signature_verified, raw_payload)
    values ('35600000-0000-4000-8000-000000000011', 'MOCK', 'EVT-DUPLICATE-1', org, true, '{}');
    insert into serp356_results values ('duplicate_webhook_delivery', 'rejected by unique constraint', 'ACCEPTED — the event was stored twice', false);
  exception when unique_violation then
    insert into serp356_results values ('duplicate_webhook_delivery', 'rejected by unique constraint', 'rejected by unique constraint', true);
  end;

  -- ...but the same event id from a DIFFERENT provider must still be accepted.
  -- Providers do not share an id space, and over-tight deduplication silently
  -- drops real events, which is the more expensive failure.
  begin
    insert into public.provider_events (id, provider_id, provider_event_id, organisation_id, signature_verified, raw_payload)
    values ('35600000-0000-4000-8000-000000000012', 'BML', 'EVT-DUPLICATE-1', org, true, '{}');
    insert into serp356_results values ('same_event_id_different_provider', 'accepted — ids are per provider', 'accepted', true);
  exception when others then
    insert into serp356_results values ('same_event_id_different_provider', 'accepted — ids are per provider', 'REJECTED — deduplication is too broad: ' || sqlstate, false);
  end;

  -- 2. DOUBLE SETTLEMENT. A batch posted twice pays the merchant twice on paper
  --    and breaks the bank reconciliation days later.
  begin
    insert into public.payment_settlements (id, organisation_id, provider_id, batch_reference, gross_amount, fee_amount, net_amount, currency, settled_at)
    values ('35600000-0000-4000-8000-000000000021', org, 'MOCK', 'BATCH-1', 100000, 500, 99500, 'MVR', now());
    insert into serp356_results values ('double_settlement_batch', 'rejected by unique constraint', 'ACCEPTED — the batch settled twice', false);
  exception when unique_violation then
    insert into serp356_results values ('double_settlement_batch', 'rejected by unique constraint', 'rejected by unique constraint', true);
  end;

  -- 3. SETTLEMENT ARITHMETIC. gross - fee = net, and a fee cannot be negative.
  begin
    insert into public.payment_settlements (id, organisation_id, provider_id, batch_reference, gross_amount, fee_amount, net_amount, currency, settled_at)
    values ('35600000-0000-4000-8000-000000000022', org, 'MOCK', 'BATCH-BAD', 100000, 500, 99999, 'MVR', now());
    insert into serp356_results values ('settlement_must_balance', 'rejected: gross - fee <> net', 'ACCEPTED — an unbalanced settlement was stored', false);
  exception when check_violation then
    insert into serp356_results values ('settlement_must_balance', 'rejected: gross - fee <> net', 'rejected by check constraint', true);
  end;

  begin
    insert into public.payment_settlements (id, organisation_id, provider_id, batch_reference, gross_amount, fee_amount, net_amount, currency, settled_at)
    values ('35600000-0000-4000-8000-000000000023', org, 'MOCK', 'BATCH-NEG', 100000, -500, 100500, 'MVR', now());
    insert into serp356_results values ('settlement_fee_cannot_be_negative', 'rejected: fee >= 0', 'ACCEPTED — a negative fee was stored', false);
  exception when check_violation then
    insert into serp356_results values ('settlement_fee_cannot_be_negative', 'rejected: fee >= 0', 'rejected by check constraint', true);
  end;

  -- 4. STATUS AND TIMESTAMP TRAVEL TOGETHER. An attempt marked 'uncertain'
  --    without uncertain_since is INVISIBLE to the reconciliation sweep — the
  --    money sits in limbo and nothing will ever look for it.
  begin
    insert into public.payment_attempts (id, organisation_id, intent_id, provider_id, status, amount, currency, provider_reference)
    values ('35600000-0000-4000-8000-000000000030', org, pint, 'MOCK', 'uncertain', 100000, 'MVR', 'SERP356-LIMBO');
    insert into serp356_results values ('uncertain_attempt_needs_timestamp', 'rejected: uncertain without uncertain_since', 'ACCEPTED — an attempt is in limbo and the sweep cannot see it', false);
  exception when check_violation then
    insert into serp356_results values ('uncertain_attempt_needs_timestamp', 'rejected: uncertain without uncertain_since', 'rejected by check constraint', true);
  end;

  begin
    insert into public.provider_events (id, provider_id, provider_event_id, organisation_id, signature_verified, raw_payload, processing_state)
    values ('35600000-0000-4000-8000-000000000031', 'MOCK', 'EVT-CONSUMED-NO-TS', org, true, '{}', 'consumed');
    insert into serp356_results values ('consumed_event_needs_timestamp', 'rejected: consumed without consumed_at', 'ACCEPTED — an event claims consumption with no record of when', false);
  exception when check_violation then
    insert into serp356_results values ('consumed_event_needs_timestamp', 'rejected: consumed without consumed_at', 'rejected by check constraint', true);
  end;

  begin
    insert into public.provider_events (id, provider_id, provider_event_id, organisation_id, signature_verified, raw_payload, processing_state)
    values ('35600000-0000-4000-8000-000000000032', 'MOCK', 'EVT-REJECTED-NO-REASON', org, true, '{}', 'rejected');
    insert into serp356_results values ('rejected_event_needs_reason', 'rejected: rejected without rejection_reason', 'ACCEPTED — an event was rejected and nobody can say why', false);
  exception when check_violation then
    insert into serp356_results values ('rejected_event_needs_reason', 'rejected: rejected without rejection_reason', 'rejected by check constraint', true);
  end;

  -- 5. REFUNDS.
  begin
    insert into public.payment_refunds (id, organisation_id, intent_id, provider_id, status, amount, currency, reason, requested_by)
    values ('35600000-0000-4000-8000-000000000040', org, pint, 'MOCK', 'created', -5000, 'MVR', 'Negative refund probe for SERP-356', who);
    insert into serp356_results values ('refund_must_be_positive', 'rejected: amount > 0', 'ACCEPTED — a negative refund was stored', false);
  exception when check_violation then
    insert into serp356_results values ('refund_must_be_positive', 'rejected: amount > 0', 'rejected by check constraint', true);
  end;

  begin
    insert into public.payment_refunds (id, organisation_id, intent_id, provider_id, status, amount, currency, reason, requested_by)
    values ('35600000-0000-4000-8000-000000000041', org, pint, 'MOCK', 'created', 5000, 'MVR', 'short', who);
    insert into serp356_results values ('refund_reason_must_be_meaningful', 'rejected: reason under 12 characters', 'ACCEPTED — a refund was stored with an unusable reason', false);
  exception when check_violation then
    insert into serp356_results values ('refund_reason_must_be_meaningful', 'rejected: reason under 12 characters', 'rejected by check constraint', true);
  end;

  -- THE OPEN QUESTION. A refund of 500,000 against a capture of 100,000.
  -- If the schema ACCEPTS it that is not automatically a defect — over-refund
  -- may be intended to live in the command layer — but it must be a DECISION
  -- rather than an accident. Recorded either way, and never failed on.
  begin
    insert into public.payment_refunds (id, organisation_id, intent_id, provider_id, status, amount, currency, reason, requested_by)
    values ('35600000-0000-4000-8000-000000000042', org, pint, 'MOCK', 'created', 500000, 'MVR', 'Over-refund probe: five times the captured amount', who);
    insert into serp356_results values ('refund_exceeding_capture', 'FINDING, not pass/fail',
      'ACCEPTED at schema level: 500000 refunded against a 100000 capture. The schema does not bound refunds by captured amount. If that bound is intended it belongs in the command layer — SERP-354 owns it.', true);
  exception when others then
    insert into serp356_results values ('refund_exceeding_capture', 'FINDING, not pass/fail',
      'REJECTED at schema level (' || sqlstate || ') — the database bounds refunds itself.', true);
  end;

  -- 6. AN EVENT MUST BELONG TO A REAL PROVIDER. A webhook from an unknown
  --    provider is either a misconfiguration or a forgery.
  begin
    insert into public.provider_events (id, provider_id, provider_event_id, organisation_id, signature_verified, raw_payload)
    values ('35600000-0000-4000-8000-000000000050', 'NOT-A-PROVIDER', 'EVT-UNKNOWN', org, true, '{}');
    insert into serp356_results values ('event_from_unknown_provider', 'rejected', 'ACCEPTED — an event from an unregistered provider was stored', false);
  exception when foreign_key_violation or check_violation then
    insert into serp356_results values ('event_from_unknown_provider', 'rejected', 'rejected by the provider constraint', true);
  end;

end $$;

table serp356_results;

do $$
declare failures text;
begin
  select string_agg(scenario || ' => ' || actual, E'\n' order by scenario)
    into failures from serp356_results where not passed;
  if failures is not null then
    raise exception E'SERP-356 PAYMENT FAILURE MODES — UNGUARDED:\n%', failures;
  end if;
end $$;

rollback;
