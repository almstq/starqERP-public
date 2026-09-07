-- =============================================================================
-- Test Probe: tests/workflow_stages_probe.sql
-- SERP-162: Dynamic Workflow Stages as Seed Data SQL Probe
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
  res record;
  ci_count integer;
  st_count integer;
  tmpl_id uuid;
begin
  -- ---------------------------------------------------------------------------
  -- Suite 1: Seed Data Verification
  -- ---------------------------------------------------------------------------
  select count(*) into ci_count
    from public.workflow_stages ws
    join public.workflow_templates wt on wt.id = ws.workflow_template_id
   where ws.organisation_id = ci_org and wt.workflow_code = 'garage_job';

  select count(*) into st_count
    from public.workflow_stages ws
    join public.workflow_templates wt on wt.id = ws.workflow_template_id
   where ws.organisation_id = st_org and wt.workflow_code = 'procurement';

  if ci_count = 12 and st_count = 6 then
    insert into probe_results values ('seed_data_verification', true, 'CI garage_job has 12 stages, ST procurement has 6 stages');
  else
    insert into probe_results values ('seed_data_verification', false, 'Expected 12 CI and 6 ST stages, found ' || ci_count || ' and ' || st_count);
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 2: Initial Stage Resolution
  -- ---------------------------------------------------------------------------
  select * into res from app_private.validate_workflow_transition(ci_org, 'garage_job', null, 'CALL');
  if res.is_valid and res.next_state = 'call' then
    insert into probe_results values ('initial_stage_resolution', true, 'CALL from null correctly resolved to call initial state');
  else
    insert into probe_results values ('initial_stage_resolution', false, 'CALL resolution failed');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 3: Valid State Transitions
  -- ---------------------------------------------------------------------------
  select * into res from app_private.validate_workflow_transition(ci_org, 'garage_job', 'call', 'BOOKING');
  if res.is_valid and res.next_state = 'booked' then
    select * into res from app_private.validate_workflow_transition(ci_org, 'garage_job', 'work', 'QC');
    if res.is_valid and res.next_state = 'qc' then
      insert into probe_results values ('valid_transitions', true, 'call->BOOKING->booked and work->QC->qc passed');
    else
      insert into probe_results values ('valid_transitions', false, 'work->QC failed');
    end if;
  else
    insert into probe_results values ('valid_transitions', false, 'call->BOOKING failed');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 4: Illegal Transitions Refused
  -- ---------------------------------------------------------------------------
  select * into res from app_private.validate_workflow_transition(ci_org, 'garage_job', 'call', 'QC');
  if not res.is_valid and res.err_msg = 'illegal_workflow_transition' then
    select * into res from app_private.validate_workflow_transition(ci_org, 'garage_job', 'closed', 'WORK');
    if not res.is_valid and res.err_msg = 'illegal_workflow_transition' then
      insert into probe_results values ('illegal_transitions_refused', true, 'call->QC and closed->WORK correctly refused with illegal_workflow_transition');
    else
      insert into probe_results values ('illegal_transitions_refused', false, 'closed->WORK was not refused');
    end if;
  else
    insert into probe_results values ('illegal_transitions_refused', false, 'call->QC was not refused');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 5: Multi-Tenant Workflow Isolation
  -- ---------------------------------------------------------------------------
  select * into res from app_private.validate_workflow_transition(st_org, 'garage_job', 'call', 'BOOKING');
  if not res.is_valid and res.err_msg = 'unsupported_command' then
    insert into probe_results values ('tenant_isolation', true, 'Tenant ST cannot execute Tenant CI garage_job workflow');
  else
    insert into probe_results values ('tenant_isolation', false, 'Tenant isolation breached');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 6: Dynamic Custom Stage Extension (Zero Code Changes)
  -- ---------------------------------------------------------------------------
  select id into tmpl_id from public.workflow_templates where organisation_id = ci_org and workflow_code = 'garage_job';
  
  -- Insert custom stage 'wash'
  insert into public.workflow_stages
    (organisation_id, workflow_template_id, stage_code, stage_name, stage_order,
     command_name, required_seat, allowed_from_stages)
  values
    (ci_org, tmpl_id, 'wash', 'Detailing & Wash', 95, 'WASH', 'technician', '{"qc"}');

  -- Update handover to allow transition from wash
  update public.workflow_stages
     set allowed_from_stages = '{"qc","wash"}'
   where organisation_id = ci_org and workflow_template_id = tmpl_id and stage_code = 'handover';

  select * into res from app_private.validate_workflow_transition(ci_org, 'garage_job', 'qc', 'WASH');
  if res.is_valid and res.next_state = 'wash' then
    select * into res from app_private.validate_workflow_transition(ci_org, 'garage_job', 'wash', 'HANDOVER');
    if res.is_valid and res.next_state = 'handover' then
      insert into probe_results values ('custom_stage_extension', true, 'Custom stage wash inserted and transitioned without any code/migration changes');
    else
      insert into probe_results values ('custom_stage_extension', false, 'wash->HANDOVER failed');
    end if;
  else
    insert into probe_results values ('custom_stage_extension', false, 'qc->WASH failed');
  end if;

end $$;

select
  case when count(*) = 6 and bool_and(passed)
    then 'WORKFLOW STAGES SQL PROBE: ALL 6 SUITES PASSED'
    else 'WORKFLOW STAGES SQL PROBE: FAIL'
  end as probe_result
from probe_results;

select test_name, passed, detail from probe_results order by test_name;

rollback;
