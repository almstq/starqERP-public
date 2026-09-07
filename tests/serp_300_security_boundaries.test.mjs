import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const combinedMigrations = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'))
  .join('\n');
const edge = fs.readFileSync(
  path.join(root, 'supabase', 'functions', 'starq-api', 'index.ts'),
  'utf8',
);

function lastFunctionDefinition(qualifiedName) {
  const escaped = qualifiedName.replaceAll('.', '\\.');
  const pattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${escaped}\\s*\\([\\s\\S]*?\\$\\$;`,
    'gi',
  );
  const definitions = [...combinedMigrations.matchAll(pattern)];
  assert.ok(definitions.length > 0, `${qualifiedName} must have a checked-in definition`);
  return definitions.at(-1)[0];
}

test('SERP-300: invitation SECURITY DEFINER RPC is service-role only', () => {
  const invitationRpc = lastFunctionDefinition('public.accept_staff_invitation');
  assert.match(invitationRpc, /\bSECURITY\s+DEFINER\b/i);
  assert.match(
    combinedMigrations,
    /revoke\s+all\s+on\s+function\s+public\.accept_staff_invitation\s*\(\s*uuid\s*,\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i,
    'accept_staff_invitation must explicitly revoke PUBLIC, anon, and authenticated execution',
  );
  assert.match(
    combinedMigrations,
    /grant\s+execute\s+on\s+function\s+public\.accept_staff_invitation\s*\(\s*uuid\s*,\s*uuid\s*\)\s+to\s+service_role\s*;/i,
    'accept_staff_invitation must be callable only through the server-authoritative service role path',
  );
});

test('SERP-300: provisioning SECURITY DEFINER RPC is service-role only', () => {
  const provisioningRpc = lastFunctionDefinition('platform.provision_approved_application');
  assert.match(provisioningRpc, /\bSECURITY\s+DEFINER\b/i);
  assert.match(
    combinedMigrations,
    /revoke\s+all\s+on\s+function\s+platform\.provision_approved_application\s*\(\s*uuid\s*,\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i,
    'provision_approved_application must explicitly revoke PUBLIC, anon, and authenticated execution',
  );
  assert.match(
    combinedMigrations,
    /grant\s+execute\s+on\s+function\s+platform\.provision_approved_application\s*\(\s*uuid\s*,\s*uuid\s*\)\s+to\s+service_role\s*;/i,
    'provision_approved_application must remain callable only by service_role',
  );
});

test('SERP-300: invitation migration targets the canonical membership and audit schema', () => {
  const invitationRpc = lastFunctionDefinition('public.accept_staff_invitation');
  assert.doesNotMatch(invitationRpc, /p_verified_email/i);
  assert.match(invitationRpc, /verified_email/is);
  assert.match(invitationRpc, /external_subject\s+is\s+not\s+null/is);
  assert.doesNotMatch(invitationRpc, /\bmemberships\s*\([^)]*\brole\b/is);
  assert.doesNotMatch(invitationRpc, /\bmemberships\s*\([^)]*\bupdated_at\b/is);
  assert.doesNotMatch(invitationRpc, /\bmembership_seats\s*\([^)]*\bcreated_at\b/is);
  assert.match(invitationRpc, /audit_events\s*\([^)]*\bactor_person_id\b/is);
  assert.match(invitationRpc, /audit_events\s*\([^)]*\baction\b/is);
  assert.match(invitationRpc, /audit_events\s*\([^)]*\bmetadata\b/is);
});

test('SERP-300: provisioning RPC targets the canonical organisation and workflow schema', () => {
  const provisioningRpc = lastFunctionDefinition('platform.provision_approved_application');
  assert.doesNotMatch(provisioningRpc, /organisations\s*\([^)]*\bname\b/is);
  assert.doesNotMatch(provisioningRpc, /locations\s*\([^)]*\bisland\b/is);
  assert.doesNotMatch(provisioningRpc, /workflow_templates\s*\([^)]*\bis_active\b/is);
  assert.match(provisioningRpc, /organisations\s*\([^)]*\blegal_name\b/is);
  assert.match(provisioningRpc, /workflow_templates\s*\([^)]*\bworkflow_code\b/is);
});

test('SERP-300: tenant invitation API is explicitly limited to administrative seats', () => {
  const invitationBlock = edge.slice(
    edge.indexOf('// Staff Invitation & Authorization Lifecycle Routes'),
    edge.indexOf('if (req.method === "POST" && path === "/api/ops/event")'),
  );
  assert.ok(invitationBlock.length > 0, 'invitation route block must be present');
  assert.match(
    invitationBlock,
    /invitation_admin_required/,
    'the invitation route block must reject non-administrative sessions before reads or writes',
  );
  assert.match(
    invitationBlock,
    /managing_director/,
    'the server-side invitation gate must name the allowed administrative seat',
  );
});

test('SERP-300: tenant context switching validates both membership and book assignment', () => {
  const switchBlock = edge.slice(
    edge.indexOf('if (req.method === "POST" && (path === "/api/auth/context"'),
    edge.indexOf('// Onboarding & Business Registration Application Routes'),
  );
  assert.ok(switchBlock.length > 0, 'context-switch route block must be present');
  assert.match(switchBlock, /book_memberships/);
  assert.match(switchBlock, /membership_id/);
  assert.match(switchBlock, /book_access_denied/);
});

test('SERP-300: database seat revocation cannot become managing-director authority by fallback', () => {
  assert.doesNotMatch(
    edge,
    /if\s*\(seats\.length\s*===\s*0\)\s*{\s*seats\s*=\s*\[\s*["']managing_director["']\s*\]/s,
  );
  assert.doesNotMatch(edge, /memberships[^\n]*select\(["'][^"']*\brole\b/);
});

test('SERP-300: book-scoped API reads apply the active book filter', () => {
  const routes = [
    '/api/ops/invoices',
    '/api/ops/expenses',
    '/api/ops/payments',
    '/api/ops/purchase-orders',
    '/api/ops/jobs',
    '/api/ops/audit',
  ];
  for (const route of routes) {
    const start = edge.indexOf(`path === "${route}"`);
    const end = edge.indexOf('\n    if (req.method', start + 1);
    const block = edge.slice(start, end === -1 ? undefined : end);
    assert.ok(start >= 0, `${route} route must exist`);
    assert.match(block, /\.eq\("book_id",\s*session\.book_id\)/, `${route} must filter by active book`);
  }
});
