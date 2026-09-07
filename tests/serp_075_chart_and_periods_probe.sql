-- =============================================================================
-- SERP-075 — tenant chart of accounts and fiscal periods, adversarially
--
-- SERP-344 added public.chart_of_accounts with an RLS policy, class-range check
-- constraints, a parent foreign key and a posting-control trigger. Every one of
-- those was DECLARED and the posting-control half was proven by
-- serp_344_posting_control_probe.sql.
--
-- THE TENANT HALF WAS NEVER ATTACKED. I wrote that RLS policy and did not test
-- it — the exact defect I have spent this session finding in other people's
-- work: 55 policies with zero tests, a period lock imported and never called,
-- an adversarial probe that skipped nine payment tables. A policy nobody has
-- tried to break is a policy nobody knows works.
--
-- public.accounting_periods has never been attacked either, and a period lock
-- that a neighbouring tenant can lift is not a lock.
--
--   psql -h localhost -p 55432 -U postgres -d <db> -f tests/serp_075_chart_and_periods_probe.sql
--
-- A case PASSES when the database REFUSES or returns nothing. Everything runs in
-- one transaction that is ROLLED BACK.
-- =============================================================================

\set ON_ERROR_STOP off

begin;

create temporary table serp075_results (
  scenario text, expected text, actual text, passed boolean
) on commit drop;

-- Two real tenants from the bootstrap. A is the attacker, B is the victim.
select id as "ORG_A" from public.organisations order by id limit 1 \gset
select id as "ORG_B" from public.organisations order by id offset 1 limit 1 \gset

\echo 'attacker (A):' :ORG_A
\echo 'victim   (B):' :ORG_B

-- A period belonging to B, and a CLOSED one, so the lock can be attacked.
insert into public.accounting_periods (id, organisation_id, period_code, starts_on, ends_on, status)
values
  ('07500000-0000-4000-8000-000000000001', :'ORG_B', '2026-07', '2026-07-01', '2026-07-31', 'open'),
  ('07500000-0000-4000-8000-000000000002', :'ORG_B', '2026-06', '2026-06-01', '2026-06-30', 'closed')
on conflict do nothing;

-- The probe role: a real user session, not a superuser and unable to bypass RLS.
drop role if exists serp075_probe;
create role serp075_probe noinherit nologin nosuperuser nobypassrls;
grant serp075_probe to current_user;
grant usage on schema public, app_private to serp075_probe;
grant select, insert, update, delete on all tables in schema public to serp075_probe;
grant select, insert, update, delete on serp075_results to serp075_probe;

set local role serp075_probe;
set local row_security = on;
select set_config('app.organisation_id', :'ORG_A', true);

do $$
declare
  n bigint;
  affected bigint;
  org_b constant uuid := (select id from public.organisations order by id offset 1 limit 1);
