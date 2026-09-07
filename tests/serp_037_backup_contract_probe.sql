\set ON_ERROR_STOP on

begin;

create temp table serp037_results (
  probe text primary key,
  expected text not null,
  actual text not null,
  passed boolean not null
);

insert into serp037_results values
  (
    'authenticated_catalogue_denied',
    'no schema/table/function access',
    format(
      'schema=%s table=%s register=%s restore=%s',
      has_schema_privilege('authenticated', 'platform', 'USAGE'),
      has_table_privilege('authenticated', 'platform.backup_catalogue', 'SELECT'),
      has_function_privilege('authenticated', 'platform.register_backup(uuid,uuid,uuid,jsonb)', 'EXECUTE'),
      has_function_privilege('authenticated', 'platform.record_restore_result(uuid,uuid,uuid,jsonb)', 'EXECUTE')
    ),
    not has_schema_privilege('authenticated', 'platform', 'USAGE')
      and not has_table_privilege('authenticated', 'platform.backup_catalogue', 'SELECT')
      and not has_function_privilege('authenticated', 'platform.register_backup(uuid,uuid,uuid,jsonb)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'platform.record_restore_result(uuid,uuid,uuid,jsonb)', 'EXECUTE')
  ),
  (
    'service_role_function_only',
    'function execute allowed; direct table insert denied',
    format(
      'table_insert=%s register=%s restore=%s',
      has_table_privilege('service_role', 'platform.backup_catalogue', 'INSERT'),
      has_function_privilege('service_role', 'platform.register_backup(uuid,uuid,uuid,jsonb)', 'EXECUTE'),
      has_function_privilege('service_role', 'platform.record_restore_result(uuid,uuid,uuid,jsonb)', 'EXECUTE')
    ),
    not has_table_privilege('service_role', 'platform.backup_catalogue', 'INSERT')
      and has_function_privilege('service_role', 'platform.register_backup(uuid,uuid,uuid,jsonb)', 'EXECUTE')
      and has_function_privilege('service_role', 'platform.record_restore_result(uuid,uuid,uuid,jsonb)', 'EXECUTE')
  );

do $$
declare
  v_manifest jsonb := jsonb_build_object(
    'backup_kind', 'logical',
    'source_environment', 'synthetic',
    'storage_locator', 'local-encrypted://serp037/source.dump.enc',
    'encryption_algorithm', 'AES-256-GCM',
    'encryption_key_reference', 'ephemeral/serp037/memory-only',
    'plaintext_sha256', repeat('a', 64),
    'ciphertext_sha256', repeat('b', 64),
    'plaintext_bytes', 100,
    'ciphertext_bytes', 128,
    'schema_version', '202608280029'
  );
  v_first jsonb;
  v_replay jsonb;
  v_conflict_denied boolean := false;
  v_admin_denied boolean := false;
  v_plaintext_denied boolean := false;
  v_backup_id uuid;
  v_restore jsonb;
  v_restore_replay jsonb;
  v_mismatch jsonb;
  v_production jsonb;
  v_immutable boolean := false;
begin
  v_first := platform.register_backup(
    '37000000-0000-4000-8000-000000000001',
    '37000000-0000-4000-8000-000000000101',
    '37000000-0000-4000-8000-000000000301',
    v_manifest
  );
  v_backup_id := (v_first->>'backup_id')::uuid;

  v_replay := platform.register_backup(
    '37000000-0000-4000-8000-000000000001',
    '37000000-0000-4000-8000-000000000101',
    '37000000-0000-4000-8000-000000000301',
    v_manifest
  );

  begin
    perform platform.register_backup(
      '37000000-0000-4000-8000-000000000001',
      '37000000-0000-4000-8000-000000000101',
      '37000000-0000-4000-8000-000000000301',
      jsonb_set(v_manifest, '{ciphertext_sha256}', to_jsonb(repeat('c', 64)))
    );
  exception when others then
    v_conflict_denied := sqlerrm = 'idempotency_key_conflict';
  end;

  begin
    perform platform.register_backup(
      '37000000-0000-4000-8000-000000000002',
      '37000000-0000-4000-8000-000000000102',
      '37000000-0000-4000-8000-000000000302',
      v_manifest
    );
  exception when others then
    v_admin_denied := sqlerrm = 'backup_admin_required';
  end;

  begin
    perform platform.register_backup(
      '37000000-0000-4000-8000-000000000001',
      '37000000-0000-4000-8000-000000000101',
      '37000000-0000-4000-8000-000000000303',
      jsonb_set(v_manifest, '{encryption_algorithm}', '"none"'::jsonb)
    );
  exception when others then
    v_plaintext_denied := sqlerrm = 'aes_256_gcm_required';
  end;

  v_restore := platform.record_restore_result(
    v_backup_id,
    '37000000-0000-4000-8000-000000000101',
    '37000000-0000-4000-8000-000000000401',
    jsonb_build_object(
      'target_environment', 'scratch',
      'decrypted_plaintext_sha256', repeat('a', 64),
      'expected_manifest', jsonb_build_object('tables', 47, 'fixture_digest', repeat('d', 64)),
      'actual_manifest', jsonb_build_object('tables', 47, 'fixture_digest', repeat('d', 64))
    )
  );

  v_restore_replay := platform.record_restore_result(
    v_backup_id,
    '37000000-0000-4000-8000-000000000101',
    '37000000-0000-4000-8000-000000000401',
    jsonb_build_object(
      'target_environment', 'scratch',
      'decrypted_plaintext_sha256', repeat('a', 64),
      'expected_manifest', jsonb_build_object('tables', 47, 'fixture_digest', repeat('d', 64)),
      'actual_manifest', jsonb_build_object('tables', 47, 'fixture_digest', repeat('d', 64))
    )
  );

  v_mismatch := platform.record_restore_result(
    v_backup_id,
    '37000000-0000-4000-8000-000000000101',
    '37000000-0000-4000-8000-000000000402',
    jsonb_build_object(
      'target_environment', 'scratch',
      'decrypted_plaintext_sha256', repeat('a', 64),
      'expected_manifest', jsonb_build_object('tables', 47),
      'actual_manifest', jsonb_build_object('tables', 46)
    )
  );

  v_production := platform.record_restore_result(
    v_backup_id,
    '37000000-0000-4000-8000-000000000101',
    '37000000-0000-4000-8000-000000000403',
    jsonb_build_object(
      'target_environment', 'production',
      'decrypted_plaintext_sha256', repeat('a', 64),
      'expected_manifest', jsonb_build_object('tables', 47),
      'actual_manifest', jsonb_build_object('tables', 47)
    )
  );

  begin
    update platform.backup_catalogue set schema_version = 'tampered' where id = v_backup_id;
  exception when others then
    v_immutable := sqlerrm like '%append-only%';
  end;

  insert into serp037_results values
    ('encrypted_backup_registered', 'one encrypted catalogue row plus audit',
      v_first::text,
      (v_first->>'ok')::boolean
        and not (v_first->>'replayed')::boolean
        and (select count(*) = 1 from platform.backup_catalogue where id = v_backup_id)
        and exists (select 1 from public.audit_events where object_id = v_backup_id and action = 'backup.registered')),
    ('identical_replay', 'same durable winner; no duplicate audit',
      v_replay::text,
      (v_replay->>'replayed')::boolean
        and v_replay->>'backup_id' = v_first->>'backup_id'
        and (select count(*) = 1 from platform.backup_catalogue where request_key = '37000000-0000-4000-8000-000000000301')),
    ('conflicting_replay_denied', 'idempotency_key_conflict', v_conflict_denied::text, v_conflict_denied),
    ('cross_tenant_non_admin_denied', 'backup_admin_required and zero Tenant B rows', v_admin_denied::text,
      v_admin_denied and not exists (select 1 from platform.backup_catalogue where organisation_id = '37000000-0000-4000-8000-000000000002')),
    ('plaintext_manifest_denied', 'aes_256_gcm_required and no mutation', v_plaintext_denied::text, v_plaintext_denied),
    ('scratch_restore_verified', 'verified and attributable', v_restore::text,
      (v_restore->>'ok')::boolean
        and exists (select 1 from public.audit_events where action = 'restore.verified' and object_id = (v_restore->>'restore_report_id')::uuid)),
    ('restore_replay', 'same durable restore report', v_restore_replay::text,
      (v_restore_replay->>'replayed')::boolean
        and v_restore_replay->>'restore_report_id' = v_restore->>'restore_report_id'),
    ('reconciliation_mismatch_fails_closed', 'failed report and attributable audit', v_mismatch::text,
      not (v_mismatch->>'ok')::boolean
        and v_mismatch->>'error' = 'restore_reconciliation_mismatch'
        and exists (select 1 from public.audit_events where action = 'restore.failed' and object_id = (v_mismatch->>'restore_report_id')::uuid)),
    ('production_restore_forbidden', 'failed report target_environment_must_be_non_production', v_production::text,
      not (v_production->>'ok')::boolean and v_production->>'error' = 'target_environment_must_be_non_production'),
    ('catalogue_immutable', 'update rejected as append-only', v_immutable::text, v_immutable);
end
$$;

table serp037_results;

do $$
begin
  if exists (select 1 from serp037_results where not passed) then
    raise exception 'SERP-037 backup contract probe failed';
  end if;
end
$$;

rollback;
