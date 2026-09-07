begin;

-- =============================================================================
-- Migration: 202608300036_goods_receipts.sql
-- SERP-311 / SERP-310 — the goods receipt becomes a record rather than a status.
--
-- WHAT WAS THERE. `receivePurchaseOrder(poId)` flipped an order to
-- 'Received & Stocked'. There was no record of WHAT physically arrived, WHEN,
-- from WHICH delivery, or WHO checked it in — and `receivedQuantity` on the
-- order lines was never written. A partial delivery, a short delivery and an
-- over-delivery were all indistinguishable from a complete one.
--
-- WHY THIS IS THE LINCHPIN AND NOT HOUSEKEEPING. Three-way matching works
-- because the receipt is an INDEPENDENT OBSERVATION, made by a different person
-- at a different moment from the order and the bill. A status flag set by the
-- same click that closes the order is not an independent observation — it is
-- the order agreeing with itself. Without this table, threeWayMatch() and
-- allocateLandedCost() are engines with nothing to run on, which is exactly
-- where both have been sitting.
--
-- A RECEIPT IS AN OBSERVATION, SO IT IS APPEND-ONLY. What arrived on Tuesday
-- did not change on Thursday. A miscount is corrected by recording a further
-- movement — a return, an adjustment, a second receipt — never by editing the
-- original, because editing it destroys the only evidence of what was first
-- observed. This is the same rule the journal lives under, and for the same
-- reason.
-- =============================================================================

-- 1. The documents ----------------------------------------------------------
create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  -- The order this delivery is against. Nullable, because goods genuinely do
  -- arrive without a purchase order and a system that refuses to record them
  -- pushes the stock off the books entirely — which is worse than an
  -- unmatched receipt. threeWayMatch reports it as
  -- `received_item_not_ordered` rather than the database forbidding it.
  purchase_order_id uuid,
  receipt_no text not null,
  supplier_id uuid,
  -- The supplier's own delivery note, so a physical document can be found.
  delivery_note_ref text,
  received_at timestamptz not null default now(),
  -- WHO CHECKED IT IN. Half of segregation of duties: the person who receives
  -- must be identifiable and, by policy, not the person who approves the bill.
  received_by uuid not null references public.persons(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (organisation_id, receipt_no),
  unique (organisation_id, id)
);

-- 2. The lines --------------------------------------------------------------
create table public.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  receipt_id uuid not null,
  line_no integer not null check (line_no > 0),
  -- The key that identifies the same item across order, receipt and bill.
  item_key text not null,
  description text,
  -- POSITIVE ONLY. A negative receipt is a return, and a return is a different
  -- document with a different authorisation. Allowing negatives here would let
  -- somebody reverse a delivery through the receiving screen, which is the
  -- receiving clerk quietly undoing a control.
  quantity numeric(18,4) not null check (quantity > 0),
  unit text,
  -- What the supplier charges, excluding GST. NOT the landed cost: freight and
  -- duty arrive later on their own invoices and are apportioned by SERP-310.
  -- Nullable because a delivery is frequently checked in before its price is
  -- known, and blocking the receipt until finance supplies a number is how
  -- stock ends up on the floor and not in the system.
  unit_cost numeric(18,4) check (unit_cost is null or unit_cost >= 0),
  -- Weight, for freight allocated by weight rather than by value.
  weight numeric(18,4) check (weight is null or weight >= 0),
  created_at timestamptz not null default now(),
  unique (receipt_id, line_no),
  foreign key (organisation_id, receipt_id)
    references public.goods_receipts (organisation_id, id) on delete restrict,
  -- COMPOSITE, deliberately. A plain `references goods_receipts(id)` would let a
  -- line claim one tenant while its header belongs to another; carrying
  -- organisation_id into the key makes that unrepresentable rather than merely
  -- forbidden by a policy somebody might forget to write.
  foreign key (organisation_id) references public.organisations(id)
);

create index goods_receipts_org_order on public.goods_receipts (organisation_id, purchase_order_id);
create index goods_receipt_lines_receipt on public.goods_receipt_lines (receipt_id);
create index goods_receipt_lines_item on public.goods_receipt_lines (organisation_id, item_key);

-- 3. Append-only ------------------------------------------------------------
-- Reusing app_private.reject_mutation(), the same function that protects the
-- journal and the audit trail. A second implementation of "this is immutable"
-- is a second thing that can drift.
create trigger goods_receipts_append_only
before update or delete on public.goods_receipts
for each row execute function app_private.reject_mutation();

create trigger goods_receipt_lines_append_only
before update or delete on public.goods_receipt_lines
for each row execute function app_private.reject_mutation();

-- 4. Tenant isolation -------------------------------------------------------
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_lines enable row level security;

create policy goods_receipts_tenant on public.goods_receipts
for select to public
using (organisation_id = app_private.current_organisation_id());

create policy goods_receipt_lines_tenant on public.goods_receipt_lines
for select to public
using (organisation_id = app_private.current_organisation_id());

revoke all on public.goods_receipts from public, anon;
revoke all on public.goods_receipt_lines from public, anon;
grant select on public.goods_receipts to authenticated;
grant select on public.goods_receipt_lines to authenticated;
grant all on public.goods_receipts to service_role;
grant all on public.goods_receipt_lines to service_role;

commit;

-- =============================================================================
-- These policies are ATTACKED by tests/serp_311_goods_receipts_probe.sql.
--
-- Written in the same commit, not "later". This codebase already carries 55 RLS
-- policies that went untested for months, and the whole lesson of the last week
-- is that a policy nobody has tried to break is a policy nobody knows works.
-- =============================================================================
