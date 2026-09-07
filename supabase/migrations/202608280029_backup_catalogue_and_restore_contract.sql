begin;

-- SERP-037: append-only backup catalogue and non-production restore evidence.
-- Backup bytes remain outside PostgreSQL. This catalogue stores only encrypted
-- artifact metadata, integrity digests, recovery evidence, and attribution.

create table platform.backup_catalogue (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  backup_kind text not null check (backup_kind in ('logical', 'snapshot', 'wal_archive')),
  source_environment text not null check (source_environment in ('production', 'staging', 'synthetic')),
  storage_locator text not null check (storage_locator ~ '^(s3|vault|local-encrypted)://'),
  encryption_algorithm text not null check (encryption_algorithm = 'AES-256-GCM'),
  encryption_key_reference text not null
    check (encryption_key_reference ~ '^(kms|vault|ephemeral)/[a-z0-9._/-]{1,119}$'),
  plaintext_sha256 text not null check (plaintext_sha256 ~ '^[0-9a-f]{64}$'),
  ciphertext_sha256 text not null check (ciphertext_sha256 ~ '^[0-9a-f]{64}$'),
  plaintext_bytes bigint not null check (plaintext_bytes > 0),
  ciphertext_bytes bigint not null check (ciphertext_bytes > plaintext_bytes),
  schema_version text not null,
  request_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.persons(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, request_key)
);

create table platform.restore_drill_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  backup_id uuid not null references platform.backup_catalogue(id),
  target_environment text not null,
  status text not null check (status in ('verified', 'failed')),
  decrypted_plaintext_sha256 text,
  expected_manifest jsonb,
  actual_manifest jsonb,
  reconciliation_sha256 text check (
    reconciliation_sha256 is null or reconciliation_sha256 ~ '^[0-9a-f]{64}$'
  ),
  error_code text,
  request_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  requested_by uuid not null references public.persons(id),
  recorded_at timestamptz not null default now(),
  check (
    (status = 'verified' and target_environment in ('scratch', 'staging') and error_code is null)
    or (status = 'failed' and error_code is not null)
  ),
  unique (organisation_id, request_key)
);

create trigger backup_catalogue_append_only
before update or delete on platform.backup_catalogue
for each row execute function app_private.reject_mutation();

create trigger restore_drill_reports_append_only
before update or delete on platform.restore_drill_reports
for each row execute function app_private.reject_mutation();

revoke all on platform.backup_catalogue, platform.restore_drill_reports
  from public, anon, authenticated, service_role;
grant select on platform.backup_catalogue, platform.restore_drill_reports
  to service_role;

create or replace function app_private.require_backup_admin(p_actor uuid)
returns void
language plpgsql
security definer
set search_path = platform, public, app_private, pg_temp
as $$
begin
  if not exists (
    select 1
    from platform.operator_principals op
    where op.person_id = p_actor
      and op.active = true
      and op.operator_role = 'platform_admin'
  ) then
    raise exception 'backup_admin_required';
  end if;
end;
$$;

revoke all on function app_private.require_backup_admin(uuid)
  from public, anon, authenticated;

