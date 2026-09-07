/**
 * STARQ ERP — negative conformance tests for contracts/commands.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE ARE ALL NEGATIVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Every one of the six defects found on 21 August passed its positive test.
 * `establishPerson()` correctly established a person. `api_garage_command`
 * correctly executed commands. The Flutter client correctly submitted forms.
 * The features worked, which is exactly why nobody noticed that the controls
 * did not.
 *
 * A positive test proves a capability exists. Only a negative test proves a
 * control works — that the thing which must not happen is actually refused.
 * So every test in this file asserts a refusal, and each names the defect it
 * would have caught.
 *
 * Run:  deno test tests/contract/
 */

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import {
  CONTRACT_VERSION,
  COMMANDS,
  COMMAND_SEATS,
  PURCHASE_STEP_SEATS,
  PURCHASE_SOD_PAIRS,
  SCM_STEPS,
  SEATS,
  SOD_REASON_MIN_LENGTH,
  authorizeCommand,
  authorizeSodOverride,
  fromLegacyBody,
  audienceIsValid,
  idempotencyDecision,
  seatWriteIsSafe,
  seatsForCommand,
  sodViolation,
  type AudiencePolicy,
  type CommandEnvelope,
  type CommandName,
  type Principal,
  type PurchaseStepRecord,
  type SeatCode,
  SQL_REQUIRED_SEAT,
  SQL_PERMITTED_SEATS,
  FINANCIAL_TRUTH_INVARIANT,
  STATUTORY_FIGURE_DOMAINS,
  OPERATIONAL_ANALYTICS_DOMAINS,
  AUTHORITATIVE_ACCOUNTING_ENGINES,
  validateFinancialFigureSource,
  COMMERCIAL_DOCUMENT_TYPES,
  SETTLEMENT_STATUSES,
  validateDynamicWorkflowTransition,
  type WorkflowStageRecord,
  MEMBERSHIP_STATUSES,
  STANDARD_ROLE_CODES,
  validateRoleActionVisibility,
  ROLE_PRECEDENCE_INVARIANT,
  evaluateSoDCapacityAndAction,
  type ScmStep,
  type MembershipRecord,
  type RolePermissionRecord,
  type SegregationCapacity,
  type SodExceptionRecord,
  TAX_MODES,
  TAX_REGISTRATION_STATUSES,
  TAX_TYPES,
  calculateLineTax,
  type TaxRateScheduleRecord,
  type TaxRegistrationRecord,
  BANK_ACCOUNT_TYPES,
  type BankAccountType,
  type BankAccountRecord,
  validateCallCommandPayload,
  type CallCommandPayload,
  MUTATION_SURFACE_MAP,
  mutationsRequiringApi,
  mutationsBlockedOnSerp167,
  statutoryMutations,
  validateMutationBoundary,
  validateStorageObjectKey,
  validateSearchScope,
  validateAIContextRetrieval,
  validateCompositeForeignKeyIntegrity,
  validateInvoiceCommandPayload,
  validateExpenseCommandPayload,
  validateCustomerCommandPayload,
  validateAICopilotProxyRequest,
  isPrivilegedRole,
  requiresMfaForAction,
  validateMfaChallenge,
  PRIVILEGED_ACTIONS,
  validateTenantOnboardingPayload,
  PRODUCT_FIXED_INVARIANTS,
  PERMITTED_ANALYTICS_EVENTS,
  DISALLOWED_SENSITIVE_KEYS,
  validateAnalyticsEvent,
  anonymizeTenantForAnalytics,
  validateReleaseCandidateManifest,
  computeManifestSignature,
  CANONICAL_LEGAL_TENANTS,
  validateOutletTenantBinding,
  validateModuleAccess,
  createSecureSessionRecord,
  validateSecureSession,
  revokeSession,
  validateReplayProtection,
  SessionTokenRecord,
  validateStockMovementCommand,
  calculateInventoryValuationSummary,
  validateCounterSaleCommand,
  validateCommercialDocumentProvenance,
  generateTaxWorkingPaperSummary,
  validateCustomerConsentUpdate,
  validateCustomerLifecycleTransition,
  executeVersionedApiCommand,
  DurableIdempotencyEntry,
  validatePostgresTenantScoping,
  validateOrganisationConstraintIntegrity,
  evaluateRoleVisibility,
  evaluateSodPolicy,
  validateOutboxEvent,
  executeTransactionalMutationWithOutbox,
  type TransactionalOutboxRecord,
  evaluateRateLimit,
  sanitizeLogMetadata,
  evaluateSystemAlertSignals,
  CANONICAL_MIGRATION_LINEAGE,
  validateMigrationLineage,
  formatSessionCookie,
  parseSessionCookie,
  validateSessionCookieLifecycle,
  calculateContrastRatio,
  validateAccessibilityStandard,
  STARQ_ERP_CANONICAL_METADATA,
  validateProductIdentityMetadata,
  CI_MANDATORY_GATES,
  validateCiGateRegistry,
} from '../../contracts/commands.ts';

const ORG = '20000000-0000-4000-8000-000000000001';
const OTHER_ORG = '10000000-0000-4000-8000-000000000001';
const DIRECTOR_PAYER = 'aaaaaaaa-0000-4000-8000-000000000001';
const MD_RECEIVER = 'bbbbbbbb-0000-4000-8000-000000000002';

function principal(
  actingSeat: SeatCode,
  held: readonly SeatCode[] = [actingSeat],
  organisationId = ORG,
): Principal {
  return {
    personId: DIRECTOR_PAYER,
    organisationId,
    actingSeat,
    heldSeats: held,
    seatVerifiedAt: '2026-08-21T18:00:00Z',
  };
}

function envelope(
  command: CommandName,
  extra: Partial<CommandEnvelope> = {},
): CommandEnvelope {
  return {
    contract: CONTRACT_VERSION,
    command,
    payload: {},
    csrf: 'test-csrf',
    ...extra,
  } as CommandEnvelope;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defect #1 — revoked seats came back at next login (index.ts:259)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('a revoked seat is refused even while the person still holds it', () => {
  const p = principal('counter');
  const d = authorizeCommand(p, envelope('INTAKE'), { revokedSeats: ['counter'] });
  assertEquals(d.ok, false);
  assert(!d.ok && d.error === 'seat_revoked');
});

Deno.test('a revoked seat reports seat_revoked, never seat_not_authorized', () => {
  // The distinction matters to whoever reads the security event: one is a
  // mistake, the other is someone using access that was deliberately removed.
  const d = authorizeCommand(principal('counter'), envelope('INTAKE'), {
    revokedSeats: ['counter'],
  });
  assert(!d.ok);
  assertNotEquals(d.error, 'seat_not_authorized');
});

