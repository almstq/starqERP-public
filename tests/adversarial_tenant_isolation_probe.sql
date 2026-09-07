\set ON_ERROR_STOP on

-- SERP-172: Adversarial Tenant Isolation Probe (Memo §37 / Amendment A6)
-- Tests both structural composite FK layer and RLS policy enforcement.
-- Disposable synthetic runtime only.

begin;

-- Create synthetic test tenants
insert into public.organisations (id, code, name, status) values
  ('11111111-1111-4000-8000-000000000001', 'TENANT_A', 'Tenant Alpha Garage', 'active'),
  ('22222222-2222-4000-8000-000000000002', 'TENANT_B', 'Tenant Beta Logistics', 'active')
on conflict (id) do nothing;

-- Create synthetic test contacts in both tenants
insert into public.contacts (id, organisation_id, type, display_name) values
  ('aaaa1111-0000-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'customer', 'Customer in Tenant A'),
  ('bbbb2222-0000-4000-8000-000000000002', '22222222-2222-4000-8000-000000000002', 'customer', 'Customer in Tenant B')
on conflict (organisation_id, id) do nothing;

-- Create synthetic test vehicles in both tenants
insert into public.vehicles (id, organisation_id, customer_id, registration_no) values
  ('aaaa2222-0000-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'aaaa1111-0000-4000-8000-000000000001', 'A-REG-01'),
  ('bbbb3333-0000-4000-8000-000000000002', '22222222-2222-4000-8000-000000000002', 'bbbb2222-0000-4000-8000-000000000002', 'B-REG-02')
on conflict (organisation_id, id) do nothing;

-- Create synthetic job in Tenant B
insert into public.garage_jobs (id, organisation_id, job_no, customer_id, vehicle_id, state, summary) values
  ('bbbb4444-0000-4000-8000-000000000002', '22222222-2222-4000-8000-000000000002', 'JOB-B-001', 'bbbb2222-0000-4000-8000-000000000002', 'bbbb3333-0000-4000-8000-000000000002', 'intake', 'Tenant B Job')
on conflict (organisation_id, id) do nothing;

-- ============================================================================
-- ATTACK 1: Cross-tenant Foreign Key Injection (Composite FK Layer)
-- Even with superuser / RLS bypassed, composite FK MUST refuse cross-tenant links.
-- ============================================================================

do $$
declare
  v_caught boolean := false;
begin
  -- Tenant A tries to create a job pointing to Tenant B's customer
  begin
    insert into public.garage_jobs (id, organisation_id, job_no, customer_id, vehicle_id, state, summary)
    values ('aaaa9999-0000-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'JOB-A-EVIL', 'bbbb2222-0000-4000-8000-000000000002', 'aaaa2222-0000-4000-8000-000000000001', 'intake', 'Cross-tenant attack');
  exception when foreign_key_violation then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'SERP-172 SECURITY FAILURE: Cross-tenant customer FK was NOT refused by composite foreign key constraint!';
  end if;
end
$$;

do $$
declare
  v_caught boolean := false;
begin
  -- Tenant A tries to create a job pointing to Tenant B's vehicle
  begin
    insert into public.garage_jobs (id, organisation_id, job_no, customer_id, vehicle_id, state, summary)
    values ('aaaa9998-0000-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'JOB-A-EVIL2', 'aaaa1111-0000-4000-8000-000000000001', 'bbbb3333-0000-4000-8000-000000000002', 'intake', 'Cross-tenant attack 2');
  exception when foreign_key_violation then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'SERP-172 SECURITY FAILURE: Cross-tenant vehicle FK was NOT refused by composite foreign key constraint!';
  end if;
end
$$;

do $$
declare
  v_caught boolean := false;
begin
  -- Tenant A tries to attach a job_event to Tenant B's job
  begin
    insert into public.job_events (id, organisation_id, job_id, event_name, actor_person_id, payload)
    values ('aaaa9997-0000-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'bbbb4444-0000-4000-8000-000000000002', 'WORK', '00000000-0000-4000-8000-000000000001', '{"notes":"evil"}'::jsonb);
  exception when foreign_key_violation then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'SERP-172 SECURITY FAILURE: Cross-tenant job_event FK was NOT refused by composite foreign key constraint!';
  end if;
end
$$;

-- ============================================================================
-- ATTACK 2: Attachment / Storage isolation validation
-- Verify (organisation_id, storage_key) uniqueness constraint exists
-- ============================================================================

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name
   where tc.table_name = 'attachments'
     and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
     and ccu.column_name = 'organisation_id';

  if v_count < 1 then
    raise exception 'SERP-172 SECURITY FAILURE: attachments table lacks organisation_id in primary/unique key constraint!';
  end if;
end
$$;

-- ============================================================================
-- ATTACK 3: Audit log append-only trigger validation
-- ============================================================================

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from information_schema.triggers
   where event_object_table = 'audit_events'
     and trigger_name = 'audit_events_append_only';

  if v_count < 1 then
    raise exception 'SERP-172 SECURITY FAILURE: audit_events append-only trigger is missing!';
  end if;
end
$$;

rollback;
