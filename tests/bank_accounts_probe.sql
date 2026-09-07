-- =============================================================================
-- Test Probe: tests/bank_accounts_probe.sql
-- SERP-165: Bank Accounts as First-Class Entities SQL Probe (Amendment A4)
-- =============================================================================

begin;

create temp table probe_results (
  test_name text not null,
  passed boolean not null,
  detail text
);

do $$
declare
  ci_org uuid := '20000000-0000-4000-8000-000000000001';
  st_org uuid := '10000000-0000-4000-8000-000000000001';
  ci_acc_count integer;
  st_acc_count integer;
  bml_col_exists boolean;
  eur_acc uuid;
begin
  -- ---------------------------------------------------------------------------
  -- Suite 1: Verify Seed Accounts Count
  -- ---------------------------------------------------------------------------
  select count(*) into ci_acc_count from public.bank_accounts where organisation_id = ci_org;
  select count(*) into st_acc_count from public.bank_accounts where organisation_id = st_org;

  if ci_acc_count = 3 and st_acc_count = 2 then
    insert into probe_results values ('seed_bank_accounts', true, 'CI has 3 accounts (cash, petty cash, operating), ST has 2 accounts');
  else
    insert into probe_results values ('seed_bank_accounts', false, 'Expected 3 CI and 2 ST accounts, found ' || ci_acc_count || ' and ' || st_acc_count);
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 2: Cash & Petty Cash as First-Class Accounts
  -- ---------------------------------------------------------------------------
  if exists (
    select 1 from public.bank_accounts
     where organisation_id = ci_org and account_type = 'cash_drawer'
  ) and exists (
    select 1 from public.bank_accounts
     where organisation_id = ci_org and account_type = 'petty_cash'
  ) then
    insert into probe_results values ('cash_and_petty_cash_accounts', true, 'Cash drawer and petty cash modeled as first-class bank_accounts');
  else
    insert into probe_results values ('cash_and_petty_cash_accounts', false, 'Cash or petty cash account missing');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 3: Multi-Currency Support (USD, EUR, SGD, AED without migrations)
  -- ---------------------------------------------------------------------------
  insert into public.bank_accounts (
    organisation_id, institution_code, institution_name, account_name,
    account_type, currency, gl_account_code
  ) values (
    ci_org, 'BML', 'Bank of Maldives', 'Import Settlement EUR',
    'treasury', 'EUR', '1035'
  ) returning id into eur_acc;

  if eur_acc is not null then
    insert into probe_results values ('multi_currency_support', true, 'Added EUR treasury account without schema migration');
  else
    insert into probe_results values ('multi_currency_support', false, 'Failed to insert EUR account');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 4: No Bank-Named Columns on Organisations
  -- ---------------------------------------------------------------------------
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'organisations'
       and column_name in ('bml_account', 'mib_account', 'bmlaccount', 'mibaccount')
  ) into bml_col_exists;

  if not bml_col_exists then
    insert into probe_results values ('no_bank_named_columns', true, 'organisations table contains zero bank-named columns');
  else
    insert into probe_results values ('no_bank_named_columns', false, 'Found hardcoded bank columns on organisations table');
  end if;

end $$;

select
  case when count(*) = 4 and bool_and(passed)
    then 'BANK ACCOUNTS SQL PROBE: ALL 4 SUITES PASSED'
    else 'BANK ACCOUNTS SQL PROBE: FAIL'
  end as probe_result
from probe_results;

select test_name, passed, detail from probe_results order by test_name;

rollback;
