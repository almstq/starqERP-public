-- Gate 2 adversarial probe. Each check asserts that the DATABASE refuses
-- something, with no application code present. A check that passes because
-- nothing tried to break it is worthless, so every negative case actually
-- attempts the violation and expects an exception.

\set ON_ERROR_STOP off
\timing off
\pset pager off

create or replace function probe(label text, ok boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when ok then 'PASS' else 'FAIL' end, label;
end $$;

-- Attempt a statement and report whether it raised.
create or replace function expect_refusal(label text, stmt text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
    perform probe(label, false);   -- it did NOT refuse: that is a failure
  exception when others then
    perform probe(label, true);    -- refused, as required
  end;
end $$;

create or replace function expect_success(label text, stmt text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
    perform probe(label, true);
  exception when others then
    raise notice 'FAIL  %  (%)', label, sqlerrm;
  end;
end $$;

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into public.organisations (id, slug, legal_name, base_currency, business_timezone, status, created_at)
values ('11111111-1111-4111-8111-111111111111','org-a','Org A','MVR','Indian/Maldives','active', now()),
       ('22222222-2222-4222-8222-222222222222','org-b','Org B','MVR','Indian/Maldives','active', now())
on conflict do nothing;

insert into public.persons (id, person_key, display_label, status, created_at)
values ('aaaaaaaa-1111-4111-8111-111111111111','person-a','Person A','active', now()),
       ('bbbbbbbb-2222-4222-8222-222222222222','person-b','Person B','active', now())
on conflict do nothing;

-- ── 1. RLS is enabled on every payment table ────────────────────────────────
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and (c.relname like 'payment%' or c.relname='provider_events')
    and c.relrowsecurity = false;
  perform probe('RLS enabled on all payment tables', missing is null);
end $$;

-- ── 2. Provider registry seeded, MOCK only executable ───────────────────────
do $$
declare mock_ok boolean; bml_blocked boolean; mib_blocked boolean;
begin
  select is_executable and spec_status='IMPLEMENTED' into mock_ok
    from public.payment_providers where id='MOCK';
  select not is_executable and spec_status='BANK_SPEC_REQUIRED' into bml_blocked
    from public.payment_providers where id='BML';
  select not is_executable and spec_status='BANK_SPEC_REQUIRED' into mib_blocked
    from public.payment_providers where id='MIB';
  perform probe('MOCK is executable', mock_ok);
  perform probe('BML is BANK_SPEC_REQUIRED and not executable', bml_blocked);
  perform probe('MIB is BANK_SPEC_REQUIRED and not executable', mib_blocked);
end $$;

-- ── 3. A provider cannot be marked executable without a spec ────────────────
select expect_refusal(
  'executable without spec is refused',
  $$update public.payment_providers set is_executable=true where id='BML'$$);

-- ── 4. Production config cannot activate for a BANK_SPEC_REQUIRED provider ──
select expect_refusal(
  'production activation refused for BANK_SPEC_REQUIRED provider',
  $$insert into public.payment_provider_config
      (provider_id, environment, is_active) values ('BML','production',true)$$);

select expect_success(
  'sandbox config may exist for a BANK_SPEC_REQUIRED provider',
  $$insert into public.payment_provider_config
      (provider_id, environment, is_active) values ('BML','sandbox',false)$$);

-- ── 5. Payment intent fixture ───────────────────────────────────────────────
insert into public.payment_intents
  (id, organisation_id, provider_id, amount, currency, created_by)
values ('dddddddd-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111','MOCK',500.000000,'MVR',
        'aaaaaaaa-1111-4111-8111-111111111111');

-- ── 6. Cross-tenant composite FK is refused BY THE DATABASE ─────────────────
select expect_refusal(
  'cross-tenant attempt->intent FK refused',
  $$insert into public.payment_attempts
      (organisation_id, intent_id, provider_id, amount, currency)
    values ('22222222-2222-4222-8222-222222222222',
            'dddddddd-1111-4111-8111-111111111111','MOCK',500.000000,'MVR')$$);

select expect_success(
  'same-tenant attempt->intent FK accepted',
  $$insert into public.payment_attempts
      (id, organisation_id, intent_id, provider_id, amount, currency, status)
    values ('eeeeeeee-1111-4111-8111-111111111111',
            '11111111-1111-4111-8111-111111111111',
            'dddddddd-1111-4111-8111-111111111111','MOCK',500.000000,'MVR','created')$$);

-- ── 7. The state machine ────────────────────────────────────────────────────
select expect_success('created -> processing',
  $$update public.payment_attempts set status='processing'
     where id='eeeeeeee-1111-4111-8111-111111111111'$$);

select expect_refusal('processing -> created is refused',
  $$update public.payment_attempts set status='created'
     where id='eeeeeeee-1111-4111-8111-111111111111'$$);

select expect_success('processing -> uncertain (timeout)',
  $$update public.payment_attempts
       set status='uncertain', uncertain_since=now()
     where id='eeeeeeee-1111-4111-8111-111111111111'$$);

select expect_refusal('uncertain -> processing is refused (no re-charge)',
  $$update public.payment_attempts set status='processing', uncertain_since=null
     where id='eeeeeeee-1111-4111-8111-111111111111'$$);

select expect_success('uncertain -> succeeded resolves',
  $$update public.payment_attempts set status='succeeded', uncertain_since=null
     where id='eeeeeeee-1111-4111-8111-111111111111'$$);

select expect_refusal('succeeded is terminal',
  $$update public.payment_attempts set status='failed'
     where id='eeeeeeee-1111-4111-8111-111111111111'$$);

select expect_refusal('attempts cannot be deleted',
  $$delete from public.payment_attempts
     where id='eeeeeeee-1111-4111-8111-111111111111'$$);

-- ── 8. Uncertain must carry a timestamp ─────────────────────────────────────
select expect_refusal('uncertain without timestamp is refused',
  $$insert into public.payment_attempts
      (organisation_id, intent_id, provider_id, amount, currency, status)
    values ('11111111-1111-4111-8111-111111111111',
            'dddddddd-1111-4111-8111-111111111111','MOCK',1.000000,'MVR','uncertain')$$);

-- ── 9. Refund ceiling, enforced in SQL ──────────────────────────────────────
select expect_success('refund within captured amount accepted',
  $$insert into public.payment_refunds
      (organisation_id, intent_id, provider_id, amount, currency, reason, requested_by)
    values ('11111111-1111-4111-8111-111111111111',
            'dddddddd-1111-4111-8111-111111111111','MOCK',300.000000,'MVR',
            'customer cancelled the booking','aaaaaaaa-1111-4111-8111-111111111111')$$);

select expect_refusal('cumulative refunds beyond capture refused',
  $$insert into public.payment_refunds
      (organisation_id, intent_id, provider_id, amount, currency, reason, requested_by)
    values ('11111111-1111-4111-8111-111111111111',
            'dddddddd-1111-4111-8111-111111111111','MOCK',250.000000,'MVR',
            'second refund exceeding capture','aaaaaaaa-1111-4111-8111-111111111111')$$);

select expect_refusal('refund with a token reason refused',
  $$insert into public.payment_refunds
      (organisation_id, intent_id, provider_id, amount, currency, reason, requested_by)
    values ('11111111-1111-4111-8111-111111111111',
            'dddddddd-1111-4111-8111-111111111111','MOCK',1.000000,'MVR',
            'oops','aaaaaaaa-1111-4111-8111-111111111111')$$);

select expect_refusal('negative refund refused (reversal is by row, not sign)',
  $$insert into public.payment_refunds
      (organisation_id, intent_id, provider_id, amount, currency, reason, requested_by)
    values ('11111111-1111-4111-8111-111111111111',
            'dddddddd-1111-4111-8111-111111111111','MOCK',-50.000000,'MVR',
            'negative amount attempt','aaaaaaaa-1111-4111-8111-111111111111')$$);

-- ── 10. Webhook deduplication is a constraint ───────────────────────────────
select expect_success('first provider event accepted',
  $$insert into public.provider_events
      (provider_id, provider_event_id, raw_payload, signature_verified)
    values ('MOCK','evt_dedupe_1','{"a":1}',true)$$);

select expect_refusal('duplicate provider event refused by unique constraint',
  $$insert into public.provider_events
      (provider_id, provider_event_id, raw_payload, signature_verified)
    values ('MOCK','evt_dedupe_1','{"a":1}',true)$$);

select expect_refusal('raw webhook payload is immutable',
  $$update public.provider_events set raw_payload='{"tampered":true}'
     where provider_event_id='evt_dedupe_1'$$);

select expect_refusal('provider events cannot be deleted',
  $$delete from public.provider_events where provider_event_id='evt_dedupe_1'$$);

-- ── 11. Settlement must balance ─────────────────────────────────────────────
select expect_refusal('settlement that does not balance is refused',
  $$insert into public.payment_settlements
      (organisation_id, provider_id, batch_reference,
       gross_amount, fee_amount, net_amount, currency, settled_at)
    values ('11111111-1111-4111-8111-111111111111','MOCK','batch-bad',
            1000.000000, 25.500000, 999.000000, 'MVR', now())$$);

select expect_success('balanced settlement accepted',
  $$insert into public.payment_settlements
      (id, organisation_id, provider_id, batch_reference,
       gross_amount, fee_amount, net_amount, currency, settled_at)
    values ('ffffffff-1111-4111-8111-111111111111',
            '11111111-1111-4111-8111-111111111111','MOCK','batch-good',
            1000.000000, 25.500000, 974.500000, 'MVR', now())$$);

select expect_refusal('settlement figures are immutable',
  $$update public.payment_settlements set gross_amount=2000.000000
     where id='ffffffff-1111-4111-8111-111111111111'$$);

select expect_success('reconciliation state may still advance',
  $$update public.payment_settlements set reconciled_at=now()
     where id='ffffffff-1111-4111-8111-111111111111'$$);

select expect_refusal('duplicate settlement batch reference refused',
  $$insert into public.payment_settlements
      (organisation_id, provider_id, batch_reference,
       gross_amount, fee_amount, net_amount, currency, settled_at)
    values ('11111111-1111-4111-8111-111111111111','MOCK','batch-good',
            1.000000, 0.000000, 1.000000, 'MVR', now())$$);
