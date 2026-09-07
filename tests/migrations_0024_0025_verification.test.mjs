import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');

console.log('=== SERP-284: Live Migrations 0024 & 0025 Verification Suite ===\n');

// 1. Migration 0024: Platform Control Plane Architecture Verification
const MIGRATION_0024_PATH = path.join(ROOT, 'supabase', 'migrations', '202608270024_platform_control_plane.sql');
assert.ok(fs.existsSync(MIGRATION_0024_PATH), 'Migration 202608270024 must exist');
const sql0024 = fs.readFileSync(MIGRATION_0024_PATH, 'utf8');

console.log('1. Verifying Migration 0024 (Platform Control Plane):');
{
  // Schema creation
  assert.ok(sql0024.includes('create schema if not exists platform;'), 'Must create dedicated platform schema');
  
  // Tenant Registry
  assert.ok(sql0024.includes('create table platform.tenant_registry'), 'Must create platform.tenant_registry table');
  assert.ok(sql0024.includes("'general_business', 'automotive_workshop'"), 'Must include supported archetypes in check constraint');
  assert.ok(sql0024.includes('subscription_status in (\'pending\', \'trial\', \'active\', \'past_due\', \'cancelled\')'), 'Must validate subscription statuses');
  assert.ok(sql0024.includes('provisioning_status in (\'requested\', \'provisioning\', \'ready\', \'failed\', \'suspended\')'), 'Must validate provisioning statuses');
  
  // Usage & Telemetry
  assert.ok(sql0024.includes('create table platform.usage_daily'), 'Must create platform.usage_daily table');
  
  // Operator Principals & MFA
  assert.ok(sql0024.includes('create table platform.operator_principals'), 'Must create platform.operator_principals table');
  assert.ok(sql0024.includes('operator_role in (\'platform_support\', \'platform_admin\')'), 'Must validate operator roles');
  
  // Provisioning Runs
  assert.ok(sql0024.includes('create table platform.provisioning_runs'), 'Must create platform.provisioning_runs table');
  assert.ok(sql0024.includes('mode in (\'clean_production\', \'demo_sample\')'), 'Must enforce mode-specific provisioning');

  // Strict Privilege Isolation
  assert.ok(sql0024.includes('revoke all on schema platform from public, anon, authenticated;'), 'Must revoke public/anon/authenticated access to platform schema');
  assert.ok(sql0024.includes('grant usage on schema platform to service_role;'), 'Must grant usage only to service_role');
  console.log('  ✓ PASS: Migration 0024 correctly defines platform schema, tenant registry, operator principals, and service_role isolation.');
}

// 2. Migration 0025: Books & Operating Activities Verification
const MIGRATION_0025_PATH = path.join(ROOT, 'supabase', 'migrations', '202608270025_books_and_operating_activities.sql');
assert.ok(fs.existsSync(MIGRATION_0025_PATH), 'Migration 202608270025 must exist');
const sql0025 = fs.readFileSync(MIGRATION_0025_PATH, 'utf8');

console.log('\n2. Verifying Migration 0025 (Books & Operating Activities):');
{
  // Books Table & Composite Uniqueness
  assert.ok(sql0025.includes('create table public.books'), 'Must create public.books table');
  assert.ok(sql0025.includes('unique (organisation_id, code)'), 'Must enforce unique code per organisation');
  assert.ok(sql0025.includes('unique (organisation_id, name)'), 'Must enforce unique name per organisation');
  assert.ok(sql0025.includes('unique (organisation_id, id)'), 'Must enforce composite (organisation_id, id) for tenant-safe FKs');

  // Single Default Active Book Invariant
  assert.ok(sql0025.includes('create unique index books_single_default_uq'), 'Must create partial unique index for single default active book');
  assert.ok(sql0025.includes('where (is_default = true and status = \'active\')'), 'Index must filter on is_default = true and status = active');

  // Book Memberships & Shared Facility Locations
  assert.ok(sql0025.includes('create table public.book_memberships'), 'Must create public.book_memberships table');
  assert.ok(sql0025.includes('create table public.book_locations'), 'Must create public.book_locations table');

  // Execution Table Column Additions
  assert.ok(sql0025.includes('alter table public.garage_jobs add column if not exists book_id uuid;'), 'Must add book_id to garage_jobs');
  assert.ok(sql0025.includes('alter table public.commercial_documents add column if not exists book_id uuid;'), 'Must add book_id to commercial_documents');
  assert.ok(sql0025.includes('alter table public.journal_entries add column if not exists book_id uuid;'), 'Must add book_id to journal_entries');
  assert.ok(sql0025.includes('alter table public.audit_events add column if not exists book_id uuid;'), 'Must add book_id to audit_events');

  // Deterministic Backfill Logic
  assert.ok(sql0025.includes("book_code := 'INK'"), 'Must provision Ignition Ink default book for automotive workshops');
  assert.ok(sql0025.includes("book_code := 'STQ'"), 'Must provision STQ default book for Starq Technologies');
  assert.ok(sql0025.includes("'DYN'"), 'Must provision Starq Dynamics secondary book');
  assert.ok(sql0025.includes('session_replication_role'), 'Must safely manage replication role during append-only backfill');

  // Composite Foreign Keys on Domain Execution Tables
  assert.ok(sql0025.includes('add constraint garage_jobs_book_fk'), 'Must add tenant-safe FK on garage_jobs');
  assert.ok(sql0025.includes('add constraint commercial_documents_book_fk'), 'Must add tenant-safe FK on commercial_documents');
  assert.ok(sql0025.includes('add constraint journal_entries_book_fk'), 'Must add tenant-safe FK on journal_entries');

  console.log('  ✓ PASS: Migration 0025 correctly enforces multi-book architecture, composite tenant-safety, and deterministic seed backfill.');
}

console.log('\n=== All SERP-284 Migration Gates Passed (2/2) ===');
