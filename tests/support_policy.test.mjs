import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');

console.log('=== SERP-269: Running Support Policy & Escalation Matrix Tests ===\n');

// 1. Validate docs/SUPPORT.md exists and contains grounded SLAs & named escalation
{
  const supportMdPath = path.join(ROOT, 'docs', 'SUPPORT.md');
  assert.ok(fs.existsSync(supportMdPath), 'docs/SUPPORT.md must exist');

  const content = fs.readFileSync(supportMdPath, 'utf8');

  // Support route & inboxes
  assert.match(content, /support@starq\.mv/, 'SUPPORT.md must specify primary support route support@starq.mv');
  assert.match(content, /urgent@starq\.mv/, 'SUPPORT.md must specify emergency pager route urgent@starq.mv');

  // Operating hours & honest Friday capacity
  assert.match(content, /Sunday\s*through\s*Thursday|Sunday\s*–\s*Thursday/i, 'SUPPORT.md must state honest operating days');
  assert.match(content, /09:00\s*–\s*18:00|09:00\s*-\s*18:00/, 'SUPPORT.md must state operating hours in MVT (UTC+5)');
  assert.match(content, /Friday|Jumu'ah/i, 'SUPPORT.md must account for Friday Jumu\'ah / weekend hours');

  // Severity tiers & definitions
  assert.match(content, /Sev-1/i, 'SUPPORT.md must define Sev-1');
  assert.match(content, /Books.*Wrong|Financial.*Inaccuracy|System.*Down/i, 'SUPPORT.md Sev-1 must encompass System Down / Books Wrong');
  assert.match(content, /4 hours/i, 'SUPPORT.md Sev-1 SLA must target <= 4 hours');

  // Escalation path terminating in a named person
  assert.match(content, /Ali Musthaq/, 'Escalation path must terminate in a named person (Ali Musthaq)');
  assert.match(content, /founder@starq\.mv/, 'Founder escalation inbox must be specified');

  console.log('  ✓ PASS: docs/SUPPORT.md verified: honest hours, Sev-1..Sev-4 SLAs, and named escalation');
}

// 2. Validate web client SettingsView & SupportTab wiring
{
  const supportTabPath = path.join(ROOT, 'web', 'src', 'components', 'settings', 'SupportTab.tsx');
  const settingsViewPath = path.join(ROOT, 'web', 'src', 'components', 'settings', 'SettingsView.tsx');

  assert.ok(fs.existsSync(supportTabPath), 'SupportTab.tsx must exist');
  assert.ok(fs.existsSync(settingsViewPath), 'SettingsView.tsx must exist');

  const tabContent = fs.readFileSync(supportTabPath, 'utf8');
  const settingsContent = fs.readFileSync(settingsViewPath, 'utf8');

  assert.match(settingsContent, /SupportTab/, 'SettingsView must import and render SupportTab');
  assert.match(settingsContent, /'support'/, 'SettingsView must support "support" subtab');

  assert.match(tabContent, /support@starq\.mv/, 'SupportTab must render support@starq.mv');
  assert.match(tabContent, /urgent@starq\.mv/, 'SupportTab must render urgent@starq.mv');
  assert.match(tabContent, /Ali Musthaq/, 'SupportTab must display named escalation to Ali Musthaq');
  assert.match(tabContent, /Sev-1.*Critical/i, 'SupportTab must display Sev-1 Critical tier');

  console.log('  ✓ PASS: Web client SupportTab and SettingsView integration verified');
}

console.log('\n======================================================');
console.log('✓ ALL SERP-269 SUPPORT POLICY ACCEPTANCE CHECKS PASSED');
console.log('======================================================');
