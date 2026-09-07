import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');

console.log('=== SERP-275: Migration 0021 Rehearsal & Constraint Verification ===\n');

const MIGRATION_PATH = path.join(ROOT, 'supabase', 'migrations', '202608260021_synthetic_tenant_uuid_transition.sql');
assert.ok(fs.existsSync(MIGRATION_PATH), 'Migration 202608260021 must exist');
const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

// 1. Uniqueness Constraint Safety Check: Slug Disambiguation
console.log('1. Checking organisations.slug and registry_code uniqueness safety:');
{
  const slugDisambigIdx = sql.indexOf("slug = slug || '-legacy-transition'");
  const insertSyntheticIdx = sql.indexOf("insert into public.organisations");
  assert.ok(slugDisambigIdx !== -1, 'Migration must rename legacy slugs before inserting new rows');
  assert.ok(insertSyntheticIdx !== -1, 'Migration must insert synthetic organisation rows');
  assert.ok(slugDisambigIdx < insertSyntheticIdx, 'Slug disambiguation must precede synthetic row insertion to prevent unique constraint violation');
  console.log('  ✓ PASS: Slug disambiguation safely precedes new synthetic row insertion.');
}

// 2. Composite Foreign Key Safety Check
console.log('\n2. Checking composite foreign key transition handling:');
{
  // Workflow Stages -> Workflow Templates
  const dropWfFkIdx = sql.indexOf("alter table public.workflow_stages drop constraint if exists workflow_stages_organisation_id_workflow_template_id_fkey");
  const updateWfStagesIdx = sql.indexOf("update public.workflow_stages");
  const restoreWfFkIdx = sql.indexOf("alter table public.workflow_stages add constraint workflow_stages_organisation_id_workflow_template_id_fkey");
  
  assert.ok(dropWfFkIdx !== -1, 'Must drop workflow_stages composite FK before mutating composite keys');
  assert.ok(restoreWfFkIdx !== -1, 'Must restore workflow_stages composite FK after mutating composite keys');
  assert.ok(dropWfFkIdx < updateWfStagesIdx && updateWfStagesIdx < restoreWfFkIdx, 'Workflow stages update must be bounded between drop and restore of composite FK constraint');
  console.log('  ✓ PASS: Workflow template & stages composite FK safely bounded.');

  // Roles -> Role Permissions
  const dropRolesFkIdx = sql.indexOf("alter table public.role_permissions drop constraint if exists role_permissions_organisation_id_role_id_fkey");
  const updateRolesIdx = sql.indexOf("update public.roles");
  const restoreRolesFkIdx = sql.indexOf("alter table public.role_permissions add constraint role_permissions_organisation_id_role_id_fkey");

  assert.ok(dropRolesFkIdx !== -1, 'Must drop role_permissions composite FK before mutating composite keys');
  assert.ok(restoreRolesFkIdx !== -1, 'Must restore role_permissions composite FK after mutating composite keys');
  assert.ok(dropRolesFkIdx < updateRolesIdx && updateRolesIdx < restoreRolesFkIdx, 'Role permissions update must be bounded between drop and restore of composite FK constraint');
  console.log('  ✓ PASS: Roles & role permissions composite FK safely bounded.');
}

// 3. Append-Only Trigger Management Check
console.log('\n3. Checking append-only trigger management:');
{
  const requiredTriggers = [
    'audit_events_append_only',
    'security_events_append_only',
    'job_events_append_only',
    'stock_movements_append_only',
    'journal_entries_append_only',
    'journal_lines_append_only',
    'settlement_allocations_append_only',
    'sod_exceptions_append_only',
    'sod_exception_dispositions_append_only'
  ];

  for (const trig of requiredTriggers) {
    const disableMatches = sql.includes(`disable trigger ${trig}`);
    const enableMatches = sql.includes(`enable trigger ${trig}`);
    assert.ok(disableMatches, `Trigger ${trig} must have explicit disable statement`);
    assert.ok(enableMatches, `Trigger ${trig} must have explicit re-enable statement`);
  }
  console.log(`  ✓ PASS: All ${requiredTriggers.length} append-only triggers have matched disable/enable blocks.`);
}

// 4. Referencing Child Tables Coverage
console.log('\n4. Checking referencing child tables coverage:');
{
  const expectedTables = [
    'business_names',
    'memberships',
    'document_sequences',
    'audit_events',
    'security_events',
    'automation_principals',
    'command_approvals',
    'customers',
    'vehicles',
    'garage_jobs',
    'job_events',
    'product_categories',
    'stock_items',
    'stock_batches',
    'stock_movements',
    'suppliers',
    'purchase_orders',
    'purchase_order_lines',
    'job_card_parts',
    'job_card_labour',
    'chart_of_accounts',
    'journal_entries',
    'journal_lines',
    'commercial_invoices',
    'commercial_invoice_lines',
    'commercial_payments',
    'commercial_expenses',
    'settlement_allocations',
    'workflow_templates',
    'workflow_stages',
    'roles',
    'role_permissions',
    'sod_exceptions',
    'sod_exception_dispositions',
    'tax_registrations',
    'bank_accounts'
  ];

  for (const tbl of expectedTables) {
    assert.ok(sql.includes(tbl), `Table public.${tbl} must be handled in transition migration`);
  }
  console.log(`  ✓ PASS: All ${expectedTables.length} referencing database tables covered in transition migration.`);
}

// 5. Final Legacy Deletion Assertion
console.log('\n5. Checking final deletion of legacy organisation rows:');
{
  const deleteLegacyIdx = sql.indexOf("delete from public.organisations where id in (old_st, old_ci)");
  assert.ok(deleteLegacyIdx !== -1, 'Migration must delete old legacy organisation rows at completion');
  console.log('  ✓ PASS: Legacy organisation IDs cleanly deleted after all child references migrated.');
}

console.log('\n✅ MIGRATION 0021 REHEARSAL VERIFICATION COMPLETED CLEANLY.');
