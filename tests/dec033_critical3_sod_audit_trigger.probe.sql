-- =============================================================================
-- Test Probe: tests/dec033_critical3_sod_audit_trigger.probe.sql
-- DEC-033 CRITICAL-3: verifies app_private.check_purchase_sod_pair() /
-- the job_events_sod_audit trigger from migration
-- 202609060049_dec033_critical3_sod_audit_trigger.sql.
--
-- WHY THIS IS A SEPARATE FILE, NOT EMBEDDED IN THE MIGRATION:
-- sod_exceptions and sod_exception_dispositions are immutable append-only
-- tables (migration 202608250016's own trigger blocks UPDATE and DELETE).
-- A migration-embedded self-test that inserts a real sod_exceptions row has
-- no way to clean itself up afterward - DELETE is refused, and DO blocks
-- cannot issue ROLLBACK (that is a client/session-level operation, not a
-- PL/pgSQL statement). An earlier version of this migration tried exactly
-- that and would have permanently committed fake test data into production
-- on every apply. Caught by Copilot's automated review before merge.
--
-- Self-contained: the begin;/rollback; below are plain top-level SQL
-- statements (not inside a DO block, where transaction control is not
-- allowed), so this file can be run directly and will always roll back its
-- own fixtures regardless of how it is invoked, e.g.:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f tests/dec033_critical3_sod_audit_trigger.probe.sql
-- Matches tests/sod_exceptions_probe.sql's own begin;/rollback; wrapping -
-- fixed after Codex's independent review of PR #102 found the first version
-- of this probe only documented that requirement instead of enforcing it,
-- so running it bare (autocommit) would have left immutable fixture rows
-- behind with no cleanup path.
-- =============================================================================

begin;

create temp table probe_results (
  test_name text not null,
  passed boolean not null,
  detail text
);

do $$
declare
  fake_org uuid;
  person_a uuid;
  person_b uuid;
  fake_job uuid := gen_random_uuid();
  exception_count_before integer;
  exception_count_after integer;
  v_capacity text;
  err_caught boolean := false;
begin
  insert into public.organisations (id, name, status)
  values (gen_random_uuid(), 'PROBE-CRITICAL3', 'active')
  returning id into fake_org;

  insert into public.persons (person_key, display_label, status)
  values ('critical3-probe-a', 'Probe A', 'active')
  returning id into person_a;
  insert into public.persons (person_key, display_label, status)
  values ('critical3-probe-b', 'Probe B', 'active')
  returning id into person_b;

  insert into public.garage_jobs (id, organisation_id, job_no, state, summary)
  values (fake_job, fake_org, 'PROBE-JOB', 'parts', 'critical3 probe');

  -- Suite 1: same person does award then pay - must record an exception,
  -- must NOT block (the second insert below must succeed).
  insert into public.job_events
    (id, organisation_id, job_id, event_type, actor_person_id, acting_seat,
     idempotency_key, payload)
  values
    (gen_random_uuid(), fake_org, fake_job, 'PURCHASE', person_a, 'quartermaster',
     gen_random_uuid(), jsonb_build_object('scm_step', 'award'));

  select count(*) into exception_count_before
    from public.sod_exceptions where organisation_id = fake_org;
  insert into probe_results values (
    'no exception before the pair completes',
    exception_count_before = 0,
    format('count=%s', exception_count_before)
  );

  begin
    insert into public.job_events
      (id, organisation_id, job_id, event_type, actor_person_id, acting_seat,
       idempotency_key, payload)
    values
      (gen_random_uuid(), fake_org, fake_job, 'PURCHASE', person_a, 'payer',
       gen_random_uuid(), jsonb_build_object('scm_step', 'pay'));
  exception when others then
    err_caught := true;
  end;
  insert into probe_results values (
    'same-person award+pay does not block the insert',
    not err_caught,
    case when err_caught then 'insert raised, trigger is blocking' else 'insert succeeded' end
  );

  select count(*) into exception_count_after
    from public.sod_exceptions where organisation_id = fake_org;
  insert into probe_results values (
    'exactly one exception recorded for same-person award+pay',
    exception_count_after = 1,
    format('count=%s', exception_count_after)
  );

  select segregation_capacity into v_capacity
    from public.sod_exceptions where organisation_id = fake_org;
  insert into probe_results values (
    'capacity is solo (only one payer exists)',
    v_capacity = 'solo',
    format('capacity=%s', v_capacity)
  );

  -- Suite 2: different people do the pair - must NOT record an exception.
  insert into public.job_events
    (id, organisation_id, job_id, event_type, actor_person_id, acting_seat,
     idempotency_key, payload)
  values
    (gen_random_uuid(), fake_org, fake_job, 'PURCHASE', person_a, 'receiver',
     gen_random_uuid(), jsonb_build_object('scm_step', 'receive'));
  insert into public.job_events
    (id, organisation_id, job_id, event_type, actor_person_id, acting_seat,
     idempotency_key, payload)
  values
    (gen_random_uuid(), fake_org, fake_job, 'PURCHASE', person_b, 'financial_controller',
     gen_random_uuid(), jsonb_build_object('scm_step', 'match'));

  select count(*) into exception_count_after
    from public.sod_exceptions where organisation_id = fake_org;
  insert into probe_results values (
    'different-person receive+match adds no exception',
    exception_count_after = 1,
    format('count=%s (unchanged from suite 1)', exception_count_after)
  );

  -- Suite 3: immutability of sod_exceptions is undisturbed by this trigger.
  err_caught := false;
  begin
    update public.sod_exceptions set disposition = 'accepted_with_reason'
     where organisation_id = fake_org;
  exception when others then
    if sqlerrm like '%ERR_IMMUTABLE_AUDIT%' then
      err_caught := true;
    else
      insert into probe_results values ('sod_exceptions immutability', false, format('unexpected error: %s', sqlerrm));
    end if;
  end;
  insert into probe_results values (
    'sod_exceptions stays immutable',
    err_caught,
    case when err_caught then 'update correctly refused' else 'update was NOT refused' end
  );
end $$;

select test_name, passed, detail from probe_results order by test_name;

do $$
declare
  fail_count integer;
begin
  select count(*) into fail_count from probe_results where not passed;
  if fail_count > 0 then
    raise exception 'DEC-033 CRITICAL-3 PROBE FAILED: % of % checks failed', fail_count, (select count(*) from probe_results);
  end if;
  raise notice 'DEC-033 CRITICAL-3 PROBE PASSED: all % checks green', (select count(*) from probe_results);
end $$;

rollback;
