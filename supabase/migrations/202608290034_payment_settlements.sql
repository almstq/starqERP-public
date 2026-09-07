begin;

-- =============================================================================
-- Migration: 202608290034_payment_settlements.sql
-- SERP-349 / SERP-354 — Bank settlement batches
--
-- CAPTURE IS NOT SETTLEMENT.
--
-- Capture is the moment the customer's payment succeeds. Settlement is the bank
-- moving money into the merchant account — usually days later, net of provider
-- fees, batched across many captures. Reconciliation is a third thing again:
-- the bank statement agreeing with both.
--
-- Collapsing these is the classic payments error. It matters here for a
-- specific reason: settlement must never retroactively alter a capture,
-- because a capture is a statutory figure that may already have been filed.
-- The fee and the clearing difference are NEW events, raised as journal
-- proposals a human accepts — never as an adjustment to the original document.
--
-- This table records the bank's side. The financial effect is raised through
-- the command boundary into journal_proposals, never posted from here.
-- =============================================================================

create table public.payment_settlements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  provider_id text not null references public.payment_providers(id),

  -- The provider's settlement batch identifier. Unique per provider per
  -- organisation, so a redelivered settlement report cannot double-post.
  batch_reference text not null,

  -- gross - fee = net. Enforced below rather than trusted, because a settlement
  -- report that does not balance is the single most common sign of a parsing
  -- error, and silently accepting it corrupts the reconciliation.
  gross_amount numeric(20, 6) not null check (gross_amount >= 0),
  fee_amount numeric(20, 6) not null check (fee_amount >= 0),
  net_amount numeric(20, 6) not null,
  currency character(3) not null,

  settled_at timestamptz not null,
  bank_account_id uuid,

  -- The proposal raised for the fee and clearing difference. A human accepts
  -- it; nothing posts automatically.
  journal_proposal_id uuid,

  reconciled_at timestamptz,
  reconciliation_note text,

  created_at timestamptz not null default now(),

  unique (organisation_id, id),
  unique (organisation_id, provider_id, batch_reference),

  foreign key (organisation_id, bank_account_id)
    references public.bank_accounts(organisation_id, id),

  constraint payment_settlements_balances
    check (gross_amount - fee_amount = net_amount)
);

create index payment_settlements_org_provider_idx
  on public.payment_settlements (organisation_id, provider_id, settled_at);

create index payment_settlements_unreconciled_idx
  on public.payment_settlements (organisation_id, settled_at)
  where reconciled_at is null;

comment on constraint payment_settlements_balances on public.payment_settlements is
  'gross - fee = net. A settlement report that does not balance is a parsing '
  'error, not a business fact, and must not be stored as though it were.';

-- 2. Which captures a batch contains ------------------------------------------
-- Many captures per settlement batch. Kept as a join rather than an array so
-- each membership is individually referenceable during reconciliation, and so
-- the composite foreign keys can do their job.

create table public.payment_settlement_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  settlement_id uuid not null,

  -- The payment document that was captured. This is the link between the
  -- provider's world and the ledger's.
  payment_document_id uuid not null,

  gross_amount numeric(20, 6) not null check (gross_amount > 0),
  fee_amount numeric(20, 6) not null check (fee_amount >= 0),
  currency character(3) not null,

  created_at timestamptz not null default now(),

  unique (organisation_id, id),

  -- A capture belongs to exactly one settlement batch. Without this, a
  -- redelivered report could settle the same capture twice.
  unique (organisation_id, payment_document_id),

  foreign key (organisation_id, settlement_id)
    references public.payment_settlements(organisation_id, id),
  foreign key (organisation_id, payment_document_id)
    references public.commercial_documents(organisation_id, id)
);

create index payment_settlement_items_settlement_idx
  on public.payment_settlement_items (organisation_id, settlement_id);

-- 3. Settlements are append-only ---------------------------------------------
-- A settlement is a report of something that already happened at the bank.
-- Reconciliation state may advance; the reported figures may not be edited.

create or replace function app_private.prevent_settlement_figure_mutation()
returns trigger language plpgsql as $$
begin
  if new.gross_amount is distinct from old.gross_amount
     or new.fee_amount is distinct from old.fee_amount
     or new.net_amount is distinct from old.net_amount
     or new.currency is distinct from old.currency
     or new.settled_at is distinct from old.settled_at
     or new.batch_reference is distinct from old.batch_reference then
    raise exception
      'settlement % figures are immutable; record a correcting settlement instead',
      old.id;
  end if;
  return new;
end $$;

create trigger payment_settlements_figures_immutable
before update on public.payment_settlements
for each row execute function app_private.prevent_settlement_figure_mutation();

create trigger payment_settlements_no_delete
before delete on public.payment_settlements
for each row execute function app_private.reject_mutation();

create trigger payment_settlement_items_append_only
before update or delete on public.payment_settlement_items
for each row execute function app_private.reject_mutation();

-- 4. Items must balance against their batch ----------------------------------
-- The sum of item gross may not exceed the batch gross. Checked under a lock on
-- the settlement so concurrent item inserts serialise.

create or replace function app_private.assert_settlement_item_within_batch()
returns trigger language plpgsql as $$
declare
  batch record;
  prior_gross numeric(20, 6);
begin
  select * into batch
    from public.payment_settlements
   where organisation_id = new.organisation_id and id = new.settlement_id
     for update;

  if batch.id is null then
    raise exception 'settlement % not found in organisation %',
      new.settlement_id, new.organisation_id;
  end if;

  if new.currency <> batch.currency then
    raise exception 'item currency % does not match settlement currency %',
      new.currency, batch.currency;
  end if;

  select coalesce(sum(gross_amount), 0) into prior_gross
    from public.payment_settlement_items
   where organisation_id = new.organisation_id and settlement_id = new.settlement_id;

  if prior_gross + new.gross_amount > batch.gross_amount then
    raise exception
      'settlement items (% + %) would exceed batch gross % on settlement %',
      prior_gross, new.gross_amount, batch.gross_amount, new.settlement_id;
  end if;

  return new;
end $$;

create trigger payment_settlement_items_batch_guard
before insert on public.payment_settlement_items
for each row execute function app_private.assert_settlement_item_within_batch();

-- 5. Access ------------------------------------------------------------------

alter table public.payment_settlements enable row level security;
alter table public.payment_settlement_items enable row level security;

create policy payment_settlements_current on public.payment_settlements
  using (app_private.has_organisation_access(organisation_id));
create policy payment_settlement_items_current on public.payment_settlement_items
  using (app_private.has_organisation_access(organisation_id));

revoke all on public.payment_settlements from anon, authenticated;
revoke all on public.payment_settlement_items from anon, authenticated;

commit;
