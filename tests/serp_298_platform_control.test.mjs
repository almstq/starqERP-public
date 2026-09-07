import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('platform Edge routes use service-only RPCs with admin and idempotency gates', async () => {
  const source = await read('supabase/functions/starq-api/index.ts');
  assert.match(source, /GET" && path === "\/api\/platform\/tenants"/);
  assert.match(source, /schema\("platform"\)\.rpc\("list_tenants"/);
  assert.match(source, /operator_role !== "platform_admin"/);
  assert.match(source, /valid_idempotency_key_required/);
  assert.match(source, /rpc\("provision_tenant"/);
  assert.match(source, /rpc\("set_tenant_status"/);
});

test('HQ tenant UI reads the API and does not import the mock platform registry', async () => {
  const source = await read('web/src/components/platform/StarqHQTenants.tsx');
  assert.match(source, /getPlatformTenants/);
  assert.match(source, /setPlatformTenantStatus/);
  assert.doesNotMatch(source, /PLATFORM_CLIENTS_REGISTRY|mockData/);
});

test('HQ provisioning submits selected archetype and owner invitation data', async () => {
  const source = await read('web/src/components/platform/StarqHQProvisioning.tsx');
  assert.match(source, /provisionPlatformTenant\(form\)/);
  assert.match(source, /archetype_id/);
  assert.match(source, /owner_email/);
  assert.match(source, /owner_invitation_id/);
});

test('migration binds suspension to canonical RLS and makes operator audit append-only', async () => {
  const source = await read('supabase/migrations/202608290030_platform_tenant_control_plane.sql');
  assert.match(source, /o\.status = 'active'/);
  assert.match(source, /operator_audit_append_only/);
  assert.match(source, /revoke all on platform\.operator_audit/);
  assert.match(source, /grant execute on function platform\.list_tenants/);
});
