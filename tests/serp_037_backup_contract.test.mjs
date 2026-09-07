import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/202608280029_backup_catalogue_and_restore_contract.sql'),
  'utf8',
);
const harness = fs.readFileSync(
  path.join(here, 'run_serp_037_backup_restore_probe.ps1'),
  'utf8',
);

test('SERP-037: catalogue writes are function-only for service_role', () => {
  assert.match(
    migration,
    /revoke\s+all\s+on\s+platform\.backup_catalogue\s*,\s*platform\.restore_drill_reports[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/i,
  );
  assert.match(
    migration,
    /grant\s+select\s+on\s+platform\.backup_catalogue\s*,\s*platform\.restore_drill_reports\s+to\s+service_role\s*;/i,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(?:[^;]*,\s*)?insert\s+on\s+platform\.(?:backup_catalogue|restore_drill_reports)/i,
  );
});

test('SERP-037: privileged RPCs are service-role-only SECURITY DEFINER boundaries', () => {
  for (const signature of [
    'platform.register_backup(uuid, uuid, uuid, jsonb)',
    'platform.record_restore_result(uuid, uuid, uuid, jsonb)',
  ]) {
    const escaped = signature.replaceAll('.', '\\.').replaceAll('(', '\\(').replaceAll(')', '\\)');
    assert.match(migration, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${escaped}[\\s\\S]*?from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${escaped}[\\s\\S]*?to\\s+service_role`, 'i'));
  }
  assert.equal((migration.match(/security\s+definer/gi) ?? []).length >= 3, true);
});

test('SERP-037: encrypted artifact key is memory-only and zeroed', () => {
  assert.match(harness, /AesGcm/);
  assert.match(harness, /RandomNumberGenerator\]::Fill\(\$key\)/);
  assert.match(harness, /CryptographicOperations\]::ZeroMemory\(\$key\)/);
  assert.doesNotMatch(harness, /WriteAllBytes\([^\r\n]*\$key/i);
  assert.match(harness, /pgRestore\s+--list\s+\$encryptedDump/);
});

test('SERP-037: destructive database scope is fixed to synthetic local names', () => {
  assert.match(harness, /\$sourceDatabase\s*=\s*'serp037_source'/);
  assert.match(harness, /\$scratchDatabase\s*=\s*'serp037_scratch'/);
  assert.match(harness, /D:\\StarqTech\\_tmp\\serp037/);
  assert.doesNotMatch(harness, /supabase\.co|DATABASE_URL|productionDatabase/i);
});
