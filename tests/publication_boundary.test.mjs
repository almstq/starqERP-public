/**
 * SERP-125 — permissioned publication boundary, CI gate.
 *
 * The behavioural proof lives in tests/publication_boundary_probe.sql, which
 * needs Docker and therefore does not run in CI (no .sql probe does — see
 * .github/workflows/ci.yml). That leaves the boundary unguarded between local
 * probe runs, which is exactly the window in which someone widens a projection
 * "just to add a description field".
 *
 * This gate closes that window. It reads the migration and asserts the
 * properties the probe proves behaviourally, so a change that would make the
 * probe go red fails in CI first.
 *
 * Run: node tests/publication_boundary.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');

const MIGRATION = path.join(
  ROOT, 'supabase', 'migrations', '202609031046_permissioned_publication_boundary.sql'
);
const PROBE = path.join(ROOT, 'tests', 'publication_boundary_probe.sql');
const FIXTURE = path.join(ROOT, 'tests', 'publication_boundary_fixture.sql');
const RUNNER = path.join(ROOT, 'tests', 'run_publication_boundary_probe.ps1');

console.log('=== SERP-125: Permissioned Publication Boundary ===');

let passed = 0;
const ok = (label) => { console.log(`  ✓ PASS: ${label}`); passed += 1; };

// --- 1. Artefacts exist -------------------------------------------------------
for (const [p, label] of [
  [MIGRATION, 'migration 202609031046'],
  [PROBE, 'behavioural probe'],
  [FIXTURE, 'synthetic fixture'],
  [RUNNER, 'probe runner'],
]) {
  assert.ok(fs.existsSync(p), `${label} must exist at ${p}`);
}
ok('all four SERP-125 artefacts are present');

const sql = fs.readFileSync(MIGRATION, 'utf8');
const probe = fs.readFileSync(PROBE, 'utf8');
const runner = fs.readFileSync(RUNNER, 'utf8');

// --- 2. Private by default ----------------------------------------------------
assert.ok(
  /state\s+text\s+not\s+null\s+default\s+'revoked'/.test(sql),
  "product_publications.state must default to 'revoked' — nothing publishable by default"
);
ok("state defaults to 'revoked' (AC1: nothing publishable by default)");

// --- 3. Projection, not a filter ---------------------------------------------
assert.ok(
  /create table public\.product_publications/.test(sql),
  'the publishable surface must be its own table, not a column on products'
);
assert.ok(
  !/alter table public\.products\s+add column/i.test(sql),
  'SERP-125 must NOT add a publication flag to public.products — a flag over the full record leaks every future column by default'
);
for (const forbidden of ['income_account', 'cogs_account', 'inventory_account', 'unit_cost', 'supplier']) {
  const inFeed = new RegExp(`create view public\\.publication_feed[\\s\\S]*?${forbidden}[\\s\\S]*?;`, 'i');
  assert.ok(
    !inFeed.test(sql),
    `publication_feed must never expose ${forbidden} — that is private ERP data`
  );
}
ok('publishable surface is a narrow named projection, no private columns (AC3)');

// --- 4. The read path is RLS-scoped, not owner-scoped -------------------------
assert.ok(
  /create view public\.publication_feed\s*\n?\s*with \(security_invoker = true\)/.test(sql),
  'publication_feed must be security_invoker — otherwise it runs as owner and silently bypasses the row policy, making the boundary a property of ownership rather than a stated rule'
);
assert.ok(
  /where p\.state = 'published'/.test(sql),
  'publication_feed must filter to published rows only (AC2)'
);
ok('read path is security_invoker and published-only (AC2)');

// --- 5. Merchant-controlled ---------------------------------------------------
const seatGates = sql.match(/target_seat not in \('owner', 'managing_director', 'director'\)/g) || [];
assert.equal(
  seatGates.length, 2,
  'both api_publish_product and api_revoke_publication must gate on the owner/managing_director/director seats — publication is an ownership decision, not a counter one'
);
ok('publish and revoke are both seat-gated to merchant control (AC1)');

// --- 6. Every act is audited --------------------------------------------------
for (const action of ['erp.publish', 'erp.unpublish']) {
  assert.ok(
    sql.includes(`'${action}', 'publication'`),
    `${action} must write a public.audit_events row with object_type 'publication'`
  );
}
assert.equal(
  (sql.match(/insert into public\.audit_events/g) || []).length, 2,
  'exactly two audit writes — one per publication act; a state change without an audit row is not an explicit act'
);
ok('publish and revoke each write an audit_events row (AC1)');

// --- 7. Revocation is a state, never a delete --------------------------------
assert.ok(
  /set state = 'revoked'/.test(sql),
  'revocation must set state, not delete (RULE 2, AC4)'
);
assert.ok(
  !/delete from public\.product_publications/.test(sql),
  'the migration must contain no delete against product_publications — RULE 2, nothing is deleted'
);
ok('revocation is a state change, not a delete (AC4 / RULE 2)');

// --- 8. Nothing is opened to anon --------------------------------------------
assert.ok(
  /revoke all on public\.product_publications from anon, authenticated/.test(sql) &&
  /revoke all on public\.publication_feed from anon, authenticated/.test(sql),
  'both the table and the feed must be revoked from anon and authenticated — opening the door to a public reader is a separate, deliberate decision for the Hoadhaa era'
);
assert.ok(
  !/grant .*to anon/i.test(sql),
  'SERP-125 must not grant anon anything'
);
ok('no anon grant — the boundary is built before the door is opened');

// --- 9. The probe has real negative controls ---------------------------------
for (const control of [
  'SimulateWideProjection', 'SimulateLeakyPolicy', 'SimulateOwnerScopedView',
  'SimulateSeatBypass', 'SimulateHardDelete',
]) {
  assert.ok(runner.includes(control), `runner must keep the ${control} negative control`);
}
assert.ok(
  probe.includes('POSITIVE CONTROL'),
  'the probe must assert a published row IS visible — otherwise an empty table passes as isolation'
);
ok('probe retains 5 negative controls and a positive control (DEC-072)');

console.log(`\n=== All SERP-125 Publication Boundary Gates Passed (${passed}/${passed}) ===`);
