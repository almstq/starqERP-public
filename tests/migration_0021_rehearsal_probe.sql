-- =============================================================================
-- Test Probe: tests/migration_0021_rehearsal_probe.sql
-- SERP-275: Rehearsal and Invariant Validation for Forward Migration 0021
-- =============================================================================

begin;

create temp table migration_rehearsal_results (
  check_name text not null,
  passed boolean not null,
  detail text
);

do $$
declare
  old_st uuid := '29552026-0000-4000-8000-000000000001';
  new_st uuid := '10000000-0000-4000-8000-000000000001';

  old_ci uuid := '30222026-0000-4000-8000-000000000001';
  new_ci uuid := '20000000-0000-4000-8000-000000000001';

  old_st_wf uuid := '29552026-0000-4000-8000-000000000802';
  new_st_wf uuid := '10000000-0000-4000-8000-000000000802';

  old_ci_wf uuid := '30222026-0000-4000-8000-000000000801';
  new_ci_wf uuid := '20000000-0000-4000-8000-000000000801';

  cnt_new_st int;
  cnt_new_ci int;
  cnt_old_st int;
  cnt_old_ci int;
  orphaned_fks int := 0;
  wf_stages_count int;
  roles_count int;
  bank_acc_count int;
  doc_seq_prefix text;
  doc_seq_val bigint;
  trigger_active boolean := false;
  trigger_caught boolean := false;
