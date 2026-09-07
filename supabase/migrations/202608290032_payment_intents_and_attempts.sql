begin;

-- =============================================================================
-- Migration: 202608290032_payment_intents_and_attempts.sql
-- SERP-349 / SERP-350 — Payment lifecycle: intents, attempts, refunds
--
-- These tables are OPERATIONAL, not financial. They record a conversation with
-- a payment provider: what we asked for, what we tried, and what came back.
-- They hold no balances and are never a source of financial truth. The money
-- lands in commercial_documents and settlement_allocations, through the
-- command envelope, and nowhere else (DEC-068).
--
-- Three properties carry the safety here:
--
--   1. UNCERTAIN. A provider or network timeout does not mean the payment
--      failed — it means we do not know. An attempt in 'uncertain' may never be
--      retried and must never be shown to a customer as a failure. It resolves
--      only by webhook, status query or settlement file. This is the single
--      state that prevents double charging.
--
--   2. APPEND-ONLY ATTEMPTS. A retry inserts a NEW attempt. Nothing resets an
--      existing one, so the history of what was tried survives, matching the
--      treatment of settlement_allocations and audit_events.
--
--   3. COMPOSITE TENANT-SAFE KEYS. Every reference carries organisation_id, so
--      a row cannot point across a tenant boundary. The database refuses it
--      independently of application logic — which is what makes the guarantee
--      worth anything.
-- =============================================================================

-- 1. Payment intents ---------------------------------------------------------
-- One intent per commercial decision to collect money. Many attempts per intent.

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  provider_id text not null references public.payment_providers(id),

  status text not null default 'created'
    check (status in ('created', 'pending', 'requires_action',
                      'succeeded', 'failed', 'cancelled')),

  -- numeric(20,6) to match every other monetary column in this schema, and the
  -- scale contracts/money.ts is built around. Never minor units in SQL.
  amount numeric(20, 6) not null check (amount > 0),
  currency character(3) not null,

  -- What this payment is meant to settle. Optional at intent time because a
  -- subscription checkout may precede the invoice being raised.
  target_document_id uuid,

  -- The payment document actually created on capture. Written by the command,
  -- never by webhook code. Its presence is what makes this intent financial.
  settled_payment_document_id uuid,

  created_by uuid not null references public.persons(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organisation_id, id),
  foreign key (organisation_id, target_document_id)
    references public.commercial_documents(organisation_id, id),
  foreign key (organisation_id, settled_payment_document_id)
    references public.commercial_documents(organisation_id, id)
);

create index payment_intents_org_status_idx
  on public.payment_intents (organisation_id, status);

comment on table public.payment_intents is
  'Operational record of an intention to collect money. Holds no financial '
  'truth; the ledger does. One intent, many attempts.';

-- 2. Payment attempts --------------------------------------------------------

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  intent_id uuid not null,
  provider_id text not null references public.payment_providers(id),

  status text not null default 'created'
    check (status in ('created', 'processing', 'succeeded', 'failed', 'uncertain')),

  amount numeric(20, 6) not null check (amount > 0),
  currency character(3) not null,

  -- The provider's own reference. Stored for reconciliation and dispute, never
  -- trusted as identity: our identity is the uuid above.
  provider_reference text,

  -- Set when the attempt enters 'uncertain'. Drives the reconciliation sweep
  -- that resolves stale unknowns against provider status.
  uncertain_since timestamptz,

  failure_code text,
  failure_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organisation_id, id),
  foreign key (organisation_id, intent_id)
    references public.payment_intents(organisation_id, id),

  -- 'uncertain' without a timestamp would be invisible to the sweep, and the
  -- timestamp without the status would be meaningless. Keep them together.
  constraint payment_attempts_uncertain_is_timestamped
    check ((status = 'uncertain') = (uncertain_since is not null))
);

create index payment_attempts_org_intent_idx
  on public.payment_attempts (organisation_id, intent_id);

-- Partial index: the reconciliation sweep only ever asks for unresolved
-- unknowns, and they are a small minority of rows.
create index payment_attempts_uncertain_idx
  on public.payment_attempts (uncertain_since)
  where status = 'uncertain';

comment on column public.payment_attempts.status is
  'uncertain means a timeout — we do not know the outcome. Never retry an '
  'uncertain attempt and never report it to a customer as a failure.';

-- 3. The state machine, enforced in the database -----------------------------
-- The contract declares these transitions in TypeScript. Declaring them here
-- too means application code cannot be the only thing standing between a
-- timeout and a double charge.

