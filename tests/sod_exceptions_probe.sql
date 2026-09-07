-- =============================================================================
-- Test Probe: tests/sod_exceptions_probe.sql
-- SERP-177: Segregation of Duties Tracked Exceptions SQL Probe (DEC-065)
-- =============================================================================

begin;

create temp table probe_results (
  test_name text not null,
  passed boolean not null,
  detail text
);

do $$
declare
  ci_org uuid := '20000000-0000-4000-8000-000000000001';
  p1 uuid;
  p2 uuid;
  m1 uuid;
  m2 uuid;
  purch_id uuid := gen_random_uuid();
  exc_id uuid;
  disp_id uuid;
  cap text;
  err_caught boolean := false;
begin
  -- ---------------------------------------------------------------------------
  -- Suite 1: Setup Test Persons & Measure Capacity
  -- ---------------------------------------------------------------------------
  insert into public.persons (person_key, display_label, status)
  values ('sod-test-person-1', 'Solo Worker 1', 'active')
  returning id into p1;

  insert into public.memberships (organisation_id, person_id, status)
  values (ci_org, p1, 'active')
  returning id into m1;

  insert into public.membership_seats (membership_id, seat_code)
  values (m1, 'quartermaster'), (m1, 'financial_controller');

  -- Capacity for financial_controller should be solo since only 1 person has it
  select app_private.evaluate_segregation_capacity(ci_org, 'financial_controller') into cap;
  if cap = 'solo' then
    insert into probe_results values ('capacity_derivation_solo', true, 'Single active person derived capacity = solo');
  else
    insert into probe_results values ('capacity_derivation_solo', false, 'Expected solo, got: ' || coalesce(cap, 'null'));
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 2: Record SoD Exception
  -- ---------------------------------------------------------------------------
  select app_private.record_sod_exception(
    ci_org,
    purch_id,
    p1,
    'quote_award',
    'quote',
    'award',
    now() - interval '5 minutes',
    'solo'
  ) into exc_id;

  if exc_id is not null then
    insert into probe_results values ('record_sod_exception', true, 'Successfully inserted immutable SoD exception record');
  else
    insert into probe_results values ('record_sod_exception', false, 'Failed to record SoD exception');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 3: Immutability Enforcement (Refuse UPDATE & DELETE)
  -- ---------------------------------------------------------------------------
  err_caught := false;
  begin
    update public.sod_exceptions set disposition = 'investigated' where id = exc_id;
  exception when others then
    if sqlerrm like '%ERR_IMMUTABLE_AUDIT%' then
      err_caught := true;
    end if;
  end;

  if err_caught then
    insert into probe_results values ('sod_exception_immutability', true, 'UPDATE on sod_exceptions refused by append-only trigger');
  else
    insert into probe_results values ('sod_exception_immutability', false, 'UPDATE on sod_exceptions was unexpectedly allowed');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 4: Honest Self-Review Labelling on Disposition Append
  -- ---------------------------------------------------------------------------
  -- 4a. Self-review by p1
  select app_private.append_sod_disposition(
    ci_org,
    exc_id,
    p1,
    'self_reviewed',
    'Solo operation documented review for period ending August 2026'
  ) into disp_id;

  if exists (
    select 1 from public.sod_exception_dispositions
     where id = disp_id and is_self_review = true
  ) then
    insert into probe_results values ('self_review_labelling', true, 'Disposition correctly stamped is_self_review = true for same actor');
  else
    insert into probe_results values ('self_review_labelling', false, 'Self-review was not honestly labelled');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 5: Capacity Transitions to Segregated When 2nd Person Added
  -- ---------------------------------------------------------------------------
  insert into public.persons (person_key, display_label, status)
  values ('sod-test-person-2', 'Second Controller', 'active')
  returning id into p2;

  insert into public.memberships (organisation_id, person_id, status)
  values (ci_org, p2, 'active')
  returning id into m2;

  insert into public.membership_seats (membership_id, seat_code)
  values (m2, 'financial_controller');

  select app_private.evaluate_segregation_capacity(ci_org, 'financial_controller') into cap;
  if cap = 'segregated' then
    insert into probe_results values ('capacity_transition_segregated', true, 'Adding 2nd person automatically restored segregated capacity without config change');
  else
    insert into probe_results values ('capacity_transition_segregated', false, 'Expected segregated capacity, got: ' || coalesce(cap, 'null'));
  end if;

end $$;

select
  case when count(*) = 5 and bool_and(passed)
    then 'SOD EXCEPTIONS SQL PROBE: ALL 5 SUITES PASSED'
    else 'SOD EXCEPTIONS SQL PROBE: FAIL'
  end as probe_result
from probe_results;

select test_name, passed, detail from probe_results order by test_name;

rollback;