begin
  -- ---------------------------------------------------------------------------
  -- 1. Assert Synthetic Organisations Exist Exactly Once
  -- ---------------------------------------------------------------------------
  select count(*) into cnt_new_st from public.organisations where id = new_st and slug = 'starq';
  select count(*) into cnt_new_ci from public.organisations where id = new_ci and slug = 'club-ignition';

  if cnt_new_st = 1 and cnt_new_ci = 1 then
    insert into migration_rehearsal_results values ('synthetic_orgs_exist', true, 'Both synthetic organisations exist with canonical slugs');
  else
    insert into migration_rehearsal_results values ('synthetic_orgs_exist', false, 'Expected 1 each, got ST: ' || cnt_new_st || ', CI: ' || cnt_new_ci);
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. Assert Legacy Organisation IDs No Longer Exist
  -- ---------------------------------------------------------------------------
  select count(*) into cnt_old_st from public.organisations where id = old_st;
  select count(*) into cnt_old_ci from public.organisations where id = old_ci;

  if cnt_old_st = 0 and cnt_old_ci = 0 then
    insert into migration_rehearsal_results values ('legacy_orgs_eliminated', true, 'Zero occurrences of legacy organisation UUIDs in organisations table');
  else
    insert into migration_rehearsal_results values ('legacy_orgs_eliminated', false, 'Found legacy orgs: ST=' || cnt_old_st || ', CI=' || cnt_old_ci);
  end if;

  -- ---------------------------------------------------------------------------
  -- 3. Assert Zero Orphaned FKs Across Child Tables
  -- ---------------------------------------------------------------------------
  select count(*) into orphaned_fks from (
    select organisation_id from public.business_names where organisation_id not in (select id from public.organisations)
    union all
    select organisation_id from public.memberships where organisation_id not in (select id from public.organisations)
    union all
    select organisation_id from public.document_sequences where organisation_id not in (select id from public.organisations)
    union all
    select organisation_id from public.workflow_templates where organisation_id not in (select id from public.organisations)
    union all
    select organisation_id from public.workflow_stages where organisation_id not in (select id from public.organisations)
    union all
    select organisation_id from public.roles where organisation_id not in (select id from public.organisations)
    union all
    select organisation_id from public.role_permissions where organisation_id not in (select id from public.organisations)
    union all
    select organisation_id from public.tax_registrations where organisation_id not in (select id from public.organisations)
    union all
    select organisation_id from public.bank_accounts where organisation_id not in (select id from public.organisations)
  ) orphan_check;

  if orphaned_fks = 0 then
    insert into migration_rehearsal_results values ('zero_orphaned_fks', true, 'Zero orphaned child foreign keys across all referencing tables');
  else
    insert into migration_rehearsal_results values ('zero_orphaned_fks', false, 'Found ' || orphaned_fks || ' orphaned FK references');
  end if;

  -- ---------------------------------------------------------------------------
  -- 4. Assert Workflow Template & Composite FK Integrity
  -- ---------------------------------------------------------------------------
  select count(*) into wf_stages_count
    from public.workflow_stages ws
    join public.workflow_templates wt
      on ws.organisation_id = wt.organisation_id and ws.workflow_template_id = wt.id
   where ws.organisation_id in (new_st, new_ci);

  if wf_stages_count >= 18 then -- 12 garage stages + 6 scm stages
    insert into migration_rehearsal_results values ('workflow_template_composite_fk', true, 'All workflow stages validly linked to updated synthetic workflow templates (' || wf_stages_count || ' stages)');
  else
    insert into migration_rehearsal_results values ('workflow_template_composite_fk', false, 'Expected >= 18 stages linked to synthetic templates, found ' || wf_stages_count);
  end if;

  -- ---------------------------------------------------------------------------
  -- 5. Assert Document Sequence Continuity
  -- ---------------------------------------------------------------------------
  select prefix, next_value into doc_seq_prefix, doc_seq_val
    from public.document_sequences
   where organisation_id = new_ci and sequence_type = 'garage_job';

  if doc_seq_prefix = 'CI-JOB-' and doc_seq_val > 0 then
    insert into migration_rehearsal_results values ('document_sequence_preserved', true, 'Document sequence preserved for new synthetic CI tenant (' || doc_seq_prefix || doc_seq_val || ')');
  else
    insert into migration_rehearsal_results values ('document_sequence_preserved', false, 'Document sequence missing or malformed for CI tenant');
  end if;

  -- ---------------------------------------------------------------------------
  -- 6. Assert Append-Only Triggers Are Restored and Operational
  -- ---------------------------------------------------------------------------
  begin
    insert into public.audit_events (organisation_id, actor_id, event_type, summary)
    values (new_ci, null, 'PROBE_EVENT', 'Testing trigger operational state');
    
    update public.audit_events set summary = 'Mutated' where event_type = 'PROBE_EVENT';
  exception when others then
    if sqlerrm like '%append-only%' then
      trigger_caught := true;
    end if;
  end;

  if trigger_caught then
    insert into migration_rehearsal_results values ('append_only_trigger_restored', true, 'Append-only triggers properly restored and blocking updates as designed');
  else
    insert into migration_rehearsal_results values ('append_only_trigger_restored', false, 'Append-only trigger failed to block mutation after migration');
  end if;

  -- ---------------------------------------------------------------------------
  -- 7. Assert Transactional Rollback Isolation on Induced Error
  -- ---------------------------------------------------------------------------
  begin
    begin
      update public.organisations set slug = 'invalid-rollback-slug' where id = new_ci;
      raise exception using errcode = 'ZX999', message = 'induced_rollback_error';
    exception when sqlstate 'ZX999' then
      null;
    end;

    -- Verify rollback of inner subtransaction
    if (select slug from public.organisations where id = new_ci) = 'club-ignition' then
      insert into migration_rehearsal_results values ('transaction_rollback_isolation', true, 'Transactional rollback isolation functions cleanly');
    else
      insert into migration_rehearsal_results values ('transaction_rollback_isolation', false, 'Transaction failed to roll back on induced error');
    end if;
  end;

end $$;

select check_name, passed, detail from migration_rehearsal_results;

do $$
declare
  failed_count int;
begin
  select count(*) into failed_count from migration_rehearsal_results where passed is false;
  if failed_count > 0 then
    raise exception 'Migration 0021 rehearsal probe FAILED with % failure(s)', failed_count;
  end if;
end $$;

rollback;