create or replace function platform.register_backup(
  target_org uuid,
  p_actor uuid,
  p_request_key uuid,
  p_manifest jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = platform, public, app_private, extensions, pg_temp
as $$
declare
  v_existing platform.backup_catalogue%rowtype;
  v_id uuid := gen_random_uuid();
  v_request_hash text := app_private.canonical_jsonb_sha256(p_manifest);
  v_plaintext_sha text := lower(coalesce(p_manifest->>'plaintext_sha256', ''));
  v_ciphertext_sha text := lower(coalesce(p_manifest->>'ciphertext_sha256', ''));
  v_plaintext_bytes bigint;
  v_ciphertext_bytes bigint;
  v_response jsonb;
begin
  perform app_private.require_backup_admin(p_actor);

  if not exists (select 1 from public.organisations where id = target_org) then
    raise exception 'organisation_not_found';
  end if;

  begin
    v_plaintext_bytes := (p_manifest->>'plaintext_bytes')::bigint;
    v_ciphertext_bytes := (p_manifest->>'ciphertext_bytes')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'backup_size_invalid';
  end;

  if coalesce(p_manifest->>'backup_kind', '') not in ('logical', 'snapshot', 'wal_archive') then
    raise exception 'backup_kind_invalid';
  end if;
  if coalesce(p_manifest->>'source_environment', '') not in ('production', 'staging', 'synthetic') then
    raise exception 'backup_source_environment_invalid';
  end if;
  if coalesce(p_manifest->>'storage_locator', '') !~ '^(s3|vault|local-encrypted)://' then
    raise exception 'encrypted_storage_locator_required';
  end if;
  if coalesce(p_manifest->>'encryption_algorithm', '') <> 'AES-256-GCM' then
    raise exception 'aes_256_gcm_required';
  end if;
  if coalesce(p_manifest->>'encryption_key_reference', '') !~ '^(kms|vault|ephemeral)/[a-z0-9._/-]{1,119}$' then
    raise exception 'non_secret_key_reference_required';
  end if;
  if v_plaintext_sha !~ '^[0-9a-f]{64}$' or v_ciphertext_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'backup_sha256_invalid';
  end if;
  if v_plaintext_sha = v_ciphertext_sha then
    raise exception 'ciphertext_must_differ_from_plaintext';
  end if;
  if v_plaintext_bytes <= 0 or v_ciphertext_bytes <= v_plaintext_bytes then
    raise exception 'encrypted_backup_size_invalid';
  end if;
  if nullif(btrim(p_manifest->>'schema_version'), '') is null then
    raise exception 'schema_version_required';
  end if;

  begin
    insert into platform.backup_catalogue (
      id, organisation_id, backup_kind, source_environment, storage_locator,
      encryption_algorithm, encryption_key_reference, plaintext_sha256,
      ciphertext_sha256, plaintext_bytes, ciphertext_bytes, schema_version,
      request_key, request_hash, created_by
    ) values (
      v_id,
      target_org,
      p_manifest->>'backup_kind',
      p_manifest->>'source_environment',
      p_manifest->>'storage_locator',
      p_manifest->>'encryption_algorithm',
      p_manifest->>'encryption_key_reference',
      v_plaintext_sha,
      v_ciphertext_sha,
      v_plaintext_bytes,
      v_ciphertext_bytes,
      btrim(p_manifest->>'schema_version'),
      p_request_key,
      v_request_hash,
      p_actor
    );
  exception when unique_violation then
    select * into v_existing
    from platform.backup_catalogue
    where organisation_id = target_org and request_key = p_request_key;

    if not found then
      raise exception 'backup_replay_missing';
    end if;
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_conflict';
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'backup_id', v_existing.id,
      'ciphertext_sha256', v_existing.ciphertext_sha256
    );
  end;

  insert into public.audit_events (
    organisation_id, actor_person_id, action, object_type, object_id,
    request_id, after_state, metadata
  ) values (
    target_org,
    p_actor,
    'backup.registered',
    'backup_catalogue',
    v_id,
    p_request_key,
    jsonb_build_object(
      'backup_kind', p_manifest->>'backup_kind',
      'source_environment', p_manifest->>'source_environment',
      'schema_version', p_manifest->>'schema_version'
    ),
    jsonb_build_object(
      'encryption_algorithm', p_manifest->>'encryption_algorithm',
      'encryption_key_reference', p_manifest->>'encryption_key_reference',
      'plaintext_sha256', v_plaintext_sha,
      'ciphertext_sha256', v_ciphertext_sha
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'backup_id', v_id,
    'ciphertext_sha256', v_ciphertext_sha
  );
  return v_response;
end;
$$;

revoke all on function platform.register_backup(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function platform.register_backup(uuid, uuid, uuid, jsonb)
  to service_role;

create or replace function platform.record_restore_result(
  p_backup_id uuid,
  p_actor uuid,
  p_request_key uuid,
  p_report jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = platform, public, app_private, extensions, pg_temp
as $$
declare
  v_backup platform.backup_catalogue%rowtype;
  v_existing platform.restore_drill_reports%rowtype;
  v_id uuid := gen_random_uuid();
  v_request_hash text := app_private.canonical_jsonb_sha256(p_report);
  v_target text := coalesce(p_report->>'target_environment', '');
  v_decrypted_sha text := lower(coalesce(p_report->>'decrypted_plaintext_sha256', ''));
  v_expected jsonb := p_report->'expected_manifest';
  v_actual jsonb := p_report->'actual_manifest';
  v_status text := 'verified';
  v_error text;
  v_reconciliation_sha text;
begin
  perform app_private.require_backup_admin(p_actor);

  select * into v_backup
  from platform.backup_catalogue
  where id = p_backup_id;
  if not found then
    raise exception 'backup_not_found';
  end if;

  if v_target not in ('scratch', 'staging') then
    v_status := 'failed';
    v_error := 'target_environment_must_be_non_production';
  elsif v_decrypted_sha !~ '^[0-9a-f]{64}$' or v_decrypted_sha <> v_backup.plaintext_sha256 then
    v_status := 'failed';
    v_error := 'decrypted_backup_digest_mismatch';
  elsif v_expected is null or v_actual is null or v_expected <> v_actual then
    v_status := 'failed';
    v_error := 'restore_reconciliation_mismatch';
  else
    v_reconciliation_sha := app_private.canonical_jsonb_sha256(v_actual);
  end if;

  begin
    insert into platform.restore_drill_reports (
      id, organisation_id, backup_id, target_environment, status,
      decrypted_plaintext_sha256, expected_manifest, actual_manifest,
      reconciliation_sha256, error_code, request_key, request_hash, requested_by
    ) values (
      v_id,
      v_backup.organisation_id,
      v_backup.id,
      v_target,
      v_status,
      nullif(v_decrypted_sha, ''),
      v_expected,
      v_actual,
      v_reconciliation_sha,
      v_error,
      p_request_key,
      v_request_hash,
      p_actor
    );
  exception when unique_violation then
    select * into v_existing
    from platform.restore_drill_reports
    where organisation_id = v_backup.organisation_id and request_key = p_request_key;

    if not found then
      raise exception 'restore_replay_missing';
    end if;
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_conflict';
    end if;
    return jsonb_build_object(
      'ok', v_existing.status = 'verified',
      'replayed', true,
      'restore_report_id', v_existing.id,
      'status', v_existing.status,
      'error', v_existing.error_code
    );
  end;

  insert into public.audit_events (
    organisation_id, actor_person_id, action, object_type, object_id,
    request_id, after_state, metadata
  ) values (
    v_backup.organisation_id,
    p_actor,
    case when v_status = 'verified' then 'restore.verified' else 'restore.failed' end,
    'restore_drill_report',
    v_id,
    p_request_key,
    jsonb_build_object('status', v_status, 'error_code', v_error),
    jsonb_build_object(
      'backup_id', v_backup.id,
      'target_environment', v_target,
      'reconciliation_sha256', v_reconciliation_sha
    )
  );

  return jsonb_build_object(
    'ok', v_status = 'verified',
    'replayed', false,
    'restore_report_id', v_id,
    'status', v_status,
    'error', v_error
  );
end;
$$;

revoke all on function platform.record_restore_result(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function platform.record_restore_result(uuid, uuid, uuid, jsonb)
  to service_role;

commit;
