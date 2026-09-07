-- =============================================================================
-- SERP-311 — goods receipts, adversarially.
--
-- Migration 202608300036 adds two tables with RLS policies, append-only
-- triggers, a positive-quantity check and a COMPOSITE tenant foreign key.
-- Every one of those is a claim, and this file is where the claims are tested.
--
-- WRITTEN IN THE SAME COMMIT AS THE MIGRATION. This codebase carries 55 RLS
-- policies that went untested for months; SERP-300 found them, SERP-075 found
-- that my own chart_of_accounts policy had joined them, and SERP-077 found five
-- append-only triggers nothing had ever attacked. A policy nobody has tried to
-- break is a policy nobody knows works, and writing the probe afterwards is how
-- "afterwards" becomes "never".
--
--   psql -h localhost -p 55432 -U postgres -d <db> -f tests/serp_311_goods_receipts_probe.sql
--
-- A case PASSES when the database REFUSES or returns nothing. Rolled back.
-- =============================================================================

\set ON_ERROR_STOP off

begin;

create temporary table serp311_results (
  scenario text, expected text, actual text, passed boolean
) on commit drop;

select id as "ORG_A" from public.organisations order by id limit 1 \gset
select id as "ORG_B" from public.organisations order by id offset 1 limit 1 \gset

insert into public.persons (id, person_key, display_label)
values ('31100000-0000-4000-8000-0000000000ff', 'serp311-probe', 'SERP-311 Probe Receiver')
on conflict (id) do nothing;

-- A receipt belonging to tenant B, for tenant A to reach for.
insert into public.goods_receipts (id, organisation_id, receipt_no, received_by, delivery_note_ref)
values ('31100000-0000-4000-8000-000000000001', :'ORG_B', 'GRN-B-001',
        '31100000-0000-4000-8000-0000000000ff', 'DN-B-9001');

insert into public.goods_receipt_lines
  (id, organisation_id, receipt_id, line_no, item_key, quantity, unit_cost)
values ('31100000-0000-4000-8000-000000000002', :'ORG_B',
        '31100000-0000-4000-8000-000000000001', 1, 'filters', 100, 25);

-- And one for tenant A, so the append-only cases have something of their own.
insert into public.goods_receipts (id, organisation_id, receipt_no, received_by)
values ('31100000-0000-4000-8000-000000000003', :'ORG_A', 'GRN-A-001',
        '31100000-0000-4000-8000-0000000000ff');

insert into public.goods_receipt_lines
  (id, organisation_id, receipt_id, line_no, item_key, quantity, unit_cost)
values ('31100000-0000-4000-8000-000000000004', :'ORG_A',
        '31100000-0000-4000-8000-000000000003', 1, 'gaskets', 10, 40);

-- ---------------------------------------------------------------------------
-- Constraints, checked as owner: these are table constraints, not policies.
-- ---------------------------------------------------------------------------
do $$
declare
  org_a constant uuid := (select id from public.organisations order by id limit 1);
  org_b constant uuid := (select id from public.organisations order by id offset 1 limit 1);
