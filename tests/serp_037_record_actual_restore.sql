\set ON_ERROR_STOP on

with registered as (
  select platform.register_backup(
    '37000000-0000-4000-8000-000000000001',
    '37000000-0000-4000-8000-000000000101',
    '37000000-0000-4000-8000-000000000501',
    jsonb_build_object(
      'backup_kind', 'logical',
      'source_environment', 'synthetic',
      'storage_locator', 'local-encrypted://serp037/serp037-source.dump.aesgcm',
      'encryption_algorithm', 'AES-256-GCM',
      'encryption_key_reference', 'ephemeral/serp037/memory-only',
      'plaintext_sha256', :'plaintext_sha',
      'ciphertext_sha256', :'ciphertext_sha',
      'plaintext_bytes', :'plaintext_bytes'::bigint,
      'ciphertext_bytes', :'ciphertext_bytes'::bigint,
      'schema_version', '202608280029'
    )
  ) as response
), backup as (
  select (response->>'backup_id')::uuid as id from registered
), restored as (
  select platform.record_restore_result(
    backup.id,
    '37000000-0000-4000-8000-000000000101',
    '37000000-0000-4000-8000-000000000502',
    jsonb_build_object(
      'target_environment', 'scratch',
      'decrypted_plaintext_sha256', :'plaintext_sha',
      'expected_manifest', :'source_manifest'::jsonb,
      'actual_manifest', :'scratch_manifest'::jsonb
    )
  ) as response
  from backup
)
select jsonb_build_object(
  'backup', (select response from registered),
  'restore', (select response from restored)
) as actual_recovery_evidence;
