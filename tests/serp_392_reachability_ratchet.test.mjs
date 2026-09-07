import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'reachability-sweep.mjs');
const DUMMY_ORPHAN = path.join(ROOT, 'web', 'src', 'components', 'TempSyntheticDarkView.tsx');

console.log('=== SERP-392: Enforceable Reachability Ratchet Suite ===\n');

// 1. Base case: --strict exits 0 on the clean codebase
console.log('1. Verifying reachability-sweep.mjs --strict on clean tree...');
try {
  const output = execFileSync(process.execPath, [SCRIPT, '--strict'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.ok(output.includes('No unreviewed orphans'), 'Expected clean report');
  console.log('   PASS: reachability-sweep.mjs --strict exits 0 cleanly.');
} catch (err) {
  assert.fail(`Clean tree failed reachability sweep --strict: ${err.message}`);
}

// 2. Ratchet enforcement: adding a newly dark component makes --strict fail (exit 1)
console.log('2. Verifying ratchet enforcement against new unreviewed orphan...');
fs.writeFileSync(
  DUMMY_ORPHAN,
  `export const TempSyntheticDarkView = () => <div>Synthetic dark view</div>;\n`,
  'utf8',
);

let caughtError = false;
try {
  execFileSync(process.execPath, [SCRIPT, '--strict'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
} catch (err) {
  caughtError = true;
  assert.equal(err.status, 1, `Expected exit status 1 on unreviewed orphan, got ${err.status}`);
  assert.ok(
    err.stdout.includes('TempSyntheticDarkView.tsx'),
    'Expected unreviewed orphan in failure output',
  );
  console.log('   PASS: New dark component reliably causes exit 1 under --strict.');
} finally {
  if (fs.existsSync(DUMMY_ORPHAN)) {
    fs.unlinkSync(DUMMY_ORPHAN);
  }
}

assert.ok(caughtError, 'Expected reachability-sweep.mjs --strict to fail when unreviewed orphan is introduced');

// 3. Post-cleanup confirmation
console.log('3. Verifying clean state restored after orphan cleanup...');
const postCleanup = execFileSync(process.execPath, [SCRIPT, '--strict'], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert.ok(postCleanup.includes('No unreviewed orphans'), 'Expected clean report after cleanup');
console.log('   PASS: Suite clean after temporary orphan removed.\n');

console.log('ALL SERP-392 ENFORCEABLE RATCHET ASSERTIONS PASSED.');