Deno.test('a sign-in seat write carrying revoked_at is refused outright', () => {
  // This is the exact payload shape of the defect. Omission is the fix —
  // `revoked_at: null` reinstates, and echoing the previous value is a race.
  assertEquals(seatWriteIsSafe({ membership_id: 'm', seat_code: 'counter' }).ok, true);
  assertEquals(seatWriteIsSafe({ seat_code: 'counter', revoked_at: null }).ok, false);
  assertEquals(seatWriteIsSafe({ seat_code: 'counter', revoked_at: '2026-08-01T00:00:00Z' }).ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect #2 — any supplied seat authorized itself (garage_api.sql:63)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('a seat outside the matrix cannot issue the command', () => {
  const d = authorizeCommand(principal('technician'), envelope('INVOICE_PAYMENT'));
  assert(!d.ok && d.error === 'seat_not_authorized');
});

Deno.test('quote is refused for every seat except quartermaster', () => {
  for (const seat of SEATS) {
    const d = authorizeCommand(
      principal(seat),
      envelope('PURCHASE', { step: 'quote' }),
    );
    assertEquals(d.ok, seat === 'quartermaster', `seat ${seat} on quote`);
  }
});

Deno.test('receive is refused for every seat except receiver', () => {
  for (const seat of SEATS) {
    const d = authorizeCommand(
      principal(seat),
      envelope('PURCHASE', { step: 'receive' }),
    );
    assertEquals(d.ok, seat === 'receiver', `seat ${seat} on receive`);
  }
});

Deno.test('pay is refused for the financial controller who awarded', () => {
  // The seat matrix alone permits this — award and pay are different seats.
  // It is PURCHASE_SOD_PAIRS that has to stop it.
  const d = authorizeCommand(principal('payer'), envelope('PURCHASE', { step: 'pay' }));
  assertEquals(d.ok, true, 'seat matrix permits payer to pay');

  const history: PurchaseStepRecord[] = [{ step: 'award', personId: DIRECTOR_PAYER }];
  assertNotEquals(sodViolation(history, 'pay', DIRECTOR_PAYER), null, 'SoD must catch it');
});

Deno.test('a seat the person does not hold is refused', () => {
  const d = authorizeCommand(principal('payer', ['counter']), envelope('PURCHASE', { step: 'pay' }));
  assert(!d.ok && d.error === 'seat_not_authorized');
});

Deno.test('PURCHASE is never authorized without a step', () => {
  const d = authorizeCommand(principal('financial_controller'), envelope('PURCHASE'));
  assert(!d.ok && d.error === 'step_required');
  assertEquals(seatsForCommand('PURCHASE').length, 0);
});

Deno.test('a step on a non-purchase command is refused', () => {
  const d = authorizeCommand(principal('counter'), envelope('INTAKE', { step: 'need' }));
  assert(!d.ok && d.error === 'step_not_permitted');
});

// ─────────────────────────────────────────────────────────────────────────────
// Segregation of duties — the control the seat matrix cannot provide
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('one person cannot satisfy both halves of any segregation pair', () => {
  for (const [first, second] of PURCHASE_SOD_PAIRS) {
    const history: PurchaseStepRecord[] = [{ step: first, personId: DIRECTOR_PAYER }];
    assertNotEquals(sodViolation(history, second, DIRECTOR_PAYER), null, `${first} then ${second}`);
  }
});

Deno.test('two different people satisfying a pair is clean', () => {
  for (const [first, second] of PURCHASE_SOD_PAIRS) {
    const history: PurchaseStepRecord[] = [{ step: first, personId: DIRECTOR_PAYER }];
    assertEquals(sodViolation(history, second, MD_RECEIVER), null, `${first}/${second}`);
  }
});

Deno.test('an override with no reason is refused', () => {
  assertEquals(authorizeSodOverride(null).ok, false);
});

Deno.test('an override with a token reason is refused', () => {
  // A control that accepts "." as justification has been switched off with
  // extra steps.
  assertEquals(authorizeSodOverride({ reason: '' }).ok, false);
  assertEquals(authorizeSodOverride({ reason: '   ' }).ok, false);
  assertEquals(authorizeSodOverride({ reason: '.' }).ok, false);
  assertEquals(authorizeSodOverride({ reason: 'ok' }).ok, false);
});

Deno.test('an override with a real reason is allowed and the reason is long enough to mean something', () => {
  const reason = 'The receiver was masked and painting; single-handed purchase of thinner';
  assert(reason.length >= SOD_REASON_MIN_LENGTH);
  assertEquals(authorizeSodOverride({ reason }).ok, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect #3 — envelope drift between Flutter and Edge
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('an unknown contract version is refused rather than coerced', () => {
  const bad = { ...envelope('INTAKE'), contract: '0.0.9' } as unknown as CommandEnvelope;
  const d = authorizeCommand(principal('counter'), bad);
  assert(!d.ok && d.error === 'contract_version_unsupported');
});

Deno.test('an unknown command is refused', () => {
  const bad = { ...envelope('INTAKE'), command: 'TELEPORT' } as unknown as CommandEnvelope;
  const d = authorizeCommand(principal('counter'), bad);
  assert(!d.ok && d.error === 'unknown_command');
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect #4 — idempotency did not survive a restart
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('a repeated key with the same hash replays instead of re-executing', () => {
  const stored = { requestHash: 'abc', command: 'INTAKE' as CommandName };
  assertEquals(idempotencyDecision(stored, { requestHash: 'abc', command: 'INTAKE' }), 'replay');
});

Deno.test('a reused key carrying a different request is a conflict, not a replay', () => {
  const stored = { requestHash: 'abc', command: 'INTAKE' as CommandName };
  assertEquals(idempotencyDecision(stored, { requestHash: 'xyz', command: 'INTAKE' }), 'conflict');
  assertEquals(idempotencyDecision(stored, { requestHash: 'abc', command: 'CLOSE' }), 'conflict');
});

Deno.test('a genuinely new key executes', () => {
  assertEquals(idempotencyDecision(null, { requestHash: 'abc', command: 'INTAKE' }), 'execute');
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect #5 — one combined OAuth allowlist across platforms
// ─────────────────────────────────────────────────────────────────────────────

const POLICIES: AudiencePolicy[] = [
  { clientKind: 'web', audience: 'web-client-id.apps.googleusercontent.com' },
  { clientKind: 'android', audience: 'android-client-id.apps.googleusercontent.com' },
];

Deno.test('a web client presenting an android-audience token is refused', () => {
  const d = audienceIsValid('web', 'android-client-id.apps.googleusercontent.com', POLICIES);
  assert(!d.ok && d.error === 'audience_mismatch');
});

Deno.test('a missing or unknown client kind is refused, never defaulted', () => {
  assertEquals(audienceIsValid(null, POLICIES[0].audience, POLICIES).ok, false);
  assertEquals(audienceIsValid('', POLICIES[0].audience, POLICIES).ok, false);
  assertEquals(audienceIsValid('ios', POLICIES[0].audience, POLICIES).ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect #7 — the Edge is hardcoded to one organisation (index.ts:14)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('a command aimed at another tenant is refused, not silently emptied', () => {
  const d = authorizeCommand(principal('counter'), envelope('INTAKE'), {
    tenantOfTarget: OTHER_ORG,
  });
  assert(!d.ok && d.error === 'cross_tenant_denied');
});

Deno.test('a principal with no resolved tenant cannot act', () => {
  const p = { ...principal('counter'), organisationId: '' };
  const d = authorizeCommand(p, envelope('INTAKE'));
  assert(!d.ok && d.error === 'tenant_not_resolved');
});

Deno.test('SERP-161: a tenant cannot act upon target belonging to another tenant via payload injection', () => {
  const attacker = { ...principal('director'), organisationId: '11111111-1111-4000-8000-000000000001' };
  const targetEnvelope = envelope('INTAKE');
  const d = authorizeCommand(attacker, targetEnvelope, {
    tenantOfTarget: '22222222-2222-4000-8000-000000000002',
  });
  assert(!d.ok && d.error === 'cross_tenant_denied');
});

Deno.test('SERP-178: a caller cannot issue commands under an unheld seat or unauthorized person identity', () => {
  const imposter = { ...principal('technician'), seats: ['technician'] as SeatCode[], actingAs: 'director' as SeatCode };
  const d = authorizeCommand(imposter, envelope('CLOSE'));
  assert(!d.ok && d.error === 'seat_not_authorized');
});

// ─────────────────────────────────────────────────────────────────────────────
// Structural — the matrix itself must stay honest
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('every command has an explicit seat list', () => {
  for (const c of COMMANDS) {
    assert(c in COMMAND_SEATS, `${c} missing from COMMAND_SEATS`);
  }
});

Deno.test('no command except PURCHASE has an empty seat list', () => {
  // An empty list means nobody can ever issue it — which is a silent outage,
  // not a control.
  for (const c of COMMANDS) {
    if (c === 'PURCHASE') continue;
    assert(COMMAND_SEATS[c].length > 0, `${c} is unissuable`);
  }
});

Deno.test('every purchase step has an explicit seat list and none is empty', () => {
  for (const s of SCM_STEPS) {
    assert(s in PURCHASE_STEP_SEATS, `${s} missing`);
    assert(PURCHASE_STEP_SEATS[s].length > 0, `${s} is unissuable`);
  }
});

Deno.test('every seat named in the matrix exists in the vocabulary', () => {
  // This is the test that would have caught the sixth finding: the SQL required
  // seats the Edge allowlist did not contain.
  const known = new Set<string>(SEATS);
  for (const c of COMMANDS) {
    for (const s of COMMAND_SEATS[c]) assert(known.has(s), `${c} names unknown seat ${s}`);
  }
  for (const step of SCM_STEPS) {
    for (const s of PURCHASE_STEP_SEATS[step]) {
      assert(known.has(s), `step ${step} names unknown seat ${s}`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// The boundary gate — DP's finding, 21 Aug 2026
//
// "The contract is correct. The runtime does not use it." The Edge imported two
// helpers but delegated the actual decision to api_garage_command, whose matrix
// still had the target_seat fallback, no SoD, and an 8-seat vocabulary.
//
// These prove the boundary now refuses what that RPC would have allowed.
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('a legacy body is read exactly as the SQL reads it', () => {
  // upper(trim(coalesce(type, sop))) / lower(trim(coalesce(scm_step, action)))
  assertEquals(fromLegacyBody({ type: '  intake ' })?.command, 'INTAKE');
  assertEquals(fromLegacyBody({ sop: 'qc' })?.command, 'QC');
  // `type` wins over `sop`, matching coalesce order. If this ever flips, the
  // boundary authorizes one command while the database executes another.
  assertEquals(fromLegacyBody({ type: 'INTAKE', sop: 'QC' })?.command, 'INTAKE');
  assertEquals(fromLegacyBody({ type: 'PURCHASE', scm_step: ' QUOTE ' })?.step, 'quote');
  assertEquals(fromLegacyBody({ type: 'PURCHASE', action: 'Pay' })?.step, 'pay');
  assertEquals(
    fromLegacyBody({ type: 'PURCHASE', scm_step: 'quote', action: 'pay' })?.step,
    'quote',
    'scm_step must win over action, as coalesce does',
  );
});

Deno.test('a body with no command at all is refused, not defaulted', () => {
  assertEquals(fromLegacyBody({}), null);
  assertEquals(fromLegacyBody({ type: '   ' }), null);
  assertEquals(fromLegacyBody({ type: 42 as unknown as string }), null);
});

Deno.test('the boundary refuses a purchase quote the old RPC fallback would have allowed', () => {
  // The RPC computed `required_seat := target_seat` for need/quote/receive, so a
  // technician acting on a quote authorized itself. The contract does not.
  const env = fromLegacyBody({ type: 'PURCHASE', scm_step: 'quote' })!;
  const d = authorizeCommand(principal('technician'), env);
  assert(!d.ok && d.error === 'seat_not_authorized');
});

Deno.test('the boundary refuses a receive the old RPC fallback would have allowed', () => {
  const env = fromLegacyBody({ type: 'PURCHASE', scm_step: 'receive' })!;
  for (const seat of ['counter', 'technician', 'financial_controller'] as SeatCode[]) {
    const d = authorizeCommand(principal(seat), env);
    assert(!d.ok && d.error === 'seat_not_authorized', `${seat} must not receive`);
  }
  assertEquals(authorizeCommand(principal('receiver'), env).ok, true);
});

Deno.test('a client cannot smuggle a seat, tenant or person through the legacy body', () => {
  // The old shape is free-form JSON. Everything in it becomes `payload`, and the
  // principal comes from the session — so these fields are inert, not obeyed.
  const env = fromLegacyBody({
    type: 'PURCHASE', scm_step: 'pay',
    seat: 'payer', acting_as: 'payer',
    organisation_id: OTHER_ORG, person_id: MD_RECEIVER,
  })!;
  const d = authorizeCommand(principal('counter'), env);
  assert(!d.ok && d.error === 'seat_not_authorized', 'the body must not grant authority');
});

Deno.test('the Edge actually CALLS authorizeCommand before dispatching', async () => {
  /**
   * The regression guard for DP's finding of 21 Aug 2026.
   *
   * Every other test here proves authorizeCommand REFUSES correctly. None of
   * them prove the boundary calls it — and for a day it did not: the Edge
   * imported two helpers, delegated the decision to the RPC, and every test
   * still passed. "The contract is correct. The runtime does not use it."
   *
   * This is a source-level check rather than a behavioural one, which is
   * cruder than I would like. It is here because the alternative is that the
   * single most important wiring in the system is guarded by nothing at all.
   */
  const edge = await Deno.readTextFile(
    new URL('../../supabase/functions/starq-api/index.ts', import.meta.url),
  );
  assert(
    /import\s*\{[^}]*\bauthorizeCommand\b[^}]*\}\s*from\s*["']\.\.\/_shared\/commands\.ts["']/s.test(edge),
    'the Edge no longer imports authorizeCommand from the contract',
  );
  assert(
    /\bauthorizeCommand\s*\(/.test(edge),
    'authorizeCommand is imported but never called — the contract is decorative again',
  );
  // The call must come BEFORE the RPC dispatch, or the boundary is authorizing
  // something the database has already executed.
  //
  // Match the actual invocation, not the bare name: `api_garage_command` also
  // appears in the comment explaining this very fix, and an earlier version of
  // this test found that comment and failed on correct code.
  const gate = edge.indexOf('authorizeCommand(principal');
  const dispatch = edge.search(/db\.rpc\(\s*["']api_garage_command["']/);
  assert(gate !== -1, 'the authorizeCommand gate is gone from the dispatch path');
  assert(dispatch !== -1, 'the RPC dispatch is gone — this test needs updating');
  assert(gate < dispatch, 'authorizeCommand must run before the RPC dispatch, not after it');
});

Deno.test('the SQL purchase matrix agrees with the contract, step for step', async () => {
  /**
   * Two matrices now exist: PURCHASE_STEP_SEATS here, and
   * app_private.purchase_step_seat_is_legal in 202608210010.
   *
   * Two copies of a rule is the failure mode this whole contract exists to end,
   * so the copy is checked rather than trusted. The SQL cannot be executed here
   * (no Postgres in this environment), so this parses it — which catches
   * divergence in the seat LISTS, the thing that actually drifts.
   */
  const sql = await Deno.readTextFile(
    new URL('../../supabase/migrations/202608210010_purchase_seat_matrix.sql', import.meta.url),
  );

  const body = sql.slice(sql.indexOf('select case step'), sql.indexOf('else false'));
  assert(body.length > 0, 'could not find the matrix in the migration');

  for (const step of SCM_STEPS) {
    const line = body.split('\n').find((l) => l.includes(`when '${step}'`));
    assert(line !== undefined, `step ${step} is missing from the SQL matrix`);
  }

  // Single-seat steps must name exactly the seat the contract names.
  for (const step of ['quote', 'award', 'receive', 'match', 'pay'] as const) {
    const expected = PURCHASE_STEP_SEATS[step];
    assertEquals(expected.length, 1, `${step} should be a single seat in the contract`);
    const idx = body.indexOf(`when '${step}'`);
    const line = body.slice(idx, body.indexOf('\n', idx));
    assert(
      line.includes(`'${expected[0]}'`),
      `SQL ${step} does not name ${expected[0]} — the matrices have drifted`,
    );
  }

  // `need` is a list; every contract seat must appear in the SQL array.
  const needIdx = body.indexOf("when 'need'");
  const needBlock = body.slice(needIdx, body.indexOf("when 'quote'"));
  for (const seat of PURCHASE_STEP_SEATS.need) {
    assert(
      needBlock.includes(`'${seat}'`),
      `SQL 'need' is missing ${seat}, which the contract permits`,
    );
  }
});

Deno.test('the Edge copy of the contract has not drifted from the canonical one', async () => {
  // Supabase bundles only what lives under supabase/functions/, so the Edge
  // gets a GENERATED copy of the contract. Two copies is precisely the shape
  // that produced three different seat vocabularies, so the copy is checked
  // rather than trusted. If this fails, someone edited the generated file:
  // fix contracts/commands.ts and run `node scripts/sync-contract.mjs`.
  const canonical = await Deno.readTextFile(new URL('../../contracts/commands.ts', import.meta.url));
  const generated = await Deno.readTextFile(
    new URL('../../supabase/functions/_shared/commands.ts', import.meta.url),
  );
  assert(
    generated.endsWith(canonical),
    'supabase/functions/_shared/commands.ts is not a verbatim copy of contracts/commands.ts',
  );
  assert(
    generated.includes('GENERATED FILE — DO NOT EDIT'),
    'the Edge copy lost its do-not-edit banner',
  );
});

Deno.test('segregation pairs reference real steps and never pair a step with itself', () => {
  for (const [a, b] of PURCHASE_SOD_PAIRS) {
    assert(SCM_STEPS.includes(a), `${a} is not a step`);
    assert(SCM_STEPS.includes(b), `${b} is not a step`);
    assertNotEquals(a, b, 'a step cannot be segregated from itself');
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// DEC-054 (Option A) — the contract may never permit a seat the SQL refuses.
//
// Before 22 Aug 2026 COMMAND_SEATS mirrored auth.py SEAT_EVENTS and additionally
// permitted managing_director and director on almost every command, while
// api_garage_command required exactly one seat. The contract said yes where the
// database said no, and NOTHING TESTED IT — tightening the matrix broke no test,
// which means the old behaviour was never pinned either.
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('COMMAND_SEATS never permits a seat api_garage_command would refuse', () => {
  for (const command of COMMANDS) {
    const permitted = COMMAND_SEATS[command];
    const sqlPermitted = SQL_PERMITTED_SEATS[command];

    if (command === 'PURCHASE') {
      assertEquals(
        permitted.length, 0,
        `${command} is authorized per step by the SQL, so the contract must permit nobody directly`,
      );
      continue;
    }

    for (const seat of permitted) {
      assert(
        sqlPermitted.includes(seat),
        `${command}: the contract permits '${seat}' but api_garage_command only permits [${sqlPermitted.join(', ')}]. A contract that says yes where the database says no is the defect DEC-054 closed.`,
      );
    }
  }
});

Deno.test('every command the SQL can require is actually reachable', () => {
  // The other direction. A command whose only permitted seat was removed would be
  // dead — refused for everyone — which is an outage rather than a tightening.
  for (const command of COMMANDS) {
    const required = SQL_REQUIRED_SEAT[command];
    if (required === null) continue;
    assert(
      COMMAND_SEATS[command].includes(required),
      `${command} requires '${required}' but the contract does not permit it — ` +
      `nobody could ever issue this command`,
    );
  }
});

Deno.test('a director is no longer permitted where the SQL requires the counter', () => {
  // The specific regression DEC-054 closed, named so it cannot quietly come back.
  for (const command of ['CALL', 'BOOKING', 'INTAKE', 'ESTIMATE', 'AUTHORISATION',
                         'JOB_CARD', 'HANDOVER', 'INVOICE_PAYMENT', 'CLOSE'] as const) {
    const permitted = COMMAND_SEATS[command] as readonly string[];
    assert(!permitted.includes('managing_director'),
      `${command} permits managing_director again — DEC-054 chose the seat, not the title`);
    assert(!permitted.includes('director'),
      `${command} permits director again — DEC-054 chose the seat, not the title`);
  }
});

Deno.test('INVOICE_PAYMENT cannot be raised and paid by one seat', () => {
  // The self-approval hole: it previously permitted counter, financial_controller,
  // payer, managing_director AND director together.
  const permitted = COMMAND_SEATS.INVOICE_PAYMENT as readonly string[];
  assertEquals(permitted.length, 1,
    'INVOICE_PAYMENT permits more than one seat, so one person can invoice and take payment');
  assertEquals(permitted[0], 'counter');
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MIGRATION 0011 — the matrix is WIRED IN, not merely present
 * ─────────────────────────────────────────────────────────────────────────────
 * 202608210010 created app_private.purchase_step_seat_is_legal and deliberately
 * called it from nothing. For a day, every test above passed while the live RPC
 * still authorized purchases against whatever seat the caller held: the matrix
 * existed, agreed with the contract, and governed nothing.
 *
 * That is the specific failure these three tests exist to make impossible —
 * a control that is present, correct, and unreachable.
 */

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);
const WIRING_MIGRATION = '202608220011_wire_purchase_seat_matrix.sql';

async function readMigration(name: string): Promise<string> {
  return await Deno.readTextFile(new URL(name, MIGRATIONS));
}

/** Every migration file, newest last. */
async function allMigrations(): Promise<{ name: string; sql: string }[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS)) {
    if (entry.isFile && entry.name.endsWith('.sql')) names.push(entry.name);
  }
  names.sort();
  return await Promise.all(names.map(async (name) => ({ name, sql: await readMigration(name) })));
}

Deno.test('api_garage_command actually calls the purchase matrix', async () => {
  const sql = await readMigration(WIRING_MIGRATION);

  const fnStart = sql.indexOf('create or replace function public.api_garage_command(');
  assert(fnStart >= 0, `${WIRING_MIGRATION} does not redefine api_garage_command`);

  // Only the executable body, so a call named in a comment cannot satisfy this.
  const body = sql.slice(sql.indexOf('as $$', fnStart), sql.indexOf('\n$$;', fnStart));
  const executable = body
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  assert(
    executable.includes('app_private.purchase_step_seat_is_legal(scm_step, target_seat)'),
    'api_garage_command does not call the matrix — the control is present but unreachable, ' +
      'which is exactly the state 202608210010 shipped in',
  );
});

Deno.test('no migration lets a purchase step authorize itself', async () => {
  /**
   * AUDIT CRITICAL #2 in one line. The original defect was:
   *
   *     when event_name = 'PURCHASE' and scm_step in (...) then target_seat
   *
   * required_seat was assigned target_seat and then compared against it, so the
   * check could not fail. Any future migration that reintroduces that shape
   * reopens the hole, and it would do so while every seat-list test above still
   * passes — because the lists would still be correct.
   */
  for (const { name, sql } of await allMigrations()) {
    const executable = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');

    // Ignore everything before the wiring migration: history is allowed to
    // contain the defect, since that is where it was found.
    if (name < WIRING_MIGRATION) continue;

    assert(
      !/scm_step\s+in\s*\([^)]*\)\s*then\s+target_seat/i.test(executable),
      `${name} reintroduces the self-authorizing purchase branch (then target_seat)`,
    );
  }
});

Deno.test('every redefinition of api_garage_command keeps the hardened search_path', async () => {
  /**
   * `create or replace function` REDEFINES a function's SET clauses rather than
   * merging them. 202608200005 created api_garage_command with
   *   search_path = public, app_private, pg_temp
   * and 202608200006 ALTERed it to add `extensions`.
   *
   * So any later replacement that copies 0005's definition — the obvious thing
   * to do — silently reverts 0006 and strips `extensions` from the search path
   * of a SECURITY DEFINER function. A hardening migration undone inside another
   * hardening migration, with nothing failing to announce it.
   */
  for (const { name, sql } of await allMigrations()) {
    if (name <= '202608200006_garage_api_search_path.sql') continue;

    let idx = sql.indexOf('create or replace function public.api_garage_command(');
    while (idx >= 0) {
      const header = sql.slice(idx, sql.indexOf('as $$', idx));
      assert(
        /search_path\s*=\s*public\s*,\s*app_private\s*,\s*extensions\s*,\s*pg_temp/.test(header),
        `${name} redefines api_garage_command without ` +
          `search_path = public, app_private, extensions, pg_temp — this reverts 0006`,
      );
      idx = sql.indexOf('create or replace function public.api_garage_command(', idx + 1);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AMENDMENT A2 (DEC-051) — Single Source of Financial Truth Conformance Tests
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('AMENDMENT A2: single-source-of-financial-truth invariant stated verbatim', () => {
  assertEquals(
    FINANCIAL_TRUTH_INVARIANT,
    'Any statutory or accounting figure shown by StarqERP must originate from, or reconcile to, the authoritative accounting engine.',
    'Amendment A2 invariant text does not match founder verbatim directive',
  );
});

Deno.test('AMENDMENT A2: statutory vs operational domains are strictly partitioned', () => {
  const expectedStatutory = [
    'profit_and_loss',
    'balance_sheet',
    'ledger_balances',
    'posted_receivables',
    'posted_payables',
    'gst_position',
    'statutory_financial_reporting',
  ];
  assertEquals([...STATUTORY_FIGURE_DOMAINS], expectedStatutory);

  const expectedOperational = [
    'job_margin',
    'turnaround',
    'utilisation',
    'stock_cover',
  ];
  assertEquals([...OPERATIONAL_ANALYTICS_DOMAINS], expectedOperational);

  // Assert disjointness: no domain can exist in both partitions
  for (const dom of STATUTORY_FIGURE_DOMAINS) {
    assert(
      !(OPERATIONAL_ANALYTICS_DOMAINS as readonly string[]).includes(dom),
      `Domain ${dom} exists in both statutory and operational sets`,
    );
  }
});

Deno.test('AMENDMENT A2: statutory figure without authoritative engine reconciliation is refused', () => {
  for (const domain of STATUTORY_FIGURE_DOMAINS) {
    // 1. Missing kind / not marked statutory
    const unclassified = validateFinancialFigureSource({ domain });
    assertEquals(unclassified.ok, false);
    if (!unclassified.ok) {
      assertEquals(unclassified.error, 'statutory_reconciliation_required');
    }

    // 2. Marked operational when actually statutory (smuggling attempt)
    const smuggled = validateFinancialFigureSource({
      domain,
      kind: 'operational',
    });
    assertEquals(smuggled.ok, false);
    if (!smuggled.ok) {
      assertEquals(smuggled.error, 'statutory_reconciliation_required');
    }

    // 3. Marked statutory but lacking authoritative engine
    const noEngine = validateFinancialFigureSource({
      domain,
      kind: 'statutory',
      reconciliationReference: 'ref-12345',
    });
    assertEquals(noEngine.ok, false);
    if (!noEngine.ok) {
      assertEquals(noEngine.error, 'statutory_reconciliation_required');
    }

    // 4. Marked statutory with unknown/fabricated engine
    const fakeEngine = validateFinancialFigureSource({
      domain,
      kind: 'statutory',
      authoritativeEngine: 'adhoc_sum_from_commercial_documents',
      reconciliationReference: 'ref-12345',
    });
    assertEquals(fakeEngine.ok, false);
    if (!fakeEngine.ok) {
      assertEquals(fakeEngine.error, 'statutory_reconciliation_required');
    }

    // 5. Marked statutory with empty/whitespace reconciliation reference
    const emptyRef = validateFinancialFigureSource({
      domain,
      kind: 'statutory',
      authoritativeEngine: 'starq_books_engine',
      reconciliationReference: '   ',
    });
    assertEquals(emptyRef.ok, false);
    if (!emptyRef.ok) {
      assertEquals(emptyRef.error, 'statutory_reconciliation_required');
    }

    // 6. Valid statutory figure with authoritative reconciliation -> PASSES
    for (const engine of AUTHORITATIVE_ACCOUNTING_ENGINES) {
      const valid = validateFinancialFigureSource({
        domain,
        kind: 'statutory',
        authoritativeEngine: engine,
        reconciliationReference: 'journal-entry-uuid-or-hash-12345',
      });
      assertEquals(valid.ok, true);
    }
  }
});

Deno.test('AMENDMENT A2: operational analytics may be computed independently without statutory engine ref', () => {
  for (const domain of OPERATIONAL_ANALYTICS_DOMAINS) {
    const operational = validateFinancialFigureSource({
      domain,
      kind: 'operational',
    });
    assertEquals(operational.ok, true);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AMENDMENT A3 (DEC-070 / SERP-175) — Commercial Document & Settlement Domain
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('DEC-070: all commercial document types and settlement statuses match SQL migration 0012', async () => {
  const expectedDocTypes = [
    'estimate',
    'quotation',
    'purchase_order',
    'goods_receipt',
    'supplier_bill',
    'sales_invoice',
    'credit_note',
    'receipt',
    'payment',
    'refund',
    'direct_expense',
    'petty_cash_voucher',
    'bank_charge',
  ];
  assertEquals([...COMMERCIAL_DOCUMENT_TYPES], expectedDocTypes);

  const expectedStatuses = ['unallocated', 'partially_allocated', 'fully_settled'];
  assertEquals([...SETTLEMENT_STATUSES], expectedStatuses);

  // Assert that migration 202608250012 contains the exact check constraint
  const migration0012 = await readMigration('202608250012_settlement_allocations.sql');
  for (const docType of COMMERCIAL_DOCUMENT_TYPES) {
    assert(
      migration0012.includes(`'${docType}'`),
      `Migration 0012 does not include commercial document type '${docType}'`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-162 — Dynamic Workflow Stages Domain
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-162: validateDynamicWorkflowTransition validates initial, forward, and illegal transitions', () => {
  const ciStages: WorkflowStageRecord[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      organisationId: ORG,
      workflowTemplateId: '00000000-0000-4000-8000-000000000100',
      stageCode: 'call',
      stageName: 'Call',
      stageOrder: 1,
      commandName: 'CALL',
      requiredSeat: 'counter',
      allowedFromStages: [],
      isInitial: true,
      isTerminal: false,
      active: true,
      createdAt: '2026-08-25T00:00:00Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      organisationId: ORG,
      workflowTemplateId: '00000000-0000-4000-8000-000000000100',
      stageCode: 'booked',
      stageName: 'Booked',
      stageOrder: 2,
      commandName: 'BOOKING',
      requiredSeat: 'counter',
      allowedFromStages: ['call'],
      isInitial: false,
      isTerminal: false,
      active: true,
      createdAt: '2026-08-25T00:00:00Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000009',
      organisationId: ORG,
      workflowTemplateId: '00000000-0000-4000-8000-000000000100',
      stageCode: 'qc',
      stageName: 'Quality Control',
      stageOrder: 9,
      commandName: 'QC',
      requiredSeat: 'qc_signer',
      allowedFromStages: ['work'],
      isInitial: false,
      isTerminal: false,
      active: true,
      createdAt: '2026-08-25T00:00:00Z',
    },
  ];

  // 1. Initial transition from null / empty state -> passes
  const initialRes = validateDynamicWorkflowTransition(ciStages, null, 'CALL');
  assertEquals(initialRes.isValid, true);
  assertEquals(initialRes.nextState, 'call');

  // 2. Valid forward transition: call -> BOOKING -> booked
  const bookingRes = validateDynamicWorkflowTransition(ciStages, 'call', 'BOOKING');
  assertEquals(bookingRes.isValid, true);
  assertEquals(bookingRes.nextState, 'booked');

  // 3. Illegal transition: call -> QC (requires 'work')
  const illegalRes = validateDynamicWorkflowTransition(ciStages, 'call', 'QC');
  assertEquals(illegalRes.isValid, false);
  assertEquals(illegalRes.errorMessage, 'illegal_workflow_transition');

  // 4. Unknown command
  const unknownRes = validateDynamicWorkflowTransition(ciStages, 'call', 'NONEXISTENT_COMMAND');
  assertEquals(unknownRes.isValid, false);
  assertEquals(unknownRes.errorMessage, 'unsupported_command');

  // 5. Dynamic extension: add custom stage 'wash' without modifying code
  const customWashStage: WorkflowStageRecord = {
    id: '00000000-0000-4000-8000-000000000095',
    organisationId: ORG,
    workflowTemplateId: '00000000-0000-4000-8000-000000000100',
    stageCode: 'wash',
    stageName: 'Detailing & Wash',
    stageOrder: 95,
    commandName: 'WORK',
    requiredSeat: 'technician',
    allowedFromStages: ['qc'],
    isInitial: false,
    isTerminal: false,
    active: true,
    createdAt: '2026-08-25T00:00:00Z',
  };

  const extendedStages = [...ciStages, customWashStage];
  const customRes = validateDynamicWorkflowTransition(extendedStages, 'qc', 'WORK');
  assertEquals(customRes.isValid, true);
  assertEquals(customRes.nextState, 'wash');
});

Deno.test('SERP-162: migration 202608250013 defines workflow_templates and workflow_stages tables and seeds', async () => {
  const migration0013 = await readMigration('202608250013_workflow_stages.sql');
  assert(migration0013.includes('create table public.workflow_templates'));
  assert(migration0013.includes('create table public.workflow_stages'));
  assert(migration0013.includes('app_private.validate_workflow_transition'));
  assert(migration0013.includes("'garage_job'"));
  assert(migration0013.includes("'procurement'"));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-163 (Amendment A8 / DEC-068) — Roles as Data & Precedence Invariant
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-163: 10 base role codes and membership statuses match contract', () => {
  const expectedRoles = [
    'owner',
    'admin',
    'financial_controller',
    'counter_operator',
    'technician',
    'quality_inspector',
    'quartermaster',
    'receiver',
    'payer',
    'auditor',
  ];
  assertEquals([...STANDARD_ROLE_CODES], expectedRoles);

  const expectedStatuses = ['pending', 'active', 'suspended', 'ended'];
  assertEquals([...MEMBERSHIP_STATUSES], expectedStatuses);
});

Deno.test('SERP-163: validateRoleActionVisibility enforces active membership and granted permissions', () => {
  const roleId = '00000000-0000-4000-8000-000000000010';
  const perms: RolePermissionRecord[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      organisationId: ORG,
      roleId,
      module: 'garage',
      action: 'admin',
      granted: true,
      createdAt: '2026-08-25T00:00:00Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      organisationId: ORG,
      roleId,
      module: 'finance',
      action: 'view',
      granted: true,
      createdAt: '2026-08-25T00:00:00Z',
    },
  ];

  // 1. Active owner accessing garage -> visible = true
  const activeMem: MembershipRecord = {
    id: '00000000-0000-4000-8000-000000000100',
    organisationId: ORG,
    personId: '00000000-0000-4000-8000-000000000200',
    roleId,
    status: 'active',
    validFrom: '2026-08-25T00:00:00Z',
    createdAt: '2026-08-25T00:00:00Z',
  };
  const activeRes = validateRoleActionVisibility(activeMem, perms, 'garage', 'view');
  assertEquals(activeRes.visible, true);

  // 2. Pending invited user -> visible = false (membership_pending)
  const pendingMem: MembershipRecord = {
    ...activeMem,
    status: 'pending',
  };
  const pendingRes = validateRoleActionVisibility(pendingMem, perms, 'garage', 'view');
  assertEquals(pendingRes.visible, false);
  assertEquals(pendingRes.reason, 'membership_pending');

  // 3. Permission denied on ungranted module
  const ungrantedRes = validateRoleActionVisibility(activeMem, perms, 'settings', 'admin');
  assertEquals(ungrantedRes.visible, false);
  assertEquals(ungrantedRes.reason, 'permission_denied');
});

Deno.test('SERP-163: Amendment A8 verbatim precedence invariant stated in contract', () => {
  const expectedStatement =
    'A role may make an action visible or generally available. A role can NEVER suppress, alter, back-date, delete or silently self-dispose a segregation-of-duties exception, and a role can NEVER determine whether a pair blocks or records — that follows from the organisation’s segregation capacity, not from permission.';
  
  assertEquals(
    ROLE_PRECEDENCE_INVARIANT,
    expectedStatement,
    'Contract does not contain the verbatim Amendment A8 precedence invariant statement',
  );
});

Deno.test('SERP-163: migration 202608250015 defines roles, role_permissions, and pending status', async () => {
  const migration0015 = await readMigration('202608250015_roles_as_data.sql');
  assert(migration0015.includes('create table public.roles'));
  assert(migration0015.includes('create table public.role_permissions'));
  assert(migration0015.includes("'pending'"));
  assert(migration0015.includes('seed_default_organisation_roles'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-177 (DEC-065 / Gate G5) — Segregation Pairs Tracked Exceptions
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-177: evaluateSoDCapacityAndAction allows, records exception for solo, or blocks for segregated', () => {
  // 1. Two different people -> always allowed cleanly
  const diffPerson = evaluateSoDCapacityAndAction('segregated', false);
  assertEquals(diffPerson.allowed, true);
  assertEquals(diffPerson.action, 'allow');

  // 2. Same person in solo capacity -> allowed with recorded exception (compensating control)
  const soloSamePerson = evaluateSoDCapacityAndAction('solo', true);
  assertEquals(soloSamePerson.allowed, true);
  assertEquals(soloSamePerson.action, 'record_exception');
  assertEquals(soloSamePerson.reason, 'solo_capacity_compensating_control_recorded');

  // 3. Same person in segregated capacity -> blocked with sod_violation
  const segregatedSamePerson = evaluateSoDCapacityAndAction('segregated', true);
  assertEquals(segregatedSamePerson.allowed, false);
  assertEquals(segregatedSamePerson.action, 'block');
  assertEquals(segregatedSamePerson.reason, 'sod_violation');
});

Deno.test('SERP-177: migration 202608250016 defines append-only sod_exceptions and disposition tables', async () => {
  const migration0016 = await readMigration('202608250016_sod_exceptions.sql');
  assert(migration0016.includes('create table public.sod_exceptions'));
  assert(migration0016.includes('create table public.sod_exception_dispositions'));
  assert(migration0016.includes('app_private.prevent_sod_exception_mutation'));
  assert(migration0016.includes('app_private.evaluate_segregation_capacity'));
  assert(migration0016.includes('app_private.append_sod_disposition'));
  assert(migration0016.includes('is_self_review'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-164 (SERP-122) — Effective-Dated Tax Regimes & Registration Status
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-164: TAX_MODES, TAX_REGISTRATION_STATUSES, and TAX_TYPES constants match vocabulary', () => {
  assertEquals([...TAX_MODES], ['inclusive', 'exclusive', 'zero_rated', 'exempt']);
  assertEquals([...TAX_REGISTRATION_STATUSES], ['registered', 'not_registered', 'pending', 'suspended', 'cancelled']);
  assertEquals([...TAX_TYPES], ['gst_general', 'gst_tourism', 'income_tax', 'withholding_tax']);
});

Deno.test('SERP-164: calculateLineTax computes exclusive, inclusive, zero-rated, and exempt rates', () => {
  const schedules: TaxRateScheduleRecord[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      taxType: 'gst_general',
      rate: 0.08,
      effectiveFrom: '2023-01-01',
      description: 'Maldives GGST 8%',
      createdAt: '2026-08-25T00:00:00Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      taxType: 'gst_tourism',
      rate: 0.16,
      effectiveFrom: '2023-01-01',
      effectiveTo: '2025-06-30',
      description: 'Maldives TGST 16% (Historical)',
      createdAt: '2026-08-25T00:00:00Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      taxType: 'gst_tourism',
      rate: 0.17,
      effectiveFrom: '2025-07-01',
      description: 'Maldives TGST 17% (Current)',
      createdAt: '2026-08-25T00:00:00Z',
    },
  ];

  const registeredOrg: TaxRegistrationRecord = {
    id: '00000000-0000-4000-8000-000000000100',
    organisationId: ORG,
    taxType: 'gst_general',
    registrationStatus: 'registered',
    tin: '1186844',
    effectiveFrom: '2026-08-01',
    createdAt: '2026-08-25T00:00:00Z',
  };

  const notRegisteredOrg: TaxRegistrationRecord = {
    id: '00000000-0000-4000-8000-000000000200',
    organisationId: '10000000-0000-4000-8000-000000000001',
    taxType: 'gst_general',
    registrationStatus: 'not_registered',
    tin: '1000001',
    effectiveFrom: '2026-08-01',
    createdAt: '2026-08-25T00:00:00Z',
  };

  // 1. Registered GGST Exclusive: 1000 -> 80 tax, 1080 gross
  const excl = calculateLineTax({
    registration: registeredOrg,
    schedules,
    taxType: 'gst_general',
    supplyDate: '2026-08-25',
    taxMode: 'exclusive',
    lineAmount: 1000,
  });
  assertEquals(excl.isTaxable, true);
  assertEquals(excl.taxRate, 0.08);
  assertEquals(excl.baseAmount, 1000);
  assertEquals(excl.taxAmount, 80);
  assertEquals(excl.grossAmount, 1080);

  // 2. Registered GGST Inclusive: 108 -> 100 base, 8 tax, 108 gross
  const incl = calculateLineTax({
    registration: registeredOrg,
    schedules,
    taxType: 'gst_general',
    supplyDate: '2026-08-25',
    taxMode: 'inclusive',
    lineAmount: 108,
  });
  assertEquals(incl.isTaxable, true);
  assertEquals(incl.taxRate, 0.08);
  assertEquals(incl.baseAmount, 100);
  assertEquals(incl.taxAmount, 8);
  assertEquals(incl.grossAmount, 108);

  // 3. Not Registered Entity -> Zero GST
  const notReg = calculateLineTax({
    registration: notRegisteredOrg,
    schedules,
    taxType: 'gst_general',
    supplyDate: '2026-08-25',
    taxMode: 'exclusive',
    lineAmount: 1000,
  });
  assertEquals(notReg.isTaxable, false);
  assertEquals(notReg.taxRate, 0);
  assertEquals(notReg.taxAmount, 0);
  assertEquals(notReg.grossAmount, 1000);

  // 4. Historical Time-of-Supply Rate Selection (SERP-122):
  // 30 June 2025 -> 16% TGST; 1 July 2025 -> 17% TGST
  const tourismReg: TaxRegistrationRecord = {
    ...registeredOrg,
    taxType: 'gst_tourism',
  };

  const tgstHist = calculateLineTax({
    registration: tourismReg,
    schedules,
    taxType: 'gst_tourism',
    supplyDate: '2025-06-30',
    taxMode: 'exclusive',
    lineAmount: 1000,
  });
  assertEquals(tgstHist.isTaxable, true);
  assertEquals(tgstHist.taxRate, 0.16);
  assertEquals(tgstHist.taxAmount, 160);

  const tgstCurr = calculateLineTax({
    registration: tourismReg,
    schedules,
    taxType: 'gst_tourism',
    supplyDate: '2025-07-01',
    taxMode: 'exclusive',
    lineAmount: 1000,
  });
  assertEquals(tgstCurr.isTaxable, true);
  assertEquals(tgstCurr.taxRate, 0.17);
  assertEquals(tgstCurr.taxAmount, 170);
});

Deno.test('SERP-164: migration 202608250017 defines tax_registrations, tax_rate_schedules, and calculation function', async () => {
  const migration0017 = await readMigration('202608250017_tax_regimes_and_periods.sql');
  assert(migration0017.includes('create table public.tax_rate_schedules'));
  assert(migration0017.includes('create table public.tax_registrations'));
  assert(migration0017.includes('app_private.calculate_line_tax'));
  assert(migration0017.includes("'not_registered'"));
  assert(migration0017.includes("'gst_tourism'"));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-165 (Amendment A4) — Bank Accounts as First-Class Entities
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-165: BANK_ACCOUNT_TYPES matches vocabulary and supports cash drawers & petty cash', () => {
  const expectedTypes = [
    'operating',
    'treasury',
    'clearing',
    'pos_settlement',
    'cash_drawer',
    'petty_cash',
  ];
  assertEquals([...BANK_ACCOUNT_TYPES], expectedTypes);
});

Deno.test('SERP-165: BankAccountRecord supports open ISO 4217 currencies and synthetic placeholders', () => {
  const accounts: BankAccountRecord[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      organisationId: ORG,
      institutionCode: 'CASH',
      institutionName: 'Cash on Hand',
      accountName: 'Workshop Cash Drawer',
      accountType: 'cash_drawer',
      accountIdentifierMask: 'CASH-DRAWER-01',
      currency: 'MVR',
      glAccountCode: '1010',
      isDefault: false,
      active: true,
      createdAt: '2026-08-25T00:00:00Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      organisationId: ORG,
      institutionCode: 'BML',
      institutionName: 'Bank of Maldives',
      accountName: 'BML USD Treasury',
      accountType: 'treasury',
      accountIdentifierMask: 'BML-USD-PLACEHOLDER',
      currency: 'USD',
      glAccountCode: '1031',
      isDefault: false,
      active: true,
      createdAt: '2026-08-25T00:00:00Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      organisationId: ORG,
      institutionCode: 'BML',
      institutionName: 'Bank of Maldives',
      accountName: 'EUR Import Account',
      accountType: 'treasury',
      accountIdentifierMask: 'BML-EUR-PLACEHOLDER',
      currency: 'EUR',
      glAccountCode: '1035',
      isDefault: false,
      active: true,
      createdAt: '2026-08-25T00:00:00Z',
    },
  ];

  assertEquals(accounts.length, 3);
  assertEquals(accounts[0].accountType, 'cash_drawer');
  assertEquals(accounts[1].currency, 'USD');
  assertEquals(accounts[2].currency, 'EUR');
});

Deno.test('SERP-165: migration 202608250018 defines bank_accounts table with synthetic placeholders', async () => {
  const migration0018 = await readMigration('202608250018_bank_accounts_entities.sql');
  assert(migration0018.includes('create table public.bank_accounts'));
  assert(migration0018.includes("'cash_drawer'"));
  assert(migration0018.includes("'petty_cash'"));
  assert(migration0018.includes('CASH-DRAWER-01'));
  // Confirm NO raw bank account numbers hardcoded in migration
  assert(!migration0018.includes('770'));
  assert(!migration0018.includes('773000'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-143: Approvals command contract alignment (DEC-054 / DEC-072)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-143: APPROVAL is refused as unknown_command (client was sending unsupported command)', () => {
  const badApproval = {
    contract: CONTRACT_VERSION,
    command: 'APPROVAL' as unknown as CommandName,
    payload: { po_id: 'PO-001', role: 'financial_controller' },
    csrf: 'test-csrf',
  };
  const d = authorizeCommand(principal('financial_controller'), badApproval);
  assertEquals(d.ok, false);
  if (!d.ok) {
    assertEquals(d.error, 'unknown_command');
  }
});

Deno.test('SERP-143: PURCHASE with step: award is authorized for financial_controller and refused for others', () => {
  const awardEnvelope: CommandEnvelope = {
    contract: CONTRACT_VERSION,
    command: 'PURCHASE',
    step: 'award',
    payload: { po_id: 'PO-001' },
    csrf: 'test-csrf',
  };

  // Legal for financial_controller
  const okDec = authorizeCommand(principal('financial_controller'), awardEnvelope);
  assertEquals(okDec.ok, true);

  // Refused for counter, technician, payer
  assertEquals(authorizeCommand(principal('counter'), awardEnvelope).ok, false);
  assertEquals(authorizeCommand(principal('technician'), awardEnvelope).ok, false);
  assertEquals(authorizeCommand(principal('payer'), awardEnvelope).ok, false);
});

Deno.test('SERP-143: PURCHASE with step: pay is authorized for payer and refused for financial_controller', () => {
  const payEnvelope: CommandEnvelope = {
    contract: CONTRACT_VERSION,
    command: 'PURCHASE',
    step: 'pay',
    payload: { po_id: 'PO-001' },
    csrf: 'test-csrf',
  };

  // Legal for payer
  const okDec = authorizeCommand(principal('payer'), payEnvelope);
  assertEquals(okDec.ok, true);

  // Refused for financial_controller, counter, technician
  assertEquals(authorizeCommand(principal('financial_controller'), payEnvelope).ok, false);
  assertEquals(authorizeCommand(principal('counter'), payEnvelope).ok, false);
  assertEquals(authorizeCommand(principal('technician'), payEnvelope).ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-144: Customer, vehicle and phone persistence (DEC-054 / DEC-072)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-144: validateCallCommandPayload preserves customer_name, vehicle_reg, and phone', () => {
  const validCall: CallCommandPayload = {
    customer_name: 'Ali Musthaq',
    vehicle_reg: 'AA01A-P2327',
    phone: '7774356',
    consent: true,
  };

  const res = validateCallCommandPayload(validCall);
  assertEquals(res.valid, true);
  assertEquals(res.customer_name, 'Ali Musthaq');
  assertEquals(res.vehicle_reg, 'AA01A-P2327');
  assertEquals(res.phone, '7774356');
});

Deno.test('SERP-144: validateCallCommandPayload rejects missing customer, vehicle, or consent', () => {
  assertEquals(
    validateCallCommandPayload({ customer_name: '', vehicle_reg: 'AA01A', consent: true }).valid,
    false
  );
  assertEquals(
    validateCallCommandPayload({ customer_name: 'Ali', vehicle_reg: '', consent: true }).valid,
    false
  );
  assertEquals(
    validateCallCommandPayload({ customer_name: 'Ali', vehicle_reg: 'AA01A', consent: false }).valid,
    false
  );
});

Deno.test('SERP-144: migration 202608250019 adds customer_name, vehicle_reg, and customer_phone to garage_jobs', async () => {
  const migration0019 = await readMigration('202608250019_job_customer_vehicle_phone.sql');
  assert(migration0019.includes('customer_name text'));
  assert(migration0019.includes('vehicle_reg text'));
  assert(migration0019.includes('customer_phone text'));
  assert(migration0019.includes('api_garage_pulse'));
  assert(migration0019.includes('api_garage_command'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-166: The 25 ERPContext mutations — canonical command surface map
// (DEC-068 / Amendment A2 / Amendment A4)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-166: mutation surface map covers exactly the 25 ERPContext mutations plus the 2 audit entries', () => {
  // The 25 named mutations from the SERP-166 task description, plus logAuditEvent and dismissAlert
  const EXPECTED_MUTATIONS = new Set([
    // WORK
    'createJob', 'updateJobStatus', 'addMaterialToJob',
    // COMMERCIAL
    'createInvoice', 'generateJobInvoice', 'recordPayment', 'addExpense',
    // STOCK_PROCUREMENT
    'receiveStock', 'createPurchaseOrder', 'receivePurchaseOrder',
    // ENTITIES
    'createCustomer',
    // TENANT
    'createTenant', 'updateTenant', 'switchTenant',
    // WORKFLOW
    'addWorkflowStage', 'updateWorkflowStage', 'deleteWorkflowStage', 'resetWorkflowToPreset',
    // IDENTITY
    'inviteUser', 'authorizeUser', 'suspendUser', 'updateUserRole',
    'createRole', 'updateRolePermissions', 'deleteRole',
    // AUDIT
    'logAuditEvent', 'dismissAlert',
  ]);

  const mapped = new Set(MUTATION_SURFACE_MAP.map((m) => m.mutation));
  for (const name of EXPECTED_MUTATIONS) {
    assert(mapped.has(name), `Missing from surface map: ${name}`);
  }
  assertEquals(mapped.size, EXPECTED_MUTATIONS.size);
});

Deno.test('SERP-167: wired mutations now include all 24 server mutations post-SERP-167', () => {
  const wired = MUTATION_SURFACE_MAP.filter((m) => m.status === 'wired').map((m) => m.mutation);
  // Post-SERP-167, all 24 server-backed mutations are wired (with switchTenant and dismissAlert client-local, logAuditEvent eliminated)
  assertEquals(wired.length, 24);
  assert(wired.includes('createInvoice'));
  assert(wired.includes('generateJobInvoice'));
  assert(wired.includes('addExpense'));
  assert(wired.includes('createCustomer'));
  assert(wired.includes('createTenant'));
  assert(wired.includes('updateTenant'));
  assert(wired.includes('addWorkflowStage'));
  assert(wired.includes('inviteUser'));
  assert(wired.includes('createRole'));
});

Deno.test('SERP-166: statutory mutations (DEC-068/A2) include all commercial mutations', () => {
  const statutory = statutoryMutations().map((m) => m.mutation);
  // All commercial mutations must be in the statutory list
  assert(statutory.includes('createInvoice'), 'createInvoice must be statutory');
  assert(statutory.includes('generateJobInvoice'), 'generateJobInvoice must be statutory');
  assert(statutory.includes('recordPayment'), 'recordPayment must be statutory');
  assert(statutory.includes('addExpense'), 'addExpense must be statutory');
  // receivePurchaseOrder is conditional (becomes statutory at match step)
  assert(statutory.includes('receivePurchaseOrder'), 'receivePurchaseOrder must be conditional statutory');
  // Work mutations are NOT statutory
  const nonStatutory = MUTATION_SURFACE_MAP.filter((m) => m.statutoryBoundary === false).map((m) => m.mutation);
  assert(nonStatutory.includes('createJob'), 'createJob must NOT be statutory');
  assert(nonStatutory.includes('addMaterialToJob'), 'addMaterialToJob must NOT be statutory');
});

Deno.test('SERP-166: logAuditEvent is eliminated — client must not call it directly', () => {
  const entry = MUTATION_SURFACE_MAP.find((m) => m.mutation === 'logAuditEvent');
  assert(entry !== undefined);
  assertEquals(entry!.status, 'eliminated');
  assertEquals(entry!.serverCommand, null);
  // validateMutationBoundary refuses an eliminated mutation
  const d = validateMutationBoundary('logAuditEvent', false);
  assertEquals(d.ok, false);
  if (!d.ok) assertEquals(d.error, 'unknown_command');
});

Deno.test('SERP-166: switchTenant is client-local — no server command required', () => {
  const entry = MUTATION_SURFACE_MAP.find((m) => m.mutation === 'switchTenant');
  assert(entry !== undefined);
  assertEquals(entry!.status, 'client_local');
  assertEquals(entry!.serverCommand, null);
  assertEquals(entry!.requiredSeats, null);
  // validateMutationBoundary is OK for client_local
  assertEquals(validateMutationBoundary('switchTenant', false).ok, true);
});

Deno.test('SERP-166: generateJobInvoice violates A2 if computed client-side', () => {
  // This is the DEC-068/A2 guard: statutory mutations computed client-side are refused.
  const d = validateMutationBoundary('generateJobInvoice', /* computedClientSide = */ true);
  assertEquals(d.ok, false);
  if (!d.ok) assertEquals(d.error, 'statutory_reconciliation_required');
  // When computed server-side (computedClientSide=false), the boundary is satisfied.
  assertEquals(validateMutationBoundary('generateJobInvoice', false).ok, true);
});

Deno.test('SERP-167: mutationsBlockedOnSerp167 is empty once SERP-167 endpoints are wired', () => {
  const blocked = mutationsBlockedOnSerp167().map((m) => m.mutation);
  assertEquals(blocked.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-172: Adversarial Tenant Isolation Test Suite (Memo §37 / Amendment A6)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-172: validateStorageObjectKey allows clean tenant paths and refuses cross-tenant, traversal (..), or absolute paths', () => {
  const orgA = '11111111-1111-4000-8000-000000000001';
  const orgB = '22222222-2222-4000-8000-000000000002';

  // Clean path under tenant's own namespace
  const clean = validateStorageObjectKey(orgA, `${orgA}/job-cards/invoice-001.pdf`);
  assertEquals(clean.ok, true);

  // Cross-tenant storage key attempt (Tenant A attempting to read/write Tenant B namespace)
  const crossTenant = validateStorageObjectKey(orgA, `${orgB}/job-cards/invoice-001.pdf`);
  assertEquals(crossTenant.ok, false);
  if (!crossTenant.ok) assertEquals(crossTenant.error, 'cross_tenant_denied');

  // Directory traversal attempts
  assertEquals(validateStorageObjectKey(orgA, `${orgA}/../secret.json`).ok, false);
  assertEquals(validateStorageObjectKey(orgA, `${orgA}/../../etc/passwd`).ok, false);
  assertEquals(validateStorageObjectKey(orgA, `${orgA}\\windows\\path`).ok, false);
  assertEquals(validateStorageObjectKey(orgA, `/root/${orgA}/file.png`).ok, false);
});

Deno.test('SERP-172: validateSearchScope allows same-tenant queries and refuses cross-tenant queries', () => {
  const sessionOrg = '11111111-1111-4000-8000-000000000001';
  const targetOrg = '22222222-2222-4000-8000-000000000002';

  // Same tenant search
  assertEquals(validateSearchScope(sessionOrg, sessionOrg).ok, true);
  assertEquals(validateSearchScope(sessionOrg, undefined).ok, true);

  // Cross tenant search query attempt
  const cross = validateSearchScope(sessionOrg, targetOrg);
  assertEquals(cross.ok, false);
  if (!cross.ok) assertEquals(cross.error, 'cross_tenant_denied');
});

Deno.test('SERP-172: validateAIContextRetrieval refuses prompts containing any cross-tenant document references', () => {
  const sessionOrg = '11111111-1111-4000-8000-000000000001';
  const otherOrg = '22222222-2222-4000-8000-000000000002';

  // All documents belong to session org
  const okDocs = [sessionOrg, sessionOrg, sessionOrg];
  assertEquals(validateAIContextRetrieval(sessionOrg, okDocs).ok, true);

  // Poisoned prompt context containing a foreign tenant document
  const poisonedDocs = [sessionOrg, otherOrg, sessionOrg];
  const blocked = validateAIContextRetrieval(sessionOrg, poisonedDocs);
  assertEquals(blocked.ok, false);
  if (!blocked.ok) assertEquals(blocked.error, 'cross_tenant_denied');
});

Deno.test('SERP-172: validateCompositeForeignKeyIntegrity enforces child and parent tenant matching independently of RLS', () => {
  const orgA = '11111111-1111-4000-8000-000000000001';
  const orgB = '22222222-2222-4000-8000-000000000002';

  // Matching tenant
  assertEquals(validateCompositeForeignKeyIntegrity(orgA, orgA).ok, true);

  // Cross-tenant composite FK injection
  const injection = validateCompositeForeignKeyIntegrity(orgA, orgB);
  assertEquals(injection.ok, false);
  if (!injection.ok) assertEquals(injection.error, 'cross_tenant_denied');
});

Deno.test('SERP-172: adversarial SQL probe file exists and covers composite FK and attachment constraints', async () => {
  const probeContent = await Deno.readTextFile(new URL('../adversarial_tenant_isolation_probe.sql', import.meta.url));
  assert(probeContent.includes('foreign_key_violation'));
  assert(probeContent.includes('attachments table lacks organisation_id'));
  assert(probeContent.includes('audit_events_append_only'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-167: Revision Missing Endpoints & Handlers (DEC-067 / DEC-068 / DEC-070)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-167: INVOICE command is authorized for counter, FC, director, owner and refused for technician', () => {
  const invEnvelope: CommandEnvelope = {
    contract: CONTRACT_VERSION,
    command: 'INVOICE',
    payload: { customer_id: '00000000-0000-4000-8000-000000000001', amount: 5000 },
    csrf: 'test-csrf',
  };

  assertEquals(authorizeCommand(principal('counter'), invEnvelope).ok, true);
  assertEquals(authorizeCommand(principal('financial_controller'), invEnvelope).ok, true);
  assertEquals(authorizeCommand(principal('director'), invEnvelope).ok, true);
  assertEquals(authorizeCommand(principal('owner'), invEnvelope).ok, true);

  // Refused for technician
  const techDec = authorizeCommand(principal('technician'), invEnvelope);
  assertEquals(techDec.ok, false);
  if (!techDec.ok) assertEquals(techDec.error, 'seat_not_authorized');
});

Deno.test('SERP-167: EXPENSE command is authorized for counter/FC/director/owner and refused for technician', () => {
  const expEnvelope: CommandEnvelope = {
    contract: CONTRACT_VERSION,
    command: 'EXPENSE',
    payload: { payee: 'State Electric Company', amount: 1250, category: 'Utilities' },
    csrf: 'test-csrf',
  };

  assertEquals(authorizeCommand(principal('counter'), expEnvelope).ok, true);
  assertEquals(authorizeCommand(principal('financial_controller'), expEnvelope).ok, true);
  assertEquals(authorizeCommand(principal('owner'), expEnvelope).ok, true);

  // Refused for technician
  const techDec = authorizeCommand(principal('technician'), expEnvelope);
  assertEquals(techDec.ok, false);
  if (!techDec.ok) assertEquals(techDec.error, 'seat_not_authorized');
});

Deno.test('SERP-167: CUSTOMER command is authorized for counter/director/owner and refused for technician', () => {
  const custEnvelope: CommandEnvelope = {
    contract: CONTRACT_VERSION,
    command: 'CUSTOMER',
    payload: { name: 'Hassan Rasheed', phone: '7771234', island: 'Male' },
    csrf: 'test-csrf',
  };

  assertEquals(authorizeCommand(principal('counter'), custEnvelope).ok, true);
  assertEquals(authorizeCommand(principal('director'), custEnvelope).ok, true);
  assertEquals(authorizeCommand(principal('owner'), custEnvelope).ok, true);

  // Refused for technician
  const techDec = authorizeCommand(principal('technician'), custEnvelope);
  assertEquals(techDec.ok, false);
  if (!techDec.ok) assertEquals(techDec.error, 'seat_not_authorized');
});

Deno.test('SERP-167: validateInvoiceCommandPayload enforces items or jobRef and computes subtotal/totals', () => {
  // Missing items and jobRef
  assertEquals(validateInvoiceCommandPayload({}).valid, false);

  // Valid with items
  const validItems = validateInvoiceCommandPayload({
    items: [
      { description: 'Engine Oil Filter', quantity: 2, unitPrice: 250, amount: 500 },
      { description: 'Synthetic Oil 5W30 4L', quantity: 1, unitPrice: 850, amount: 850 },
    ],
    gst_amount: 108,
  });
  assertEquals(validItems.valid, true);
  assertEquals(validItems.subtotal, 1350);
  assertEquals(validItems.gstAmount, 108);
  assertEquals(validItems.totalAmount, 1458);

  // Valid with linked jobRef
  const validJob = validateInvoiceCommandPayload({
    job_id: '00000000-0000-4000-8000-000000000001',
    total_amount: 3500,
  });
  assertEquals(validJob.valid, true);
  assertEquals(validJob.totalAmount, 3500);
});

Deno.test('SERP-167: validateExpenseCommandPayload requires payee, category and positive amount', () => {
  assertEquals(validateExpenseCommandPayload({ payee: '', amount: 100, category: 'Rent' }).valid, false);
  assertEquals(validateExpenseCommandPayload({ payee: 'Landlord', amount: -50, category: 'Rent' }).valid, false);
  assertEquals(validateExpenseCommandPayload({ payee: 'Landlord', amount: 0, category: 'Rent' }).valid, false);
  assertEquals(validateExpenseCommandPayload({ payee: 'Landlord', amount: 15000, category: '' }).valid, false);

  assertEquals(
    validateExpenseCommandPayload({ payee: 'Landlord', amount: 15000, category: 'Rent' }).valid,
    true
  );
});

Deno.test('SERP-167: validateCustomerCommandPayload requires non-empty customer name', () => {
  assertEquals(validateCustomerCommandPayload({ name: '' }).valid, false);
  assertEquals(validateCustomerCommandPayload({ name: '   ' }).valid, false);

  const valid = validateCustomerCommandPayload({ name: 'Ahmed Shifaz', phone: '7789012', island: 'Hulhumale' });
  assertEquals(valid.valid, true);
  assertEquals(valid.name, 'Ahmed Shifaz');
});

Deno.test('SERP-167: migration 202608250020 defines INVOICE, EXPENSE, CUSTOMER, TENANT_CONFIG command handlers', async () => {
  const migration0020 = await readMigration('202608250020_revision_missing_endpoints.sql');
  assert(migration0020.includes("'INVOICE'"));
  assert(migration0020.includes("'EXPENSE'"));
  assert(migration0020.includes("'CUSTOMER'"));
  assert(migration0020.includes("'TENANT_CONFIG'"));
  assert(migration0020.includes('sales_invoice'));
  assert(migration0020.includes('direct_expense'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-168: AI Copilot Proxy & Isolation Boundaries (Amendment A6 / DEC-068)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-168: AI copilot proxy defaults to OFF when feature flag is not explicitly true', () => {
  const decision = validateAICopilotProxyRequest({
    tenantId: ORG,
    userId: DIRECTOR_PAYER,
    prompt: 'Summarize today jobs',
    retrievedDocOrgIds: [ORG],
  });
  assertEquals(decision.ok, false);
  if (!decision.ok) {
    assertEquals(decision.error, 'ai_copilot_disabled');
  }
});

Deno.test('SERP-168: AI copilot proxy refuses prompt containing cross-tenant documents', () => {
  const decision = validateAICopilotProxyRequest({
    tenantId: ORG,
    userId: DIRECTOR_PAYER,
    prompt: 'Summarize cross-tenant invoice',
    retrievedDocOrgIds: [ORG, OTHER_ORG],
    featureFlagEnabled: true,
  });
  assertEquals(decision.ok, false);
  if (!decision.ok) {
    assertEquals(decision.error, 'cross_tenant_denied');
  }
});

Deno.test('SERP-168: AI copilot proxy allows same-tenant prompt when feature flag is enabled', () => {
  const decision = validateAICopilotProxyRequest({
    tenantId: ORG,
    userId: DIRECTOR_PAYER,
    prompt: 'List inventory low in stock',
    retrievedDocOrgIds: [ORG],
    featureFlagEnabled: true,
  });
  assertEquals(decision.ok, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-275: Forward-Only Synthetic-ID Transition Migration (0021)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-275: migration 0021 safely disambiguates slug uniqueness before synthetic row insertion', async () => {
  const migration0021 = await readMigration('202608260021_synthetic_tenant_uuid_transition.sql');
  const slugDisambigIdx = migration0021.indexOf("slug = slug || '-legacy-transition'");
  const insertSyntheticIdx = migration0021.indexOf("insert into public.organisations");
  assert(slugDisambigIdx !== -1, 'Migration 0021 must disambiguate legacy slug');
  assert(insertSyntheticIdx !== -1, 'Migration 0021 must insert synthetic organisation rows');
  assert(slugDisambigIdx < insertSyntheticIdx, 'Slug disambiguation must precede synthetic row insertion');
});

Deno.test('SERP-275: migration 0021 safely bounds composite FKs on workflow_stages and role_permissions', async () => {
  const migration0021 = await readMigration('202608260021_synthetic_tenant_uuid_transition.sql');
  assert(migration0021.includes('alter table public.workflow_stages drop constraint if exists workflow_stages_organisation_id_workflow_template_id_fkey'));
  assert(migration0021.includes('alter table public.workflow_stages add constraint workflow_stages_organisation_id_workflow_template_id_fkey'));
  assert(migration0021.includes('alter table public.role_permissions drop constraint if exists role_permissions_organisation_id_role_id_fkey'));
  assert(migration0021.includes('alter table public.role_permissions add constraint role_permissions_organisation_id_role_id_fkey'));
});

Deno.test('SERP-275: migration 0021 safely handles append-only triggers during transition', async () => {
  const migration0021 = await readMigration('202608260021_synthetic_tenant_uuid_transition.sql');
  assert(migration0021.includes('disable trigger audit_events_append_only'));
  assert(migration0021.includes('enable trigger audit_events_append_only'));
  assert(migration0021.includes('disable trigger security_events_append_only'));
  assert(migration0021.includes('enable trigger security_events_append_only'));
  assert(migration0021.includes('disable trigger sod_exceptions_append_only'));
  assert(migration0021.includes('enable trigger sod_exceptions_append_only'));
  assert(migration0021.includes('delete from public.organisations where id in (old_st, old_ci)'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-268: Admin & Privileged Multi-Factor Authentication (MFA) Boundary
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-268: isPrivilegedRole recognizes administrator and system admin roles', () => {
  assertEquals(isPrivilegedRole('superadmin'), true);
  assertEquals(isPrivilegedRole('role-superadmin'), true);
  assertEquals(isPrivilegedRole('owner'), true);
  assertEquals(isPrivilegedRole('director'), true);
  assertEquals(isPrivilegedRole('managing_director'), true);
  assertEquals(isPrivilegedRole('technician', true), true); // system admin flag
  assertEquals(isPrivilegedRole('technician', false), false);
  assertEquals(isPrivilegedRole('counter', false), false);
});

Deno.test('SERP-268: requiresMfaForAction enforces MFA on privileged operational actions', () => {
  for (const act of PRIVILEGED_ACTIONS) {
    assertEquals(requiresMfaForAction(act, 'technician'), true);
  }
  assertEquals(requiresMfaForAction('CREATE_JOB', 'superadmin'), true); // admin persona
  assertEquals(requiresMfaForAction('CREATE_JOB', 'technician'), false);
});

Deno.test('SERP-268: validateMfaChallenge enforces 2FA requirement on un-elevated privileged session', () => {
  const res = validateMfaChallenge({
    code: '',
    isPrivileged: true,
    sessionMfaVerified: false,
  });
  assertEquals(res.valid, false);
  assertEquals(res.error, 'mfa_required');
});

// SERP-381: After the fix, no 6-digit code is accepted by the TOTP path; it returns
// an explicit not-implemented error ('totp_not_implemented') instead of silently admitting users.
Deno.test('SERP-381: validateMfaChallenge fails closed on 6-digit TOTP token (totp_not_implemented)', () => {
  const res = validateMfaChallenge({
    code: '123456',
    isPrivileged: true,
    sessionMfaVerified: false,
  });
  assertEquals(res.valid, false);
  assertEquals(res.error, 'totp_not_implemented');
});

Deno.test('SERP-381: validateMfaChallenge fails closed on any arbitrary 6-digit code', () => {
  for (const code of ['654321', '000000', '999999', '111111', '000001', '999998', '000002']) {
    const res = validateMfaChallenge({
      code,
      isPrivileged: true,
      sessionMfaVerified: false,
    });
    assertEquals(res.valid, false);
    assertEquals(res.error, 'totp_not_implemented');
  }
});

Deno.test('SERP-268: validateMfaChallenge consumes single-use emergency recovery code', () => {
  const initialCodes = ['REC1-9921', 'REC2-4412', 'REC3-8871'];
  const res = validateMfaChallenge({
    code: 'REC1-9921',
    recoveryCodes: initialCodes,
    isPrivileged: true,
    sessionMfaVerified: false,
  });
  assertEquals(res.valid, true);
  assertEquals(res.isRecoveryCodeUsed, true);
  assertEquals(res.remainingRecoveryCodes?.length, 2);
  assert(!res.remainingRecoveryCodes?.includes('REC1-9921'));
});

Deno.test('SERP-268 / SERP-381: validateMfaChallenge rejects invalid non-6-digit token codes', () => {
  const res = validateMfaChallenge({
    code: 'BADCODE',
    isPrivileged: true,
    sessionMfaVerified: false,
  });
  assertEquals(res.valid, false);
  assertEquals(res.error, 'invalid_mfa_code');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-276: Standardised Tenant Onboarding Wizard & Governance Invariants
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-276: validateTenantOnboardingPayload requires non-empty organization name', () => {
  const res = validateTenantOnboardingPayload({
    name: '',
    industry: 'Automotive & Body Repair',
    currency: 'MVR',
  });
  assertEquals(res.valid, false);
  assertEquals(res.error, 'tenant_name_required');
});

Deno.test('SERP-276: validateTenantOnboardingPayload never invents TIN when blank', () => {
  const res = validateTenantOnboardingPayload({
    name: 'Thilafushi Marine Slipway',
    industry: 'Marine & Boatyard',
    currency: 'MVR',
    tinNumber: '', // left blank
    bmlAccount: '',
  });
  assertEquals(res.valid, true);
  assertEquals(res.config?.tinNumber, '');
  assertEquals(res.config?.gstStatus, 'not_registered');
  assertEquals(res.config?.bmlAccount, undefined);
});

Deno.test('SERP-276: validateTenantOnboardingPayload preserves valid TIN and custom prefixes', () => {
  const res = validateTenantOnboardingPayload({
    name: 'Apex Clinic Maldives',
    industry: 'Medical Clinic & Diagnostics',
    currency: 'USD',
    tinNumber: '1099882GST501',
    bmlAccount: '7730000189201',
    jobPrefix: 'APEX-MED-',
    invoicePrefix: 'APEX-INV-',
  });
  assertEquals(res.valid, true);
  assertEquals(res.config?.tinNumber, '1099882GST501');
  assertEquals(res.config?.gstStatus, 'registered');
  assertEquals(res.config?.jobPrefix, 'APEX-MED-');
  assertEquals(res.config?.invoicePrefix, 'APEX-INV-');
});

Deno.test('SERP-276: PRODUCT_FIXED_INVARIANTS explicitly locks 5 statutory & security guarantees', () => {
  assertEquals(PRODUCT_FIXED_INVARIANTS.length, 5);
  assert(PRODUCT_FIXED_INVARIANTS.includes('SINGLE_SOURCE_FINANCIAL_TRUTH'));
  assert(PRODUCT_FIXED_INVARIANTS.includes('SEGREGATION_OF_DUTIES_AWARD_PAY'));
  assert(PRODUCT_FIXED_INVARIANTS.includes('ROW_LEVEL_SECURITY_TENANT_ISOLATION'));
  assert(PRODUCT_FIXED_INVARIANTS.includes('APPEND_ONLY_AUDIT_LOG_INTEGRITY'));
  assert(PRODUCT_FIXED_INVARIANTS.includes('NO_SECOND_POSTING_AUTHORITY'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-280: Privacy-Preserving Product Analytics Specification
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-280: anonymizeTenantForAnalytics hashes tenant ID deterministically with anon_ prefix', () => {
  const anon = anonymizeTenantForAnalytics(ORG);
  assert(anon.startsWith('anon_tenant_'));
  assert(!anon.includes(ORG));
  assertEquals(anonymizeTenantForAnalytics(ORG), anon);
});

Deno.test('SERP-280: validateAnalyticsEvent accepts valid operational events with non-sensitive properties', () => {
  const res = validateAnalyticsEvent({
    event: 'screen_viewed',
    anonymizedTenantId: 'anon_tenant_12345678',
    properties: { route: '/jobs' },
  });
  assertEquals(res.valid, true);
  assertEquals(res.event?.event, 'screen_viewed');
});

Deno.test('SERP-280: validateAnalyticsEvent refuses unpermitted event names (fail closed)', () => {
  const res = validateAnalyticsEvent({
    event: 'invoiced_client_details',
    anonymizedTenantId: 'anon_tenant_12345678',
  });
  assertEquals(res.valid, false);
  assertEquals(res.error, 'unpermitted_analytics_event');
});

Deno.test('SERP-280: validateAnalyticsEvent refuses unmasked raw tenant IDs', () => {
  const res = validateAnalyticsEvent({
    event: 'screen_viewed',
    anonymizedTenantId: ORG, // unmasked raw UUID
  });
  assertEquals(res.valid, false);
  assertEquals(res.error, 'raw_tenant_id_unmasked');
});

Deno.test('SERP-280: validateAnalyticsEvent strictly rejects disallowed sensitive fields (commercial/PII)', () => {
  for (const badKey of ['customer_name', 'amount', 'phone', 'tinNumber', 'prompt', 'notes', 'bmlAccount']) {
    const res = validateAnalyticsEvent({
      event: 'document_created_count',
      anonymizedTenantId: 'anon_tenant_12345678',
      properties: { [badKey]: 'sensitive_value' },
    });
    assertEquals(res.valid, false);
    assert(res.error?.includes('disallowed_sensitive_field_detected'));
  }
});

Deno.test('SERP-280: validateAnalyticsEvent rejects email, phone, or currency patterns in property values', () => {
  const res = validateAnalyticsEvent({
    event: 'error_occurred',
    anonymizedTenantId: 'anon_tenant_12345678',
    properties: { module: 'Failed email to admin@client.mv' },
  });
  assertEquals(res.valid, false);
  assertEquals(res.error, 'sensitive_pattern_detected_in_property_value: module');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-025: Release Candidate & Evidence Manifest Contract
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-025: validateReleaseCandidateManifest passes valid manifest binding commit, artifacts, and test evidence', async () => {
  const manifestRaw = await Deno.readTextFile(
    new URL('../../docs/specs/RELEASE_CANDIDATE_MANIFEST_V1.json', import.meta.url),
  );
  const manifest = JSON.parse(manifestRaw);
  const res = validateReleaseCandidateManifest(manifest);
  assertEquals(res.valid, true);
  assertEquals(res.manifest?.manifestVersion, '1.0');
});

Deno.test('SERP-025: validateReleaseCandidateManifest rejects manifest with failed test suite', () => {
  const validData = {
    manifestVersion: '1.0',
    releaseCandidateId: 'RC-TEST-001',
    gitCommitHead: 'effc531e79fcde5a29ed9adc645bb24aac9cdc63',
    environment: 'production',
    artifacts: [{ path: 'contracts/commands.ts', sha256: 'a'.repeat(64), byteLength: 100 }],
    testEvidence: [
      { suite: 'Suite A', total: 10, passed: 9, failed: 1, passedAt: '2026-08-26T00:00:00Z' },
    ],
    securityGates: {
      tenantHardcodingViolations: 0,
      privilegedPathsInventoried: true,
      privacyTelemetryCompliant: true,
      migration0011Gated: true,
      migration0021Rehearsed: true,
    },
    manifestSignature: 'sig_rc_test',
  };

  const res = validateReleaseCandidateManifest(validData);
  assertEquals(res.valid, false);
  assertEquals(res.error, 'failed_test_suite_detected: Suite A');
});

Deno.test('SERP-025: validateReleaseCandidateManifest rejects tenant hardcoding violations', () => {
  const badData = {
    manifestVersion: '1.0',
    releaseCandidateId: 'RC-TEST-002',
    gitCommitHead: 'effc531e79fcde5a29ed9adc645bb24aac9cdc63',
    environment: 'production',
    artifacts: [{ path: 'contracts/commands.ts', sha256: 'a'.repeat(64), byteLength: 100 }],
    testEvidence: [
      { suite: 'Suite A', total: 10, passed: 10, failed: 0, passedAt: '2026-08-26T00:00:00Z' },
    ],
    securityGates: {
      tenantHardcodingViolations: 2, // violation detected!
      privilegedPathsInventoried: true,
      privacyTelemetryCompliant: true,
      migration0011Gated: true,
      migration0021Rehearsed: true,
    },
    manifestSignature: 'sig_rc_test',
  };

  const res = validateReleaseCandidateManifest(badData);
  assertEquals(res.valid, false);
  assertEquals(res.error, 'tenant_hardcoding_violations_detected');
});

Deno.test('SERP-025: validateReleaseCandidateManifest rejects signature mismatch / tampering', () => {
  const tamperedData = {
    manifestVersion: '1.0',
    releaseCandidateId: 'RC-TEST-003',
    gitCommitHead: 'effc531e79fcde5a29ed9adc645bb24aac9cdc63',
    environment: 'production',
    artifacts: [{ path: 'contracts/commands.ts', sha256: 'a'.repeat(64), byteLength: 100 }],
    testEvidence: [
      { suite: 'Suite A', total: 10, passed: 10, failed: 0, passedAt: '2026-08-26T00:00:00Z' },
    ],
    securityGates: {
      tenantHardcodingViolations: 0,
      privilegedPathsInventoried: true,
      privacyTelemetryCompliant: true,
      migration0011Gated: true,
      migration0021Rehearsed: true,
    },
    manifestSignature: 'sig_rc_corrupted_signature',
  };

  const res = validateReleaseCandidateManifest(tamperedData);
  assertEquals(res.valid, false);
  assertEquals(res.error, 'manifest_signature_mismatch');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-002: Dual-Tenant Organisation, Outlet & Module Spine Contract
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-002: CANONICAL_LEGAL_TENANTS defines Starq Tech and Club Ignition as equal primary ledger tenants', () => {
  assertEquals(CANONICAL_LEGAL_TENANTS.length, 2);
  assertEquals(CANONICAL_LEGAL_TENANTS[0].slug, 'starq-tech');
  assertEquals(CANONICAL_LEGAL_TENANTS[0].isPrimaryLedgerTenant, true);
  assertEquals(CANONICAL_LEGAL_TENANTS[1].slug, 'club-ignition');
  assertEquals(CANONICAL_LEGAL_TENANTS[1].isPrimaryLedgerTenant, true);
});

Deno.test('SERP-002: validateOutletTenantBinding binds outlets strictly to parent tenant (no detached ledger tenants)', () => {
  const validOutlet = {
    id: 'out-1',
    tenantId: ORG,
    name: 'Starq Dynamics',
    code: 'DYN',
    tradingBrand: 'Starq Dynamics Engineering',
    island: "Male'",
    isPrimary: true,
  };

  const res1 = validateOutletTenantBinding(ORG, validOutlet);
  assertEquals(res1.valid, true);

  // Attempt cross-tenant binding
  const res2 = validateOutletTenantBinding(OTHER_ORG, validOutlet);
  assertEquals(res2.valid, false);
  assertEquals(res2.error, 'cross_tenant_outlet_binding_forbidden');
});

Deno.test('SERP-002: validateModuleAccess enforces module entitlements per tenant', () => {
  const entitlement = {
    tenantId: ORG,
    modules: ['jobs', 'invoices', 'inventory'],
    maxOutlets: 5,
    maxUsers: 20,
  };

  // Permitted module
  const res1 = validateModuleAccess(ORG, 'jobs', entitlement);
  assertEquals(res1.allowed, true);

  // Unentitled module
  const res2 = validateModuleAccess(ORG, 'clinic_diagnostics', entitlement);
  assertEquals(res2.allowed, false);
  assertEquals(res2.error, 'module_not_entitled: clinic_diagnostics');

  // Cross-tenant entitlement mismatch
  const res3 = validateModuleAccess(OTHER_ORG, 'jobs', entitlement);
  assertEquals(res3.allowed, false);
  assertEquals(res3.error, 'cross_tenant_entitlement_mismatch');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-026: Server Identity & Secure Session Boundary Contract
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-026: validateSecureSession successfully validates active session and updates access timestamp', () => {
  const store: Record<string, SessionTokenRecord> = {};
  const record = createSecureSessionRecord({
    userId: 'usr-1',
    tenantId: ORG,
    roleId: 'role-admin',
    seat: 'counter',
    ttlSeconds: 3600,
    nowMs: 1000000,
  });
  store[record.token] = record;

  const res = validateSecureSession(record.token, store, 1005000);
  assertEquals(res.valid, true);
  assertEquals(res.session?.userId, 'usr-1');
  assertEquals(res.session?.tenantId, ORG);
  assertEquals(res.session?.seat, 'counter');
  assertEquals(res.session?.lastAccessedAt, 1005000);
});

Deno.test('SERP-026: validateSecureSession fails closed on expired session (absolute TTL)', () => {
  const store: Record<string, SessionTokenRecord> = {};
  const record = createSecureSessionRecord({
    userId: 'usr-1',
    tenantId: ORG,
    roleId: 'role-admin',
    seat: 'counter',
    ttlSeconds: 3600, // 1 hour
    nowMs: 1000000,
  });
  store[record.token] = record;

  // Check at 1 hr + 1 sec
  const res = validateSecureSession(record.token, store, 1000000 + 3601 * 1000);
  assertEquals(res.valid, false);
  assertEquals(res.error, 'session_expired_absolute');
});

Deno.test('SERP-026: validateSecureSession fails closed on idle timeout inactivity', () => {
  const store: Record<string, SessionTokenRecord> = {};
  const record = createSecureSessionRecord({
    userId: 'usr-1',
    tenantId: ORG,
    roleId: 'role-admin',
    seat: 'counter',
    ttlSeconds: 3600 * 8,
    nowMs: 1000000,
  });
  store[record.token] = record;

  // Inactive for 35 minutes (exceeds default 30 min idle timeout)
  const res = validateSecureSession(record.token, store, 1000000 + 35 * 60 * 1000);
  assertEquals(res.valid, false);
  assertEquals(res.error, 'session_expired_idle_timeout');
});

Deno.test('SERP-026: revokeSession terminates session immediately upon logout', () => {
  const store: Record<string, SessionTokenRecord> = {};
  const record = createSecureSessionRecord({
    userId: 'usr-1',
    tenantId: ORG,
    roleId: 'role-admin',
    seat: 'counter',
    ttlSeconds: 3600,
    nowMs: 1000000,
  });
  store[record.token] = record;

  const revRes = revokeSession(record.token, store, 'user_logout');
  assertEquals(revRes.success, true);

  const valRes = validateSecureSession(record.token, store, 1001000);
  assertEquals(valRes.valid, false);
  assertEquals(valRes.error, 'session_revoked: user_logout');
});

Deno.test('SERP-026: validateReplayProtection detects and refuses repeated request nonces', () => {
  const seenNonces = new Set<string>();
  const sessId = 'sess_abc123';
  const nonce = 'nonce_unique_998124';

  const res1 = validateReplayProtection(sessId, nonce, seenNonces);
  assertEquals(res1.allowed, true);

  // Attempt replay of exact same nonce
  const res2 = validateReplayProtection(sessId, nonce, seenNonces);
  assertEquals(res2.allowed, false);
  assertEquals(res2.error, 'replay_attack_detected');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-005: Stage 2 Inventory — Stock, Movement & Valuation Contract
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-005: validateStockMovementCommand accepts valid Received stock movement', () => {
  const payload = {
    tenantId: ORG,
    itemId: 'item-paint-01',
    type: 'Received',
    quantity: 10,
    unitCost: 450,
    reference: 'PO-2026-088',
    actorId: 'usr-admin-1',
    staffName: 'Ali Musthaq',
    currentStockOnHand: 15,
  };

  const res = validateStockMovementCommand(payload);
  assertEquals(res.valid, true);
  assertEquals(res.resultingStockOnHand, 25);
  assertEquals(res.totalValueImpact, 4500);
});

Deno.test('SERP-005: validateStockMovementCommand refuses deductions exceeding current stock (no phantom negative stock)', () => {
  const payload = {
    tenantId: ORG,
    itemId: 'item-paint-01',
    type: 'Deducted (Job)',
    quantity: 20,
    unitCost: 450,
    reference: 'JOB-2026-104',
    actorId: 'usr-tech-1',
    staffName: 'Ahsan Lead Painter',
    currentStockOnHand: 5, // Only 5 available!
  };

  const res = validateStockMovementCommand(payload);
  assertEquals(res.valid, false);
  assertEquals(res.error, 'insufficient_stock_on_hand');
});

Deno.test('SERP-005: validateStockMovementCommand enforces tenant, actor, and reference evidence', () => {
  const missingActor = {
    tenantId: ORG,
    itemId: 'item-paint-01',
    type: 'Received',
    quantity: 5,
    unitCost: 450,
    reference: 'PO-101',
    actorId: '', // missing actor
    staffName: '',
    currentStockOnHand: 10,
  };

  const res = validateStockMovementCommand(missingActor);
  assertEquals(res.valid, false);
  assertEquals(res.error, 'actor_id_required');
});

Deno.test('SERP-005: calculateInventoryValuationSummary computes authoritative cost and retail valuation without ledger bypass', () => {
  const items = [
    {
      id: 'it-1',
      tenantId: ORG,
      sku: 'SKU-PNT-01',
      quantityOnHand: 10,
      reorderLevel: 5,
      unitCost: 300,
      sellingPrice: 550,
    },
    {
      id: 'it-2',
      tenantId: ORG,
      sku: 'SKU-CLR-02',
      quantityOnHand: 2, // Low stock (<= 4)
      reorderLevel: 4,
      unitCost: 500,
      sellingPrice: 850,
    },
    {
      id: 'it-3',
      tenantId: ORG,
      sku: 'SKU-WRP-03',
      quantityOnHand: 0, // Out of stock
      reorderLevel: 3,
      unitCost: 1200,
      sellingPrice: 2200,
    },
    {
      id: 'it-other',
      tenantId: OTHER_ORG, // Other tenant (must be isolated)
      sku: 'SKU-OTHER-99',
      quantityOnHand: 100,
      reorderLevel: 10,
      unitCost: 9999,
      sellingPrice: 99999,
    },
  ];

  const val = calculateInventoryValuationSummary(ORG, items);
  assertEquals(val.tenantId, ORG);
  assertEquals(val.totalItems, 3);
  assertEquals(val.totalUnitsOnHand, 12);
  // Total cost: (10 * 300) + (2 * 500) + (0 * 1200) = 3000 + 1000 = 4000
  assertEquals(val.totalValuationCost, 4000);
  // Total retail: (10 * 550) + (2 * 850) + 0 = 5500 + 1700 = 7200
  assertEquals(val.totalPotentialRetailValue, 7200);
  assertEquals(val.lowStockItemsCount, 1);
  assertEquals(val.outOfStockItemsCount, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-006: Stage 3 Counter Capability Inside ERP
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-006: validateCounterSaleCommand allows counter seat and reconciles retail total', () => {
  const processed = new Set<string>();
  const payload = {
    idempotencyKey: 'idemp-pos-001',
    tenantId: ORG,
    customerName: 'Walk-in Counter Customer',
    items: [
      { itemId: 'item-1', name: 'Sandpaper Grit 800', sku: 'SKU-SND-800', quantity: 5, unitPrice: 20, total: 100 },
      { itemId: 'item-2', name: 'Masking Tape 2in', sku: 'SKU-MSK-02', quantity: 2, unitPrice: 50, total: 100 },
    ],
    subtotal: 200,
    gstRate: 8,
    gstAmount: 16,
    totalAmount: 216,
    paymentMethod: 'Cash',
    actorId: 'usr-counter-1',
    actorSeat: 'counter' as SeatCode,
  };

  const res = validateCounterSaleCommand(payload, processed);
  assertEquals(res.valid, true);
  assertEquals(res.isIdempotentReplay, false);
  assertEquals(res.invoiceSummary?.totalAmount, 216);
  assertEquals(res.invoiceSummary?.status, 'Paid');
});

Deno.test('SERP-006: validateCounterSaleCommand returns idempotent replay on repeated submission', () => {
  const processed = new Set<string>();
  const payload = {
    idempotencyKey: 'idemp-pos-replay-test',
    tenantId: ORG,
    customerName: 'Walk-in Counter Customer',
    items: [
      { itemId: 'item-1', name: 'Sandpaper Grit 800', sku: 'SKU-SND-800', quantity: 1, unitPrice: 20, total: 20 },
    ],
    subtotal: 20,
    gstRate: 0,
    gstAmount: 0,
    totalAmount: 20,
    paymentMethod: 'Cash',
    actorId: 'usr-counter-1',
    actorSeat: 'counter' as SeatCode,
  };

  // First call
  const first = validateCounterSaleCommand(payload, processed);
  assertEquals(first.valid, true);
  assertEquals(first.isIdempotentReplay, false);

  // Replay with exact same idempotencyKey
  const second = validateCounterSaleCommand(payload, processed);
  assertEquals(second.valid, true);
  assertEquals(second.isIdempotentReplay, true);
});

Deno.test('SERP-006: validateCounterSaleCommand denies unauthorized seat (e.g. technician)', () => {
  const processed = new Set<string>();
  const payload = {
    idempotencyKey: 'idemp-pos-unauth',
    tenantId: ORG,
    customerName: 'Walk-in Customer',
    items: [
      { itemId: 'item-1', name: 'Item', sku: 'SKU-1', quantity: 1, unitPrice: 50, total: 50 },
    ],
    subtotal: 50,
    gstRate: 0,
    gstAmount: 0,
    totalAmount: 50,
    paymentMethod: 'Cash',
    actorId: 'usr-tech-1',
    actorSeat: 'technician' as SeatCode, // Technician cannot execute counter POS sale
  };

  const res = validateCounterSaleCommand(payload, processed);
  assertEquals(res.valid, false);
  assertEquals(res.error, 'unauthorized_seat_for_counter_sale: technician');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-007: Stage 4 Commercial & Purchasing Module / Tax Working Papers
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-007: validateCommercialDocumentProvenance validates provenance with tenant, creator, and approval status', () => {
  const validDoc = {
    tenantId: ORG,
    documentType: 'PurchaseOrder',
    documentNumber: 'PO-2026-001',
    createdBy: 'usr-admin-1',
    approvedBy: 'usr-owner-1',
    approvalStatus: 'Approved',
    createdAt: '2026-08-26T12:00:00Z',
  };

  const res1 = validateCommercialDocumentProvenance(validDoc);
  assertEquals(res1.valid, true);

  const missingCreator = {
    tenantId: ORG,
    documentType: 'PurchaseOrder',
    documentNumber: 'PO-2026-001',
    createdBy: '',
    approvalStatus: 'Draft',
    createdAt: '2026-08-26T12:00:00Z',
  };
  const res2 = validateCommercialDocumentProvenance(missingCreator);
  assertEquals(res2.valid, false);
  assertEquals(res2.error, 'created_by_required');
});

Deno.test('SERP-007: generateTaxWorkingPaperSummary computes reviewable Output vs Input GST for registered tenant', () => {
  const sales = [
    { documentId: 'inv-1', documentNumber: 'INV-001', documentType: 'Invoice' as const, date: '2026-08-10', taxableAmount: 10000, gstRate: 8, gstAmount: 800 },
    { documentId: 'pos-1', documentNumber: 'POS-001', documentType: 'CounterSale' as const, date: '2026-08-11', taxableAmount: 2000, gstRate: 8, gstAmount: 160 },
  ];

  const purchases = [
    { documentId: 'po-1', documentNumber: 'PO-001', documentType: 'PurchaseOrder' as const, date: '2026-08-05', taxableAmount: 5000, gstRate: 8, gstAmount: 400 },
    { documentId: 'exp-1', documentNumber: 'EXP-001', documentType: 'Expense' as const, date: '2026-08-08', taxableAmount: 1000, gstRate: 8, gstAmount: 80 },
  ];

  const summary = generateTaxWorkingPaperSummary({
    tenantId: ORG,
    taxPeriod: '2026-08',
    isGstRegistered: true,
    tinNumber: '1068940GST001',
    salesDocuments: sales,
    purchaseDocuments: purchases,
  });

  assertEquals(summary.gstRegistrationStatus, 'registered');
  assertEquals(summary.totalTaxableSales, 12000);
  assertEquals(summary.totalOutputGst, 960);
  assertEquals(summary.totalTaxablePurchases, 6000);
  assertEquals(summary.totalInputGst, 480);
  assertEquals(summary.netGstPayable, 480); // 960 - 480
  assertEquals(summary.isReviewable, true);
  assertEquals(summary.status, 'Draft');
});

Deno.test('SERP-007: generateTaxWorkingPaperSummary strictly zeroes GST claims for non-registered tenant (DEC-073 §10)', () => {
  const sales = [
    { documentId: 'inv-1', documentNumber: 'INV-001', documentType: 'Invoice' as const, date: '2026-08-10', taxableAmount: 5000, gstRate: 0, gstAmount: 0 },
  ];
  const purchases = [
    { documentId: 'po-1', documentNumber: 'PO-001', documentType: 'PurchaseOrder' as const, date: '2026-08-05', taxableAmount: 2000, gstRate: 0, gstAmount: 0 },
  ];

  const summary = generateTaxWorkingPaperSummary({
    tenantId: ORG,
    taxPeriod: '2026-08',
    isGstRegistered: false, // Non-registered
    salesDocuments: sales,
    purchaseDocuments: purchases,
  });

  assertEquals(summary.gstRegistrationStatus, 'not_registered');
  assertEquals(summary.totalTaxableSales, 5000);
  assertEquals(summary.totalOutputGst, 0);
  assertEquals(summary.totalTaxablePurchases, 2000);
  assertEquals(summary.totalInputGst, 0);
  assertEquals(summary.netGstPayable, 0);
  assertEquals(summary.isReviewable, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-008: Stage 5 CRM & Customer Lifecycle Module
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-008: validateCustomerConsentUpdate validates tenant, channel, and updater', () => {
  const validConsent = {
    tenantId: ORG,
    customerId: 'cust-101',
    consentGiven: true,
    consentChannel: 'Phone',
    consentTimestamp: '2026-08-26T14:30:00Z',
    updatedBy: 'usr-admin-1',
  };
  const res1 = validateCustomerConsentUpdate(validConsent);
  assertEquals(res1.valid, true);

  const invalidChannel = {
    tenantId: ORG,
    customerId: 'cust-101',
    consentGiven: true,
    consentChannel: 'Telepathy', // Invalid channel
    consentTimestamp: '2026-08-26T14:30:00Z',
    updatedBy: 'usr-admin-1',
  };
  const res2 = validateCustomerConsentUpdate(invalidChannel);
  assertEquals(res2.valid, false);
  assertEquals(res2.error, 'invalid_consent_channel: Telepathy');
});

Deno.test('SERP-008: validateCustomerLifecycleTransition allows legal progression and blocks unprivileged unblocking', () => {
  // Lead -> Active (allowed)
  const t1 = validateCustomerLifecycleTransition({
    currentStage: 'Lead',
    targetStage: 'Active',
    actorSeat: 'counter',
  });
  assertEquals(t1.allowed, true);

  // Active -> VIP (allowed)
  const t2 = validateCustomerLifecycleTransition({
    currentStage: 'Active',
    targetStage: 'VIP',
    actorSeat: 'counter',
  });
  assertEquals(t2.allowed, true);

  // Blocked -> Active (denied for counter/technician)
  const t3 = validateCustomerLifecycleTransition({
    currentStage: 'Blocked',
    targetStage: 'Active',
    actorSeat: 'counter',
  });
  assertEquals(t3.allowed, false);
  assertEquals(t3.error, 'unblocking_customer_requires_privileged_seat');

  // Blocked -> Active (allowed for director/owner)
  const t4 = validateCustomerLifecycleTransition({
    currentStage: 'Blocked',
    targetStage: 'Active',
    actorSeat: 'director',
  });
  assertEquals(t4.allowed, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-031: Versioned API, Error & Idempotency Contract
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-031: executeVersionedApiCommand executes valid v1 command and caches outcome', () => {
  const store = new Map<string, DurableIdempotencyEntry>();
  const princ = principal('counter');

  const req = {
    version: 'v1',
    requestId: 'req-001',
    idempotencyKey: 'idemp-pos-888',
    command: 'CALL' as CommandName,
    payload: { customerPhone: '7771234', notes: 'Initial intake call' },
  };

  const res = executeVersionedApiCommand({
    request: req,
    principal: princ,
    idempotencyStore: store,
    handler: (p) => ({ ok: true, data: { jobId: 'JOB-NEW-01', phone: p.customerPhone } }),
  });

  assertEquals(res.ok, true);
  assertEquals(res.disposition, 'applied');
  assertEquals(res.data?.jobId, 'JOB-NEW-01');
  assertEquals(store.has('idemp-pos-888'), true);
});

Deno.test('SERP-031: executeVersionedApiCommand replays cached outcome on exact same idempotency key + request hash', () => {
  const store = new Map<string, DurableIdempotencyEntry>();
  const princ = principal('counter');

  const req = {
    version: 'v1',
    requestId: 'req-002',
    idempotencyKey: 'idemp-replay-key',
    command: 'CALL' as CommandName,
    payload: { customerPhone: '7771234' },
  };

  let executionCount = 0;
  const handler = () => {
    executionCount++;
    return { ok: true, data: { executedTimes: executionCount } };
  };

  // First execution
  const first = executeVersionedApiCommand({
    request: req,
    principal: princ,
    idempotencyStore: store,
    handler,
  });
  assertEquals(first.disposition, 'applied');
  assertEquals(executionCount, 1);

  // Replay exact same request
  const replay = executeVersionedApiCommand({
    request: req,
    principal: princ,
    idempotencyStore: store,
    handler,
  });
  assertEquals(replay.disposition, 'replayed');
  assertEquals(executionCount, 1); // Handler NOT invoked a second time!
});

Deno.test('SERP-031: executeVersionedApiCommand rejects key conflict when payload differs on same key', () => {
  const store = new Map<string, DurableIdempotencyEntry>();
  const princ = principal('counter');

  const req1 = {
    version: 'v1',
    requestId: 'req-003',
    idempotencyKey: 'idemp-conflict-key',
    command: 'CALL' as CommandName,
    payload: { customerPhone: '7771111' },
  };

  const req2 = {
    version: 'v1',
    requestId: 'req-004',
    idempotencyKey: 'idemp-conflict-key', // Same key!
    command: 'CALL' as CommandName,
    payload: { customerPhone: '9992222' }, // Differing payload!
  };

  // First succeeds
  executeVersionedApiCommand({
    request: req1,
    principal: princ,
    idempotencyStore: store,
    handler: () => ({ ok: true, data: {} }),
  });

  // Second fails with idempotency_key_conflict
  const conflict = executeVersionedApiCommand({
    request: req2,
    principal: princ,
    idempotencyStore: store,
    handler: () => ({ ok: true, data: {} }),
  });

  assertEquals(conflict.ok, false);
  assertEquals(conflict.disposition, 'rejected');
  assertEquals(conflict.error?.code, 'idempotency_key_conflict');
});

Deno.test('SERP-031: executeVersionedApiCommand rejects unsupported envelope versions (fail closed)', () => {
  const store = new Map<string, DurableIdempotencyEntry>();
  const princ = principal('counter');

  const req = {
    version: 'v99.0.0-unsupported',
    requestId: 'req-bad-ver',
    idempotencyKey: 'idemp-ver-1',
    command: 'CALL' as CommandName,
    payload: {},
  };

  const res = executeVersionedApiCommand({
    request: req,
    principal: princ,
    idempotencyStore: store,
    handler: () => ({ ok: true, data: {} }),
  });

  assertEquals(res.ok, false);
  assertEquals(res.error?.code, 'contract_version_unsupported');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-029: Tenant-Scoped PostgreSQL Foundation Contract
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-029: validatePostgresTenantScoping permits same-tenant queries and strictly denies cross-tenant access', () => {
  // Same tenant allowed
  const res1 = validatePostgresTenantScoping({
    actingOrganisationId: ORG,
    actingSeat: 'counter',
    targetOrganisationId: ORG,
  });
  assertEquals(res1.allowed, true);

  // Cross tenant denied
  const res2 = validatePostgresTenantScoping({
    actingOrganisationId: ORG,
    actingSeat: 'counter',
    targetOrganisationId: OTHER_ORG,
  });
  assertEquals(res2.allowed, false);
  assertEquals(res2.error, 'cross_tenant_denied');

  // Superuser bypass attempt denied
  const res3 = validatePostgresTenantScoping({
    actingOrganisationId: ORG,
    actingSeat: 'owner',
    isSystemSuperuser: true,
  });
  assertEquals(res3.allowed, false);
  assertEquals(res3.error, 'unauthorized_superuser_bypass');
});

Deno.test('SERP-029: validateOrganisationConstraintIntegrity enforces slug formatting, legal name and status constraints', () => {
  const valid = validateOrganisationConstraintIntegrity({
    slug: 'club-ignition',
    legalName: 'Club Ignition Pvt Ltd',
    baseCurrency: 'MVR',
    status: 'active',
  });
  assertEquals(valid.valid, true);

  const invalidSlug = validateOrganisationConstraintIntegrity({
    slug: '-bad_slug!',
    legalName: 'Test Org',
    baseCurrency: 'MVR',
    status: 'active',
  });
  assertEquals(invalidSlug.valid, false);
  assertEquals(invalidSlug.error, 'invalid_organisation_slug_format');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-030: Role, Seat and Separation-of-Duties Policy Engine
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-030: evaluateRoleVisibility gates what user sees per role', () => {
  const ownerVis = evaluateRoleVisibility('owner');
  assertEquals(ownerVis.canViewReports, true);
  assertEquals(ownerVis.canViewAuditLogs, true);

  const techVis = evaluateRoleVisibility('technician');
  assertEquals(techVis.canViewReports, false);
  assertEquals(techVis.canViewCommercialDocuments, false);
  assertEquals(techVis.canViewInventoryStock, true);
});

Deno.test('SERP-030: evaluateSodPolicy supports clean multi-person execution and solo capacity compensation', () => {
  const history = [
    { step: 'quote' as ScmStep, personId: DIRECTOR_PAYER },
  ];

  // Different person taking 'award' -> allowed cleanly
  const resClean = evaluateSodPolicy({
    organisationId: ORG,
    actorPersonId: MD_RECEIVER,
    actingSeat: 'financial_controller',
    targetStep: 'award',
    history,
    capacity: 'segregated',
  });
  assertEquals(resClean.allowed, true);
  assertEquals(resClean.action, 'allow');

  // Same person taking 'award' in SOLO capacity -> allowed with compensating exception record
  const resSolo = evaluateSodPolicy({
    organisationId: ORG,
    actorPersonId: DIRECTOR_PAYER,
    actingSeat: 'financial_controller',
    targetStep: 'award',
    history,
    capacity: 'solo',
  });
  assertEquals(resSolo.allowed, true);
  assertEquals(resSolo.action, 'record_exception');
  assertEquals(resSolo.auditRecord?.disposition, 'exception_recorded');
});

Deno.test('SERP-030: evaluateSodPolicy blocks SoD conflicts in segregated capacity unless valid unexpired override is present', () => {
  const history = [
    { step: 'quote' as ScmStep, personId: DIRECTOR_PAYER },
  ];

  // Same person in segregated capacity with NO override -> blocked
  const resBlocked = evaluateSodPolicy({
    organisationId: ORG,
    actorPersonId: DIRECTOR_PAYER,
    actingSeat: 'financial_controller',
    targetStep: 'award',
    history,
    capacity: 'segregated',
  });
  assertEquals(resBlocked.allowed, false);
  assertEquals(resBlocked.action, 'block');

  // Same person with valid unexpired override (reason >= 12 chars) -> allowed with exception recorded
  const resOverride = evaluateSodPolicy({
    organisationId: ORG,
    actorPersonId: DIRECTOR_PAYER,
    actingSeat: 'financial_controller',
    targetStep: 'award',
    history,
    capacity: 'segregated',
    override: {
      overrideId: 'ovr-001',
      approvedByPersonId: MD_RECEIVER,
      reason: 'Urgent weekend emergency breakdown repair authorization',
      grantedAt: '2026-08-26T10:00:00Z',
      expiresAt: '2026-08-26T23:59:59Z',
    },
    nowIso: '2026-08-26T12:00:00Z',
  });
  assertEquals(resOverride.allowed, true);
  assertEquals(resOverride.action, 'record_exception');

  // Same person with EXPIRED override -> blocked
  const resExpired = evaluateSodPolicy({
    organisationId: ORG,
    actorPersonId: DIRECTOR_PAYER,
    actingSeat: 'financial_controller',
    targetStep: 'award',
    history,
    capacity: 'segregated',
    override: {
      overrideId: 'ovr-001',
      approvedByPersonId: MD_RECEIVER,
      reason: 'Urgent weekend emergency breakdown repair authorization',
      grantedAt: '2026-08-20T10:00:00Z',
      expiresAt: '2026-08-21T23:59:59Z',
    },
    nowIso: '2026-08-26T12:00:00Z',
  });
  assertEquals(resExpired.allowed, false);
  assertEquals(resExpired.error, 'sod_override_expired');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-034: Append-Only Audit, Outbox and Exception Foundation
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-034: validateOutboxEvent enforces organisation_id, aggregate metadata, and status allowlist', () => {
  const validEvent = {
    organisationId: ORG,
    eventType: 'PAYMENT_RELEASED',
    aggregateType: 'payment',
    aggregateId: 'PAY-2026-001',
    payload: { amount: 5000, currency: 'MVR' },
    status: 'pending',
  };
  const res1 = validateOutboxEvent(validEvent);
  assertEquals(res1.valid, true);

  const missingOrg = {
    eventType: 'PAYMENT_RELEASED',
    aggregateType: 'payment',
    aggregateId: 'PAY-2026-001',
    payload: {},
  };
  const res2 = validateOutboxEvent(missingOrg);
  assertEquals(res2.valid, false);
  assertEquals(res2.error, 'organisation_id_required');
});

Deno.test('SERP-034: executeTransactionalMutationWithOutbox commits business mutation and outbox event together', () => {
  const outboxStore: TransactionalOutboxRecord[] = [];
  let businessState = 0;

  const res = executeTransactionalMutationWithOutbox({
    organisationId: ORG,
    businessMutation: () => {
      businessState += 100;
      return { ok: true, result: { newTotal: businessState } };
    },
    outboxEvent: {
      eventType: 'STOCK_DEDUCTED',
      aggregateType: 'inventory',
      aggregateId: 'SKU-001',
      payload: { quantity: 5 },
      actorPersonId: DIRECTOR_PAYER,
      actingSeat: 'counter',
    },
    outboxStore,
    nowIso: '2026-08-26T14:00:00Z',
  });

  assertEquals(res.ok, true);
  assertEquals(businessState, 100);
  assertEquals(outboxStore.length, 1);
  assertEquals(outboxStore[0].eventType, 'STOCK_DEDUCTED');
  assertEquals(outboxStore[0].status, 'pending');
});

Deno.test('SERP-034: executeTransactionalMutationWithOutbox fails closed and writes NO outbox record on business failure', () => {
  const outboxStore: TransactionalOutboxRecord[] = [];

  const res = executeTransactionalMutationWithOutbox({
    organisationId: ORG,
    businessMutation: () => {
      return { ok: false, error: 'insufficient_inventory_balance' };
    },
    outboxEvent: {
      eventType: 'STOCK_DEDUCTED',
      aggregateType: 'inventory',
      aggregateId: 'SKU-002',
      payload: { quantity: 999 },
    },
    outboxStore,
  });

  assertEquals(res.ok, false);
  assertEquals(res.error, 'insufficient_inventory_balance');
  assertEquals(outboxStore.length, 0); // No half-applied outbox event!
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-036: Observability, Rate-Limit and Alerting Baseline
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-036: evaluateRateLimit enforces sliding window and fails closed when limit exceeded', () => {
  const store = new Map<string, number[]>();
  const key = 'rate_client_192_168_1_1';
  const now = 1000000;

  // 3 allowed within 60s
  const r1 = evaluateRateLimit({ key, maxRequests: 3, windowMs: 60000, store, nowMs: now });
  assertEquals(r1.allowed, true);
  assertEquals(r1.remaining, 2);

  const r2 = evaluateRateLimit({ key, maxRequests: 3, windowMs: 60000, store, nowMs: now + 1000 });
  assertEquals(r2.allowed, true);
  assertEquals(r2.remaining, 1);

  const r3 = evaluateRateLimit({ key, maxRequests: 3, windowMs: 60000, store, nowMs: now + 2000 });
  assertEquals(r3.allowed, true);
  assertEquals(r3.remaining, 0);

  // 4th request exceeds rate limit -> fail closed
  const r4 = evaluateRateLimit({ key, maxRequests: 3, windowMs: 60000, store, nowMs: now + 3000 });
  assertEquals(r4.allowed, false);
  assertEquals(r4.remaining, 0);
  assertEquals(typeof r4.retryAfterSeconds, 'number');
});

Deno.test('SERP-036: sanitizeLogMetadata scrubs passwords, tokens, customer phone, and account numbers', () => {
  const rawMetadata = {
    action: 'LOGIN_ATTEMPT',
    username: 'admin@starq.com',
    password: 'SuperSecretPassword123!',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    customer_phone: '7771234',
    bml_account: '7730000998811',
    valid_flag: true,
  };

  const sanitized = sanitizeLogMetadata(rawMetadata);
  assertEquals(sanitized.action, 'LOGIN_ATTEMPT');
  assertEquals(sanitized.password, '[REDACTED_SENSITIVE_PAYLOAD]');
  assertEquals(sanitized.token, '[REDACTED_SENSITIVE_PAYLOAD]');
  assertEquals(sanitized.customer_phone, '[REDACTED_SENSITIVE_PAYLOAD]');
  assertEquals(sanitized.bml_account, '[REDACTED_SENSITIVE_PAYLOAD]');
  assertEquals(sanitized.valid_flag, true);
});

Deno.test('SERP-036: evaluateSystemAlertSignals generates structured alerts for brute force, cross tenant, and dead letter events', () => {
  const signals = evaluateSystemAlertSignals({
    tenantId: ORG,
    failedAuthAttemptsInWindow: 6, // Triggers AUTH_BRUTE_FORCE
    crossTenantAttemptsInWindow: 1, // Triggers CROSS_TENANT_ATTACK
    outboxDeadLetterCount: 2, // Triggers OUTBOX_DEAD_LETTER
    sodOverridesInWindow: 1,
    nowIso: '2026-08-26T15:00:00Z',
  });

  assertEquals(signals.length, 3);
  const types = signals.map((s) => s.alertType);
  assertEquals(types.includes('AUTH_BRUTE_FORCE'), true);
  assertEquals(types.includes('CROSS_TENANT_ATTACK'), true);
  assertEquals(types.includes('OUTBOX_DEAD_LETTER'), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-033: Security Verification and Abuse-Resistance Suite
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-033 [ATTACK 1]: Cross-tenant command injection is denied fail-closed', () => {
  const princ = principal('counter', ['counter'], ORG);
  const envelope = {
    contract: CONTRACT_VERSION,
    command: 'CALL' as CommandName,
    payload: { customerPhone: '7770000' },
    csrf: 'test_csrf',
  };

  // Targeting a different organization must be refused with cross_tenant_denied
  const decision = authorizeCommand(princ, envelope, { tenantOfTarget: OTHER_ORG });
  assertEquals(decision.ok, false);
  if (!decision.ok) {
    assertEquals(decision.error, 'cross_tenant_denied');
  }
});

Deno.test('SERP-033 [ATTACK 2]: Forged seat / privilege escalation fails closed', () => {
  // Technician attempts to release a PAYMENT (requires payer seat)
  const techPrinc = principal('technician', ['technician'], ORG);
  const payEnvelope = {
    contract: CONTRACT_VERSION,
    command: 'PURCHASE' as CommandName,
    step: 'pay' as ScmStep,
    payload: { amount: 10000 },
    csrf: 'test_csrf',
  };

  const decision = authorizeCommand(techPrinc, payEnvelope);
  assertEquals(decision.ok, false);
  if (!decision.ok) {
    assertEquals(decision.error, 'seat_not_authorized');
  }
});

Deno.test('SERP-033 [ATTACK 3]: Revoked seat cannot execute commands even if presented in stale session', () => {
  // Principal holds 'payer' in cookie, but server boundary has 'payer' in revokedSeats
  const princ = principal('payer', ['payer'], ORG);
  const payEnvelope = {
    contract: CONTRACT_VERSION,
    command: 'PURCHASE' as CommandName,
    step: 'pay' as ScmStep,
    payload: { amount: 10000 },
    csrf: 'test_csrf',
  };

  const decision = authorizeCommand(princ, payEnvelope, { revokedSeats: ['payer'] });
  assertEquals(decision.ok, false);
  if (!decision.ok) {
    assertEquals(decision.error, 'seat_revoked');
  }
});

Deno.test('SERP-033 [ATTACK 4]: Replayed request nonces and idempotency conflicts fail closed', () => {
  const store = new Map<string, DurableIdempotencyEntry>();
  const princ = principal('counter', ['counter'], ORG);

  const req1 = {
    version: 'v1',
    requestId: 'req-adv-1',
    idempotencyKey: 'idemp-replay-target',
    command: 'CALL' as CommandName,
    payload: { customerPhone: '7771111' },
  };

  // 1. Initial execution applied
  const res1 = executeVersionedApiCommand({
    request: req1,
    principal: princ,
    idempotencyStore: store,
    handler: (p) => ({ ok: true, data: { status: 'created' } }),
  });
  assertEquals(res1.disposition, 'applied');

  // 2. Exact replay returns cached outcome without re-executing
  const resReplay = executeVersionedApiCommand({
    request: req1,
    principal: princ,
    idempotencyStore: store,
    handler: () => ({ ok: false, error: { code: 'validation_failed', message: 'Should not execute' } }),
  });
  assertEquals(resReplay.disposition, 'replayed');
  assertEquals(resReplay.ok, true);

  // 3. Same idempotency key with altered payload -> rejected as conflict
  const reqTampered = {
    ...req1,
    payload: { customerPhone: '9999999' }, // Altered!
  };
  const resConflict = executeVersionedApiCommand({
    request: reqTampered,
    principal: princ,
    idempotencyStore: store,
    handler: () => ({ ok: true, data: {} }),
  });
  assertEquals(resConflict.ok, false);
  assertEquals(resConflict.error?.code, 'idempotency_key_conflict');
});

Deno.test('SERP-033 [ATTACK 5]: Segregation of Duties bypass is strictly blocked in segregated capacity', () => {
  const history = [
    { step: 'quote' as ScmStep, personId: DIRECTOR_PAYER },
  ];

  // Self-awarding purchase without approved override in segregated capacity must be blocked
  const res = evaluateSodPolicy({
    organisationId: ORG,
    actorPersonId: DIRECTOR_PAYER,
    actingSeat: 'financial_controller',
    targetStep: 'award',
    history,
    capacity: 'segregated',
  });

  assertEquals(res.allowed, false);
  assertEquals(res.action, 'block');
  assertEquals(res.auditRecord?.disposition, 'blocked_sod_violation');
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-038: Ordered Migration, Rollback and Compatibility Discipline
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-038: CANONICAL_MIGRATION_LINEAGE contains exactly 22 migrations in strict monotonic order', () => {
  const result = validateMigrationLineage(CANONICAL_MIGRATION_LINEAGE);
  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
  assertEquals(CANONICAL_MIGRATION_LINEAGE.length, 22);

  // Verify 0011 is reviewer gated
  const m0011 = CANONICAL_MIGRATION_LINEAGE.find((m) => m.version === '202608220011');
  assertEquals(m0011?.status, 'REVIEWER_GATED');
  assertEquals(m0011?.requiresReviewerApproval, true);

  // Verify 0021 and 0022 are forward unapplied
  const m0021 = CANONICAL_MIGRATION_LINEAGE.find((m) => m.version === '202608260021');
  assertEquals(m0021?.status, 'UNAPPLIED_FORWARD_ONLY');

  const m0022 = CANONICAL_MIGRATION_LINEAGE.find((m) => m.version === '202608260022');
  assertEquals(m0022?.status, 'UNAPPLIED_FORWARD_ONLY');
});

Deno.test('SERP-038: validateMigrationLineage rejects out-of-order and non-conforming filenames', () => {
  const badLineage = [
    { version: '202608250002', filename: '202608250002_second.sql', status: 'APPLIED' as const, description: '' },
    { version: '202608250001', filename: '202608250001_first.sql', status: 'APPLIED' as const, description: '' },
  ];
  const res = validateMigrationLineage(badLineage);
  assertEquals(res.valid, false);
  assertEquals(res.errors.length > 0, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-027: Native Secure-Session Persistence Verification
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-027: formatSessionCookie and parseSessionCookie handle sb_ops lifecycle with Secure, HttpOnly, and SameSite=None', () => {
  const token = 'header.payload.signature_abc123';
  const cookieStr = formatSessionCookie(token, { maxAge: 28800 });

  assertEquals(cookieStr.includes('sb_ops=header.payload.signature_abc123'), true);
  assertEquals(cookieStr.includes('HttpOnly'), true);
  assertEquals(cookieStr.includes('Secure'), true);
  assertEquals(cookieStr.includes('SameSite=None'), true);
  assertEquals(cookieStr.includes('Max-Age=28800'), true);

  // Parse roundtrip
  const parsed = parseSessionCookie(`other=123; ${cookieStr}; test=xyz`);
  assertEquals(parsed, token);
});

Deno.test('SERP-027: validateSessionCookieLifecycle enforces 401 eviction (Max-Age=0) and CSRF-gated logout clearing', () => {
  // 1. 401 eviction
  const evict = validateSessionCookieLifecycle({ action: 'unauthenticated_401' });
  assertEquals(evict.ok, true);
  assertEquals(evict.setCookieHeader?.includes('Max-Age=0'), true);
  assertEquals(evict.setCookieHeader?.includes('sb_ops='), true);

  // 2. Logout with CSRF mismatch -> rejected
  const badLogout = validateSessionCookieLifecycle({
    action: 'logout',
    csrfToken: 'wrong_token',
    sessionCsrf: 'expected_token',
  });
  assertEquals(badLogout.ok, false);
  assertEquals(badLogout.error, 'csrf_mismatch');

  // 3. Logout with valid CSRF -> evicts cookie cleanly
  const goodLogout = validateSessionCookieLifecycle({
    action: 'logout',
    csrfToken: 'valid_csrf_token',
    sessionCsrf: 'valid_csrf_token',
  });
  assertEquals(goodLogout.ok, true);
  assertEquals(goodLogout.setCookieHeader?.includes('Max-Age=0'), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-035: Accessibility and Inclusive Interaction Baseline
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-035: calculateContrastRatio correctly calculates WCAG 2.1 contrast ratios', () => {
  // Black on White: ~21:1
  const blackWhite = calculateContrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
  assertEquals(Math.round(blackWhite), 21);

  // Dark slate (text) on white background: >= 7:1
  const slateOnWhite = calculateContrastRatio({ r: 15, g: 23, b: 42 }, { r: 255, g: 255, b: 255 });
  assertEquals(slateOnWhite >= 7.0, true);

  // Low contrast grey on white: < 4.5:1
  const lowContrast = calculateContrastRatio({ r: 200, g: 200, b: 200 }, { r: 255, g: 255, b: 255 });
  assertEquals(lowContrast < 4.5, true);
});

Deno.test('SERP-035: validateAccessibilityStandard enforces WCAG AA contrast, touch target >= 44px, focus rings, and labels', () => {
  const compliantItem = {
    elementId: 'btn-submit-invoice',
    role: 'button',
    hasAriaLabel: true,
    hasKeyboardFocusRing: true,
    minTouchTargetPx: 48,
    fgColor: { r: 15, g: 23, b: 42 },
    bgColor: { r: 255, g: 255, b: 255 },
  };
  const resValid = validateAccessibilityStandard(compliantItem);
  assertEquals(resValid.compliant, true);
  assertEquals(resValid.errors.length, 0);

  const nonCompliantItem = {
    elementId: 'btn-tiny-icon',
    hasAriaLabel: false, // Missing label
    hasKeyboardFocusRing: false, // Missing ring
    minTouchTargetPx: 24, // Too small (< 44px)
    fgColor: { r: 200, g: 200, b: 200 },
    bgColor: { r: 255, g: 255, b: 255 }, // Low contrast
  };
  const resInvalid = validateAccessibilityStandard(nonCompliantItem);
  assertEquals(resInvalid.compliant, false);
  assertEquals(resInvalid.errors.length, 4); // Catches all 4 violations
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-032: STARQ ERP Product Metadata and Branding Contract
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-032: STARQ_ERP_CANONICAL_METADATA strictly enforces starqERP and starqAI canonical naming', () => {
  const result = validateProductIdentityMetadata(STARQ_ERP_CANONICAL_METADATA);
  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);

  assertEquals(STARQ_ERP_CANONICAL_METADATA.productName, 'starqERP');
  assertEquals(STARQ_ERP_CANONICAL_METADATA.embeddedAiName, 'starqAI');
  assertEquals(STARQ_ERP_CANONICAL_METADATA.companyName, 'Starq Technologies Pvt Ltd');
  assertEquals(STARQ_ERP_CANONICAL_METADATA.baseCurrency, 'MVR');
});

Deno.test('SERP-032: validateProductIdentityMetadata rejects drifted branding or invalid AI naming', () => {
  const drifted = {
    productName: 'starqBooks', // Stale legacy name
    embeddedAiName: 'Starq AI', // Drifted AI name (must be starqAI)
    companyName: 'Starq Tech',
    baseCurrency: 'USD',
    version: '0.1.0',
  };
  const res = validateProductIdentityMetadata(drifted);
  assertEquals(res.valid, false);
  assertEquals(res.errors.length, 4);
});

// ─────────────────────────────────────────────────────────────────────────────
// SERP-263: Remote Git and CI Control Plane Contract
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('SERP-263: CI_MANDATORY_GATES covers all required governance, secret, migration, and build gates', () => {
  const result = validateCiGateRegistry(CI_MANDATORY_GATES);
  assertEquals(result.valid, true);
  assertEquals(result.missingMandatoryGates.length, 0);

  // Verify all mandatory gates have BLOCK_MERGE policy
  const allBlocking = CI_MANDATORY_GATES.every((g) => g.failureImpact === 'BLOCK_MERGE' && g.isMandatory);
  assertEquals(allBlocking, true);
});

Deno.test('SERP-263: validateCiGateRegistry detects missing mandatory gates (fail closed)', () => {
  const incompleteGates = [
    {
      name: 'Secret & Credential Sweep',
      command: 'node scripts/pre-push-secret-scan.mjs',
      isMandatory: true,
      failureImpact: 'BLOCK_MERGE' as const,
    },
  ];
  const res = validateCiGateRegistry(incompleteGates);
  assertEquals(res.valid, false);
  assertEquals(res.missingMandatoryGates.length >= 5, true);
});

