create or replace function app_private.assert_payment_attempt_transition()
returns trigger language plpgsql as $$
begin
  if old.status = new.status then
    return new;
  end if;

  -- Terminal states are terminal. A retry is a new attempt, not a revival.
  if old.status in ('succeeded', 'failed') then
    raise exception
      'payment attempt % is terminal (%); a retry must insert a new attempt',
      old.id, old.status;
  end if;

  -- Nothing returns to 'created'.
  if new.status = 'created' then
    raise exception 'payment attempt % cannot return to created', old.id;
  end if;

  if old.status = 'created' and new.status not in ('processing', 'failed') then
    raise exception 'illegal transition % -> % on attempt %', old.status, new.status, old.id;
  end if;

  if old.status = 'processing'
     and new.status not in ('succeeded', 'failed', 'uncertain') then
    raise exception 'illegal transition % -> % on attempt %', old.status, new.status, old.id;
  end if;

  -- An unknown resolves only to a known outcome. It never re-enters processing,
  -- because re-processing an attempt that may already have taken money is
  -- exactly the double charge this state exists to prevent.
  if old.status = 'uncertain' and new.status not in ('succeeded', 'failed') then
    raise exception
      'attempt % is uncertain and may only resolve to succeeded or failed, not %',
      old.id, new.status;
  end if;

  return new;
end $$;

create trigger payment_attempts_transition_guard
before update on public.payment_attempts
for each row execute function app_private.assert_payment_attempt_transition();

-- Attempts are never deleted. The record of what was tried is the audit trail.
create trigger payment_attempts_no_delete
before delete on public.payment_attempts
for each row execute function app_private.reject_mutation();

-- 4. Refunds -----------------------------------------------------------------
-- A refund is not a negative payment. settlement_allocations.allocated_amount
-- is constrained positive and the table carries reversal_of for this purpose.
-- This table records the PROVIDER side of a refund; the financial reversal is
-- an allocation row plus a credit note, raised by the command.

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  intent_id uuid not null,
  provider_id text not null references public.payment_providers(id),

  status text not null default 'created'
    check (status in ('created', 'processing', 'succeeded', 'failed')),

  amount numeric(20, 6) not null check (amount > 0),
  currency character(3) not null,

  provider_reference text,

  -- Required, and long enough to be a real explanation. Mirrors
  -- SOD_REASON_MIN_LENGTH in the contract.
  reason text not null check (length(btrim(reason)) >= 12),

  requested_by uuid not null references public.persons(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organisation_id, id),
  foreign key (organisation_id, intent_id)
    references public.payment_intents(organisation_id, id)
);

create index payment_refunds_org_intent_idx
  on public.payment_refunds (organisation_id, intent_id);

-- 5. The refund ceiling, enforced under a lock -------------------------------
-- Cumulative refunds may not exceed what was captured. Checking this in
-- application memory loses to two concurrent refund requests; checking it here,
-- under a row lock on the intent, does not.

create or replace function app_private.assert_refund_within_capture()
returns trigger language plpgsql as $$
declare
  captured numeric(20, 6);
  already_refunded numeric(20, 6);
  intent_currency character(3);
begin
  -- Lock the intent so concurrent refunds serialise against the same total.
  select amount, currency into captured, intent_currency
    from public.payment_intents
   where organisation_id = new.organisation_id and id = new.intent_id
     for update;

  if captured is null then
    raise exception 'payment intent % not found in organisation %',
      new.intent_id, new.organisation_id;
  end if;

  if new.currency <> intent_currency then
    raise exception 'refund currency % does not match intent currency %',
      new.currency, intent_currency;
  end if;

  select coalesce(sum(amount), 0) into already_refunded
    from public.payment_refunds
   where organisation_id = new.organisation_id
     and intent_id = new.intent_id
     and status in ('created', 'processing', 'succeeded')
     and (tg_op = 'INSERT' or id <> new.id);

  if already_refunded + new.amount > captured then
    raise exception
      'cumulative refunds (% + %) would exceed captured amount % on intent %',
      already_refunded, new.amount, captured, new.intent_id;
  end if;

  return new;
end $$;

create trigger payment_refunds_ceiling_guard
before insert or update on public.payment_refunds
for each row execute function app_private.assert_refund_within_capture();

-- 6. Access ------------------------------------------------------------------
-- Read is scoped to the session organisation. There is NO client write policy:
-- every write arrives through the command boundary using the service role, so a
-- policy permitting authenticated INSERT would be a second door around the
-- seat matrix.

alter table public.payment_intents enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_refunds enable row level security;

create policy payment_intents_current on public.payment_intents
  using (app_private.has_organisation_access(organisation_id));
create policy payment_attempts_current on public.payment_attempts
  using (app_private.has_organisation_access(organisation_id));
create policy payment_refunds_current on public.payment_refunds
  using (app_private.has_organisation_access(organisation_id));

revoke all on public.payment_intents from anon, authenticated;
revoke all on public.payment_attempts from anon, authenticated;
revoke all on public.payment_refunds from anon, authenticated;

commit;
