import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const edgePath = new URL('supabase/functions/starq-api/index.ts', root);
const migrationPath = new URL('supabase/migrations/202608250017_tax_regimes_and_periods.sql', root);

test('SERP-339 Item 5: finance HOLD gates the invoice RPC', async () => {
  const edge = await fs.readFile(edgePath, 'utf8');
  const hold = edge.indexOf('if (decision.status === "HOLD" || !decision.value)');
  const rpc = edge.indexOf('db.rpc("api_garage_command"');
  assert.notEqual(hold, -1);
  assert.ok(hold < rpc, 'HOLD must return before api_garage_command');
  assert.match(edge, /error: "finance_hold"/);
});

test('SERP-339 Item 5: READY overrides caller-supplied invoice figures', async () => {
  const edge = await fs.readFile(edgePath, 'utf8');
  assert.match(edge, /subtotal: decision\.value\.subtotal/);
  assert.match(edge, /gst_amount: decision\.value\.gstAmount/);
  assert.match(edge, /total_amount: decision\.value\.totalAmount/);
  assert.match(edge, /finance_decision: decision/);
});

test('SERP-339 Item 5: authoritative tax function signature is preserved', async () => {
  const migration = await fs.readFile(migrationPath, 'utf8');
  assert.match(
    migration,
    /calculate_line_tax\(\s*\n\s*target_org uuid,\s*\n\s*target_tax_type text,\s*\n\s*supply_date date,\s*\n\s*tax_mode text,\s*\n\s*line_amount numeric/s,
  );
});

test('SERP-339 Item 5: the Edge-facing tax wrapper is service-role-only', async () => {
  const migration = await fs.readFile(
    new URL('supabase/migrations/202609060048_serp_339_invoice_finance_boundary.sql', root),
    'utf8',
  );
  assert.match(migration, /create or replace function public\.calculate_line_tax/);
  assert.match(migration, /revoke all on function public\.calculate_line_tax[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.calculate_line_tax[\s\S]*to service_role/);
});
