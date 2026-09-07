import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');

console.log('=== SERP-270: Running Security Contact & Disclosure Policy Tests ===\n');

// 1. Validate .well-known/security.txt existence and RFC 9116 directives
{
  const repoSecurityTxt = path.join(ROOT, '.well-known', 'security.txt');
  const webSecurityTxt = path.join(ROOT, 'web', 'public', '.well-known', 'security.txt');

  assert.ok(fs.existsSync(repoSecurityTxt), '.well-known/security.txt must exist at repo root');
  assert.ok(fs.existsSync(webSecurityTxt), 'web/public/.well-known/security.txt must exist for public web serving');

  const content = fs.readFileSync(repoSecurityTxt, 'utf8');

  // Directives
  assert.match(content, /Contact:\s*mailto:security@starq\.mv/, 'Contact directive must include security@starq.mv');
  assert.match(content, /Expires:\s*\d{4}-\d{2}-\d{2}T/, 'Expires directive must be in ISO 8601 format');
  assert.match(content, /Preferred-Languages:/, 'Preferred-Languages directive must be present');
  assert.match(content, /Policy:\s*https?:\/\//, 'Policy directive URL must be present');
  assert.match(content, /Canonical:\s*https?:\/\//, 'Canonical directive URL must be present');

  // Verify expiration date is in the future
  const expiresMatch = content.match(/Expires:\s*([^\r\n]+)/);
  assert.ok(expiresMatch, 'Expires date could not be parsed');
  const expiresDate = new Date(expiresMatch[1].trim());
  assert.ok(expiresDate > new Date(), `Expires date (${expiresDate.toISOString()}) must be in the future`);

  console.log('  ✓ PASS: RFC 9116 security.txt format, directives, and future expiration date verified');
}

// 2. Validate SECURITY.md disclosure policy, safe harbor, and response commitment
{
  const securityMdPath = path.join(ROOT, 'SECURITY.md');
  assert.ok(fs.existsSync(securityMdPath), 'SECURITY.md must exist in repository root');

  const md = fs.readFileSync(securityMdPath, 'utf8');

  assert.match(md, /security@starq\.mv/, 'SECURITY.md must list security@starq.mv');
  assert.match(md, /Safe Harbor/i, 'SECURITY.md must include Safe Harbor statement');
  assert.match(md, /good faith/i, 'SECURITY.md must commit to good-faith protection');
  assert.match(md, /24 hours/i, 'SECURITY.md must commit to 24-hour initial response target');
  assert.match(md, /not pursue/i, 'SECURITY.md must commit not to pursue legal action for good-faith disclosure');
  assert.match(md, /board task|tracked/i, 'SECURITY.md must require tracking vulnerabilities as formal tasks');

  console.log('  ✓ PASS: SECURITY.md disclosure policy, 24h SLA, tracking gate, and safe harbor verified');
}

console.log('\n======================================================');
console.log('✓ ALL SERP-270 SECURITY POLICY ACCEPTANCE CHECKS PASSED');
console.log('======================================================');
