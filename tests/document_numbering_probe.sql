-- =============================================================================
-- Test Probe: tests/document_numbering_probe.sql
-- SERP-176: Concurrency-Safe Server-Generated Document Numbering Real SQL Probe
-- =============================================================================

begin;

create temp table probe_results (
  test_name text not null,
  passed boolean not null,
  detail text
);

do $$
declare
  org_a uuid := '00000000-0000-4000-8000-000000000001';
  org_b uuid := '00000000-0000-4000-8000-000000000002';
  num1 text;
  num2 text;
  num3 text;
  num_b1 text;
  num_inv1 text;
  caught boolean;
begin
  -- ---------------------------------------------------------------------------
  -- Suite 1: Single Allocation Format & Padding
  -- ---------------------------------------------------------------------------
  insert into public.document_sequences (organisation_id, sequence_type, prefix, padding, next_value)
  values (org_a, 'probe_job', 'CI-JOB-', 4, 1)
  on conflict (organisation_id, sequence_type) do update
    set next_value = 1, prefix = 'CI-JOB-', padding = 4;

  num1 := app_private.allocate_document_no(org_a, 'probe_job');
  if num1 = 'CI-JOB-0001' then
    insert into probe_results values ('single_allocation_formatting', true, 'CI-JOB-0001 formatted correctly with 4-digit padding');
  else
    insert into probe_results values ('single_allocation_formatting', false, 'Expected CI-JOB-0001, got ' || coalesce(num1, 'NULL'));
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 2: Sequential Advancement
  -- ---------------------------------------------------------------------------
  num2 := app_private.allocate_document_no(org_a, 'probe_job');
  num3 := app_private.allocate_document_no(org_a, 'probe_job');
  if num2 = 'CI-JOB-0002' and num3 = 'CI-JOB-0003' then
    insert into probe_results values ('sequential_advancement', true, 'Sequential numbers generated without gaps (0002, 0003)');
  else
    insert into probe_results values ('sequential_advancement', false, 'Expected 0002 and 0003, got ' || num2 || ', ' || num3);
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 3: Multi-Tenant Isolation
  -- ---------------------------------------------------------------------------
  insert into public.document_sequences (organisation_id, sequence_type, prefix, padding, next_value)
  values (org_b, 'probe_job', 'ST-JOB-', 4, 1)
  on conflict (organisation_id, sequence_type) do update
    set next_value = 1, prefix = 'ST-JOB-', padding = 4;

  num_b1 := app_private.allocate_document_no(org_b, 'probe_job');
  if num_b1 = 'ST-JOB-0001' then
    insert into probe_results values ('multi_tenant_isolation', true, 'Tenant B started at 0001 independently of Tenant A at 0003');
  else
    insert into probe_results values ('multi_tenant_isolation', false, 'Expected ST-JOB-0001, got ' || coalesce(num_b1, 'NULL'));
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 4: Sequence Type Isolation within Same Organisation
  -- ---------------------------------------------------------------------------
  insert into public.document_sequences (organisation_id, sequence_type, prefix, padding, next_value)
  values (org_a, 'probe_inv', 'CI-INV-2026-', 4, 1)
  on conflict (organisation_id, sequence_type) do update
    set next_value = 1, prefix = 'CI-INV-2026-', padding = 4;

  num_inv1 := app_private.allocate_document_no(org_a, 'probe_inv');
  if num_inv1 = 'CI-INV-2026-0001' then
    insert into probe_results values ('sequence_type_isolation', true, 'Invoice sequence started at 0001 without disturbing probe_job');
  else
    insert into probe_results values ('sequence_type_isolation', false, 'Expected CI-INV-2026-0001, got ' || coalesce(num_inv1, 'NULL'));
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 5: Rejection of Unknown Sequence Type
  -- ---------------------------------------------------------------------------
  caught := false;
  begin
    perform app_private.allocate_document_no(org_a, 'nonexistent_sequence_type');
  exception when others then
    if sqlerrm like '%unknown document sequence%' then
      caught := true;
    end if;
  end;
  insert into probe_results values ('reject_unknown_sequence', caught, 'Unknown sequence type rejected with explicit exception');

  -- ---------------------------------------------------------------------------
  -- Suite 6: Rejection of Unknown Organisation
  -- ---------------------------------------------------------------------------
  caught := false;
  begin
    perform app_private.allocate_document_no('ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid, 'probe_job');
  exception when others then
    if sqlerrm like '%unknown document sequence%' then
      caught := true;
    end if;
  end;
  insert into probe_results values ('reject_unknown_organisation', caught, 'Unknown organisation rejected with explicit exception');

  -- ---------------------------------------------------------------------------
  -- Suite 7: Padding Constraints Enforcement
  -- ---------------------------------------------------------------------------
  caught := false;
  begin
    insert into public.document_sequences (organisation_id, sequence_type, prefix, padding, next_value)
    values (org_a, 'bad_padding', 'BAD-', 0, 1);
  exception when check_violation then
    caught := true;
  end;
  insert into probe_results values ('reject_zero_padding', caught, 'Zero padding rejected by check constraint (padding between 1 and 12)');

  -- ---------------------------------------------------------------------------
  -- Suite 8: Commercial Document Number Uniqueness
  -- ---------------------------------------------------------------------------
  insert into public.commercial_documents (
    id, organisation_id, document_type, document_no, currency, status, gross_total, issued_at
  ) values (
    '00000000-0000-4000-8000-000000008801', org_a, 'sales_invoice', 'INV-2026-9999', 'MVR', 'issued', 1000.00, now()
  );

  caught := false;
  begin
    insert into public.commercial_documents (
      id, organisation_id, document_type, document_no, currency, status, gross_total, issued_at
    ) values (
      '00000000-0000-4000-8000-000000008802', org_a, 'sales_invoice', 'INV-2026-9999', 'MVR', 'issued', 2000.00, now()
    );
  exception when unique_violation then
    caught := true;
  end;
  insert into probe_results values ('commercial_document_number_uniqueness', caught, 'Duplicate (org, type, document_no) rejected by unique constraint');

end $$;

select
  case when count(*) = 8 and bool_and(passed)
    then 'DOCUMENT NUMBERING SQL PROBE: ALL 8 SUITES PASSED'
    else 'DOCUMENT NUMBERING SQL PROBE: FAIL'
  end as probe_result
from probe_results;

select test_name, passed, detail from probe_results order by test_name;

rollback;
