\set ON_ERROR_STOP on

-- SERP-034: Transactional Outbox and Append-Only Audit Probe
-- Disposable synthetic verification only.

begin;

create temporary table test_orgs (id uuid primary key);
insert into test_orgs values
  ('11111111-1111-4000-8000-000000000001'),
  ('22222222-2222-4000-8000-000000000002');

-- 1. Insert synthetic organisations
insert into public.organisations (id, slug, legal_name, base_currency, status)
values
  ('11111111-1111-4000-8000-000000000001', 'outbox-test-org-a', 'Outbox Org A', 'MVR', 'active'),
  ('22222222-2222-4000-8000-000000000002', 'outbox-test-org-b', 'Outbox Org B', 'MVR', 'active')
on conflict (id) do nothing;

-- 2. Insert outbox event for Org A
insert into public.transactional_outbox (
  id,
  organisation_id,
  event_type,
  aggregate_type,
  aggregate_id,
  payload,
  status
) values (
  '99990000-0000-4000-8000-000000000001',
  '11111111-1111-4000-8000-000000000001',
  'INVOICE_GENERATED',
  'invoice',
  'INV-2026-001',
  '{"invoiceId": "INV-2026-001", "total": 1500.00}'::jsonb,
  'pending'
);

-- 3. Verify status transition is permitted
update public.transactional_outbox
   set status = 'published', published_at = now()
 where id = '99990000-0000-4000-8000-000000000001';

-- 4. Verify DELETE is blocked by immutability trigger
do $$
declare
  v_caught boolean := false;
begin
  begin
    delete from public.transactional_outbox where id = '99990000-0000-4000-8000-000000000001';
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'SERP-034 FAILURE: DELETE on transactional_outbox was not blocked by immutability trigger!';
  end if;
end;
$$;

-- 5. Verify payload UPDATE is blocked by immutability trigger
do $$
declare
  v_caught boolean := false;
begin
  begin
    update public.transactional_outbox
       set payload = '{"tampered": true}'::jsonb
     where id = '99990000-0000-4000-8000-000000000001';
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'SERP-034 FAILURE: Payload alteration on transactional_outbox was not blocked by immutability trigger!';
  end if;
end;
$$;

rollback;
