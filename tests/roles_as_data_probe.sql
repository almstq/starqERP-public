-- =============================================================================
-- Test Probe: tests/roles_as_data_probe.sql
-- SERP-163: Roles as Data Over Seats & Pending Membership Status SQL Probe
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
  st_org uuid := '10000000-0000-4000-8000-000000000001';
  ci_role_count integer;
  st_role_count integer;
  test_person uuid;
  test_mem uuid;
  owner_role uuid;
begin
  -- ---------------------------------------------------------------------------
  -- Suite 1: Verify Standard Seed Roles
  -- ---------------------------------------------------------------------------
  select count(*) into ci_role_count from public.roles where organisation_id = ci_org;
  select count(*) into st_role_count from public.roles where organisation_id = st_org;

  if ci_role_count = 10 and st_role_count = 10 then
    insert into probe_results values ('seed_roles_count', true, 'Both CI and ST have exactly 10 seeded base roles');
  else
    insert into probe_results values ('seed_roles_count', false, 'Expected 10 roles per org, got CI: ' || ci_role_count || ', ST: ' || st_role_count);
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 2: Memberships Accepts 'pending' Status
  -- ---------------------------------------------------------------------------
  select id into owner_role from public.roles where organisation_id = ci_org and code = 'owner';
  
  insert into public.persons (person_key, display_label, status)
  values ('test-pending-user', 'Test Pending User', 'active')
  returning id into test_person;

  insert into public.memberships (organisation_id, person_id, role_id, status)
  values (ci_org, test_person, owner_role, 'pending')
  returning id into test_mem;

  if test_mem is not null then
    insert into probe_results values ('memberships_pending_status', true, 'Membership successfully created in pending status with role_id');
  else
    insert into probe_results values ('memberships_pending_status', false, 'Failed to create membership in pending status');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 3: Role Permissions Linking
  -- ---------------------------------------------------------------------------
  if exists (
    select 1 from public.role_permissions
     where organisation_id = ci_org and role_id = owner_role and module = 'garage' and action = 'admin'
  ) then
    insert into probe_results values ('role_permissions_link', true, 'Owner role has administrative permissions on garage module');
  else
    insert into probe_results values ('role_permissions_link', false, 'Owner role permissions missing');
  end if;

end $$;

select
  case when count(*) = 3 and bool_and(passed)
    then 'ROLES AS DATA SQL PROBE: ALL 3 SUITES PASSED'
    else 'ROLES AS DATA SQL PROBE: FAIL'
  end as probe_result
from probe_results;

select test_name, passed, detail from probe_results order by test_name;

rollback;
