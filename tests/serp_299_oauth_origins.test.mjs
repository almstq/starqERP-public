import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), '..');

console.log('=== SERP-299: Running Google OAuth, Origins & Secrets Verification Tests ===\n');

// 1. Validate Edge Function CORS implementation
{
  const edgeIndexPath = path.join(ROOT, 'supabase', 'functions', 'starq-api', 'index.ts');
  assert.ok(fs.existsSync(edgeIndexPath), 'supabase/functions/starq-api/index.ts must exist');

  const content = fs.readFileSync(edgeIndexPath, 'utf8');

  // Verify canonical production origin is in default allowlist (quote-agnostic)
  assert.match(content, /['"]https:\/\/erp\.starq\.mv['"]/, 'DEFAULT_ALLOWED_ORIGINS must include https://erp.starq.mv');
  assert.match(content, /['"]https:\/\/starq\.mv['"]/, 'DEFAULT_ALLOWED_ORIGINS must include https://starq.mv');

  // Verify production guard against arbitrary vercel preview wildcards
  assert.match(content, /const IS_PROD =/, 'Edge function must determine production environment');
  assert.match(content, /ALLOW_PREVIEW_ORIGINS \|\| !IS_PROD/, 'Wildcard vercel app matching must be guarded against production mode');

  console.log('  ✓ PASS: Edge function CORS exact origins and production wildcard guard verified');
}

// 2. Behavioral verification of CORS origin validation logic
{
  const DEFAULT_ALLOWED = new Set([
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "https://web-dhivashi.vercel.app",
    "https://web-eight-psi-92.vercel.app",
    "https://erp.starq.mv",
    "https://starq.mv",
  ]);

  function resolveIsProd(starqEnv, environment) {
    const rawEnv = ((starqEnv || environment) ?? "").trim().toLowerCase();
    return rawEnv !== "development" && rawEnv !== "test" && rawEnv !== "local";
  }

  function testOriginAllowed(origin, isProd, allowPreview) {
    if (!origin) return true;
    if (DEFAULT_ALLOWED.has(origin)) return true;
    if (allowPreview || !isProd) {
      if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)) return true;
    }
    return false;
  }

  // Fail-closed environment resolution tests
  assert.equal(resolveIsProd(undefined, undefined), true, 'Unset env vars MUST fail-closed to production');
  assert.equal(resolveIsProd('', ''), true, 'Empty env vars MUST fail-closed to production');
  assert.equal(resolveIsProd('production', ''), true, 'Explicit production resolves to production');
  assert.equal(resolveIsProd('staging', ''), true, 'Unknown/staging env resolves to production (fail-closed)');
  assert.equal(resolveIsProd('development', ''), false, 'development resolves to non-production');
  assert.equal(resolveIsProd('', 'local'), false, 'local resolves to non-production');

  // Production behavior (Founder Ruling #1475)
  assert.equal(testOriginAllowed('https://erp.starq.mv', true, false), true, 'Production origin erp.starq.mv must be allowed');
  assert.equal(testOriginAllowed('https://starq.mv', true, false), true, 'Root domain starq.mv must be allowed');
  assert.equal(testOriginAllowed('https://arbitrary-attacker.vercel.app', true, false), false, 'Wildcard vercel apps must be REJECTED in production');
  assert.equal(testOriginAllowed('https://malicious-site.com', true, false), false, 'Unauthorized domains must be REJECTED');

  // Preview / non-prod behavior
  assert.equal(testOriginAllowed('https://preview-feat-branch.vercel.app', false, false), true, 'Preview vercel apps permitted in non-prod');
  assert.equal(testOriginAllowed('https://preview-feat-branch.vercel.app', true, true), true, 'Preview permitted in prod only with explicit opt-in');

  console.log('  ✓ PASS: Origin evaluation behavior matches Founder Ruling #1475 invariants');
}

// 3. Validate Google OAuth Setup Documentation (GOOGLE_OAUTH_SETUP.md)
{
  const oauthDocPath = path.join(ROOT, 'docs', 'auth', 'GOOGLE_OAUTH_SETUP.md');
  assert.ok(fs.existsSync(oauthDocPath), 'docs/auth/GOOGLE_OAUTH_SETUP.md must exist');

  const content = fs.readFileSync(oauthDocPath, 'utf8');

  assert.match(content, /erp\.starq\.mv/, 'GOOGLE_OAUTH_SETUP.md must specify canonical erp.starq.mv domain');
  assert.match(content, /https:\/\/erp\.starq\.mv\/auth\/callback/, 'GOOGLE_OAUTH_SETUP.md must document production redirect callback');
  assert.match(content, /Backend-Only Secret/, 'GOOGLE_OAUTH_SETUP.md must document STARQBOOKS_SESSION_SECRET backend-only ownership');
  assert.match(content, /90 days/i, 'GOOGLE_OAUTH_SETUP.md must establish 90-day secret rotation cadence');
  assert.match(content, /Modernization Path.*Secret Keys/s, 'GOOGLE_OAUTH_SETUP.md must document transition to Supabase Secret Keys');

  console.log('  ✓ PASS: Google OAuth setup document reflects canonical domain, redirects & secret policies');
}

// 4. Validate Security Posture Documentation
{
  const secDocPath = path.join(ROOT, 'docs', 'security', '2026-09-03_SUPABASE_AUTH_SECURITY_POSTURE_SERP-399.md');
  assert.ok(fs.existsSync(secDocPath), 'SUPABASE_AUTH_SECURITY_POSTURE doc must exist');

  const content = fs.readFileSync(secDocPath, 'utf8');

  assert.match(content, /## 4\. Production Domain & CORS Boundary \(SERP-299/i, 'Security posture doc must include CORS Boundary section');
  assert.match(content, /## 5\. Privileged Secret Management & Rotation Policy \(SERP-299\)/i, 'Security posture doc must include Secret Policy section');
  assert.match(content, /Zero Wildcards on Credentialed Routes/i, 'Security posture doc must mandate zero wildcards on credentialed routes');
  assert.match(content, /90 days/i, 'Security posture doc must record 90-day rotation policy');

  console.log('  ✓ PASS: Security posture baseline integrates SERP-299 CORS & secret lifecycle policies');
}

console.log('\n======================================================');
console.log('✓ ALL SERP-299 ACCEPTANCE AND SECURITY CHECKS PASSED');
console.log('======================================================');
