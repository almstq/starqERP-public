import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');
const SRC = path.join(ROOT, 'web', 'src');

console.log('=== SERP-234: Component Reachability Sweep ===\n');

/**
 * WHY THIS GATE EXISTS
 * --------------------
 * On 30 Aug 2026 the web app contained 98 components. Eleven of them could not
 * be reached from the router by any chain of imports, so no user could open
 * them however they navigated. They were not stubs: they were finished-looking
 * screens, several with passing unit tests behind them, seeded from fixtures.
 *
 * A screen nobody can open is not delivered capability. Worse, it rots
 * silently — nothing fails, so nothing tells you. This gate makes a NEW
 * orphan fail CI on the commit that creates it, rather than in an audit
 * months later.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * Import reachability is necessary, not sufficient. A component reachable
 * only behind a dead tab, or wired to fixtures rather than real data, passes
 * this gate and is still not usable capability. This proves the door exists.
 * It does not prove there is a room behind it.
 */

const ENTRY_POINTS = ['app/router.tsx', 'main.tsx'];

/**
 * Components with no import path from the router, each with a recorded reason
 * and disposition. Presence on this list is a DEBT REGISTER, not an approval.
 *
 * To remove an entry: wire the component up (SERP-234) or archive it.
 * Do NOT add an entry to make this gate pass. A new orphan is the defect this
 * file exists to catch; adding it here without a Founder-visible reason
 * defeats the whole gate.
 */
const KNOWN_DARK = {
  // --- Superseded duplicates: a live equivalent is already routed. Archive. ---
  'components/onboarding/OrganisationSetupModal.tsx':
    'Superseded by RegisterOrganisationModal, which AppShell renders. Rival implementation; archive, do not wire.',

  // --- Capability screens with no backend. Not one wiring step away. ---
  'components/payroll/PayrollManagementView.tsx':
    'No payroll or employee table, no command, no endpoint. Fixture-seeded; posts to an inert addJournalEntry.',
  'components/inventory/MultiWarehouseView.tsx':
    'No warehouse or stock_transfer table, no command. Fixture-seeded; posts to an inert addJournalEntry.',
  'components/manufacturing/ProductionOrderView.tsx':
    'No production_order or BOM table, no command. Fixture-seeded; posts to an inert addJournalEntry.',
  'components/projects/JobCostingView.tsx':
    'No job_cost table, no command. Fixture-seeded; posts to an inert addJournalEntry.',
  'components/sales/CreditDunningView.tsx':
    'No credit_profile or dunning table, no command. Fixture-seeded.',
  'components/reports/ConsolidatedReportingView.tsx':
    'No branch table; STARQ_BUSINESS_BRANCHES is a constant. Fixture-seeded.',
  'components/banking/AiReconciliationView.tsx':
    'No bank transaction table and no OCR service. OCR text and match suggestions are hard-coded literals.',
  'components/admin/AgentRegistryView.tsx':
    'automation_principals / automation_capability_grants exist, but this view reads DEFAULT_AI_AGENTS constants, not those tables.',
};

const EXTS = ['.tsx', '.ts'];

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  for (const e of EXTS) {
    const idx = path.join(base, 'index' + e);
    if (fs.existsSync(idx)) return idx;
  }
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  return null;
}

function importsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const found = [];
  // static `from '...'` and dynamic `import('...')`
  const re = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const resolved = resolveImport(file, m[1]);
    if (resolved) found.push(resolved);
  }
  return found;
}

function walkComponents(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkComponents(p, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

// --- Breadth-first crawl from the router ---
const roots = ENTRY_POINTS.map((e) => path.join(SRC, e)).filter((f) => fs.existsSync(f));
assert.ok(roots.length > 0, 'No entry point found — expected web/src/app/router.tsx');

const reachable = new Set(roots);
const queue = [...roots];
while (queue.length) {
  const file = queue.shift();
  for (const dep of importsOf(file)) {
    if (!reachable.has(dep)) {
      reachable.add(dep);
      queue.push(dep);
    }
  }
}

const components = walkComponents(path.join(SRC, 'components'));
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const dark = components.filter((c) => !reachable.has(c)).map(rel).sort();

console.log(`Components:  ${components.length}`);
console.log(`Reachable:   ${components.length - dark.length}`);
console.log(`Dark:        ${dark.length}\n`);

const known = Object.keys(KNOWN_DARK).sort();
const newlyDark = dark.filter((d) => !known.includes(d));
const nowReachable = known.filter((k) => !dark.includes(k));

for (const d of dark) {
  console.log(`  DARK  ${d}\n        ${KNOWN_DARK[d] || '*** UNREGISTERED ***'}`);
}

if (nowReachable.length) {
  console.log('\nNow reachable (remove from KNOWN_DARK):');
  for (const r of nowReachable) console.log(`  + ${r}`);
}

console.log('');

// A component that became reachable is good news, but the register must be
// kept truthful or it stops describing the codebase.
assert.deepEqual(
  nowReachable,
  [],
  `These components are now reachable but still listed in KNOWN_DARK. ` +
    `Remove them from the register in tests/component_reachability.test.mjs: ${nowReachable.join(', ')}`,
);

// The gate itself: no component may become unreachable without being recorded.
assert.deepEqual(
  newlyDark,
  [],
  `NEW UNREACHABLE COMPONENT(S). No user can open these however they navigate: ` +
    `${newlyDark.join(', ')}. Either wire them into the router (directly or via a ` +
    `parent that is routed), or archive them. Adding them to KNOWN_DARK is only ` +
    `correct if the Founder has accepted them as recorded debt.`,
);

console.log('PASS — reachability register matches the codebase.\n');
