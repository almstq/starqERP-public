// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — DO NOT EDIT.
//
// Copied verbatim from contracts/commands.ts by scripts/sync-contract.mjs so
// that Supabase bundles it with the Edge function. Editing this file instead of
// the canonical one recreates the drift the contract exists to eliminate.
//
// Edit:  contracts/commands.ts
// Then:  node scripts/sync-contract.mjs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * STARQ ERP — Canonical command contract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS
 * ─────────────────────────────────────────────────────────────────────────────
 * The single source of truth for every command the ERP accepts: its envelope,
 * who may issue it, how it is authorized, and how it is made idempotent.
 *
 * Three runtimes must agree with this file and with each other:
 *
 *   supabase/functions/starq-api/index.ts   (Deno — the boundary)
 *   supabase/migrations/*.sql                (PostgreSQL — the enforcement)
 *   starq-ops-app/lib/**.dart                (Flutter — the caller)
 *
 * They currently do not. This contract states the target; the runtimes are
 * refactored toward it. Where a runtime disagrees with this file, the runtime
 * is wrong.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * An independent audit on 21 August 2026 found five critical defects. Each is
 * a disagreement between what a document claims and what the code does. The
 * five invariants below resolve all five ON PAPER, before implementation, so
 * that the client, the boundary and the database are built against one settled
 * shape rather than three drifting ones.
 *
 * Authority: Elder review 2026-08-21 (docs/foundation/ELDER-REVIEW-2026-08-21).
 * Approved slices: SERP-025, SERP-026, SERP-029. SERP-031 deferred.
 *
 * NOT IN SCOPE. This file defines commands, not accounting. The double-entry
 * rules, the chart of accounts and the activity-code controls live in the
 * Python engine (books.py, journal_outbox.py) and stay there until the ERP has
 * demonstrably held garage operations (DEC-051). Do not restate ledger rules here.
 */

import { Money } from './money.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/** RFC 4122 v4. Rejected at the boundary if malformed — never coerced. */
export type Uuid = string;

/**
 * Currency used while computing a line's tax (SERP-347).
 *
 * `calculateLineTax` takes bare numbers and returns bare numbers; it never sees
 * a currency. Money requires one, because refusing to add MVR to USD is the
 * point of the type. Every value inside one call is the same currency by
 * construction, so this placeholder cannot mask a real mismatch — the guard
 * that matters lives at the document level, where currency is known.
 */
const TAX_CALC_CURRENCY = 'MVR' as const;

/** RFC 3339 UTC. */
export type Timestamp = string;

/**
 * 0.x on purpose.
 *
 * A major version asserts that the shape is committed and that breaking it
 * requires a deliberate bump. Nothing has been built against this file yet, no
 * runtime conforms to it, and the seat vocabulary it depends on is still split
 * three ways. Calling it 1.0.0 would claim a stability that does not exist and
 * would make the first inevitable correction look like a breaking change
 * rather than what it is — the contract settling.
 *
 * IT BECOMES 1.0.0 WHEN: every test in CONFORMANCE_TESTS passes against a real
 * runtime, and at least two of the three runtimes import their authorization
 * decision from this file rather than reimplementing it.
 */
export const CONTRACT_VERSION = '0.1.0' as const;

// ─────────────────────────────────────────────────────────────────────────────
// Seats
//
// A SEAT IS AN OPERATIONAL SEPARATION, NOT A CORPORATE OFFICE.
// Founder, 21 August 2026. Holding the `financial_controller` seat while
// matching an invoice is a workflow state. It is not an appointment, it does
// not bind the company, and no document generated from this system may
// describe a person by a seat name as though it were an office.
//
// Seats exist so that one person doing the whole chain still cannot quote,
// award, receive and pay in a single unbroken motion.
// ─────────────────────────────────────────────────────────────────────────────

export const SEATS = [
  'owner',
  'managing_director',
  'director',
  'financial_controller',
  'quartermaster',
  'receiver',
  'payer',
  'counter',
  'technician',
  'qc_signer',
  'stores',
  'ledger_poster',
] as const;

export type SeatCode = (typeof SEATS)[number];

/**
 * ⚠ DRIFT THIS CONTRACT RESOLVES — and the root cause of audit defect #2.
 *
 * Three runtimes currently hold three different seat vocabularies:
 *
 *   auth.py SEATS                     12 seats (the complete set, above)
 *   index.ts ALLOWED_SEATS             8 seats — MISSING quartermaster,
 *                                      receiver, stores, ledger_poster
 *   202608200005_garage_api.sql        references financial_controller, payer,
 *                                      counter, technician, qc_signer
 *
 * The procurement flow requires `quartermaster` to quote and `receiver` to
 * receive. Neither seat exists in the Edge allowlist — so a CORRECT seat matrix
 * would make those two steps permanently unauthorizable. That is why the SQL
 * falls back to `required_seat := target_seat` for need/quote/receive: it is
 * not laziness, it is a workaround for a seat vocabulary with holes in it.
 *
 * Fixing the matrix without first unifying the vocabulary would convert a
 * silent authorization hole into a hard outage. Order matters: vocabulary
 * first, then the matrix.
 */
export const SEAT_VOCABULARY_IS_AUTHORITATIVE_HERE = true;

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT 1 — Revocation is permanent until an explicit grant
// Resolves audit critical #1 · SERP-026
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TODAY (index.ts:259), sign-in upserts every allowlisted seat with
 * `revoked_at: null`. Revoking someone's seat in the database therefore lasts
 * exactly until their next login, at which point it is silently restored.
 * Access cannot be withdrawn from anyone.
 *
 * THE RULE
 *
 *   Authentication may CREATE a seat that does not exist.
 *   Authentication may NEVER clear `revoked_at` on a seat that does.
 *   Only an explicit, audited grant command may un-revoke.
 *
 * Implementation note: the upsert must not carry `revoked_at` in its payload
 * at all. Omission is the fix — passing `revoked_at: null` is the defect, and
 * passing the previous value is a race. Insert-if-absent, never update.
 *
 * Negative test that must pass before SERP-026 is accepted: revoke a seat,
 * sign the person in again, assert the seat is still revoked and that the
 * session carries no authority from it.
 */
