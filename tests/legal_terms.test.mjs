import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');

console.log('=== SERP-265: Running Terms, Privacy & Data Processing Tests ===\n');

// 1. Validate TERMS.md, PRIVACY.md, DPA.md existence and hosting location disclosures
{
  const termsPath = path.join(ROOT, 'docs', 'TERMS.md');
  const privacyPath = path.join(ROOT, 'docs', 'PRIVACY.md');
  const dpaPath = path.join(ROOT, 'docs', 'DPA.md');

  assert.ok(fs.existsSync(termsPath), 'docs/TERMS.md must exist');
  assert.ok(fs.existsSync(privacyPath), 'docs/PRIVACY.md must exist');
  assert.ok(fs.existsSync(dpaPath), 'docs/DPA.md must exist');

  const terms = fs.readFileSync(termsPath, 'utf8');
  const privacy = fs.readFileSync(privacyPath, 'utf8');

  // Hosting location
  assert.match(terms, /Asia-Southeast|Singapore/i, 'TERMS.md must name Singapore / Asia-Southeast hosting region');
  assert.match(privacy, /Asia-Southeast|Singapore/i, 'PRIVACY.md must name Singapore / Asia-Southeast hosting region');
  assert.match(privacy, /Supabase|AWS/i, 'PRIVACY.md must name cloud infrastructure sub-processors');

  console.log('  ✓ PASS: Legal docs exist and explicitly name Singapore / Asia-Southeast hosting locations');
}

// 2. Validate DEC-073 §10 GST Non-Registration Compliance
{
  const terms = fs.readFileSync(path.join(ROOT, 'docs', 'TERMS.md'), 'utf8');
  const dpa = fs.readFileSync(path.join(ROOT, 'docs', 'DPA.md'), 'utf8');

  // Must explicitly state non-GST registered status
  assert.match(terms, /not registered for Goods and Services Tax|not registered for.*GST/i, 'TERMS.md must state Starq is not GST-registered (DEC-073 §10)');
  assert.match(terms, /0%\s*GST/i, 'TERMS.md must state Starq fees carry 0% GST');
  assert.match(dpa, /non-GST registered|not GST-registered/i, 'DPA.md must state non-GST registered status');

  console.log('  ✓ PASS: Statutory non-GST registered disclosures strictly compliant with DEC-073 §10');
}

// 3. Validate Isolation Claim Transparency (SERP-124 / SERP-172 reference)
{
  const terms = fs.readFileSync(path.join(ROOT, 'docs', 'TERMS.md'), 'utf8');
  const privacy = fs.readFileSync(path.join(ROOT, 'docs', 'PRIVACY.md'), 'utf8');

  // Must reference active testing milestone rather than unproven marketing claims
  assert.match(terms, /SERP-172|SERP-124/i, 'TERMS.md must reference SERP-172/SERP-124 isolation testing milestone');
  assert.match(privacy, /SERP-172|SERP-124/i, 'PRIVACY.md must reference SERP-172/SERP-124 isolation testing milestone');

  console.log('  ✓ PASS: Tenant isolation claims explicitly qualified against SERP-172/124 verification gates');
}

// 4. Validate Concrete Exit Terms (14 days, JSON/CSV format, 30 days retention)
{
  const terms = fs.readFileSync(path.join(ROOT, 'docs', 'TERMS.md'), 'utf8');
  const privacy = fs.readFileSync(path.join(ROOT, 'docs', 'PRIVACY.md'), 'utf8');
  const dpa = fs.readFileSync(path.join(ROOT, 'docs', 'DPA.md'), 'utf8');

  assert.match(terms, /14 business days/i, 'TERMS.md must state 14 business days delivery guarantee');
  assert.match(terms, /JSON and CSV|JSON.*CSV/i, 'TERMS.md must specify open JSON and CSV export formats');
  assert.match(terms, /30-day|30 days/i, 'TERMS.md must state 30 days grace period before deletion');
  assert.match(dpa, /14 business days/i, 'DPA.md must state 14 business days return SLA');

  console.log('  ✓ PASS: Exit terms guarantee 14-day JSON/CSV data extraction and 30-day retention grace period');
}

console.log('\n======================================================');
console.log('✓ ALL SERP-265 SERVICE TERMS & PRIVACY ACCEPTANCE CHECKS PASSED');
console.log('======================================================');