begin
  -- 1. THE CHART IS TENANT-SCOPED ON READ.
  --    Every organisation is seeded with the same 55 codes, so a leak here does
  --    not look like a leak — it looks like a correct chart. That is precisely
  --    why it needs asserting rather than eyeballing.
  select count(*) into n from public.chart_of_accounts where organisation_id = org_b;
  insert into serp075_results values
    ('chart_cross_tenant_select', '0 tenant B accounts', n || ' tenant B accounts', n = 0);

  -- 2. AND A COUNT OF WHAT IS VISIBLE IS EXACTLY ONE TENANT'S CHART.
  --    Guards the subtler failure: the policy filters nothing and A sees 110.
  select count(*) into n from public.chart_of_accounts;
  insert into serp075_results values
    ('chart_visible_is_one_tenant', '55 accounts, not every tenant''s', n || ' visible', n = 55);

  -- 3. NO WRITING INTO ANOTHER TENANT'S CHART.
  begin
    insert into public.chart_of_accounts
      (organisation_id, code, name, account_class, subtype, level, posting_control)
    values (org_b, '1999', 'FORGED ACCOUNT', 'ASSET', 'CURRENT_ASSET', 3, 'postable');
    insert into serp075_results values
      ('chart_cross_tenant_insert', 'rejected', 'ACCEPTED — an account was planted in tenant B', false);
  exception when others then
    insert into serp075_results values
      ('chart_cross_tenant_insert', 'rejected', 'rejected (' || sqlstate || ')', true);
  end;

  -- 4. NO RENAMING ANOTHER TENANT'S ACCOUNTS.
  update public.chart_of_accounts set name = 'FORGED' where organisation_id = org_b;
  get diagnostics affected = row_count;
  insert into serp075_results values
    ('chart_cross_tenant_update', '0 rows affected', affected || ' rows affected', affected = 0);

  update public.chart_of_accounts set posting_control = 'postable'
   where organisation_id = org_b and posting_control in ('header', 'control', 'system');
  get diagnostics affected = row_count;
  insert into serp075_results values
    ('chart_cross_tenant_unlock_controls', '0 rows affected — cannot open another tenant''s control accounts',
     affected || ' rows affected', affected = 0);

  delete from public.chart_of_accounts where organisation_id = org_b;
  get diagnostics affected = row_count;
  insert into serp075_results values
    ('chart_cross_tenant_delete', '0 rows affected', affected || ' rows affected', affected = 0);

  -- 5. PERIODS ARE TENANT-SCOPED.
  select count(*) into n from public.accounting_periods where organisation_id = org_b;
  insert into serp075_results values
    ('periods_cross_tenant_select', '0 tenant B periods', n || ' tenant B periods', n = 0);

  -- 6. A NEIGHBOUR CANNOT REOPEN A CLOSED PERIOD.
  --    A period lock another tenant can lift is not a lock, and reopening one is
  --    how a closed year quietly acquires new entries.
  update public.accounting_periods set status = 'open'
   where organisation_id = org_b and status = 'closed';
  get diagnostics affected = row_count;
  insert into serp075_results values
    ('periods_cross_tenant_reopen', '0 rows affected — a closed period cannot be reopened by a neighbour',
     affected || ' rows affected', affected = 0);
end $$;

reset role;

-- 7. THE CLASS-RANGE CONSTRAINT IS ENFORCED, NOT CONVENTIONAL.
--    Checked as the owner, because it is a check constraint rather than a policy.
do $$
declare org_a constant uuid := (select id from public.organisations order by id limit 1);
begin
  begin
    insert into public.chart_of_accounts
      (organisation_id, code, name, account_class, subtype, level, posting_control)
    values (org_a, '2500', 'ASSET IN THE LIABILITY RANGE', 'ASSET', 'CURRENT_ASSET', 3, 'postable');
    insert into serp075_results values
      ('class_range_enforced', 'rejected: ASSET must be 1000-1999', 'ACCEPTED — an asset was stored at 2500', false);
  exception when check_violation then
    insert into serp075_results values
      ('class_range_enforced', 'rejected: ASSET must be 1000-1999', 'rejected by check constraint', true);
  end;

  -- 8. AN ACCOUNT CANNOT BE ITS OWN PARENT.
  begin
    insert into public.chart_of_accounts
      (organisation_id, code, name, account_class, subtype, parent_code, level, posting_control)
    values (org_a, '1998', 'SELF PARENTED', 'ASSET', 'CURRENT_ASSET', '1998', 3, 'postable');
    insert into serp075_results values
      ('no_self_parent', 'rejected', 'ACCEPTED — an account is its own parent', false);
  exception when check_violation or foreign_key_violation then
    insert into serp075_results values ('no_self_parent', 'rejected', 'rejected by constraint', true);
  end;

  -- 9. A DUPLICATE CODE WITHIN ONE TENANT IS REFUSED.
  begin
    insert into public.chart_of_accounts
      (organisation_id, code, name, account_class, subtype, level, posting_control)
    values (org_a, '1111', 'DUPLICATE BANK', 'ASSET', 'BANK_AND_CASH', 3, 'postable');
    insert into serp075_results values
      ('no_duplicate_code_per_tenant', 'rejected by unique constraint', 'ACCEPTED — two accounts share a code', false);
  exception when unique_violation then
    insert into serp075_results values
      ('no_duplicate_code_per_tenant', 'rejected by unique constraint', 'rejected by unique constraint', true);
  end;
end $$;

table serp075_results;

do $$
declare failures text;
begin
  select string_agg(scenario || ' => ' || actual, E'\n' order by scenario)
    into failures from serp075_results where not passed;
  if failures is not null then
    raise exception E'SERP-075 CHART AND PERIODS — UNGUARDED:\n%', failures;
  end if;
end $$;

rollback;