export interface SeatGrant {
  membershipId: Uuid;
  seat: SeatCode;
  /** Null means active. A non-null value is authoritative and survives login. */
  revokedAt: Timestamp | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT 2 — The server decides which seat may issue which command
// Resolves audit critical #2 · SERP-025
// ─────────────────────────────────────────────────────────────────────────────

export const COMMANDS = [
  'CALL', 'BOOKING', 'INTAKE', 'ESTIMATE', 'AUTHORISATION', 'JOB_CARD',
  'PARTS_PROCUREMENT', 'PURCHASE', 'WORK', 'QC', 'HANDOVER',
  'INVOICE_PAYMENT', 'CLOSE',
  // Revision missing endpoints (SERP-167)
  'INVOICE', 'EXPENSE', 'CUSTOMER', 'TENANT_CONFIG', 'TENANT_ONBOARD',
  'WORKFLOW', 'MEMBER_INVITE', 'MEMBER_AUTHORIZE', 'MEMBER_SUSPEND',
  'MEMBER_ROLE_UPDATE', 'ROLE', 'COUNTER_SALE',
] as const;
export type CommandName = (typeof COMMANDS)[number];

export const SCM_STEPS = ['need', 'quote', 'award', 'receive', 'match', 'pay'] as const;
export type ScmStep = (typeof SCM_STEPS)[number];

/**
 * The authorization matrix. Explicit, server-side, and the ONLY thing that
 * decides whether a command is legal for the acting seat.
 */
export const COMMAND_SEATS: Readonly<Record<CommandName, readonly SeatCode[]>> = {
  // Each list mirrors `required_seat` in api_garage_command. A command is legal
  // for exactly the seat that does that work, and for no one else.
  CALL:              ['counter'],
  BOOKING:           ['counter'],
  INTAKE:            ['counter'],
  ESTIMATE:          ['counter'],
  AUTHORISATION:     ['counter'],
  JOB_CARD:          ['counter'],
  PARTS_PROCUREMENT: ['technician'],
  WORK:              ['technician'],
  QC:                ['qc_signer'],
  HANDOVER:          ['counter'],
  INVOICE_PAYMENT:   ['counter'],
  CLOSE:             ['counter'],
  PURCHASE:          [], // never authorized directly — see PURCHASE_STEP_SEATS
  // Revision missing endpoints (SERP-167)
  INVOICE:           ['counter', 'financial_controller', 'director', 'managing_director', 'owner'],
  EXPENSE:           ['counter', 'financial_controller', 'director', 'managing_director', 'owner'],
  CUSTOMER:          ['counter', 'director', 'managing_director', 'owner'],
  TENANT_CONFIG:     ['owner', 'director', 'managing_director'],
  TENANT_ONBOARD:    ['owner'],
  WORKFLOW:          ['owner', 'director', 'managing_director'],
  MEMBER_INVITE:     ['owner', 'director', 'managing_director'],
  MEMBER_AUTHORIZE:  ['owner', 'director', 'managing_director'],
  MEMBER_SUSPEND:    ['owner', 'director', 'managing_director'],
  MEMBER_ROLE_UPDATE:['owner', 'director', 'managing_director'],
  ROLE:              ['owner', 'director', 'managing_director'],
  COUNTER_SALE:      ['counter', 'financial_controller', 'director', 'managing_director', 'owner'],
} as const;

/**
 * The SQL this matrix is required to agree with, restated so a reviewer can
 * check the two by eye and so `commands_test.ts` can assert it mechanically.
 */
export const SQL_REQUIRED_SEAT: Readonly<Record<CommandName, SeatCode | null>> = {
  CALL: 'counter',
  BOOKING: 'counter',
  INTAKE: 'counter',
  ESTIMATE: 'counter',
  AUTHORISATION: 'counter',
  JOB_CARD: 'counter',
  PARTS_PROCUREMENT: 'technician',
  WORK: 'technician',
  QC: 'qc_signer',
  HANDOVER: 'counter',
  INVOICE_PAYMENT: 'counter',
  CLOSE: 'counter',
  PURCHASE: null, // authorized per step, never as a whole
  INVOICE: null, // multi-seat authorized
  EXPENSE: null,
  CUSTOMER: null,
  TENANT_CONFIG: null,
  TENANT_ONBOARD: 'owner',
  WORKFLOW: null,
  MEMBER_INVITE: null,
  MEMBER_AUTHORIZE: null,
  MEMBER_SUSPEND: null,
  MEMBER_ROLE_UPDATE: null,
  ROLE: null,
  COUNTER_SALE: null,
} as const;

export const SQL_PERMITTED_SEATS: Readonly<Record<CommandName, readonly SeatCode[]>> = {
  CALL:              ['counter'],
  BOOKING:           ['counter'],
  INTAKE:            ['counter'],
  ESTIMATE:          ['counter'],
  AUTHORISATION:     ['counter'],
  JOB_CARD:          ['counter'],
  PARTS_PROCUREMENT: ['technician'],
  WORK:              ['technician'],
  QC:                ['qc_signer'],
  HANDOVER:          ['counter'],
  INVOICE_PAYMENT:   ['counter'],
  CLOSE:             ['counter'],
  PURCHASE:          [],
  INVOICE:           ['counter', 'financial_controller', 'director', 'managing_director', 'owner'],
  EXPENSE:           ['counter', 'financial_controller', 'director', 'managing_director', 'owner'],
  CUSTOMER:          ['counter', 'director', 'managing_director', 'owner'],
  TENANT_CONFIG:     ['owner', 'director', 'managing_director'],
  TENANT_ONBOARD:    ['owner'],
  WORKFLOW:          ['owner', 'director', 'managing_director'],
  MEMBER_INVITE:     ['owner', 'director', 'managing_director'],
  MEMBER_AUTHORIZE:  ['owner', 'director', 'managing_director'],
  MEMBER_SUSPEND:    ['owner', 'director', 'managing_director'],
  MEMBER_ROLE_UPDATE:['owner', 'director', 'managing_director'],
  ROLE:              ['owner', 'director', 'managing_director'],
  COUNTER_SALE:      ['counter', 'financial_controller', 'director', 'managing_director', 'owner'],
} as const;

/**
 * PURCHASE is authorized per step, never as a whole. This is the segregation
 * that matters most: the person who requests may not award, the person who
 * awards may not pay, and the person who receives may not match.
 */
export const PURCHASE_STEP_SEATS: Readonly<Record<ScmStep, readonly SeatCode[]>> = {
  need:    ['counter', 'technician', 'quartermaster', 'stores', 'managing_director', 'director', 'financial_controller'],
  quote:   ['quartermaster'],
  award:   ['financial_controller'],
  receive: ['receiver'],
  match:   ['financial_controller'],
  pay:     ['payer'],
} as const;

/**
 * Segregation pairs that must never be satisfied by the same person on the
 * same purchase, regardless of how many seats that person holds.
 *
 * This is the part a seat matrix alone does not give you. Ali holds most seats;
 * without this, he satisfies every step himself and the separation is cosmetic.
 * Enforced per-purchase on `person_id`, not on seat.
 */
export const PURCHASE_SOD_PAIRS: readonly (readonly [ScmStep, ScmStep])[] = [
  ['quote', 'award'],
  ['award', 'pay'],
  ['receive', 'match'],
] as const;

/**
 * Whether a one-person operation may override a SoD pair.
 *
 * FOUNDER DECISION, 21 August 2026: allow with a recorded override.
 *
 * Ignition Ink has two people and one of them is masked and painting. Strict
 * enforcement would make routine purchases impossible; no enforcement makes the
 * control theatre. Recording the override keeps the control honest: the
 * separation is still the default, breaking it is still an event, and the
 * record says who broke it and why.
 *
 * What this is NOT: a way to switch the control off. An override is refused
 * unless it carries a reason, and the reason is stored, not discarded.
 */
export type SodOverridePolicy = 'forbid' | 'allow_with_recorded_override';
export const SOD_OVERRIDE_POLICY: SodOverridePolicy = 'allow_with_recorded_override';

/**
 * The record written when someone satisfies both halves of a segregation pair.
 *
 * Append-only, and it is evidence rather than a log line: an auditor asking
 * "who approved their own purchase, and did anyone say why" gets an answer
 * from this table alone.
 *
 * `reason` is required and must be non-trivial — an empty string, whitespace,
 * or a single character is refused. A control that accepts "." as a
 * justification has been switched off with extra steps.
 */
export interface SodOverride {
  organisationId: Uuid;
  purchaseRef: Uuid;
  pair: readonly [ScmStep, ScmStep];
  /** The person on BOTH sides of the pair. This is the whole point of the record. */
  personId: Uuid;
  seatUsedFirst: SeatCode;
  seatUsedSecond: SeatCode;
  reason: string;
  recordedAt: Timestamp;
}

export const SOD_REASON_MIN_LENGTH = 12 as const;

export type SegregationCapacity = 'solo' | 'segregated';
export type SodDispositionStatus = 'open' | 'self_reviewed' | 'investigated' | 'accepted_with_reason';

export interface SodExceptionRecord {
  readonly id: Uuid;
  readonly organisationId: Uuid;
  readonly purchaseId: Uuid;
  readonly personId: Uuid;
  readonly pairName: string;
  readonly stepA: ScmStep;
  readonly stepB: ScmStep;
  readonly stepAEventId?: Uuid | null;
  readonly stepBEventId?: Uuid | null;
  readonly stepATimestamp: Timestamp;
  readonly stepBTimestamp: Timestamp;
  readonly segregationCapacity: SegregationCapacity;
  readonly disposition: SodDispositionStatus;
  readonly dispositionBy?: Uuid | null;
  readonly dispositionAt?: Timestamp | null;
  readonly dispositionReason?: string | null;
  readonly isSelfReview: boolean;
  readonly createdAt: Timestamp;
}

export interface SodExceptionDispositionRecord {
  readonly id: Uuid;
  readonly organisationId: Uuid;
  readonly exceptionId: Uuid;
  readonly disposition: 'self_reviewed' | 'investigated' | 'accepted_with_reason';
  readonly disposedBy: Uuid;
  readonly reason: string;
  readonly isSelfReview: boolean;
  readonly createdAt: Timestamp;
}

export interface SodCapacityEvaluationResult {
  readonly allowed: boolean;
  readonly action: 'allow' | 'record_exception' | 'block';
  readonly reason?: string;
}

/**
 * Derives whether a purchase step execution should allow cleanly, record an
 * exception (solo capacity), or block (segregated capacity). (DEC-065 / SERP-177)
 */
export function evaluateSoDCapacityAndAction(
  capacity: SegregationCapacity,
  isSamePerson: boolean,
): SodCapacityEvaluationResult {
  if (!isSamePerson) {
    return { allowed: true, action: 'allow' };
  }
  if (capacity === 'solo') {
    return {
      allowed: true,
      action: 'record_exception',
      reason: 'solo_capacity_compensating_control_recorded',
    };
  }
  return {
    allowed: false,
    action: 'block',
    reason: 'sod_violation',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT 3 — One envelope, versioned, server-derived principal
// Resolves audit critical #3 · SERP-025
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TODAY the Flutter client posts workflow forms whose shape does not
 * consistently match what the Edge accepts, so approval and receive flows can
 * fail or skip a stage.
 *
 * THE RULE: exactly one envelope. Every field a client may send is below.
 * Anything else is dropped, not merged.
 *
 * Note what is ABSENT: no `seat`, no `organisation_id`, no `person_id`, no
 * account codes, no amounts posted to the ledger. Those are derived from the
 * session on the server. A client that sends them is ignored, not obeyed.
 */
export interface CommandEnvelope {
  contract: typeof CONTRACT_VERSION;
  command: CommandName;
  /** Required when command === 'PURCHASE'; forbidden otherwise. */
  step?: ScmStep;
  /** The job this command acts on. Absent only for CALL, which creates one. */
  jobRef?: Uuid;
  /** Command-specific payload. Validated per command; never spread into SQL. */
  payload: Readonly<Record<string, unknown>>;
  /** CSRF token echoed from the session cookie. */
  csrf: string;
}

/**
 * The principal. Assembled by the server from the session on every request.
 * Never accepted from the client, never cached beyond the request.
 *
 * `seatVerifiedAt` exists because a session may outlive a revocation: the
 * boundary re-reads membership and seat authority before each authenticated
 * route rather than trusting what the cookie said at sign-in (SERP-026).
 */
export interface Principal {
  personId: Uuid;
  organisationId: Uuid;
  actingSeat: SeatCode;
  heldSeats: readonly SeatCode[];
  seatVerifiedAt: Timestamp;
}

export interface CommandResult {
  ok: boolean;
  requestId: Uuid;
  /** 'applied' on first execution; 'replayed' when an idempotency key repeats. */
  disposition: 'applied' | 'replayed' | 'rejected';
  error?: ErrorCode;
  data?: Readonly<Record<string, unknown>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT 4 — Idempotency survives a restart
// Resolves audit critical #4 · SERP-029
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TODAY the Flutter client holds idempotency keys in memory
 * (api_client.dart:115) and the Python API has no durable store
 * (ops.py:230). A process restart, a retry, a double-tap or a resubmitted form
 * can therefore create duplicate operational effects — two job cards, two
 * payments.
 *
 * THE RULE
 *   1. The CLIENT generates the key and persists it with the pending command,
 *      so a restart mid-flight retries with the SAME key rather than a new one.
 *   2. The SERVER stores key + request hash + outcome durably before acting.
 *   3. Same key + same hash  → replay the stored result. Never re-execute.
 *   4. Same key + different hash → reject as `idempotency_key_conflict`.
 *      This is the case that catches a client reusing a key for a new command.
 *
 * Rule 1 is the one currently missing on both clients, and it is the one that
 * makes the other three worth having.
 */
export interface IdempotencyRecord {
  organisationId: Uuid;
  key: Uuid;
  command: CommandName;
  /** SHA-256 over the canonical envelope. Binds the key to one exact request. */
  requestHash: string;
  state: 'processing' | 'succeeded' | 'failed';
  responseBody: Readonly<Record<string, unknown>> | null;
  expiresAt: Timestamp;
}

export const IDEMPOTENCY_RETENTION_DAYS = 7 as const;

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT 5 — One audience per platform
// Resolves audit critical #5
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TODAY (index.ts:6) web and Android Google client IDs sit in one combined
 * allowlist, and the `x-starq-client-kind` header is accepted but does not
 * select which audience is valid. A web request may therefore present an
 * Android-audience token and be accepted.
 *
 * THE RULE: the declared client kind selects exactly one acceptable audience.
 * A token whose `aud` belongs to a different platform is rejected even if it is
 * otherwise valid and unexpired. An absent or unknown client kind is rejected.
 */
export const CLIENT_KINDS = ['web', 'android'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export interface AudiencePolicy {
  clientKind: ClientKind;
  /** Exactly one. Never a list — a list is how the defect happened. */
  audience: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT 6 (AMENDMENT A2) — Single source of financial truth (DEC-051)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FOUNDER INVARIANT (verbatim):
 * "Any statutory or accounting figure shown by StarqERP must originate from,
 * or reconcile to, the authoritative accounting engine."
 *
 * APPLIES TO (Statutory boundary):
 *   - profit and loss
 *   - balance sheet
 *   - ledger balances
 *   - posted receivables and payables
 *   - GST position
 *   - statutory financial reporting
 *
 * DOES NOT APPLY TO (Operational boundary):
 *   - operational analytics:
 *     - job margin
 *     - turnaround
 *     - utilisation
 *     - stock cover
 *   which may be computed independently because they are management information
 *   rather than statutory figures.
 *
 * THE FAILURE THIS PREVENTS:
 * Nobody decides to build a second accounting engine. It happens one convenient
 * SUM() at a time, in a reports endpoint, because the number was easier to compute
 * from commercial_documents than to ask the books for. Six months later two systems
 * disagree about receivables and both have users.
 *
 * Binds SERP-167 (reports endpoint) and all financial presentation contracts.
 */
export const FINANCIAL_TRUTH_INVARIANT =
  'Any statutory or accounting figure shown by StarqERP must originate from, or reconcile to, the authoritative accounting engine.' as const;

export const STATUTORY_FIGURE_DOMAINS = [
  'profit_and_loss',
  'balance_sheet',
  'ledger_balances',
  'posted_receivables',
  'posted_payables',
  'gst_position',
  'statutory_financial_reporting',
] as const;
export type StatutoryFigureDomain = (typeof STATUTORY_FIGURE_DOMAINS)[number];

export const OPERATIONAL_ANALYTICS_DOMAINS = [
  'job_margin',
  'turnaround',
  'utilisation',
  'stock_cover',
] as const;
export type OperationalAnalyticsDomain = (typeof OPERATIONAL_ANALYTICS_DOMAINS)[number];

export const AUTHORITATIVE_ACCOUNTING_ENGINES = [
  'starq_books_engine',
  'reconciled_journal_outbox',
] as const;
export type AuthoritativeAccountingEngine = (typeof AUTHORITATIVE_ACCOUNTING_ENGINES)[number];

export interface StatutoryFigureSource {
  readonly domain: StatutoryFigureDomain;
  readonly authoritativeEngine: AuthoritativeAccountingEngine;
  /** UUID or deterministic hash of the reconciled ledger entry / batch */
  readonly reconciliationReference: string;
  readonly reconciledAt: Timestamp;
}

export interface OperationalAnalyticsSource {
  readonly domain: OperationalAnalyticsDomain;
  readonly calculationMethodology: string;
  readonly computedAt: Timestamp;
}

export type FinancialFigureSource =
  | { readonly kind: 'statutory'; readonly source: StatutoryFigureSource }
  | { readonly kind: 'operational'; readonly source: OperationalAnalyticsSource };

// ─────────────────────────────────────────────────────────────────────────────
// Commercial Documents & Settlement Allocation Domain (DEC-070 / SERP-175)
// ─────────────────────────────────────────────────────────────────────────────

export const COMMERCIAL_DOCUMENT_TYPES = [
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
] as const;
export type CommercialDocumentType = (typeof COMMERCIAL_DOCUMENT_TYPES)[number];

export const SETTLEMENT_STATUSES = [
  'unallocated',
  'partially_allocated',
  'fully_settled',
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export interface DocumentSettlementSummary {
  readonly documentId: Uuid;
  readonly organisationId: Uuid;
  readonly documentType: CommercialDocumentType;
  readonly currency: string;
  readonly grossTotal: number;
  readonly allocatedTotal: number;
  readonly unallocatedBalance: number;
  readonly settlementStatus: SettlementStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Effective-Dated Tax Regimes & Periods Domain (SERP-164)
// ─────────────────────────────────────────────────────────────────────────────

export const TAX_MODES = ['inclusive', 'exclusive', 'zero_rated', 'exempt'] as const;
export type TaxMode = (typeof TAX_MODES)[number];

export const TAX_REGISTRATION_STATUSES = [
  'registered',
  'not_registered',
  'pending',
  'suspended',
  'cancelled',
] as const;
export type TaxRegistrationStatus = (typeof TAX_REGISTRATION_STATUSES)[number];

export const TAX_TYPES = [
  'gst_general',
  'gst_tourism',
  'income_tax',
  'withholding_tax',
] as const;
export type TaxType = (typeof TAX_TYPES)[number];

export interface TaxRateScheduleRecord {
  readonly id: Uuid;
  readonly taxType: TaxType;
  readonly rate: number;
  readonly effectiveFrom: string; // YYYY-MM-DD
  readonly effectiveTo?: string | null;
  readonly description: string;
  readonly createdAt: Timestamp;
}

export interface TaxRegistrationRecord {
  readonly id: Uuid;
  readonly organisationId: Uuid;
  readonly taxType: TaxType;
  readonly registrationStatus: TaxRegistrationStatus;
  readonly tin?: string | null;
  readonly tan?: string | null;
  readonly effectiveFrom: string; // YYYY-MM-DD
  readonly effectiveTo?: string | null;
  readonly createdAt: Timestamp;
}

export interface TaxCalculationResult {
  readonly isTaxable: boolean;
  readonly taxRate: number;
  /**
   * Convenience view of `baseAmountExact` as a JS number, for display and for
   * callers not yet migrated. NOT authoritative — a double cannot hold every
   * `numeric(20,6)` value. Persist and compare using the `*Exact` strings.
   */
  readonly baseAmount: number;
  readonly taxAmount: number;
  readonly grossAmount: number;
  /**
   * The authoritative figures: exact decimal strings at scale 6, the form
   * `numeric(20,6)` accepts. Bind these as SQL parameters. `baseAmountExact`
   * plus `taxAmountExact` always equals `grossAmountExact` exactly.
   */
  readonly baseAmountExact: string;
  readonly taxAmountExact: string;
  readonly grossAmountExact: string;
  readonly errorMessage?: string | null;
}

export function calculateLineTax(params: {
  readonly registration?: TaxRegistrationRecord | null;
  readonly schedules: readonly TaxRateScheduleRecord[];
  readonly taxType: TaxType;
  readonly supplyDate: string; // YYYY-MM-DD
  readonly taxMode: TaxMode;
  readonly lineAmount: number;
}): TaxCalculationResult {
  const { registration, schedules, taxType, supplyDate, taxMode, lineAmount } = params;

  // SERP-347. This calculation previously ran on IEEE-754 doubles:
  //
  //     const roundedAmount = Math.round(lineAmount * 100) / 100;
  //     const tax = Math.round(base * rate * 100) / 100;
  //
  // which is measurably wrong for values not exactly representable in binary.
  // Observed on that arithmetic: 1.005 -> 1.00 (correct 1.01) and
  // 162.295 -> 162.29 (correct 162.30), because 1.005 * 100 evaluates to
  // 100.49999999999999. These are statutory GST figures on live invoices.
  //
  // Every monetary step below now runs through Money, which is exact decimal
  // at the same scale as the columns — `numeric(20, 6)`.
  //
  // On the input: `lineAmount` is typed `number`, so precision is already lost
  // before this function is entered. `String(n)` yields the shortest decimal
  // that round-trips to that double — String(1.005) === '1.005' — which
  // recovers the caller's intent. Callers should migrate to passing an exact
  // decimal string; until then this is the faithful reading of what they meant.
  const amount = Money.fromDecimalString(String(lineAmount), TAX_CALC_CURRENCY, 'half_up');

  const untaxed = (base: Money): TaxCalculationResult => ({
    isTaxable: false,
    taxRate: 0,
    baseAmount: Number(base.toDisplayString(2)),
    taxAmount: 0,
    grossAmount: Number(base.toDisplayString(2)),
    baseAmountExact: base.toDecimalString(),
    taxAmountExact: Money.zero(TAX_CALC_CURRENCY).toDecimalString(),
    grossAmountExact: base.toDecimalString(),
    errorMessage: null,
  });

  // The statutory presentation scale is two places; the storage scale is six.
  // Round once, here, so the figure that reaches the ledger is the figure that
  // was quoted — rather than rounding again at each later step.
  const presented = Money.fromDecimalString(amount.toDisplayString(2), TAX_CALC_CURRENCY);

  // 1. If not registered -> CANNOT charge tax
  if (!registration || registration.registrationStatus !== 'registered') {
    return untaxed(presented);
  }

  // 2. Non-taxable modes
  if (taxMode === 'zero_rated' || taxMode === 'exempt') {
    return untaxed(presented);
  }

  // 3. Resolve rate schedule by time of supply
  const schedule = schedules.find((s) => {
    if (s.taxType !== taxType) return false;
    if (supplyDate < s.effectiveFrom) return false;
    if (s.effectiveTo && supplyDate > s.effectiveTo) return false;
    return true;
  });

  if (!schedule) {
    const zero = Money.zero(TAX_CALC_CURRENCY);
    return {
      isTaxable: false,
      taxRate: 0,
      baseAmount: 0,
      taxAmount: 0,
      grossAmount: 0,
      baseAmountExact: zero.toDecimalString(),
      taxAmountExact: zero.toDecimalString(),
      grossAmountExact: zero.toDecimalString(),
      errorMessage: 'no_tax_rate_for_supply_date',
    };
  }

  const rate = schedule.rate;
  // The rate is typed `number` on TaxRateScheduleRecord. Same treatment as the
  // line amount: String() recovers the exact decimal that was meant (0.08),
  // rather than multiplying by 0.08000000000000000166...
  const rateDecimal = String(rate);

  const taxed = (base: Money, tax: Money, gross: Money): TaxCalculationResult => ({
    isTaxable: true,
    taxRate: rate,
    baseAmount: Number(base.toDisplayString(2)),
    taxAmount: Number(tax.toDisplayString(2)),
    grossAmount: Number(gross.toDisplayString(2)),
    baseAmountExact: base.toDecimalString(),
    taxAmountExact: tax.toDecimalString(),
    grossAmountExact: gross.toDecimalString(),
    errorMessage: null,
  });

  if (taxMode === 'exclusive') {
    const base = presented;
    const tax = base.multiply(rateDecimal, 'half_up');
    // Derived by addition, so base + tax === gross holds exactly.
    return taxed(base, tax, base.add(tax));
  }

  // Inclusive: the quoted figure IS the gross, and the base is recovered from
  // it. The tax is then taken by SUBTRACTION rather than a second rounding, so
  // that base + tax === gross exactly — the identity an auditor checks first.
  const gross = presented;
  const divisor = Money.fromDecimalString('1', TAX_CALC_CURRENCY)
    .add(Money.fromDecimalString(rateDecimal, TAX_CALC_CURRENCY, 'half_up'))
    .toDecimalString();
  const base = gross.divide(divisor, 'half_up');
  return taxed(base, gross.subtract(base), gross);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bank Accounts as First-Class Entities Domain (SERP-165 / Amendment A4)
// ─────────────────────────────────────────────────────────────────────────────

export const BANK_ACCOUNT_TYPES = [
  'operating',
  'treasury',
  'clearing',
  'pos_settlement',
  'cash_drawer',
  'petty_cash',
] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export interface BankAccountRecord {
  readonly id: Uuid;
  readonly organisationId: Uuid;
  readonly institutionCode: string;
  readonly institutionName: string;
  readonly accountName: string;
  readonly accountType: BankAccountType;
  readonly accountIdentifierMask?: string | null;
  readonly currency: string; // ISO 4217 open code (MVR, USD, EUR, SGD, AED, GBP, etc.)
  readonly glAccountCode?: string | null;
  readonly isDefault: boolean;
  readonly active: boolean;
  readonly createdAt: Timestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Workflow Stages & Templates Domain (DEC-057 / SERP-162)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowTemplateRecord {
  readonly id: Uuid;
  readonly organisationId: Uuid;
  readonly workflowCode: string;
  readonly name: string;
  readonly description?: string | null;
  readonly active: boolean;
  readonly createdAt: Timestamp;
}

export interface WorkflowStageRecord {
  readonly id: Uuid;
  readonly organisationId: Uuid;
  readonly workflowTemplateId: Uuid;
  readonly stageCode: string;
  readonly stageName: string;
  readonly stageOrder: number;
  readonly commandName?: CommandName | null;
  readonly requiredSeat?: SeatCode | null;
  readonly allowedFromStages: readonly string[];
  readonly isInitial: boolean;
  readonly isTerminal: boolean;
  readonly active: boolean;
  readonly createdAt: Timestamp;
}

export interface WorkflowTransitionResult {
  readonly nextState: string | null;
  readonly isValid: boolean;
  readonly errorMessage: string | null;
}

export function validateDynamicWorkflowTransition(
  stages: readonly WorkflowStageRecord[],
  currentState: string | null,
  commandName: string,
): WorkflowTransitionResult {
  const normCmd = commandName.trim().toUpperCase();
  const targetStage = stages.find((s) => s.active && s.commandName?.toUpperCase() === normCmd);
  if (!targetStage) {
    return { nextState: null, isValid: false, errorMessage: 'unsupported_command' };
  }
  if (targetStage.isInitial && (!currentState || currentState === '')) {
    return { nextState: targetStage.stageCode, isValid: true, errorMessage: null };
  }
  if (currentState && targetStage.allowedFromStages.includes(currentState)) {
    return { nextState: targetStage.stageCode, isValid: true, errorMessage: null };
  }
  return { nextState: targetStage.stageCode, isValid: false, errorMessage: 'illegal_workflow_transition' };
}

// ─────────────────────────────────────────────────────────────────────────────
// AMENDMENT A8 (DEC-068 / SERP-163) — Roles as Data & Precedence Invariant
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_PRECEDENCE_INVARIANT =
  'A role may make an action visible or generally available. A role can NEVER suppress, alter, back-date, delete or silently self-dispose a segregation-of-duties exception, and a role can NEVER determine whether a pair blocks or records — that follows from the organisation’s segregation capacity, not from permission.' as const;

export const MEMBERSHIP_STATUSES = ['pending', 'active', 'suspended', 'ended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const STANDARD_ROLE_CODES = [
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
] as const;
export type StandardRoleCode = (typeof STANDARD_ROLE_CODES)[number];

export interface RoleRecord {
  readonly id: Uuid;
  readonly organisationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly isSystem: boolean;
  readonly active: boolean;
  readonly createdAt: Timestamp;
}

export interface RolePermissionRecord {
  readonly id: Uuid;
  readonly organisationId: Uuid;
  readonly roleId: Uuid;
  readonly module: string;
  readonly action: string;
  readonly granted: boolean;
  readonly createdAt: Timestamp;
}

export interface MembershipRecord {
  readonly id: Uuid;
  readonly organisationId: Uuid;
  readonly personId: Uuid;
  readonly roleId?: Uuid | null;
  readonly status: MembershipStatus;
  readonly validFrom: Timestamp;
  readonly validTo?: Timestamp | null;
  readonly createdAt: Timestamp;
}

/**
 * Precedence Rule Validator (A8):
 * Ensures that roles determine only UI/action visibility, and never bypass
 * seat authorization or segregation of duties.
 */
export function validateRoleActionVisibility(
  membership: MembershipRecord,
  permissions: readonly RolePermissionRecord[],
  module: string,
  action: string,
): { visible: boolean; reason?: string } {
  if (membership.status !== 'active') {
    return { visible: false, reason: `membership_${membership.status}` };
  }
  const perm = permissions.find(
    (p) => p.roleId === membership.roleId && p.module === module && (p.action === action || p.action === 'admin'),
  );
  if (!perm || !perm.granted) {
    return { visible: false, reason: 'permission_denied' };
  }
  return { visible: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenancy
//
// Audit critical #7: the Edge is hardcoded to a single organisation
// (index.ts:14, CLUB_IGNITION_ID). Starq Technologies is seeded in the database
// but unreachable through the API, so the "multi-tenant ERP" serves one tenant.
//
// The first two tenants are Starq Technologies (planning its own resources) and
// Club Ignition (the garage) — DEC-043. Two real tenants from the start is what
// proves isolation with real data instead of a synthetic fixture.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolved from the session's membership. Never a constant, never a header,
 * never a body field. A hardcoded organisation id in any runtime is a defect.
 */
export interface TenantContext {
  organisationId: Uuid;
  /** Trading/outlet name for display only. Carries no authority. */
  activityLabel: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
//
// Stable codes. The boundary returns a code and a request id — never a database
// message, a stack, a table name or a constraint name.
// ─────────────────────────────────────────────────────────────────────────────

export const ERROR_CODES = [
  'contract_version_unsupported',
  'malformed_envelope',
  'unknown_command',
  'step_required',
  'step_not_permitted',
  'seat_not_authorized',
  'seat_revoked',
  'sod_violation',
  'tenant_not_resolved',
  'cross_tenant_denied',
  'csrf_mismatch',
  'idempotency_key_required',
  'idempotency_key_conflict',
  'audience_mismatch',
  'rate_limited',
  'statutory_reconciliation_required',
  'ai_copilot_disabled',
  'tenant_not_found',
  'insufficient_seat_authority',
  'validation_failed',
  'unauthorized',
  'invalid_request_payload',
  'internal_server_error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Decisions
//
// Pure functions, no I/O. These exist so the three runtimes stop each holding
// their own copy of the authorization rules — which is how the vocabularies
// drifted apart in the first place. The Edge calls these; the tests below call
// exactly the same code, so a passing test means the boundary is right rather
// than that a parallel reimplementation is self-consistent.
// ─────────────────────────────────────────────────────────────────────────────

export type Decision =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: ErrorCode };

const OK: Decision = { ok: true };
const no = (error: ErrorCode): Decision => ({ ok: false, error });

/** Seats permitted to issue this command. PURCHASE resolves through its step. */
export function seatsForCommand(
  command: CommandName,
  step?: ScmStep,
): readonly SeatCode[] {
  if (command === 'PURCHASE') return step ? PURCHASE_STEP_SEATS[step] ?? [] : [];
  return COMMAND_SEATS[command] ?? [];
}

/**
 * The single authorization decision.
 *
 * Order matters and is deliberate: shape, then tenancy, then revocation, then
 * seat. A revoked seat must be refused as `seat_revoked` rather than falling
 * through to `seat_not_authorized`, because the two mean different things to
 * whoever reads the security event — one is a mistake, the other is someone
 * using access that was taken away.
 */
export function authorizeCommand(
  principal: Principal,
  envelope: CommandEnvelope,
  opts: { readonly revokedSeats?: readonly SeatCode[]; readonly tenantOfTarget?: Uuid } = {},
): Decision {
  if (envelope.contract !== CONTRACT_VERSION) return no('contract_version_unsupported');
  if (!COMMANDS.includes(envelope.command)) return no('unknown_command');

  if (envelope.command === 'PURCHASE') {
    if (!envelope.step) return no('step_required');
    if (!SCM_STEPS.includes(envelope.step)) return no('step_not_permitted');
  } else if (envelope.step) {
    return no('step_not_permitted');
  }

  if (!principal.organisationId) return no('tenant_not_resolved');
  if (opts.tenantOfTarget && opts.tenantOfTarget !== principal.organisationId) {
    return no('cross_tenant_denied');
  }

  if ((opts.revokedSeats ?? []).includes(principal.actingSeat)) return no('seat_revoked');
  if (!principal.heldSeats.includes(principal.actingSeat)) return no('seat_not_authorized');

  const permitted = seatsForCommand(envelope.command, envelope.step);
  if (!permitted.includes(principal.actingSeat)) return no('seat_not_authorized');

  return OK;
}

/** One completed step of a purchase, as the SoD check needs to see it. */
export interface PurchaseStepRecord {
  readonly step: ScmStep;
  readonly personId: Uuid;
}

/**
 * Does taking `step` as `personId` break a segregation pair?
 * Returns the offending pair, or null when clear.
 */
export function sodViolation(
  history: readonly PurchaseStepRecord[],
  step: ScmStep,
  personId: Uuid,
): readonly [ScmStep, ScmStep] | null {
  for (const pair of PURCHASE_SOD_PAIRS) {
    const [a, b] = pair;
    const other = step === a ? b : step === b ? a : null;
    if (!other) continue;
    if (history.some((h) => h.step === other && h.personId === personId)) return pair;
  }
  return null;
}

/**
 * Whether a SoD violation may proceed.
 *
 * Under the founder's ruling this returns ok for a properly reasoned override
 * and refuses otherwise — including when the policy is set to forbid, so
 * flipping the policy constant is enough to harden the system without touching
 * call sites.
 */
export function authorizeSodOverride(
  override: Pick<SodOverride, 'reason'> | null,
): Decision {
  if (SOD_OVERRIDE_POLICY === 'forbid') return no('sod_violation');
  if (!override) return no('sod_violation');
  if (override.reason.trim().length < SOD_REASON_MIN_LENGTH) return no('sod_violation');
  return OK;
}

/**
 * What to do with an incoming idempotency key.
 *
 * `execute` only when the key is genuinely new. A stored key with a matching
 * hash replays; a stored key with a different hash is a client reusing a key
 * for a different command, which is a conflict rather than a replay.
 */
export function idempotencyDecision(
  stored: Pick<IdempotencyRecord, 'requestHash' | 'command'> | null,
  incoming: { readonly requestHash: string; readonly command: CommandName },
): 'execute' | 'replay' | 'conflict' {
  if (!stored) return 'execute';
  if (stored.requestHash !== incoming.requestHash) return 'conflict';
  if (stored.command !== incoming.command) return 'conflict';
  return 'replay';
}

/**
 * Exactly one audience per declared client kind. An unknown or absent kind is
 * refused rather than defaulted — defaulting is how a web request came to be
 * accepted with an Android-audience token.
 */
export function audienceIsValid(
  clientKind: string | null | undefined,
  tokenAudience: string,
  policies: readonly AudiencePolicy[],
): Decision {
  if (!clientKind) return no('audience_mismatch');
  const policy = policies.find((p) => p.clientKind === clientKind);
  if (!policy) return no('audience_mismatch');
  if (policy.audience !== tokenAudience) return no('audience_mismatch');
  return OK;
}

/**
 * Read a LEGACY request body as an envelope.
 *
 * The Flutter client does not yet send `CommandEnvelope`; it posts the older shape that
 * `api_garage_command` was written against. This adapter exists until the client is migrated,
 * and is then deleted.
 *
 * ⚠ THE KEY ORDER AND CASING MIRROR THE SQL EXACTLY:
 *
 *     event_name := upper(trim(coalesce(command->>'type', command->>'sop', '')))
 *     scm_step   := lower(trim(coalesce(command->>'scm_step', command->>'action', '')))
 *
 * If this and that SQL ever disagree about which key wins, the boundary authorizes one command
 * while the database executes another — worse than having no boundary check, because it would
 * look like it was working. Change both or neither. It lives here, not in the Edge, so the test
 * harness exercises the same code the boundary runs.
 *
 * Returns null when no command can be read; the caller refuses that as `unknown_command`.
 */
export function fromLegacyBody(
  body: Readonly<Record<string, unknown>>,
): CommandEnvelope | null {
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };

  const command = pick('type', 'sop').toUpperCase();
  if (!command) return null;

  const step = pick('scm_step', 'action').toLowerCase();

  return {
    contract: CONTRACT_VERSION,
    command: command as CommandName,
    // Only PURCHASE carries a step. A step on anything else is refused by authorizeCommand as
    // `step_not_permitted` — the correct answer, not something to paper over here.
    ...(step ? { step: step as ScmStep } : {}),
    payload: body,
    csrf: String(body.csrf ?? ''),
  };
}

/**
 * Whether a seat write is allowed to touch revocation.
 *
 * The sign-in path must never carry `revoked_at`. This exists so the rule is
 * enforceable by a test rather than by remembering to read a comment.
 */
export function seatWriteIsSafe(payload: Readonly<Record<string, unknown>>): Decision {
  return Object.prototype.hasOwnProperty.call(payload, 'revoked_at')
    ? no('seat_revoked')
    : OK;
}

/**
 * Validates that any financial figure presented by StarqERP obeys Amendment A2 (DEC-051).
 * Rejects statutory figures that attempt unverified / ad-hoc calculations without
 * authoritative accounting engine reconciliation.
 */
export function validateFinancialFigureSource(
  input: {
    readonly domain: string;
    readonly kind?: 'statutory' | 'operational';
    readonly authoritativeEngine?: string;
    readonly reconciliationReference?: string;
  },
): Decision {
  const isStatutory = (STATUTORY_FIGURE_DOMAINS as readonly string[]).includes(input.domain);
  const isOperational = (OPERATIONAL_ANALYTICS_DOMAINS as readonly string[]).includes(input.domain);

  if (!isStatutory && !isOperational) {
    return no('unknown_command');
  }

  if (isStatutory) {
    if (input.kind !== 'statutory') return no('statutory_reconciliation_required');
    if (
      !input.authoritativeEngine ||
      !(AUTHORITATIVE_ACCOUNTING_ENGINES as readonly string[]).includes(input.authoritativeEngine)
    ) {
      return no('statutory_reconciliation_required');
    }
    if (!input.reconciliationReference || input.reconciliationReference.trim().length === 0) {
      return no('statutory_reconciliation_required');
    }
  }

  return OK;
}

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance
//
// A runtime conforms when every check below passes with a NEGATIVE test — one
// that proves the thing is refused. Positive tests prove a feature exists;
// only negative tests prove a control works, and every defect above passed its
// positive test.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFORMANCE_TESTS = [
  'revoked seat stays revoked across a fresh sign-in',
  'seat not in COMMAND_SEATS is refused for that command',
  'purchase step outside PURCHASE_STEP_SEATS is refused',
  'same person cannot satisfy both halves of a PURCHASE_SOD_PAIR',
  'client-supplied seat, organisation or person in the body is ignored',
  'same idempotency key and hash replays without re-executing',
  'same idempotency key with a different hash is refused',
  'idempotency survives a process restart mid-command',
  'web client presenting an android-audience token is refused',
  'request for another tenant\'s job is refused, not empty',
  'envelope with an unknown contract version is refused',
  'statutory figure must trace to authoritative accounting engine and cannot be ad-hoc raw aggregation',
  'operational analytics are distinguished and permitted independent calculation',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SERP-144: Customer, vehicle and phone persistence on garage jobs
// ─────────────────────────────────────────────────────────────────────────────

export interface CallCommandPayload {
  customer_name: string;
  vehicle_reg: string;
  phone?: string;
  customer_phone?: string;
  consent: boolean;
  notes?: string;
}

export function validateCallCommandPayload(payload: CallCommandPayload | Readonly<Record<string, unknown>>): {
  valid: boolean;
  customer_name?: string;
  vehicle_reg?: string;
  phone?: string;
  error?: string;
} {
  const p = payload as Record<string, unknown>;
  const customerName = String(p.customer_name || p.customer || '').trim();
  const vehicleReg = String(p.vehicle_reg || p.vehicle || '').trim();
  const phone = String(p.phone || p.customer_phone || '').trim();
  const consent = Boolean(p.consent);

  if (!customerName || !vehicleReg || !consent) {
    return {
      valid: false,
      error: 'call_requires_customer_vehicle_and_consent',
    };
  }

  return {
    valid: true,
    customer_name: customerName,
    vehicle_reg: vehicleReg,
    phone: phone || undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-166: The 25 ERPContext mutations — canonical command surface map
// (DEC-068 / Amendment A2 / Amendment A4)
//
// THIS IS THE MERGE ARTEFACT described in SERP-166. Nothing may be scoped in
// the wiring without reference to this table.
//
// READING THE TABLE
// -----------------
//   WIRED    → API command or endpoint already exists in starq-api/index.ts
//              and api_garage_command SQL (as of the date noted).
//   NEEDS_167 → Endpoint does not exist; must be built in SERP-167.
//   CLIENT_LOCAL → No server mutation is required; state is view/session only.
//   ELIMINATED → Mutation is replaced by a server-side consequence of the
//                command that triggers it; the client function must be removed.
//
// STATUTORY BOUNDARY (DEC-068 Amendment A2)
//   true  → The figure that results from this mutation is a statutory figure
//            (profit_and_loss, balance_sheet, ledger_balances, posted_receivables,
//            posted_payables, gst_position, statutory_financial_reporting).
//            It MUST originate from, or reconcile to, the authoritative accounting
//            engine (legacy/engine - journal_outbox).
//            Client-side arithmetic on these figures is a contract violation.
//   false → The resulting figure is operational analytics (job_margin,
//            turnaround, utilisation, stock_cover) and may be computed locally.
//   conditional → The figure is statutory only when the organisation is GST-
//            registered or when the mutation triggers an accounting posting.
//
// ─────────────────────────────────────────────────────────────────────────────

export type MutationStatus =
  | 'wired'         // command and endpoint exist today
  | 'needs_167'     // endpoint must be built in SERP-167
  | 'client_local'  // no server round-trip; session/UI state only
  | 'eliminated';   // client call replaced by server-side consequence

export type StatutoryClassification =
  | true            // statutory figure — must originate from accounting engine
  | false           // operational analytics — local compute permitted
  | 'conditional';  // statutory only when org is GST-registered or AP is posted

export interface MutationSurfaceEntry {
  readonly mutation: string;
  readonly group: string;
  readonly status: MutationStatus;
  /**
   * The CommandName (or endpoint path) the client must call, or null if
   * the mutation is client-local or eliminated.
   */
  readonly serverCommand: CommandName | string | null;
  /** Per-step for PURCHASE mutations. */
  readonly purchaseStep?: ScmStep;
  /** The seat(s) that may issue the server command. Null for client-local. */
  readonly requiredSeats: readonly SeatCode[] | null;
  readonly statutoryBoundary: StatutoryClassification;
  /** Free-text notes — wiring constraints, SERP-167 blockers, DEC refs. */
  readonly notes: string;
}

/**
 * The canonical 25-mutation surface map.
 *
 * WIRED TODAY (as of SERP-166, 25 Aug 2026)
 *   createJob           → CALL command (SERP-144 hardened this with customer/vehicle fields)
 *   updateJobStatus     → WORK/QC/HANDOVER/CLOSE depending on stage
 *   addMaterialToJob    → WORK command (stock deduction is a server side-effect)
 *   recordPayment       → INVOICE_PAYMENT command
 *   receiveStock        → PURCHASE/receive (manual restock path)
 *   receivePurchaseOrder → PURCHASE/receive (GRN path, references PO)
 *
 * CLIENT-LOCAL
 *   switchTenant        → session tenant context switch; server knows tenant from session
 *
 * ELIMINATED
 *   logAuditEvent       → server writes audit row as consequence of every accepted command;
 *                         client MUST NOT call this directly (it is a no-op over the API;
 *                         the only reason it exists in ERPContext is that the prototype has
 *                         no real API)
 *
 * NEEDS SERP-167
 *   createInvoice       → INVOICE command (new; generates a sales invoice from line items)
 *   generateJobInvoice  → INVOICE command (server derives from job record; GST from SERP-122)
 *   addExpense          → EXPENSE command (new; direct-expense posting to AP/ledger)
 *   createPurchaseOrder → PURCHASE/need → PURCHASE/award chain
 *   createCustomer      → CUSTOMER command (entity creation)
 *   createTenant        → TENANT_ONBOARD endpoint (admin; bootstrap path)
 *   updateTenant        → TENANT_CONFIG command (settings; TIN/GST flags are statutory-adjacent)
 *   addWorkflowStage    → WORKFLOW command (tenant config; stage definitions)
 *   updateWorkflowStage → WORKFLOW command
 *   deleteWorkflowStage → WORKFLOW command
 *   resetWorkflowToPreset → WORKFLOW command with preset param
 *   inviteUser          → MEMBER_INVITE command
 *   authorizeUser       → MEMBER_AUTHORIZE command
 *   suspendUser         → MEMBER_SUSPEND command
 *   updateUserRole      → MEMBER_ROLE_UPDATE command
 *   createRole          → ROLE command
 *   updateRolePermissions → ROLE command
 *   deleteRole          → ROLE command
 *
 * dismissAlert          → client-local in prototype; full wiring deferred (alerts will
 *                         eventually be server-sourced and dismissal will need an endpoint)
 */
export const MUTATION_SURFACE_MAP: readonly MutationSurfaceEntry[] = [
  // ── WORK ──────────────────────────────────────────────────────────────────
  {
    mutation: 'createJob',
    group: 'WORK',
    status: 'wired',
    serverCommand: 'CALL',
    requiredSeats: COMMAND_SEATS.CALL,
    statutoryBoundary: false,
    notes: 'CALL command creates the garage_job row. Payload must include customer_name, vehicle_reg, phone (SERP-144). Wired in api_garage_command SQL migration 202608200005.',
  },
  {
    mutation: 'updateJobStatus',
    group: 'WORK',
    status: 'wired',
    serverCommand: 'WORK', // also QC, HANDOVER, CLOSE, AUTHORISATION — stage-dependent
    requiredSeats: ['technician', 'qc_signer', 'counter'],
    statutoryBoundary: false,
    notes: 'Stage transition maps to command by stage: in-progress stages → WORK (technician); QC check → QC (qc_signer); customer handover → HANDOVER (counter); invoiced/closed → CLOSE (counter). The client must select the correct command for the target stage, not call updateJobStatus generically.',
  },
  {
    mutation: 'addMaterialToJob',
    group: 'WORK',
    status: 'wired',
    serverCommand: 'WORK',
    requiredSeats: COMMAND_SEATS.WORK,
    statutoryBoundary: false,
    notes: 'Server side-effect of WORK command: deducts stock from inventory and appends material usage to the job record. Client must NOT compute actualProfit locally (operational analytics; permitted) but must NOT compute actualMaterialCost as a ledger figure. The stock movement record is a server consequence.',
  },
  // ── COMMERCIAL ────────────────────────────────────────────────────────────
  {
    mutation: 'createInvoice',
    group: 'COMMERCIAL',
    status: 'wired',
    serverCommand: 'INVOICE',
    requiredSeats: COMMAND_SEATS.INVOICE,
    statutoryBoundary: true,
    notes: 'INVOICE command added in SERP-167 (migration 202608250020). Invoice amounts, GST, and balanceDue are statutory figures computed server-side and recorded in commercial_documents. DEC-068/A2 enforced.',
  },
  {
    mutation: 'generateJobInvoice',
    group: 'COMMERCIAL',
    status: 'wired',
    serverCommand: 'INVOICE',
    requiredSeats: COMMAND_SEATS.INVOICE,
    statutoryBoundary: true,
    notes: 'INVOICE command added in SERP-167. Server derives subtotal and statutory tax from job record / rate schedule and links commercial_documents row to garage_jobs, transitioning job to invoiced.',
  },
  {
    mutation: 'recordPayment',
    group: 'COMMERCIAL',
    status: 'wired',
    serverCommand: 'INVOICE_PAYMENT',
    requiredSeats: COMMAND_SEATS.INVOICE_PAYMENT,
    statutoryBoundary: true,
    notes: 'INVOICE_PAYMENT command exists. Payment settles a receivable — statutory. Server must update invoice balanceDue and post the receipt to the AP/receivables ledger via the foundation engine. Client sends: invoiceId, amount, method, referenceNumber, paymentDate. Server derives: amountPaid, newBalance, status, ledger posting. Client must not update invoice or customer balances locally.',
  },
  {
    mutation: 'addExpense',
    group: 'COMMERCIAL',
    status: 'wired',
    serverCommand: 'EXPENSE',
    requiredSeats: COMMAND_SEATS.EXPENSE,
    statutoryBoundary: true,
    notes: 'EXPENSE command added in SERP-167 (migration 202608250020). Direct expenses post to commercial_documents (type: direct_expense) and journal_outbox with sequential EXP document numbering.',
  },
  // ── STOCK AND PROCUREMENT ─────────────────────────────────────────────────
  {
    mutation: 'receiveStock',
    group: 'STOCK_PROCUREMENT',
    status: 'wired',
    serverCommand: 'PURCHASE',
    purchaseStep: 'receive',
    requiredSeats: PURCHASE_STEP_SEATS.receive,
    statutoryBoundary: false,
    notes: 'Manual restock (no PO) maps to PURCHASE/receive. Stock quantity is operational; the cost update is accounting-adjacent when tied to an AP posting but the inventory quantity itself is not statutory.',
  },
  {
    mutation: 'createPurchaseOrder',
    group: 'STOCK_PROCUREMENT',
    status: 'wired',
    serverCommand: 'PURCHASE',
    purchaseStep: 'need',
    requiredSeats: PURCHASE_STEP_SEATS.need,
    statutoryBoundary: false,
    notes: 'PO creation = PURCHASE/need step. The full PO lifecycle (need → quote → award → receive → match → pay) is already defined by PURCHASE_STEP_SEATS. Client sends: supplierId, items, requiredDate, notes. The supplier outstandingPayable shown in ERPContext is computed from PO totalAmount — this is not a statutory figure (commitment, not yet a ledger posting) and client-side display is permitted until the match step triggers the AP posting.',
  },
  {
    mutation: 'receivePurchaseOrder',
    group: 'STOCK_PROCUREMENT',
    status: 'wired',
    serverCommand: 'PURCHASE',
    purchaseStep: 'receive',
    requiredSeats: PURCHASE_STEP_SEATS.receive,
    statutoryBoundary: 'conditional',
    notes: 'GRN path: PURCHASE/receive with poId in payload. Server records the Goods Receipt Note, updates stock, and signals the match step can proceed. The AP posting happens at PURCHASE/match — at that point the payable becomes statutory. Client must NOT update supplier.outstandingPayable after receive; only after match (server consequence).',
  },
  // ── ENTITIES ──────────────────────────────────────────────────────────────
  {
    mutation: 'createCustomer',
    group: 'ENTITIES',
    status: 'wired',
    serverCommand: 'CUSTOMER',
    requiredSeats: COMMAND_SEATS.CUSTOMER,
    statutoryBoundary: false,
    notes: 'CUSTOMER command added in SERP-167 (migration 202608250020). Creates contact record in public.contacts with type=customer.',
  },
  // ── TENANT ────────────────────────────────────────────────────────────────
  {
    mutation: 'createTenant',
    group: 'TENANT',
    status: 'wired',
    serverCommand: 'TENANT_ONBOARD',
    requiredSeats: COMMAND_SEATS.TENANT_ONBOARD,
    statutoryBoundary: 'conditional',
    notes: 'TENANT_ONBOARD command added in SERP-167.',
  },
  {
    mutation: 'updateTenant',
    group: 'TENANT',
    status: 'wired',
    serverCommand: 'TENANT_CONFIG',
    requiredSeats: COMMAND_SEATS.TENANT_CONFIG,
    statutoryBoundary: 'conditional',
    notes: 'TENANT_CONFIG command added in SERP-167.',
  },
  {
    mutation: 'switchTenant',
    group: 'TENANT',
    status: 'client_local',
    serverCommand: null,
    requiredSeats: null,
    statutoryBoundary: false,
    notes: 'Session tenant context switch. The server knows the tenant from the session; the client just changes which org is displayed. No server round-trip required. If multi-tenant isolation is needed, re-auth against a different org membership is the mechanism (not a client-side flag).',
  },
  // ── WORKFLOW ──────────────────────────────────────────────────────────────
  {
    mutation: 'addWorkflowStage',
    group: 'WORKFLOW',
    status: 'wired',
    serverCommand: 'WORKFLOW',
    requiredSeats: COMMAND_SEATS.WORKFLOW,
    statutoryBoundary: false,
    notes: 'WORKFLOW command added in SERP-167.',
  },
  {
    mutation: 'updateWorkflowStage',
    group: 'WORKFLOW',
    status: 'wired',
    serverCommand: 'WORKFLOW',
    requiredSeats: COMMAND_SEATS.WORKFLOW,
    statutoryBoundary: false,
    notes: 'WORKFLOW command added in SERP-167.',
  },
  {
    mutation: 'deleteWorkflowStage',
    group: 'WORKFLOW',
    status: 'wired',
    serverCommand: 'WORKFLOW',
    requiredSeats: COMMAND_SEATS.WORKFLOW,
    statutoryBoundary: false,
    notes: 'WORKFLOW command added in SERP-167.',
  },
  {
    mutation: 'resetWorkflowToPreset',
    group: 'WORKFLOW',
    status: 'wired',
    serverCommand: 'WORKFLOW',
    requiredSeats: COMMAND_SEATS.WORKFLOW,
    statutoryBoundary: false,
    notes: 'WORKFLOW command added in SERP-167.',
  },
  // ── IDENTITY ──────────────────────────────────────────────────────────────
  {
    mutation: 'inviteUser',
    group: 'IDENTITY',
    status: 'wired',
    serverCommand: 'MEMBER_INVITE',
    requiredSeats: COMMAND_SEATS.MEMBER_INVITE,
    statutoryBoundary: false,
    notes: 'MEMBER_INVITE command added in SERP-167.',
  },
  {
    mutation: 'authorizeUser',
    group: 'IDENTITY',
    status: 'wired',
    serverCommand: 'MEMBER_AUTHORIZE',
    requiredSeats: COMMAND_SEATS.MEMBER_AUTHORIZE,
    statutoryBoundary: false,
    notes: 'MEMBER_AUTHORIZE command added in SERP-167.',
  },
  {
    mutation: 'suspendUser',
    group: 'IDENTITY',
    status: 'wired',
    serverCommand: 'MEMBER_SUSPEND',
    requiredSeats: COMMAND_SEATS.MEMBER_SUSPEND,
    statutoryBoundary: false,
    notes: 'MEMBER_SUSPEND command added in SERP-167.',
  },
  {
    mutation: 'updateUserRole',
    group: 'IDENTITY',
    status: 'wired',
    serverCommand: 'MEMBER_ROLE_UPDATE',
    requiredSeats: COMMAND_SEATS.MEMBER_ROLE_UPDATE,
    statutoryBoundary: false,
    notes: 'MEMBER_ROLE_UPDATE command added in SERP-167.',
  },
  {
    mutation: 'createRole',
    group: 'IDENTITY',
    status: 'wired',
    serverCommand: 'ROLE',
    requiredSeats: COMMAND_SEATS.ROLE,
    statutoryBoundary: false,
    notes: 'ROLE command added in SERP-167.',
  },
  {
    mutation: 'updateRolePermissions',
    group: 'IDENTITY',
    status: 'wired',
    serverCommand: 'ROLE',
    requiredSeats: COMMAND_SEATS.ROLE,
    statutoryBoundary: false,
    notes: 'ROLE command added in SERP-167.',
  },
  {
    mutation: 'deleteRole',
    group: 'IDENTITY',
    status: 'wired',
    serverCommand: 'ROLE',
    requiredSeats: COMMAND_SEATS.ROLE,
    statutoryBoundary: false,
    notes: 'ROLE command added in SERP-167.',
  },
  // ── AUDIT ─────────────────────────────────────────────────────────────────
  {
    mutation: 'logAuditEvent',
    group: 'AUDIT',
    status: 'eliminated',
    serverCommand: null,
    requiredSeats: null,
    statutoryBoundary: false,
    notes: 'ELIMINATED. The server writes an audit row as a consequence of every accepted command. The client MUST NOT call this. Its existence in ERPContext.tsx is a prototype artefact: the prototype has no API and needed a local record. Once wired, the ERPContext function is deleted — it cannot be retained as an "also log locally" helper because client-side audit logs are not audit logs.',
  },
  {
    mutation: 'dismissAlert',
    group: 'AUDIT',
    status: 'client_local',
    serverCommand: null,
    requiredSeats: null,
    statutoryBoundary: false,
    notes: 'Client-local for now. In the prototype, alerts are seeded from mockData and live in React state; dismissal is a local filter. Full wiring: alerts will be server-sourced (from the api_garage_pulse response or a dedicated alerts endpoint) and dismissal will need a DISMISS_ALERT endpoint or be a consequence of the action that resolves the alert (e.g., authorizeUser dismisses the pending-approval alert). Deferred — no blocking dependency.',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SERP-166 helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all mutations that must be wired before mockData.ts can be deleted. */
export function mutationsRequiringApi(): readonly MutationSurfaceEntry[] {
  return MUTATION_SURFACE_MAP.filter((m) => m.status === 'wired' || m.status === 'needs_167');
}

/** Returns mutations blocked on SERP-167 (new endpoints). */
export function mutationsBlockedOnSerp167(): readonly MutationSurfaceEntry[] {
  return MUTATION_SURFACE_MAP.filter((m) => m.status === 'needs_167');
}

/** Returns mutations that cross the statutory boundary (DEC-068/A2). */
export function statutoryMutations(): readonly MutationSurfaceEntry[] {
  return MUTATION_SURFACE_MAP.filter((m) => m.statutoryBoundary === true || m.statutoryBoundary === 'conditional');
}

/**
 * Validates that a mutation's client-side implementation does not violate
 * Amendment A2 — i.e., that the mutation is either client-local, wired to the
 * server, or explicitly eliminated.
 *
 * Returns ok=false with error='statutory_reconciliation_required' when a
 * statutory mutation attempts to compute its figure client-side.
 */
export function validateMutationBoundary(
  mutationName: string,
  computedClientSide: boolean,
): Decision {
  const entry = MUTATION_SURFACE_MAP.find((m) => m.mutation === mutationName);
  if (!entry) return no('unknown_command');
  if (entry.status === 'client_local') return OK;
  if (entry.status === 'eliminated') return no('unknown_command'); // client should not call
  if (computedClientSide && (entry.statutoryBoundary === true || entry.statutoryBoundary === 'conditional')) {
    return no('statutory_reconciliation_required');
  }
  return OK;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-172: Adversarial Tenant Isolation Domain (Memo §37 / Amendment A6)
//
// MEMO §37: multi-tenancy is not "verified" because two tenants render correctly.
// It is verified when attacks fail.
//
// ATTACK VECTORS COVERED:
//   1. Cross-tenant document / job ID guessing
//   2. Forged organisation ID in payload / header
//   3. Cross-tenant storage object URL access & path traversal (..)
//   4. Search & export queries crossing tenant boundaries
//   5. Audit-log query leakage across organisations
//   6. AI copilot context retrieval crossing tenant boundaries
//   7. Structural composite foreign key enforcement independent of RLS
//
// AMENDMENT A6 (DEC-068): passing this suite is a hard gate that unlocks
// AI retrieval and file storage on production tenant data.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that an attachment / storage key is strictly bounded to the
 * tenant's namespace and contains no path traversal attacks (.. or backslashes).
 */
export function validateStorageObjectKey(
  organisationId: Uuid,
  storageKey: string,
): Decision {
  if (!organisationId) return no('tenant_not_resolved');
  if (!storageKey || typeof storageKey !== 'string') return no('cross_tenant_denied');

  const trimmed = storageKey.trim();
  // Prevent directory traversal and invalid slashes
  if (trimmed.includes('..') || trimmed.includes('\\') || trimmed.startsWith('/')) {
    return no('cross_tenant_denied');
  }

  // Storage key must be prefixed with the organisation ID namespace: "<org_id>/"
  const expectedPrefix = `${organisationId}/`;
  if (!trimmed.startsWith(expectedPrefix)) {
    return no('cross_tenant_denied');
  }

  return OK;
}

/**
 * Validates that a search or export request does not attempt cross-tenant retrieval.
 */
export function validateSearchScope(
  sessionOrgId: Uuid,
  requestedOrgId?: string,
): Decision {
  if (!sessionOrgId) return no('tenant_not_resolved');
  if (requestedOrgId && requestedOrgId !== sessionOrgId) {
    return no('cross_tenant_denied');
  }
  return OK;
}

/**
 * Validates that all documents assembled into an AI context prompt belong
 * exclusively to the session organisation (no cross-tenant leakage into LLM prompts).
 */
export function validateAIContextRetrieval(
  sessionOrgId: Uuid,
  documentOrgIds: readonly Uuid[],
): Decision {
  if (!sessionOrgId) return no('tenant_not_resolved');
  for (const docOrgId of documentOrgIds) {
    if (docOrgId !== sessionOrgId) {
      return no('cross_tenant_denied');
    }
  }
  return OK;
}

/**
 * Validates composite foreign key structural isolation: child and parent
 * records MUST share the same organisation_id. (Asserted independently of RLS).
 */
export function validateCompositeForeignKeyIntegrity(
  childOrgId: Uuid,
  parentOrgId: Uuid,
): Decision {
  if (!childOrgId || !parentOrgId) return no('tenant_not_resolved');
  if (childOrgId !== parentOrgId) {
    return no('cross_tenant_denied');
  }
  return OK;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-168: AI Copilot Proxy & Tenant Isolation Boundaries
// ─────────────────────────────────────────────────────────────────────────────

export interface AICopilotProxyRequest {
  readonly tenantId: Uuid;
  readonly userId: Uuid;
  readonly prompt: string;
  readonly retrievedDocOrgIds: readonly Uuid[];
  readonly featureFlagEnabled?: boolean;
}

export function validateAICopilotProxyRequest(req: AICopilotProxyRequest): Decision {
  if (!req.tenantId) return no('tenant_not_resolved');
  if (!req.userId) return no('tenant_not_resolved');
  if (!req.prompt || req.prompt.trim().length === 0) return no('malformed_envelope');

  // Feature flag default is OFF (Amendment A6 / DEC-068)
  if (req.featureFlagEnabled !== true) {
    return no('ai_copilot_disabled');
  }

  // Cross-tenant document retrieval check
  return validateAIContextRetrieval(req.tenantId, req.retrievedDocOrgIds);
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-167: Command Payloads & Validation (Revision Missing Endpoints)
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceLineItemPayload {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
}

export interface InvoiceCommandPayload {
  readonly customer_id?: Uuid;
  readonly customer_name?: string;
  readonly job_id?: Uuid;
  readonly job_no?: string;
  readonly items?: readonly InvoiceLineItemPayload[];
  readonly total_amount?: number;
  readonly gst_amount?: number;
  readonly subtotal?: number;
  readonly notes?: string;
}

export function validateInvoiceCommandPayload(
  payload: InvoiceCommandPayload | Readonly<Record<string, unknown>>,
): { valid: boolean; error?: string; totalAmount?: number; subtotal?: number; gstAmount?: number } {
  const p = payload as Record<string, unknown>;
  const items = (p.items as readonly InvoiceLineItemPayload[]) || [];
  const jobId = p.job_id || p.jobRef;

  if (items.length === 0 && !jobId) {
    return { valid: false, error: 'invoice_requires_items_or_job_ref' };
  }

  let subtotal = 0;
  for (const item of items) {
    if (!item.description || item.quantity <= 0 || item.unitPrice < 0) {
      return { valid: false, error: 'invalid_invoice_line_item' };
    }
    subtotal += item.quantity * item.unitPrice;
  }

  const gstAmount = Number(p.gst_amount ?? 0);
  const totalAmount = Number(p.total_amount ?? subtotal + gstAmount);

  return { valid: true, subtotal, gstAmount, totalAmount };
}

export interface ExpenseCommandPayload {
  readonly payee: string;
  readonly amount: number;
  readonly category: string;
  readonly payment_method?: string;
  readonly notes?: string;
  readonly date?: string;
}

export function validateExpenseCommandPayload(
  payload: ExpenseCommandPayload | Readonly<Record<string, unknown>>,
): { valid: boolean; error?: string } {
  const p = payload as Record<string, unknown>;
  const payee = String(p.payee || '').trim();
  const amount = Number(p.amount);
  const category = String(p.category || '').trim();

  if (!payee || !category || isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'expense_requires_payee_category_and_positive_amount' };
  }
  return { valid: true };
}

export interface CustomerCommandPayload {
  readonly name: string;
  readonly phone?: string;
  readonly island?: string;
  readonly vehicle_reg?: string;
  readonly notes?: string;
}

export function validateCustomerCommandPayload(
  payload: CustomerCommandPayload | Readonly<Record<string, unknown>>,
): { valid: boolean; error?: string; name?: string } {
  const p = payload as Record<string, unknown>;
  const name = String(p.name || p.customer_name || '').trim();
  if (!name) {
    return { valid: false, error: 'customer_name_required' };
  }
  return { valid: true, name };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-268: Privileged & Administrator Multi-Factor Authentication (MFA)
// (DEC-073 / DEC-083 / Vision §19)
// ─────────────────────────────────────────────────────────────────────────────

export type MfaStatus = 'disabled' | 'enrolled' | 'challenged' | 'verified';

export const PRIVILEGED_ROLE_CODES: readonly string[] = [
  'owner',
  'superadmin',
  'super-admin',
  'managing_director',
  'director',
  'role-superadmin',
  'role-owner',
];

export const PRIVILEGED_ACTIONS = [
  'CHANGE_ENTITLEMENTS',
  'AUTHORIZE_USER',
  'INVITE_USER',
  'SUSPEND_USER',
  'CROSS_TENANT_SWITCH',
  'MUTATE_SECURITY_POLICY',
  'SYSTEM_ADMIN_ACCESS',
  'DELETE_ROLE',
  'UPDATE_ROLE_PERMISSIONS',
] as const;

export type PrivilegedAction = (typeof PRIVILEGED_ACTIONS)[number];

export function isPrivilegedRole(roleCode?: string, isSystemAdmin?: boolean): boolean {
  if (isSystemAdmin === true) return true;
  if (!roleCode) return false;
  const normalized = roleCode.toLowerCase().trim();
  return PRIVILEGED_ROLE_CODES.some((c) => c.toLowerCase() === normalized);
}

export function requiresMfaForAction(
  action: string,
  roleCode?: string,
  isSystemAdmin?: boolean,
): boolean {
  if (isPrivilegedRole(roleCode, isSystemAdmin)) return true;
  return (PRIVILEGED_ACTIONS as readonly string[]).includes(action);
}

export interface MfaVerificationParams {
  readonly secret?: string;
  readonly code: string;
  readonly recoveryCodes?: readonly string[];
  readonly sessionMfaVerified?: boolean;
  readonly isPrivileged?: boolean;
}

export interface MfaVerificationResult {
  readonly valid: boolean;
  readonly isRecoveryCodeUsed?: boolean;
  readonly remainingRecoveryCodes?: string[];
  readonly error?:
    | 'mfa_required'
    | 'mfa_unverified'
    | 'invalid_mfa_code'
    | 'missing_mfa_secret'
    | 'empty_code'
    | 'totp_not_implemented';
}

/**
 * Validates an MFA challenge submission against single-use recovery codes.
 * Ensures that privileged actions without verified MFA elevation are rejected with explicit error codes.
 *
 * SERP-381: The 6-digit TOTP path is intentionally failed closed with 'totp_not_implemented'.
 * Real cryptographic TOTP verification requires the Starq Account schema/secrets layer (SERP-366).
 * Recovery codes are validated directly against caller-supplied recoveryCodes.
 */
export function validateMfaChallenge(params: MfaVerificationParams): MfaVerificationResult {
  const { code, recoveryCodes = [], sessionMfaVerified, isPrivileged } = params;
  const cleaned = (code || '').trim().replace(/[\s-]/g, '').toUpperCase();

  if (!cleaned) {
    if (isPrivileged && !sessionMfaVerified) {
      return { valid: false, error: 'mfa_required' };
    }
    return { valid: false, error: 'empty_code' };
  }

  // 1. Check recovery code match (format 8 alphanumeric chars, case-insensitive)
  const matchingRecoveryIndex = recoveryCodes.findIndex((rc) => {
    const cleanRc = rc.replace(/[\s-]/g, '').toUpperCase();
    return cleanRc === cleaned;
  });

  if (matchingRecoveryIndex !== -1) {
    const updated = [...recoveryCodes];
    updated.splice(matchingRecoveryIndex, 1);
    return {
      valid: true,
      isRecoveryCodeUsed: true,
      remainingRecoveryCodes: updated,
    };
  }

  // 2. Check TOTP format (6 digits) - fail closed (SERP-381)
  if (/^\d{6}$/.test(cleaned)) {
    return { valid: false, error: 'totp_not_implemented' };
  }

  return { valid: false, error: 'invalid_mfa_code' };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-276: Standardised Tenant Onboarding & Governance Invariants
// (DEC-073 §10 / Vision §19 / Productisation)
// ─────────────────────────────────────────────────────────────────────────────

export interface TenantOnboardingPayload {
  readonly name: string;
  readonly legalName?: string;
  readonly industry: string;
  readonly currency: 'MVR' | 'USD';
  readonly tinNumber?: string;
  readonly gstRate?: number;
  readonly island?: string;
  readonly atoll?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly bmlAccount?: string;
  readonly mibAccount?: string;
  readonly invoicePrefix?: string;
  readonly jobPrefix?: string;
}

export const PRODUCT_FIXED_INVARIANTS = [
  'SINGLE_SOURCE_FINANCIAL_TRUTH',
  'SEGREGATION_OF_DUTIES_AWARD_PAY',
  'ROW_LEVEL_SECURITY_TENANT_ISOLATION',
  'APPEND_ONLY_AUDIT_LOG_INTEGRITY',
  'NO_SECOND_POSTING_AUTHORITY',
] as const;

export type ProductFixedInvariant = (typeof PRODUCT_FIXED_INVARIANTS)[number];

export function validateTenantOnboardingPayload(
  payload: TenantOnboardingPayload | Readonly<Record<string, unknown>>,
): { valid: boolean; error?: string; config?: Record<string, unknown> } {
  const p = payload as Record<string, unknown>;
  const name = String(p.name || '').trim();
  if (!name) {
    return { valid: false, error: 'tenant_name_required' };
  }

  const currency = p.currency === 'USD' ? 'USD' : 'MVR';
  const rawTin = String(p.tinNumber || '').trim();
  const tinNumber = rawTin;
  const gstStatus = tinNumber ? 'registered' : 'not_registered';

  // Invariant: Never invent values for blank fields (DEC-073 §10 / SERP-276)
  const bmlAccount = String(p.bmlAccount || '').trim();
  const mibAccount = String(p.mibAccount || '').trim();

  // Validate custom prefixes if provided
  const invoicePrefix = p.invoicePrefix ? String(p.invoicePrefix).trim().toUpperCase() : undefined;
  const jobPrefix = p.jobPrefix ? String(p.jobPrefix).trim().toUpperCase() : undefined;

  return {
    valid: true,
    config: {
      name,
      legalName: String(p.legalName || '').trim() || `${name} Pvt Ltd`,
      industry: String(p.industry || 'Automotive & Body Repair'),
      currency,
      currencySymbol: currency === 'MVR' ? 'Rf' : '$',
      tinNumber,
      gstStatus,
      gstRate: typeof p.gstRate === 'number' ? p.gstRate : 8,
      bmlAccount: bmlAccount || undefined,
      mibAccount: mibAccount || undefined,
      invoicePrefix,
      jobPrefix,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-280: Privacy-Preserving Product Analytics Specification
// (DEC-073 / DEC-083 / Vision §19 / Productisation)
// ─────────────────────────────────────────────────────────────────────────────

export const PERMITTED_ANALYTICS_EVENTS = [
  'screen_viewed',
  'modal_opened',
  'tab_switched',
  'theme_toggled',
  'workflow_step_advanced',
  'document_created_count',
  'search_executed',
  'error_occurred',
  'mfa_challenge_prompted',
  'mfa_challenge_completed',
] as const;

export type PermittedAnalyticsEvent = (typeof PERMITTED_ANALYTICS_EVENTS)[number];

export const DISALLOWED_SENSITIVE_KEYS = [
  'customer_name',
  'name',
  'customer',
  'email',
  'phone',
  'plate_number',
  'plateNumber',
  'vehicle_reg',
  'vehicleReg',
  'tin',
  'tinNumber',
  'bml_account',
  'bmlAccount',
  'mibAccount',
  'account_number',
  'amount',
  'subtotal',
  'total',
  'price',
  'unitPrice',
  'prompt',
  'search_query',
  'query',
  'notes',
  'details',
  'description',
  'address',
  'password',
  'secret',
  'token',
  'csrf',
  'recoveryCodes',
  'rawError',
  'stack',
  'payload',
] as const;

export interface AnalyticsEventPayload {
  readonly event: PermittedAnalyticsEvent;
  readonly anonymizedTenantId: string;
  readonly properties?: Readonly<Record<string, string | number | boolean>>;
  readonly timestamp?: string;
}

export function anonymizeTenantForAnalytics(tenantId: string, salt = 'starq_erp_telemetry_salt_v1'): string {
  if (!tenantId) return 'anonymous';
  // Deterministic source-side anonymization (prefix with anon_ and truncated hash representation)
  let hash = 0;
  const input = `${tenantId}:${salt}`;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `anon_tenant_${hex}`;
}

export function validateAnalyticsEvent(
  rawEvent: unknown,
): { valid: boolean; error?: string; event?: AnalyticsEventPayload } {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return { valid: false, error: 'invalid_event_structure' };
  }

  const e = rawEvent as Record<string, unknown>;
  const eventName = String(e.event || '') as PermittedAnalyticsEvent;

  // 1. Assert event is in explicit allowlist (fail closed)
  if (!PERMITTED_ANALYTICS_EVENTS.includes(eventName)) {
    return { valid: false, error: 'unpermitted_analytics_event' };
  }

  const anonymizedTenantId = String(e.anonymizedTenantId || '');
  if (!anonymizedTenantId || !anonymizedTenantId.startsWith('anon_')) {
    return { valid: false, error: 'raw_tenant_id_unmasked' };
  }

  const properties = (e.properties || {}) as Record<string, unknown>;

  // 2. Reject any payload carrying disallowed sensitive keys or excessive free text
  for (const key of Object.keys(properties)) {
    const lowerKey = key.toLowerCase();
    if (DISALLOWED_SENSITIVE_KEYS.some((bad) => lowerKey === bad.toLowerCase() || lowerKey.includes(bad.toLowerCase()))) {
      return { valid: false, error: `disallowed_sensitive_field_detected: ${key}` };
    }

    const val = properties[key];
    if (typeof val === 'string') {
      if (val.length > 64) {
        return { valid: false, error: `excessive_string_length_in_property: ${key}` };
      }
      // Inspect string contents for email or phone-like signatures
      if (/@/.test(val) || /\+960\s?\d{3}/.test(val) || /MVR|\$|Rf\s?\d+/.test(val)) {
        return { valid: false, error: `sensitive_pattern_detected_in_property_value: ${key}` };
      }
    }
  }

  return {
    valid: true,
    event: {
      event: eventName,
      anonymizedTenantId,
      properties: properties as Record<string, string | number | boolean>,
      timestamp: String(e.timestamp || new Date().toISOString()),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-025: Release Candidate & Evidence Manifest Contract
// (CORE-001 / CORE-002 / DEC-072 / Phase 2 Main Base)
// ─────────────────────────────────────────────────────────────────────────────

export interface ArtifactChecksum {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface TestEvidenceRecord {
  readonly suite: string;
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly passedAt: string;
}

export interface SecurityGatesSummary {
  readonly tenantHardcodingViolations: number;
  readonly privilegedPathsInventoried: boolean;
  readonly privacyTelemetryCompliant: boolean;
  readonly migration0011Gated: boolean;
  readonly migration0021Rehearsed: boolean;
}

export interface ReleaseCandidateManifest {
  readonly manifestVersion: string;
  readonly releaseCandidateId: string;
  readonly gitCommitHead: string;
  readonly environment: 'production' | 'staging' | 'disposable_rehearsal';
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly artifacts: readonly ArtifactChecksum[];
  readonly testEvidence: readonly TestEvidenceRecord[];
  readonly securityGates: SecurityGatesSummary;
  readonly manifestSignature: string;
}

/**
 * Computes an authoritative deterministic manifest digest binding commit, artifacts, and test evidence.
 */
export function computeManifestSignature(data: {
  releaseCandidateId: string;
  gitCommitHead: string;
  artifacts: readonly ArtifactChecksum[];
  testEvidence: readonly TestEvidenceRecord[];
  securityGates: SecurityGatesSummary;
}): string {
  const artifactStr = data.artifacts.map((a) => `${a.path}:${a.sha256}`).sort().join('|');
  const testStr = data.testEvidence.map((t) => `${t.suite}:${t.passed}/${t.total}`).sort().join('|');
  const gateStr = `${data.securityGates.tenantHardcodingViolations}:${data.securityGates.migration0011Gated}:${data.securityGates.migration0021Rehearsed}`;
  const raw = `${data.releaseCandidateId}@${data.gitCommitHead}#${artifactStr}#${testStr}#${gateStr}`;

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sig_rc_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Validates a Release Candidate Manifest against strict tamper-evident invariants:
 * 1. Single immutable candidate binds every artifact with non-empty SHA-256 digests.
 * 2. Zero test failures across all registered test suites.
 * 3. Zero tenant hardcoding violations.
 * 4. Critical security gates verified (Migration 0011 gated, Migration 0021 rehearsed).
 * 5. Signature matches content computation.
 */
export function validateReleaseCandidateManifest(
  rawManifest: unknown,
): { valid: boolean; error?: string; manifest?: ReleaseCandidateManifest } {
  if (!rawManifest || typeof rawManifest !== 'object') {
    return { valid: false, error: 'invalid_manifest_object' };
  }

  const m = rawManifest as Record<string, unknown>;

  if (m.manifestVersion !== '1.0') {
    return { valid: false, error: 'unsupported_manifest_version' };
  }

  const gitCommitHead = String(m.gitCommitHead || '').trim();
  if (!/^[a-f0-9]{7,40}$/i.test(gitCommitHead)) {
    return { valid: false, error: 'invalid_git_commit_head' };
  }

  const artifacts = (m.artifacts || []) as ArtifactChecksum[];
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return { valid: false, error: 'empty_artifact_manifest' };
  }

  for (const art of artifacts) {
    if (!art.path || !/^[a-f0-9]{64}$/i.test(art.sha256 || '') || typeof art.byteLength !== 'number') {
      return { valid: false, error: `invalid_artifact_entry: ${art.path || 'unknown'}` };
    }
  }

  const testEvidence = (m.testEvidence || []) as TestEvidenceRecord[];
  if (!Array.isArray(testEvidence) || testEvidence.length === 0) {
    return { valid: false, error: 'empty_test_evidence' };
  }

  for (const t of testEvidence) {
    if (t.failed > 0 || t.passed !== t.total || t.total === 0) {
      return { valid: false, error: `failed_test_suite_detected: ${t.suite}` };
    }
  }

  const securityGates = (m.securityGates || {}) as SecurityGatesSummary;
  if (securityGates.tenantHardcodingViolations !== 0) {
    return { valid: false, error: 'tenant_hardcoding_violations_detected' };
  }

  if (
    !securityGates.privilegedPathsInventoried ||
    !securityGates.privacyTelemetryCompliant ||
    !securityGates.migration0011Gated ||
    !securityGates.migration0021Rehearsed
  ) {
    return { valid: false, error: 'security_gate_unverified' };
  }

  const releaseCandidateId = String(m.releaseCandidateId || '');
  const expectedSig = computeManifestSignature({
    releaseCandidateId,
    gitCommitHead,
    artifacts,
    testEvidence,
    securityGates,
  });

  if (m.manifestSignature !== expectedSig) {
    return { valid: false, error: 'manifest_signature_mismatch' };
  }

  return {
    valid: true,
    manifest: {
      manifestVersion: '1.0',
      releaseCandidateId,
      gitCommitHead,
      environment: (m.environment || 'disposable_rehearsal') as ReleaseCandidateManifest['environment'],
      generatedAt: String(m.generatedAt || new Date().toISOString()),
      generatedBy: String(m.generatedBy || 'system'),
      artifacts,
      testEvidence,
      securityGates,
      manifestSignature: expectedSig,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-002: Dual-Tenant Organisation, Outlet & Module Spine Contract
// (R1 — Organisation spine / CORE-001 / CORE-002 / AUD-001 / SEC-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface OutletRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly code: string;
  readonly tradingBrand: string;
  readonly island: string;
  readonly isPrimary?: boolean;
}

export interface ModuleEntitlementRecord {
  readonly tenantId: string;
  readonly modules: readonly string[];
  readonly maxOutlets: number;
  readonly maxUsers: number;
}

export const CANONICAL_LEGAL_TENANTS = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    slug: 'starq-tech',
    legalName: 'Starq Technologies LLP',
    industry: 'Software & Engineering Services',
    isPrimaryLedgerTenant: true,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    slug: 'club-ignition',
    legalName: 'Club Ignition Garage Private Limited',
    industry: 'Automotive & Body Repair',
    isPrimaryLedgerTenant: true,
  },
] as const;

/**
 * Validates that an outlet strictly binds to its parent legal tenant.
 * Trading brands (Starq Dynamics, Ignition Ink) must never act as detached ledger tenants.
 */
export function validateOutletTenantBinding(
  tenantId: string,
  outlet: OutletRecord,
): { valid: boolean; error?: string } {
  if (!tenantId) {
    return { valid: false, error: 'tenant_id_required' };
  }
  if (!outlet || !outlet.tenantId) {
    return { valid: false, error: 'invalid_outlet_record' };
  }
  if (outlet.tenantId !== tenantId) {
    return { valid: false, error: 'cross_tenant_outlet_binding_forbidden' };
  }
  if (!outlet.code || !outlet.tradingBrand) {
    return { valid: false, error: 'incomplete_outlet_brand_identity' };
  }
  return { valid: true };
}

/**
 * Validates that a requested module action is explicitly permitted by the tenant's module entitlement.
 */
export function validateModuleAccess(
  tenantId: string,
  requestedModule: string,
  entitlement: ModuleEntitlementRecord,
): { allowed: boolean; error?: string } {
  if (!tenantId || !requestedModule) {
    return { allowed: false, error: 'invalid_module_access_parameters' };
  }
  if (entitlement.tenantId !== tenantId) {
    return { allowed: false, error: 'cross_tenant_entitlement_mismatch' };
  }
  if (!entitlement.modules.includes(requestedModule)) {
    return { allowed: false, error: `module_not_entitled: ${requestedModule}` };
  }
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-026: Server Identity & Secure Session Boundary Contract
// (M0 main base / CORE-001 / CORE-002 / Auth & Session Lifecycle)
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionTokenRecord {
  readonly sessionId: string;
  readonly token: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly roleId: string;
  readonly seat: SeatCode;
  readonly issuedAt: number; // epoch ms
  readonly expiresAt: number; // epoch ms
  readonly lastAccessedAt: number; // epoch ms
  readonly isRevoked: boolean;
  readonly revokedReason?: string;
  readonly mfaVerified: boolean;
}

export function createSecureSessionRecord(params: {
  userId: string;
  tenantId: string;
  roleId: string;
  seat: SeatCode;
  ttlSeconds?: number;
  mfaVerified?: boolean;
  nowMs?: number;
}): SessionTokenRecord {
  const now = params.nowMs || Date.now();
  const ttl = (params.ttlSeconds || 3600 * 8) * 1000; // Default 8 hours
  const rawId = `${params.userId}:${params.tenantId}:${now}:${Math.random().toString(36).substring(2)}`;
  
  let hash = 0;
  for (let i = 0; i < rawId.length; i++) {
    const char = rawId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const sessionId = `sess_${Math.abs(hash).toString(16).padStart(8, '0')}`;
  const token = `stq_sec_${sessionId}_${Date.now().toString(36)}`;

  return {
    sessionId,
    token,
    userId: params.userId,
    tenantId: params.tenantId,
    roleId: params.roleId,
    seat: params.seat,
    issuedAt: now,
    expiresAt: now + ttl,
    lastAccessedAt: now,
    isRevoked: false,
    mfaVerified: !!params.mfaVerified,
  };
}

export function validateSecureSession(
  token: string,
  sessionStore: Readonly<Record<string, SessionTokenRecord>>,
  nowMs?: number,
  idleTimeoutMs = 1800 * 1000, // 30 minutes idle timeout
): { valid: boolean; error?: string; session?: SessionTokenRecord } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'missing_session_token' };
  }

  const session = sessionStore[token];
  if (!session) {
    return { valid: false, error: 'invalid_or_unrecognized_session' };
  }

  if (session.isRevoked) {
    return { valid: false, error: `session_revoked: ${session.revokedReason || 'explicit_logout'}` };
  }

  const now = nowMs || Date.now();

  // 1. Absolute expiration check
  if (now > session.expiresAt) {
    return { valid: false, error: 'session_expired_absolute' };
  }

  // 2. Idle timeout check
  if (now - session.lastAccessedAt > idleTimeoutMs) {
    return { valid: false, error: 'session_expired_idle_timeout' };
  }

  return {
    valid: true,
    session: {
      ...session,
      lastAccessedAt: now,
    },
  };
}

export function revokeSession(
  token: string,
  sessionStore: Record<string, SessionTokenRecord>,
  reason = 'user_logout',
): { success: boolean; error?: string } {
  const session = sessionStore[token];
  if (!session) {
    return { success: false, error: 'session_not_found' };
  }

  sessionStore[token] = {
    ...session,
    isRevoked: true,
    revokedReason: reason,
  };

  return { success: true };
}

export function validateReplayProtection(
  sessionId: string,
  nonce: string,
  seenNonces: Set<string>,
): { allowed: boolean; error?: string } {
  if (!nonce || nonce.trim().length < 8) {
    return { allowed: false, error: 'invalid_nonce_parameter' };
  }

  const key = `${sessionId}:${nonce}`;
  if (seenNonces.has(key)) {
    return { allowed: false, error: 'replay_attack_detected' };
  }

  seenNonces.add(key);
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-005: Stage 2 Inventory — Stock, Movement & Valuation Contract
// (Stage 2 Module / CORE-001 / CORE-002 / INV-001 / INV-002)
// ─────────────────────────────────────────────────────────────────────────────

export interface StockMovementCommandPayload {
  readonly tenantId: string;
  readonly itemId: string;
  readonly type: 'Received' | 'Deducted (Job)' | 'Adjustment' | 'Waste' | 'Transfer';
  readonly quantity: number;
  readonly unitCost: number;
  readonly reference: string;
  readonly actorId: string;
  readonly staffName: string;
  readonly sourceLocation?: string;
  readonly destinationLocation?: string;
  readonly currentStockOnHand: number;
}

export interface InventoryValuationItem {
  readonly id: string;
  readonly tenantId: string;
  readonly sku: string;
  readonly quantityOnHand: number;
  readonly reorderLevel: number;
  readonly unitCost: number;
  readonly sellingPrice: number;
}

export interface InventoryValuationSummary {
  readonly tenantId: string;
  readonly totalItems: number;
  readonly totalUnitsOnHand: number;
  readonly totalValuationCost: number;
  readonly totalPotentialRetailValue: number;
  readonly lowStockItemsCount: number;
  readonly outOfStockItemsCount: number;
  readonly asOfDate: string;
}

/**
 * Validates inventory stock movement with full tenant, actor, source, and destination evidence.
 * Prevents negative stock on deductions and direct ledger valuation bypass.
 */
export function validateStockMovementCommand(
  payload: unknown,
): { valid: boolean; error?: string; resultingStockOnHand?: number; totalValueImpact?: number } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'invalid_payload_object' };
  }

  const p = payload as Record<string, unknown>;

  const tenantId = String(p.tenantId || '').trim();
  if (!tenantId) {
    return { valid: false, error: 'tenant_id_required' };
  }

  const itemId = String(p.itemId || '').trim();
  if (!itemId) {
    return { valid: false, error: 'item_id_required' };
  }

  const actorId = String(p.actorId || '').trim();
  if (!actorId) {
    return { valid: false, error: 'actor_id_required' };
  }

  const reference = String(p.reference || '').trim();
  if (!reference) {
    return { valid: false, error: 'movement_reference_required' };
  }

  const quantity = Number(p.quantity || 0);
  if (quantity <= 0 || !Number.isFinite(quantity)) {
    return { valid: false, error: 'positive_quantity_required' };
  }

  const unitCost = Number(p.unitCost || 0);
  if (unitCost < 0 || !Number.isFinite(unitCost)) {
    return { valid: false, error: 'non_negative_unit_cost_required' };
  }

  const currentStock = Number(p.currentStockOnHand || 0);
  const movementType = String(p.type || '');

  let resultingStockOnHand = currentStock;
  let totalValueImpact = 0;

  if (movementType === 'Received') {
    resultingStockOnHand = currentStock + quantity;
    totalValueImpact = quantity * unitCost;
  } else if (movementType === 'Deducted (Job)' || movementType === 'Waste') {
    if (quantity > currentStock) {
      return { valid: false, error: 'insufficient_stock_on_hand' };
    }
    resultingStockOnHand = currentStock - quantity;
    totalValueImpact = -(quantity * unitCost);
  } else if (movementType === 'Adjustment' || movementType === 'Transfer') {
    resultingStockOnHand = quantity; // Absolute adjustment
    totalValueImpact = (quantity - currentStock) * unitCost;
  } else {
    return { valid: false, error: `unknown_movement_type: ${movementType}` };
  }

  return {
    valid: true,
    resultingStockOnHand,
    totalValueImpact,
  };
}

/**
 * Computes authoritative inventory asset valuation without direct ledger bypass.
 */
export function calculateInventoryValuationSummary(
  tenantId: string,
  items: readonly InventoryValuationItem[],
  asOfDate = new Date().toISOString(),
): InventoryValuationSummary {
  const tenantItems = items.filter((i) => i.tenantId === tenantId);

  let totalUnits = 0;
  let totalCost = 0;
  let totalRetail = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const item of tenantItems) {
    const qty = Math.max(0, item.quantityOnHand || 0);
    totalUnits += qty;
    totalCost += qty * (item.unitCost || 0);
    totalRetail += qty * (item.sellingPrice || 0);

    if (qty === 0) {
      outOfStockCount++;
    } else if (qty <= (item.reorderLevel || 0)) {
      lowStockCount++;
    }
  }

  return {
    tenantId,
    totalItems: tenantItems.length,
    totalUnitsOnHand: totalUnits,
    totalValuationCost: Math.round(totalCost * 100) / 100,
    totalPotentialRetailValue: Math.round(totalRetail * 100) / 100,
    lowStockItemsCount: lowStockCount,
    outOfStockItemsCount: outOfStockCount,
    asOfDate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-006: Stage 3 Counter Capability Inside ERP
// (Stage 3 Module / POS Integration / CORE-001 / CORE-002)
// ─────────────────────────────────────────────────────────────────────────────

export interface CounterSaleItemPayload {
  readonly itemId: string;
  readonly name: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly total: number;
}

export interface CounterSaleCommandPayload {
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly customerId?: string;
  readonly customerName: string;
  readonly items: readonly CounterSaleItemPayload[];
  readonly subtotal: number;
  readonly gstRate: number;
  readonly gstAmount: number;
  readonly totalAmount: number;
  readonly paymentMethod: 'Cash' | 'BML Transfer' | 'Card' | 'Cheque' | string;
  readonly bankAccount?: string;
  readonly actorId: string;
  readonly actorSeat: SeatCode;
}

export function validateCounterSaleCommand(
  payload: unknown,
  processedKeys: Set<string> = new Set(),
): { valid: boolean; error?: string; isIdempotentReplay?: boolean; invoiceSummary?: Record<string, unknown> } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'invalid_payload_object' };
  }

  const p = payload as Record<string, unknown>;

  const idempotencyKey = String(p.idempotencyKey || '').trim();
  if (!idempotencyKey) {
    return { valid: false, error: 'idempotency_key_required' };
  }

  // Idempotency check: Replay returns previous result without double deduction/charge
  if (processedKeys.has(idempotencyKey)) {
    return {
      valid: true,
      isIdempotentReplay: true,
      invoiceSummary: {
        idempotencyKey,
        status: 'already_processed',
      },
    };
  }

  const tenantId = String(p.tenantId || '').trim();
  if (!tenantId) {
    return { valid: false, error: 'tenant_id_required' };
  }

  const actorSeat = String(p.actorSeat || '') as SeatCode;
  if (!COMMAND_SEATS.COUNTER_SALE.includes(actorSeat)) {
    return { valid: false, error: `unauthorized_seat_for_counter_sale: ${actorSeat}` };
  }

  const items = (p.items || []) as CounterSaleItemPayload[];
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'counter_sale_items_required' };
  }

  let calculatedSubtotal = 0;
  for (const it of items) {
    if (!it.itemId || !it.sku) {
      return { valid: false, error: 'invalid_counter_sale_item' };
    }
    if (it.quantity <= 0) {
      return { valid: false, error: 'item_quantity_must_be_positive' };
    }
    calculatedSubtotal += it.quantity * it.unitPrice;
  }

  const subtotal = Number(p.subtotal || 0);
  if (Math.abs(subtotal - calculatedSubtotal) > 0.01) {
    return { valid: false, error: 'subtotal_arithmetic_mismatch' };
  }

  const gstRate = typeof p.gstRate === 'number' ? p.gstRate : 0;
  const expectedGst = Math.round((subtotal * gstRate) / 100 * 100) / 100;
  const providedGst = Number(p.gstAmount || 0);

  if (Math.abs(providedGst - expectedGst) > 0.05) {
    return { valid: false, error: 'gst_arithmetic_mismatch' };
  }

  const totalAmount = Number(p.totalAmount || 0);
  if (Math.abs(totalAmount - (subtotal + expectedGst)) > 0.05) {
    return { valid: false, error: 'total_arithmetic_mismatch' };
  }

  processedKeys.add(idempotencyKey);

  return {
    valid: true,
    isIdempotentReplay: false,
    invoiceSummary: {
      idempotencyKey,
      tenantId,
      customerName: String(p.customerName || 'Walk-in Counter Customer'),
      totalItemsCount: items.length,
      subtotal,
      gstAmount: expectedGst,
      totalAmount,
      paymentMethod: p.paymentMethod || 'Cash',
      status: 'Paid',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-007: Stage 4 Commercial & Purchasing Module / Tax Working Papers
// (Stage 4 Module / DEC-073 §10 / SERP-164 / CORE-001 / CORE-002)
// ─────────────────────────────────────────────────────────────────────────────

export interface CommercialDocumentProvenanceRecord {
  readonly tenantId: string;
  readonly documentType: 'Quote' | 'Invoice' | 'PurchaseOrder' | 'Expense' | 'CreditNote' | string;
  readonly documentNumber: string;
  readonly createdBy: string;
  readonly approvedBy?: string;
  readonly approvalStatus: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';
  readonly createdAt: string;
  readonly auditLogId?: string;
}

export function validateCommercialDocumentProvenance(
  payload: unknown,
): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'invalid_provenance_payload' };
  }

  const p = payload as Record<string, unknown>;
  const tenantId = String(p.tenantId || '').trim();
  if (!tenantId) return { valid: false, error: 'tenant_id_required' };

  const documentNumber = String(p.documentNumber || '').trim();
  if (!documentNumber) return { valid: false, error: 'document_number_required' };

  const createdBy = String(p.createdBy || '').trim();
  if (!createdBy) return { valid: false, error: 'created_by_required' };

  const validStatuses = ['Draft', 'Pending Approval', 'Approved', 'Rejected'];
  const status = String(p.approvalStatus || 'Draft');
  if (!validStatuses.includes(status)) {
    return { valid: false, error: `invalid_approval_status: ${status}` };
  }

  return { valid: true };
}

export interface TaxWorkingPaperSourceDocument {
  readonly documentId: string;
  readonly documentNumber: string;
  readonly documentType: 'Invoice' | 'CounterSale' | 'PurchaseOrder' | 'Expense';
  readonly date: string;
  readonly taxableAmount: number;
  readonly gstRate: number;
  readonly gstAmount: number;
}

export interface TaxWorkingPaperSummary {
  readonly tenantId: string;
  readonly taxPeriod: string;
  readonly gstRegistrationStatus: 'registered' | 'not_registered' | 'pending';
  readonly tinNumber?: string;
  readonly applicableGstRate: number;
  readonly totalTaxableSales: number;
  readonly totalOutputGst: number;
  readonly totalTaxablePurchases: number;
  readonly totalInputGst: number;
  readonly netGstPayable: number;
  readonly salesDocumentCount: number;
  readonly purchaseDocumentCount: number;
  readonly isReviewable: boolean;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly status: 'Draft' | 'Reviewed' | 'Filed';
}

/**
 * Computes configured statutory tax working paper summary for pre-filing review.
 * Respects statutory non-GST registered status (0% rate, zero output/input tax claims).
 */
export function generateTaxWorkingPaperSummary(params: {
  tenantId: string;
  taxPeriod: string;
  isGstRegistered: boolean;
  tinNumber?: string;
  standardGstRate?: number;
  salesDocuments: readonly TaxWorkingPaperSourceDocument[];
  purchaseDocuments: readonly TaxWorkingPaperSourceDocument[];
}): TaxWorkingPaperSummary {
  const {
    tenantId,
    taxPeriod,
    isGstRegistered,
    tinNumber,
    standardGstRate = 8,
    salesDocuments,
    purchaseDocuments,
  } = params;

  let totalTaxableSales = 0;
  let totalOutputGst = 0;

  for (const doc of salesDocuments) {
    totalTaxableSales += Math.max(0, doc.taxableAmount || 0);
    if (isGstRegistered) {
      totalOutputGst += Math.max(0, doc.gstAmount || 0);
    }
  }

  let totalTaxablePurchases = 0;
  let totalInputGst = 0;

  for (const doc of purchaseDocuments) {
    totalTaxablePurchases += Math.max(0, doc.taxableAmount || 0);
    if (isGstRegistered) {
      totalInputGst += Math.max(0, doc.gstAmount || 0);
    }
  }

  const effectiveRate = isGstRegistered ? standardGstRate / 100 : 0;
  const netGstPayable = isGstRegistered ? Math.round((totalOutputGst - totalInputGst) * 100) / 100 : 0;

  return {
    tenantId,
    taxPeriod,
    gstRegistrationStatus: isGstRegistered ? 'registered' : 'not_registered',
    tinNumber: tinNumber || undefined,
    applicableGstRate: effectiveRate,
    totalTaxableSales: Math.round(totalTaxableSales * 100) / 100,
    totalOutputGst: Math.round(totalOutputGst * 100) / 100,
    totalTaxablePurchases: Math.round(totalTaxablePurchases * 100) / 100,
    totalInputGst: Math.round(totalInputGst * 100) / 100,
    netGstPayable,
    salesDocumentCount: salesDocuments.length,
    purchaseDocumentCount: purchaseDocuments.length,
    isReviewable: true,
    status: 'Draft',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-008: Stage 5 CRM & Customer Lifecycle Module
// (Stage 5 Module / CRM / CORE-001 / CORE-002)
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomerConsentRecord {
  readonly tenantId: string;
  readonly customerId: string;
  readonly consentGiven: boolean;
  readonly consentChannel: 'Phone' | 'Email' | 'In-Person' | 'Web' | string;
  readonly consentTimestamp: string;
  readonly updatedBy: string;
  readonly notes?: string;
}

export function validateCustomerConsentUpdate(
  payload: unknown,
): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'invalid_consent_payload' };
  }

  const p = payload as Record<string, unknown>;
  const tenantId = String(p.tenantId || '').trim();
  if (!tenantId) return { valid: false, error: 'tenant_id_required' };

  const customerId = String(p.customerId || '').trim();
  if (!customerId) return { valid: false, error: 'customer_id_required' };

  const updatedBy = String(p.updatedBy || '').trim();
  if (!updatedBy) return { valid: false, error: 'updated_by_required' };

  const validChannels = ['Phone', 'Email', 'In-Person', 'Web'];
  const channel = String(p.consentChannel || '');
  if (!validChannels.includes(channel)) {
    return { valid: false, error: `invalid_consent_channel: ${channel}` };
  }

  return { valid: true };
}

export type CustomerLifecycleStage = 'Lead' | 'Active' | 'VIP' | 'Inactive' | 'Blocked';

export function validateCustomerLifecycleTransition(params: {
  currentStage: CustomerLifecycleStage;
  targetStage: CustomerLifecycleStage;
  actorSeat: SeatCode;
}): { allowed: boolean; error?: string } {
  const { currentStage, targetStage, actorSeat } = params;

  if (currentStage === targetStage) {
    return { allowed: true };
  }

  // Blocked unblocking requires privileged role
  if (currentStage === 'Blocked') {
    const privilegedSeats: SeatCode[] = ['owner', 'director', 'managing_director', 'financial_controller'];
    if (!privilegedSeats.includes(actorSeat)) {
      return { allowed: false, error: 'unblocking_customer_requires_privileged_seat' };
    }
  }

  const validTransitions: Record<CustomerLifecycleStage, CustomerLifecycleStage[]> = {
    Lead: ['Active', 'Inactive', 'Blocked'],
    Active: ['VIP', 'Inactive', 'Blocked'],
    VIP: ['Active', 'Inactive', 'Blocked'],
    Inactive: ['Active', 'Blocked'],
    Blocked: ['Active', 'Inactive'],
  };

  const allowedTargets = validTransitions[currentStage] || [];
  if (!allowedTargets.includes(targetStage)) {
    return { allowed: false, error: `illegal_lifecycle_transition: ${currentStage} -> ${targetStage}` };
  }

  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-031: Versioned API, Error & Idempotency Contract
// (M0 main base / CORE-001 / CORE-002 / API-001 / IDEMP-001)
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPORTED_API_VERSIONS = ['0.1.0', 'v1'] as const;
export type SupportedApiVersion = (typeof SUPPORTED_API_VERSIONS)[number];

export interface ApiRequestEnvelope<T = Record<string, unknown>> {
  readonly version: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly command: CommandName;
  readonly step?: ScmStep;
  readonly payload: T;
  readonly clientTimestamp?: string;
}

export interface ApiResponseEnvelope<T = unknown> {
  readonly version: string;
  readonly requestId: string;
  readonly idempotencyKey?: string;
  readonly ok: boolean;
  readonly disposition: 'applied' | 'replayed' | 'rejected';
  readonly data?: T;
  readonly error?: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: unknown;
  };
  readonly serverTimestamp: string;
}

export interface DurableIdempotencyEntry {
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly command: CommandName;
  readonly response: ApiResponseEnvelope;
  readonly createdAt: number; // epoch ms
}

export function computeRequestHash(command: CommandName, step: ScmStep | undefined, payload: unknown): string {
  const canonicalStr = JSON.stringify({ command, step: step || null, payload: payload || {} });
  let hash = 0;
  for (let i = 0; i < canonicalStr.length; i++) {
    const char = canonicalStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export function executeVersionedApiCommand<TReq = Record<string, unknown>, TRes = unknown>(params: {
  request: ApiRequestEnvelope<TReq>;
  principal: Principal;
  idempotencyStore: Map<string, DurableIdempotencyEntry>;
  handler: (payload: TReq, principal: Principal) => { ok: boolean; data?: TRes; error?: { code: ErrorCode; message: string } };
  nowMs?: number;
}): ApiResponseEnvelope<TRes> {
  const { request, principal, idempotencyStore, handler, nowMs } = params;
  const now = new Date(nowMs || Date.now()).toISOString();

  // 1. API Version check
  if (!SUPPORTED_API_VERSIONS.includes(request.version as SupportedApiVersion)) {
    return {
      version: request.version,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      ok: false,
      disposition: 'rejected',
      error: {
        code: 'contract_version_unsupported',
        message: `API version '${request.version}' is unsupported. Supported: ${SUPPORTED_API_VERSIONS.join(', ')}`,
      },
      serverTimestamp: now,
    };
  }

  // 2. Idempotency Key presence check
  const idempKey = String(request.idempotencyKey || '').trim();
  if (!idempKey) {
    return {
      version: request.version,
      requestId: request.requestId,
      ok: false,
      disposition: 'rejected',
      error: {
        code: 'idempotency_key_required',
        message: 'A durable idempotency key is required for stateful API commands',
      },
      serverTimestamp: now,
    };
  }

  // 3. Idempotency Replay & Conflict check
  const requestHash = computeRequestHash(request.command, request.step, request.payload);
  const existing = idempotencyStore.get(idempKey);
  if (existing) {
    if (existing.requestHash === requestHash) {
      // Exact same key + same hash -> Replay cached response without re-executing
      return {
        ...existing.response,
        disposition: 'replayed',
        serverTimestamp: now,
      } as ApiResponseEnvelope<TRes>;
    } else {
      // Same key + differing payload/hash -> Conflict error
      return {
        version: request.version,
        requestId: request.requestId,
        idempotencyKey: idempKey,
        ok: false,
        disposition: 'rejected',
        error: {
          code: 'idempotency_key_conflict',
          message: `Idempotency key '${idempKey}' was already used with different request parameters`,
        },
        serverTimestamp: now,
      };
    }
  }

  // 4. Server-Side Seat & Tenancy Authorization check
  const authDecision = authorizeCommand(principal, {
    contract: CONTRACT_VERSION,
    command: request.command,
    step: request.step,
    payload: (request.payload || {}) as Record<string, unknown>,
    csrf: 'server_verified',
  });

  if (!authDecision.ok) {
    const authError = (authDecision as { readonly ok: false; readonly error: ErrorCode }).error;
    const errorResponse: ApiResponseEnvelope<TRes> = {
      version: request.version,
      requestId: request.requestId,
      idempotencyKey: idempKey,
      ok: false,
      disposition: 'rejected',
      error: {
        code: authError,
        message: `Command execution denied by server authority: ${authError}`,
      },
      serverTimestamp: now,
    };
    return errorResponse;
  }

  // 5. Execute Command Handler
  const handlerResult = handler(request.payload, principal);
  if (!handlerResult.ok) {
    const failureResponse: ApiResponseEnvelope<TRes> = {
      version: request.version,
      requestId: request.requestId,
      idempotencyKey: idempKey,
      ok: false,
      disposition: 'rejected',
      error: handlerResult.error || {
        code: 'validation_failed',
        message: 'Command execution failed during business validation',
      },
      serverTimestamp: now,
    };
    return failureResponse;
  }

  // 6. Record successful execution in durable idempotency store
  const successResponse: ApiResponseEnvelope<TRes> = {
    version: request.version,
    requestId: request.requestId,
    idempotencyKey: idempKey,
    ok: true,
    disposition: 'applied',
    data: handlerResult.data,
    serverTimestamp: now,
  };

  idempotencyStore.set(idempKey, {
    idempotencyKey: idempKey,
    requestHash,
    command: request.command,
    response: successResponse,
    createdAt: nowMs || Date.now(),
  });

  return successResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-029: Tenant-Scoped PostgreSQL Foundation Contract
// (M0 main base / CORE-001 / CORE-002 / DB-001 / TENANT-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface PostgresQueryContext {
  readonly actingOrganisationId: string;
  readonly actingSeat: SeatCode;
  readonly targetOrganisationId?: string;
  readonly isSystemSuperuser?: boolean;
}

export function validatePostgresTenantScoping(context: PostgresQueryContext): {
  allowed: boolean;
  error?: 'tenant_not_resolved' | 'cross_tenant_denied' | 'unauthorized_superuser_bypass';
} {
  const { actingOrganisationId, targetOrganisationId, isSystemSuperuser } = context;

  if (!actingOrganisationId || typeof actingOrganisationId !== 'string') {
    return { allowed: false, error: 'tenant_not_resolved' };
  }

  if (isSystemSuperuser) {
    // Superuser bypass is strictly rejected in application multi-tenant queries (DEC-058 / SERP-172)
    return { allowed: false, error: 'unauthorized_superuser_bypass' };
  }

  if (targetOrganisationId && targetOrganisationId !== actingOrganisationId) {
    return { allowed: false, error: 'cross_tenant_denied' };
  }

  return { allowed: true };
}

export function validateOrganisationConstraintIntegrity(params: {
  slug: string;
  legalName: string;
  baseCurrency: string;
  status: string;
}): { valid: boolean; error?: string } {
  const { slug, legalName, baseCurrency, status } = params;

  if (!slug || !slug.match(/^[a-z0-9][a-z0-9-]{1,62}$/)) {
    return { valid: false, error: 'invalid_organisation_slug_format' };
  }

  if (!legalName || legalName.trim().length === 0) {
    return { valid: false, error: 'legal_name_required' };
  }

  if (!baseCurrency || baseCurrency.length !== 3) {
    return { valid: false, error: 'invalid_currency_code_iso4217' };
  }

  const validStatuses = ['active', 'suspended', 'closed'];
  if (!validStatuses.includes(status)) {
    return { valid: false, error: `invalid_organisation_status: ${status}` };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-030: Role, Seat and Separation-of-Duties Policy Engine
// (M0 main base / CORE-001 / CORE-002 / RBAC-001 / SOD-001)
// ─────────────────────────────────────────────────────────────────────────────

export type AppRole =
  | 'owner'
  | 'administrator'
  | 'general_manager'
  | 'accountant'
  | 'workshop_manager'
  | 'technician'
  | 'counter'
  | 'viewer';

export interface RoleVisibilityMatrix {
  readonly role: AppRole;
  readonly canViewReports: boolean;
  readonly canViewAccountingLedger: boolean;
  readonly canViewCommercialDocuments: boolean;
  readonly canViewInventoryStock: boolean;
  readonly canViewAuditLogs: boolean;
  readonly canViewSettings: boolean;
}

export function evaluateRoleVisibility(role: AppRole): RoleVisibilityMatrix {
  switch (role) {
    case 'owner':
    case 'administrator':
    case 'general_manager':
      return {
        role,
        canViewReports: true,
        canViewAccountingLedger: true,
        canViewCommercialDocuments: true,
        canViewInventoryStock: true,
        canViewAuditLogs: true,
        canViewSettings: true,
      };
    case 'accountant':
      return {
        role,
        canViewReports: true,
        canViewAccountingLedger: true,
        canViewCommercialDocuments: true,
        canViewInventoryStock: true,
        canViewAuditLogs: false,
        canViewSettings: false,
      };
    case 'workshop_manager':
      return {
        role,
        canViewReports: false,
        canViewAccountingLedger: false,
        canViewCommercialDocuments: true,
        canViewInventoryStock: true,
        canViewAuditLogs: false,
        canViewSettings: false,
      };
    case 'counter':
      return {
        role,
        canViewReports: false,
        canViewAccountingLedger: false,
        canViewCommercialDocuments: true,
        canViewInventoryStock: true,
        canViewAuditLogs: false,
        canViewSettings: false,
      };
    case 'technician':
      return {
        role,
        canViewReports: false,
        canViewAccountingLedger: false,
        canViewCommercialDocuments: false,
        canViewInventoryStock: true,
        canViewAuditLogs: false,
        canViewSettings: false,
      };
    case 'viewer':
    default:
      return {
        role: 'viewer',
        canViewReports: false,
        canViewAccountingLedger: false,
        canViewCommercialDocuments: false,
        canViewInventoryStock: true,
        canViewAuditLogs: false,
        canViewSettings: false,
      };
  }
}

export interface TemporarySodOverride {
  readonly overrideId: string;
  readonly approvedByPersonId: string;
  readonly reason: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
}

export interface SodPolicyEvaluationContext {
  readonly organisationId: string;
  readonly actorPersonId: string;
  readonly actingSeat: SeatCode;
  readonly targetStep: ScmStep;
  readonly history: readonly PurchaseStepRecord[];
  readonly capacity: SegregationCapacity;
  readonly override?: TemporarySodOverride;
  readonly nowIso?: string;
}

export interface SodPolicyEvaluationResult {
  readonly allowed: boolean;
  readonly action: 'allow' | 'record_exception' | 'block';
  readonly error?: string;
  readonly auditRecord?: {
    readonly organisationId: string;
    readonly actorPersonId: string;
    readonly actingSeat: SeatCode;
    readonly targetStep: ScmStep;
    readonly capacity: SegregationCapacity;
    readonly disposition: 'allowed_cleanly' | 'exception_recorded' | 'blocked_sod_violation';
    readonly overrideReason?: string;
    readonly timestamp: string;
  };
}

export function evaluateSodPolicy(context: SodPolicyEvaluationContext): SodPolicyEvaluationResult {
  const { organisationId, actorPersonId, actingSeat, targetStep, history, capacity, override, nowIso } = context;
  const now = nowIso || new Date().toISOString();

  // 1. Check if step creates a SoD violation against history
  const violationPair = sodViolation(history, targetStep, actorPersonId);

  // Case A: No SoD violation (different person or first step)
  if (!violationPair) {
    return {
      allowed: true,
      action: 'allow',
      auditRecord: {
        organisationId,
        actorPersonId,
        actingSeat,
        targetStep,
        capacity,
        disposition: 'allowed_cleanly',
        timestamp: now,
      },
    };
  }

  // Case B: Violation detected in SOLO capacity (solo founder / small team)
  if (capacity === 'solo') {
    return {
      allowed: true,
      action: 'record_exception',
      auditRecord: {
        organisationId,
        actorPersonId,
        actingSeat,
        targetStep,
        capacity,
        disposition: 'exception_recorded',
        overrideReason: 'solo_capacity_compensating_control',
        timestamp: now,
      },
    };
  }

  // Case C: Violation detected in SEGREGATED capacity -> Check temporary approved override
  if (override) {
    // Validate override reason length (min 12 chars per founder standard)
    if (!override.reason || override.reason.trim().length < SOD_REASON_MIN_LENGTH) {
      return {
        allowed: false,
        action: 'block',
        error: 'sod_override_reason_insufficient',
        auditRecord: {
          organisationId,
          actorPersonId,
          actingSeat,
          targetStep,
          capacity,
          disposition: 'blocked_sod_violation',
          timestamp: now,
        },
      };
    }

    // Check expiry
    if (new Date(override.expiresAt).getTime() < new Date(now).getTime()) {
      return {
        allowed: false,
        action: 'block',
        error: 'sod_override_expired',
        auditRecord: {
          organisationId,
          actorPersonId,
          actingSeat,
          targetStep,
          capacity,
          disposition: 'blocked_sod_violation',
          timestamp: now,
        },
      };
    }

    // Valid active override
    return {
      allowed: true,
      action: 'record_exception',
      auditRecord: {
        organisationId,
        actorPersonId,
        actingSeat,
        targetStep,
        capacity,
        disposition: 'exception_recorded',
        overrideReason: override.reason,
        timestamp: now,
      },
    };
  }

  // Case D: Segregated capacity with no valid override -> strictly block
  return {
    allowed: false,
    action: 'block',
    error: `sod_violation: pair [${violationPair[0]}, ${violationPair[1]}] conflict for person ${actorPersonId}`,
    auditRecord: {
      organisationId,
      actorPersonId,
      actingSeat,
      targetStep,
      capacity,
      disposition: 'blocked_sod_violation',
      timestamp: now,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-034: Append-Only Audit, Outbox and Exception Foundation
// (M0 main base / CORE-001 / CORE-002 / AUDIT-001 / OUTBOX-001)
// ─────────────────────────────────────────────────────────────────────────────

export type OutboxEventStatus = 'pending' | 'published' | 'failed' | 'dead_letter';

export interface TransactionalOutboxRecord {
  readonly id: string;
  readonly organisationId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly actorPersonId?: string;
  readonly actingSeat?: SeatCode;
  readonly status: OutboxEventStatus;
  readonly retryCount: number;
  readonly lastError?: string;
  readonly createdAt: string;
  readonly publishedAt?: string;
}

export function validateOutboxEvent(
  record: unknown,
): { valid: boolean; error?: string } {
  if (!record || typeof record !== 'object') {
    return { valid: false, error: 'invalid_outbox_payload' };
  }

  const r = record as Record<string, unknown>;
  const orgId = String(r.organisationId || '').trim();
  if (!orgId) return { valid: false, error: 'organisation_id_required' };

  const eventType = String(r.eventType || '').trim();
  if (!eventType) return { valid: false, error: 'event_type_required' };

  const aggregateType = String(r.aggregateType || '').trim();
  if (!aggregateType) return { valid: false, error: 'aggregate_type_required' };

  const aggregateId = String(r.aggregateId || '').trim();
  if (!aggregateId) return { valid: false, error: 'aggregate_id_required' };

  if (!r.payload || typeof r.payload !== 'object') {
    return { valid: false, error: 'payload_object_required' };
  }

  const validStatuses: OutboxEventStatus[] = ['pending', 'published', 'failed', 'dead_letter'];
  const status = String(r.status || 'pending') as OutboxEventStatus;
  if (!validStatuses.includes(status)) {
    return { valid: false, error: `invalid_outbox_status: ${status}` };
  }

  return { valid: true };
}

export function executeTransactionalMutationWithOutbox<TRes = unknown>(params: {
  organisationId: string;
  businessMutation: () => { ok: boolean; result?: TRes; error?: string };
  outboxEvent: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    actorPersonId?: string;
    actingSeat?: SeatCode;
  };
  outboxStore: TransactionalOutboxRecord[];
  nowIso?: string;
}): { ok: boolean; result?: TRes; outboxId?: string; error?: string } {
  const { organisationId, businessMutation, outboxEvent, outboxStore, nowIso } = params;
  const now = nowIso || new Date().toISOString();

  // Validate outbox event structure first
  const eventValidation = validateOutboxEvent({
    organisationId,
    ...outboxEvent,
    status: 'pending',
  });
  if (!eventValidation.valid) {
    return { ok: false, error: eventValidation.error };
  }

  // Execute business mutation
  const mutationOutcome = businessMutation();
  if (!mutationOutcome.ok) {
    // Failure in business logic -> Fail closed, NO outbox record written (prevents partial state)
    return { ok: false, error: mutationOutcome.error || 'business_mutation_failed' };
  }

  // Atomically append outbox record
  const outboxId = `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const outboxRecord: TransactionalOutboxRecord = {
    id: outboxId,
    organisationId,
    eventType: outboxEvent.eventType,
    aggregateType: outboxEvent.aggregateType,
    aggregateId: outboxEvent.aggregateId,
    payload: outboxEvent.payload,
    actorPersonId: outboxEvent.actorPersonId,
    actingSeat: outboxEvent.actingSeat,
    status: 'pending',
    retryCount: 0,
    createdAt: now,
  };

  outboxStore.push(outboxRecord);

  return {
    ok: true,
    result: mutationOutcome.result,
    outboxId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-036: Observability, Rate-Limit and Alerting Baseline
// (M0 main base / CORE-001 / CORE-002 / OBS-001 / RATE-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitBucket {
  readonly key: string;
  readonly timestamps: number[];
}

export function evaluateRateLimit(params: {
  key: string;
  maxRequests: number;
  windowMs: number;
  store: Map<string, number[]>;
  nowMs?: number;
}): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  const { key, maxRequests, windowMs, store, nowMs } = params;
  const now = nowMs || Date.now();
  const windowStart = now - windowMs;

  const existingTimestamps = store.get(key) || [];
  const validTimestamps = existingTimestamps.filter((ts) => ts > windowStart);

  if (validTimestamps.length >= maxRequests) {
    const oldest = validTimestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  validTimestamps.push(now);
  store.set(key, validTimestamps);

  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
  };
}

export interface StructuredLogEntry {
  readonly requestId: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
  readonly action: string;
  readonly tenantId?: string;
  readonly actorPersonId?: string;
  readonly actingSeat?: SeatCode;
  readonly durationMs?: number;
  readonly sanitizedMetadata?: Record<string, unknown>;
  readonly error?: {
    readonly code: ErrorCode | string;
    readonly message: string;
  };
}

export function sanitizeLogMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEYS = [
    'password',
    'secret',
    'token',
    'apikey',
    'authorization',
    'cookie',
    'credit_card',
    'pan',
    'cvv',
    'bml_account',
    'bank_account',
    'tin',
    'customer_phone',
    'phone',
    'email',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED_SENSITIVE_PAYLOAD]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeLogMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export type AlertSeverity = 'SEV1_CRITICAL' | 'SEV2_HIGH' | 'SEV3_MEDIUM' | 'SEV4_LOW';

export interface AlertSignal {
  readonly alertId: string;
  readonly alertType: 'AUTH_BRUTE_FORCE' | 'CROSS_TENANT_ATTACK' | 'OUTBOX_DEAD_LETTER' | 'SOD_OVERRIDE_SURGE';
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly tenantId?: string;
  readonly triggerCount: number;
  readonly threshold: number;
  readonly triggeredAt: string;
}

export function evaluateSystemAlertSignals(metrics: {
  tenantId?: string;
  failedAuthAttemptsInWindow: number;
  crossTenantAttemptsInWindow: number;
  outboxDeadLetterCount: number;
  sodOverridesInWindow: number;
  nowIso?: string;
}): AlertSignal[] {
  const alerts: AlertSignal[] = [];
  const now = metrics.nowIso || new Date().toISOString();

  // 1. Auth Brute Force Alert (Threshold >= 5)
  if (metrics.failedAuthAttemptsInWindow >= 5) {
    alerts.push({
      alertId: `alert_auth_${Date.now()}`,
      alertType: 'AUTH_BRUTE_FORCE',
      severity: 'SEV2_HIGH',
      message: `Detected ${metrics.failedAuthAttemptsInWindow} failed auth attempts within evaluation window`,
      tenantId: metrics.tenantId,
      triggerCount: metrics.failedAuthAttemptsInWindow,
      threshold: 5,
      triggeredAt: now,
    });
  }

  // 2. Cross-Tenant Attempt Alert (Threshold >= 1)
  if (metrics.crossTenantAttemptsInWindow >= 1) {
    alerts.push({
      alertId: `alert_tenant_${Date.now()}`,
      alertType: 'CROSS_TENANT_ATTACK',
      severity: 'SEV1_CRITICAL',
      message: `Detected ${metrics.crossTenantAttemptsInWindow} cross-tenant denial events`,
      tenantId: metrics.tenantId,
      triggerCount: metrics.crossTenantAttemptsInWindow,
      threshold: 1,
      triggeredAt: now,
    });
  }

  // 3. Outbox Dead Letter Alert (Threshold >= 1)
  if (metrics.outboxDeadLetterCount >= 1) {
    alerts.push({
      alertId: `alert_outbox_${Date.now()}`,
      alertType: 'OUTBOX_DEAD_LETTER',
      severity: 'SEV2_HIGH',
      message: `Detected ${metrics.outboxDeadLetterCount} outbox events in dead_letter state`,
      tenantId: metrics.tenantId,
      triggerCount: metrics.outboxDeadLetterCount,
      threshold: 1,
      triggeredAt: now,
    });
  }

  // 4. SoD Override Surge (Threshold >= 3)
  if (metrics.sodOverridesInWindow >= 3) {
    alerts.push({
      alertId: `alert_sod_${Date.now()}`,
      alertType: 'SOD_OVERRIDE_SURGE',
      severity: 'SEV3_MEDIUM',
      message: `Detected ${metrics.sodOverridesInWindow} SoD overrides recorded in evaluation window`,
      tenantId: metrics.tenantId,
      triggerCount: metrics.sodOverridesInWindow,
      threshold: 3,
      triggeredAt: now,
    });
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-038: Ordered Migration, Rollback and Compatibility Discipline
// (M0 main base / CORE-001 / CORE-002 / MIG-001 / COMPAT-001)
// ─────────────────────────────────────────────────────────────────────────────

export type MigrationStatus = 'APPLIED' | 'REVIEWER_GATED' | 'UNAPPLIED_FORWARD_ONLY';

export interface MigrationLineageRecord {
  readonly version: string;
  readonly filename: string;
  readonly status: MigrationStatus;
  readonly description: string;
  readonly isIrreversible?: boolean;
  readonly requiresReviewerApproval?: boolean;
}

export const CANONICAL_MIGRATION_LINEAGE: readonly MigrationLineageRecord[] = [
  { version: '202608200001', filename: '202608200001_core_foundation.sql', status: 'APPLIED', description: 'Core foundation (organisations, memberships, seats, idempotency, audit)' },
  { version: '202608200002', filename: '202608200002_garage_inventory.sql', status: 'APPLIED', description: 'Garage and inventory operational tables' },
  { version: '202608200003', filename: '202608200003_commercial_accounting.sql', status: 'APPLIED', description: 'Commercial accounting and journal entries' },
  { version: '202608200004', filename: '202608200004_pilot_security.sql', status: 'APPLIED', description: 'Pilot security and RLS isolation policies' },
  { version: '202608200005', filename: '202608200005_garage_api.sql', status: 'APPLIED', description: 'Garage API commands' },
  { version: '202608200006', filename: '202608200006_garage_api_search_path.sql', status: 'APPLIED', description: 'Search path hardening for garage API' },
  { version: '202608200007', filename: '202608200007_garage_api_self_test.sql', status: 'APPLIED', description: 'Garage API self test functions' },
  { version: '202608200008', filename: '202608200008_session_authority.sql', status: 'APPLIED', description: 'Session authority and token functions' },
  { version: '202608210009', filename: '202608210009_seat_vocabulary.sql', status: 'APPLIED', description: 'Seat vocabulary expansion' },
  { version: '202608210010', filename: '202608210010_purchase_seat_matrix.sql', status: 'APPLIED', description: 'Purchase seat matrix seeds' },
  { version: '202608220011', filename: '202608220011_wire_purchase_seat_matrix.sql', status: 'REVIEWER_GATED', requiresReviewerApproval: true, description: 'Wire purchase seat matrix (Gated by 3rd-person reviewer)' },
  { version: '202608250012', filename: '202608250012_settlement_allocations.sql', status: 'APPLIED', description: 'Settlement allocations and payment linkages' },
  { version: '202608250013', filename: '202608250013_workflow_stages.sql', status: 'APPLIED', description: 'Workflow stages and transitions' },
  { version: '202608250014', filename: '202608250014_idempotency_replay.sql', status: 'APPLIED', description: 'Idempotency replay persistence table' },
  { version: '202608250015', filename: '202608250015_roles_as_data.sql', status: 'APPLIED', description: 'Roles as data matrix and seat bindings' },
  { version: '202608250016', filename: '202608250016_sod_exceptions.sql', status: 'APPLIED', description: 'SoD tracked exceptions and capacity derivation' },
  { version: '202608250017', filename: '202608250017_tax_regimes_and_periods.sql', status: 'APPLIED', description: 'Tax regimes and statutory GST periods' },
  { version: '202608250018', filename: '202608250018_bank_accounts_entities.sql', status: 'APPLIED', description: 'Bank accounts and entity mapping' },
  { version: '202608250019', filename: '202608250019_job_customer_vehicle_phone.sql', status: 'APPLIED', description: 'Job customer vehicle phone linkages' },
  { version: '202608250020', filename: '202608250020_revision_missing_endpoints.sql', status: 'APPLIED', description: 'Command handler endpoints for statutory mutations' },
  { version: '202608260021', filename: '202608260021_synthetic_tenant_uuid_transition.sql', status: 'UNAPPLIED_FORWARD_ONLY', description: 'Synthetic tenant UUID transition migration' },
  { version: '202608260022', filename: '202608260022_transactional_outbox_and_audit.sql', status: 'UNAPPLIED_FORWARD_ONLY', description: 'Transactional outbox and immutable audit foundation' },
];

export function validateMigrationLineage(lineage: readonly MigrationLineageRecord[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  let previousVersion = 0n;

  for (const m of lineage) {
    const match = m.filename.match(/^(\d{12})_(.+)\.sql$/);
    if (!match) {
      errors.push(`Invalid filename format: ${m.filename}`);
      continue;
    }

    const versionNum = BigInt(match[1]);
    if (versionNum <= previousVersion) {
      errors.push(`Out of order or duplicate migration version: ${m.filename} (${versionNum} <= ${previousVersion})`);
    }
    previousVersion = versionNum;

    if (m.status === 'REVIEWER_GATED' && !m.requiresReviewerApproval) {
      errors.push(`Reviewer gated migration missing explicit approval requirement flag: ${m.filename}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-027: Native Secure-Session Persistence Verification
// (M0 main base / CORE-001 / CORE-002 / SESS-001 / COOKIE-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionCookieOptions {
  readonly cookieName?: string;
  readonly maxAge?: number;
  readonly sameSite?: 'Strict' | 'Lax' | 'None';
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly path?: string;
}

export function formatSessionCookie(
  value: string,
  options: SessionCookieOptions = {},
): string {
  const cookieName = options.cookieName || 'sb_ops';
  const maxAge = options.maxAge ?? 28800; // 8 hours default
  const sameSite = options.sameSite || 'None';
  const path = options.path || '/';
  const httpOnly = options.httpOnly !== false;
  const secure = options.secure !== false;

  const parts = [`${cookieName}=${value}`, `Path=${path}`, `Max-Age=${maxAge}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite) parts.push(`SameSite=${sameSite}`);

  return parts.join('; ');
}

export function parseSessionCookie(
  cookieHeader: string | null | undefined,
  cookieName = 'sb_ops',
): string | null {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;

  const parts = cookieHeader.split(';').map((p) => p.trim());
  const match = parts.find((p) => p.startsWith(`${cookieName}=`));
  if (!match) return null;

  const val = match.slice(cookieName.length + 1).trim();
  return val.length > 0 ? val : null;
}

export function validateSessionCookieLifecycle(params: {
  action: 'login' | 'reload' | 'unauthenticated_401' | 'logout';
  sessionToken?: string;
  cookieHeader?: string;
  csrfToken?: string;
  sessionCsrf?: string;
}): {
  ok: boolean;
  setCookieHeader?: string;
  extractedToken?: string;
  error?: string;
} {
  const { action, sessionToken, cookieHeader, csrfToken, sessionCsrf } = params;

  switch (action) {
    case 'login': {
      if (!sessionToken || sessionToken.trim().length === 0) {
        return { ok: false, error: 'session_token_required_for_login' };
      }
      return {
        ok: true,
        setCookieHeader: formatSessionCookie(sessionToken, { maxAge: 28800 }),
      };
    }
    case 'reload': {
      const token = parseSessionCookie(cookieHeader);
      if (!token) {
        return { ok: false, error: 'no_session_cookie_found' };
      }
      return {
        ok: true,
        extractedToken: token,
      };
    }
    case 'unauthenticated_401': {
      // 401 must clear the cookie immediately with Max-Age=0
      return {
        ok: true,
        setCookieHeader: formatSessionCookie('', { maxAge: 0 }),
      };
    }
    case 'logout': {
      // Logout must validate CSRF before clearing cookie
      if (!csrfToken || !sessionCsrf || csrfToken !== sessionCsrf) {
        return { ok: false, error: 'csrf_mismatch' };
      }
      return {
        ok: true,
        setCookieHeader: formatSessionCookie('', { maxAge: 0 }),
      };
    }
    default:
      return { ok: false, error: 'unknown_session_action' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-035: Accessibility and Inclusive Interaction Baseline
// (M0 main base / CORE-001 / CORE-002 / A11Y-001 / WCAG-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface ColorRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function getRelativeLuminance(color: ColorRgb): number {
  const rs = color.r / 255;
  const gs = color.g / 255;
  const bs = color.b / 255;

  const rLinear = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const gLinear = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const bLinear = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

export function calculateContrastRatio(fg: ColorRgb, bg: ColorRgb): number {
  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface AccessibilityAuditItem {
  readonly elementId: string;
  readonly role?: string;
  readonly hasAriaLabel: boolean;
  readonly hasKeyboardFocusRing: boolean;
  readonly minTouchTargetPx: number; // >= 44
  readonly fgColor: ColorRgb;
  readonly bgColor: ColorRgb;
  readonly isLargeText?: boolean;
}

export function validateAccessibilityStandard(item: AccessibilityAuditItem): {
  compliant: boolean;
  contrastRatio: number;
  errors: string[];
} {
  const errors: string[] = [];

  // 1. Contrast Check (WCAG AA: >= 4.5:1 normal text, >= 3.0:1 large text)
  const ratio = calculateContrastRatio(item.fgColor, item.bgColor);
  const minRatio = item.isLargeText ? 3.0 : 4.5;
  if (ratio < minRatio) {
    errors.push(`Contrast ratio ${ratio.toFixed(2)}:1 below required ${minRatio}:1`);
  }

  // 2. Touch target check (>= 44px)
  if (item.minTouchTargetPx < 44) {
    errors.push(`Touch target ${item.minTouchTargetPx}px below recommended minimum 44px`);
  }

  // 3. Accessible label check
  if (!item.hasAriaLabel) {
    errors.push(`Element ${item.elementId} missing accessible name or aria-label`);
  }

  // 4. Focus ring check
  if (!item.hasKeyboardFocusRing) {
    errors.push(`Element ${item.elementId} missing visible focus ring`);
  }

  return {
    compliant: errors.length === 0,
    contrastRatio: Number(ratio.toFixed(2)),
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-032: STARQ ERP Product Metadata and Branding Contract
// (M0 main base / CORE-001 / CORE-002 / META-001 / BRAND-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductIdentityMetadata {
  readonly productName: 'starqERP';
  readonly embeddedAiName: 'starqAI';
  readonly companyName: 'Starq Technologies Pvt Ltd';
  readonly version: string;
  readonly releaseTrack: string;
  readonly baseCurrency: 'MVR';
  readonly contactEmail: string;
  readonly legalJurisdiction: string;
  readonly tagline: string;
}

export const STARQ_ERP_CANONICAL_METADATA: ProductIdentityMetadata = {
  productName: 'starqERP',
  embeddedAiName: 'starqAI',
  companyName: 'Starq Technologies Pvt Ltd',
  version: '0.2.0',
  releaseTrack: 'beta',
  baseCurrency: 'MVR',
  contactEmail: 'ops@starq.mv',
  legalJurisdiction: 'Republic of Maldives',
  tagline: 'Multi-tenant ERP & Commercial Operating System',
};

/**
 * Derives the canonical user-facing formatted product version string (e.g. "v0.2.0-beta")
 */
export function getFormattedProductVersion(meta: ProductIdentityMetadata = STARQ_ERP_CANONICAL_METADATA): string {
  return meta.releaseTrack ? `v${meta.version}-${meta.releaseTrack}` : `v${meta.version}`;
}

export function validateProductIdentityMetadata(meta: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!meta || typeof meta !== 'object') {
    return { valid: false, errors: ['Metadata must be an object'] };
  }

  const m = meta as Record<string, unknown>;

  if (m.productName !== 'starqERP') {
    errors.push(`Invalid product name "${m.productName}". Must be exactly "starqERP".`);
  }

  if (m.embeddedAiName !== 'starqAI') {
    errors.push(`Invalid embedded AI name "${m.embeddedAiName}". Must be exactly "starqAI".`);
  }

  if (m.companyName !== 'Starq Technologies Pvt Ltd') {
    errors.push(`Invalid company name "${m.companyName}". Must be "Starq Technologies Pvt Ltd".`);
  }

  if (m.baseCurrency !== 'MVR') {
    errors.push(`Invalid base currency "${m.baseCurrency}". Must be "MVR".`);
  }

  if (!m.version || typeof m.version !== 'string') {
    errors.push('Version string is required.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP-263: Remote Git and CI Control Plane Contract
// (DEC-089 / Phase 6 / CORE-001 / CORE-002 / CI-001 / SEC-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface CiGateDefinition {
  readonly name: string;
  readonly command: string;
  readonly isMandatory: boolean;
  readonly failureImpact: 'BLOCK_MERGE' | 'WARN_ONLY';
}

export const CI_MANDATORY_GATES: readonly CiGateDefinition[] = Object.freeze([
  {
    name: 'Secret & Credential Sweep',
    command: 'node scripts/pre-push-secret-scan.mjs',
    isMandatory: true,
    failureImpact: 'BLOCK_MERGE',
  },
  {
    name: 'Migration Lineage & Compatibility Linter',
    command: 'node scripts/lint-migrations.mjs',
    isMandatory: true,
    failureImpact: 'BLOCK_MERGE',
  },
  {
    name: 'Migration 0021 Synthetic UUID Rehearsal',
    command: 'node tests/migration_0021_rehearsal.test.mjs',
    isMandatory: true,
    failureImpact: 'BLOCK_MERGE',
  },
  {
    name: 'Tenant Hardcoding Sweep',
    command: 'node tests/tenant_hardcoding_sweep.test.mjs',
    isMandatory: true,
    failureImpact: 'BLOCK_MERGE',
  },
  {
    name: 'Security Policy Enforcement',
    command: 'node tests/security_policy.test.mjs',
    isMandatory: true,
    failureImpact: 'BLOCK_MERGE',
  },
  {
    name: 'Deno Contract Test Suite',
    command: 'deno test --allow-read tests/contract/commands_test.ts',
    isMandatory: true,
    failureImpact: 'BLOCK_MERGE',
  },
  {
    name: 'Web TypeScript Typecheck',
    command: 'npm run lint',
    isMandatory: true,
    failureImpact: 'BLOCK_MERGE',
  },
  {
    name: 'Web Vitest Suite',
    command: 'npm test',
    isMandatory: true,
    failureImpact: 'BLOCK_MERGE',
  },
  {
    name: 'Web Production Build',
    command: 'npm run build',
    isMandatory: true,
    failureImpact: 'BLOCK_MERGE',
  },
]);

export function validateCiGateRegistry(gates: readonly CiGateDefinition[]): {
  valid: boolean;
  missingMandatoryGates: string[];
} {
  const missing: string[] = [];
  const requiredGateNames = [
    'Secret & Credential Sweep',
    'Migration Lineage & Compatibility Linter',
    'Migration 0021 Synthetic UUID Rehearsal',
    'Tenant Hardcoding Sweep',
    'Deno Contract Test Suite',
    'Web Vitest Suite',
    'Web Production Build',
  ];

  for (const req of requiredGateNames) {
    const found = gates.find((g) => g.name === req && g.isMandatory && g.failureImpact === 'BLOCK_MERGE');
    if (!found) {
      missing.push(req);
    }
  }

  return {
    valid: missing.length === 0,
    missingMandatoryGates: missing,
  };
}






















