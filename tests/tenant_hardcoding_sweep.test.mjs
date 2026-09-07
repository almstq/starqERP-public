import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');

console.log('=== SERP-275: Automated Tenant Hardcoding & Generalization Sweep ===\n');

// Explicitly allow immutable historical migrations to preserve migration lineage
// prior to the forward synthetic-ID transition migration (202608260021).
const HISTORICAL_MIGRATIONS_IMMUTABLE_ALLOWLIST = [
  'supabase/migrations/202608200004_pilot_security.sql',
  'supabase/migrations/202608200007_garage_api_self_test.sql',
  'supabase/migrations/202608200008_session_authority.sql',
  'supabase/migrations/202608250013_workflow_stages.sql',
  'supabase/migrations/202608250015_roles_as_data.sql',
  'supabase/migrations/202608250017_tax_regimes_and_periods.sql',
  'supabase/migrations/202608250018_bank_accounts_entities.sql',
  // The forward migration 0021 maps old IDs to new IDs, and its rehearsal probe tests that transition
  'supabase/migrations/202608260021_synthetic_tenant_uuid_transition.sql',
  'tests/migration_0021_rehearsal_probe.sql',
];

const FORBIDDEN_PATTERNS = [
  {
    name: 'Real Company Registration Embedding UUIDs (29552026 / 30222026)',
    pattern: /(?:29552026|30222026)-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    scanDirs: ['contracts', 'supabase/functions', 'web/src', 'tests'],
    ignoreFiles: HISTORICAL_MIGRATIONS_IMMUTABLE_ALLOWLIST
  },
  {
    name: 'CLUB_IGNITION_ID Constant Declaration',
    pattern: /\bconst\s+CLUB_IGNITION_ID\b/g,
    scanDirs: ['contracts', 'supabase/functions', 'web/src'],
    ignoreFiles: []
  },
  {
    name: 'Hardcoded Fallback BML Account (7730000998811)',
    pattern: /7730000998811/g,
    scanDirs: ['web/src/components'],
    ignoreFiles: []
  },
  {
    name: 'Hardcoded Tenant Ternary Lookup in API Gateway',
    pattern: /primaryEntity\s*===\s*["']CI["']/g,
    scanDirs: ['supabase/functions'],
    ignoreFiles: []
  }
];

function getFilesRecursively(dir, extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql']) {
  const fullPath = path.join(ROOT, dir);
  if (!fs.existsSync(fullPath)) return [];
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const res = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        files = files.concat(getFilesRecursively(res, extensions));
      }
    } else {
      if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(res);
      }
    }
  }
  return files;
}

let totalViolations = 0;

for (const check of FORBIDDEN_PATTERNS) {
  console.log(`Checking invariant: ${check.name}...`);
  let matchedFiles = [];

  for (const dir of check.scanDirs) {
    const files = getFilesRecursively(dir);
    for (const relFile of files) {
      if (check.ignoreFiles.includes(relFile)) continue;
      const content = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
      const matches = content.match(check.pattern);
      if (matches && matches.length > 0) {
        matchedFiles.push({ file: relFile, matches: matches.length });
      }
    }
  }

  if (matchedFiles.length === 0) {
    console.log(`  ✓ PASS: Clean — 0 occurrences across scanned surfaces.`);
  } else {
    console.log(`  ✗ FAIL: Found occurrences in:`);
    for (const m of matchedFiles) {
      console.log(`    - ${m.file} (${m.matches} matches)`);
      totalViolations += m.matches;
    }
  }
}

// Check forward migration 0021 exists and contains synthetic transition logic
{
  console.log('\nChecking Forward Synthetic-ID Transition Migration (0021):');
  const mig0021Path = path.join(ROOT, 'supabase', 'migrations', '202608260021_synthetic_tenant_uuid_transition.sql');
  assert.ok(fs.existsSync(mig0021Path), 'Migration 202608260021 exists');
  const mig0021 = fs.readFileSync(mig0021Path, 'utf8');
  assert.ok(mig0021.includes('10000000-0000-4000-8000-000000000001'), 'Starq Technologies synthetic org UUID present in 0021');
  assert.ok(mig0021.includes('20000000-0000-4000-8000-000000000001'), 'Club Ignition synthetic org UUID present in 0021');
  assert.ok(mig0021.includes('delete from public.organisations where id in (old_st, old_ci)'), 'Old organisations deleted after child references migrated');
  console.log('  ✓ PASS: Forward transition migration 0021 verified.');
}

if (totalViolations > 0) {
  console.error(`\n❌ SWEEP FAILED: ${totalViolations} hardcoded tenant violation(s) detected.`);
  process.exit(1);
} else {
  console.log('\n✅ ALL TENANT GENERALIZATION INVARIANTS PASSED CLEANLY.');
}