begin
  -- 1. A NEGATIVE RECEIPT IS REFUSED.
  --    A negative receipt is a RETURN, and a return is a different document
  --    with different authorisation. Allowing it here lets a receiving clerk
  --    reverse a delivery through the receiving screen — quietly undoing a
  --    control from inside it.
  begin
    insert into public.goods_receipt_lines
      (organisation_id, receipt_id, line_no, item_key, quantity)
    values (org_a, '31100000-0000-4000-8000-000000000003', 90, 'reversal', -5);
    insert into serp311_results values
      ('negative_receipt_rejected', 'rejected: quantity must be positive',
       'ACCEPTED — a delivery was reversed through the receiving screen', false);
  exception when check_violation then
    insert into serp311_results values
      ('negative_receipt_rejected', 'rejected: quantity must be positive', 'rejected by check constraint', true);
  end;

  begin
    insert into public.goods_receipt_lines
      (organisation_id, receipt_id, line_no, item_key, quantity)
    values (org_a, '31100000-0000-4000-8000-000000000003', 91, 'nothing', 0);
    insert into serp311_results values
      ('zero_receipt_rejected', 'rejected', 'ACCEPTED — a receipt of nothing was recorded', false);
  exception when check_violation then
    insert into serp311_results values ('zero_receipt_rejected', 'rejected', 'rejected', true);
  end;

  -- 2. A LINE CANNOT CLAIM A DIFFERENT TENANT TO ITS HEADER.
  --    This is what the COMPOSITE foreign key is for. A plain
  --    references goods_receipts(id) would accept this row, and tenant B's
  --    delivery would carry a line owned by tenant A.
  begin
    insert into public.goods_receipt_lines
      (organisation_id, receipt_id, line_no, item_key, quantity)
    values (org_a, '31100000-0000-4000-8000-000000000001', 92, 'smuggled', 1);
    insert into serp311_results values
      ('line_cannot_cross_tenant', 'rejected by composite foreign key',
       'ACCEPTED — a line joined another tenant''s receipt', false);
  exception when foreign_key_violation then
    insert into serp311_results values
      ('line_cannot_cross_tenant', 'rejected by composite foreign key', 'rejected by composite FK', true);
  end;

  -- 3. RECEIPT NUMBERS ARE UNIQUE WITHIN A TENANT, AND ONLY WITHIN ONE.
  begin
    insert into public.goods_receipts (organisation_id, receipt_no, received_by)
    values (org_a, 'GRN-A-001', '31100000-0000-4000-8000-0000000000ff');
    insert into serp311_results values
      ('receipt_no_unique_per_tenant', 'rejected by unique constraint',
       'ACCEPTED — two receipts share a number', false);
  exception when unique_violation then
    insert into serp311_results values
      ('receipt_no_unique_per_tenant', 'rejected by unique constraint', 'rejected', true);
  end;

  begin
    insert into public.goods_receipts (organisation_id, receipt_no, received_by)
    values (org_b, 'GRN-A-001', '31100000-0000-4000-8000-0000000000ff');
    insert into serp311_results values
      ('receipt_no_reusable_across_tenants', 'accepted for a different tenant', 'accepted', true);
  exception when others then
    -- Over-tight uniqueness would mean one tenant's numbering could collide
    -- with another's. That is an availability failure dressed as safety.
    insert into serp311_results values
      ('receipt_no_reusable_across_tenants', 'accepted for a different tenant',
       'REJECTED — numbering collides across tenants: ' || sqlstate, false);
  end;

  -- 4. A RECEIPT IS AN OBSERVATION — APPEND-ONLY.
  --    What arrived on Tuesday did not change on Thursday. A miscount is
  --    corrected by a further movement, never by editing the original, because
  --    editing destroys the only evidence of what was first observed.
  begin
    update public.goods_receipts set delivery_note_ref = 'FORGED'
     where id = '31100000-0000-4000-8000-000000000003';
    insert into serp311_results values
      ('receipt_header_immutable', 'rejected: append-only',
       'ACCEPTED — a recorded delivery was rewritten', false);
  exception when others then
    insert into serp311_results values
      ('receipt_header_immutable', 'rejected: append-only', 'rejected — ' || sqlerrm, true);
  end;

  begin
    update public.goods_receipt_lines set quantity = 999
     where id = '31100000-0000-4000-8000-000000000004';
    insert into serp311_results values
      ('receipt_quantity_immutable', 'rejected: append-only',
       'ACCEPTED — the quantity received was changed after the fact', false);
  exception when others then
    insert into serp311_results values
      ('receipt_quantity_immutable', 'rejected: append-only', 'rejected', true);
  end;

  begin
    delete from public.goods_receipt_lines where id = '31100000-0000-4000-8000-000000000004';
    insert into serp311_results values
      ('receipt_line_undeletable', 'rejected: append-only',
       'ACCEPTED — a delivery line vanished', false);
  exception when others then
    insert into serp311_results values
      ('receipt_line_undeletable', 'rejected: append-only', 'rejected', true);
  end;

  -- 5. A RECEIPT WITHOUT A PURCHASE ORDER IS ALLOWED.
  --    Goods genuinely arrive without one, and a system that refuses to record
  --    them pushes the stock off the books entirely — worse than an unmatched
  --    receipt. threeWayMatch reports it as received_item_not_ordered; the
  --    database does not forbid it.
  begin
    insert into public.goods_receipts (organisation_id, receipt_no, received_by, purchase_order_id)
    values (org_a, 'GRN-A-NOPO', '31100000-0000-4000-8000-0000000000ff', null);
    insert into serp311_results values
      ('receipt_without_po_allowed', 'accepted', 'accepted', true);
  exception when others then
    insert into serp311_results values
      ('receipt_without_po_allowed', 'accepted',
       'REJECTED — unordered stock cannot be recorded at all: ' || sqlstate, false);
  end;

  -- 6. WHO CHECKED IT IN IS NOT OPTIONAL.
  --    Half of segregation of duties. An anonymous receipt cannot be held
  --    against the person who approves the bill.
  begin
    insert into public.goods_receipts (organisation_id, receipt_no, received_by)
    values (org_a, 'GRN-A-ANON', null);
    insert into serp311_results values
      ('receiver_required', 'rejected: received_by is not null',
       'ACCEPTED — an anonymous delivery was recorded', false);
  exception when not_null_violation then
    insert into serp311_results values
      ('receiver_required', 'rejected: received_by is not null', 'rejected', true);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Tenant isolation, as a real user session: not a superuser, cannot bypass RLS.
-- ---------------------------------------------------------------------------
drop role if exists serp311_probe;
create role serp311_probe noinherit nologin nosuperuser nobypassrls;
grant serp311_probe to current_user;
grant usage on schema public, app_private to serp311_probe;
grant select, insert, update, delete on all tables in schema public to serp311_probe;
grant select, insert, update, delete on serp311_results to serp311_probe;

set local role serp311_probe;
set local row_security = on;
select set_config('app.organisation_id', :'ORG_A', true);

do $$
declare
  n bigint;
  org_b constant uuid := (select id from public.organisations order by id offset 1 limit 1);
begin
  -- 7. TENANT A CANNOT SEE TENANT B'S DELIVERIES.
  --    A supplier's delivery notes are commercially sensitive: they disclose
  --    what a competitor buys, from whom, and how often.
  select count(*) into n from public.goods_receipts where organisation_id = org_b;
  insert into serp311_results values
    ('receipts_cross_tenant_select', '0 tenant B receipts', n || ' visible', n = 0);

  select count(*) into n from public.goods_receipt_lines where organisation_id = org_b;
  insert into serp311_results values
    ('receipt_lines_cross_tenant_select', '0 tenant B lines', n || ' visible', n = 0);

  -- 8. AND SEES ITS OWN.
  --    Guards the opposite failure: a policy that filters everything passes
  --    every isolation test and ships a blank screen.
  select count(*) into n from public.goods_receipts;
  insert into serp311_results values
    ('receipts_own_tenant_visible', 'at least one of tenant A''s own', n || ' visible', n >= 1);
end $$;

reset role;

table serp311_results;

do $$
declare failures text;
begin
  select string_agg(scenario || ' => ' || actual, E'\n' order by scenario)
    into failures from serp311_results where not passed;
  if failures is not null then
    raise exception E'SERP-311 GOODS RECEIPTS — UNGUARDED:\n%', failures;
  end if;
end $$;

rollback;
