begin;

-- =============================================================================
-- Migration: 202608300035_chart_of_accounts_as_data.sql
-- SERP-344 — Accounts become data.
--
-- Until now the Chart of Accounts existed only as a TypeScript constant rendered
-- in the browser, and public.journal_lines.account_code was 'text not null' with
-- NO foreign key: the database accepted any string as an account. Every posting
-- control the accountant audit asked for -- headers reject direct journals, AR
-- and AP and inventory and tax controls reject manual posting -- had no layer in
-- which it could be expressed.
--
-- This migration makes the chart a first-class, tenant-scoped table, constrains
-- journal_lines against it, and turns posting control into a column rather than
-- a UI flag.
--
-- AUTHORITY: docs/specs/CHART_OF_ACCOUNTS_SPECIFICATION.md v1.1.
-- If this migration and that document disagree, the document wins.
-- =============================================================================

-- 1. The table --------------------------------------------------------------
create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  code text not null check (code ~ '^[1-6][0-9]{3}$'),
  name text not null,
  account_class text not null check (account_class in ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  subtype text not null,
  parent_code text,
  level integer not null check (level between 0 and 4),
  currency text not null default 'MVR' check (currency in ('MVR','USD','MULTI')),
  posting_control text not null default 'postable'
    check (posting_control in ('header','control','system','postable','archived')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  description text,
  created_at timestamptz not null default now(),
  unique (organisation_id, code),
  unique (organisation_id, id),
  -- the class range is enforced, not conventional: 1=asset .. 5/6=expense
  check (
    (account_class = 'ASSET'     and code >= '1000' and code <= '1999') or
    (account_class = 'LIABILITY' and code >= '2000' and code <= '2999') or
    (account_class = 'EQUITY'    and code >= '3000' and code <= '3999') or
    (account_class = 'REVENUE'   and code >= '4000' and code <= '4999') or
    (account_class = 'EXPENSE'   and code >= '5000' and code <= '6999')
  ),
  -- an account cannot be its own parent
  check (parent_code is null or parent_code <> code),
  foreign key (organisation_id, parent_code)
    references public.chart_of_accounts(organisation_id, code)
    deferrable initially deferred
);

comment on table public.chart_of_accounts is
  'Canonical Chart of Accounts. Authority: docs/specs/CHART_OF_ACCOUNTS_SPECIFICATION.md v1.1.';
comment on column public.chart_of_accounts.posting_control is
  'header = grouping, rejects all journals. control = subledger-owned, rejects manual journals. '
  'system = written by a defined process only. postable = ordinary. archived = retired.';

create index chart_of_accounts_org_class on public.chart_of_accounts (organisation_id, account_class);
create index chart_of_accounts_org_parent on public.chart_of_accounts (organisation_id, parent_code);

-- 2. Seed the canonical 55 for every existing organisation ------------------
insert into public.chart_of_accounts
  (organisation_id, code, name, account_class, subtype, parent_code, level, currency, posting_control, description)
select o.id, s.code, s.name, s.account_class, s.subtype, s.parent_code, s.level, s.currency, s.posting_control, s.description
from public.organisations o
cross join (values
  ('1000', 'Assets', 'ASSET', 'CURRENT_ASSET', null, 0, 'MULTI', 'header', 'Top-level asset category encompassing all company economic resources.'),
  ('1100', 'Current Assets', 'ASSET', 'CURRENT_ASSET', '1000', 1, 'MULTI', 'header', 'Cash, bank balances, receivables, inventory, and short-term resources.'),
  ('1110', 'Cash and Bank Equivalents', 'ASSET', 'BANK_AND_CASH', '1100', 2, 'MULTI', 'header', 'Operational bank accounts and physical cash funds.'),
  ('1111', 'Bank of Maldives (BML) MVR Main', 'ASSET', 'BANK_AND_CASH', '1110', 3, 'MVR', 'postable', 'Primary Bank of Maldives operational checking account in MVR.'),
  ('1112', 'Bank of Maldives (BML) USD Account', 'ASSET', 'BANK_AND_CASH', '1110', 3, 'USD', 'postable', 'Foreign currency Bank of Maldives account for international trade.'),
  ('1113', 'Maldives Islamic Bank (MIB) MVR Account', 'ASSET', 'BANK_AND_CASH', '1110', 3, 'MVR', 'postable', 'Maldives Islamic Bank business checking account.'),
  ('1114', 'Petty Cash Fund', 'ASSET', 'BANK_AND_CASH', '1110', 3, 'MVR', 'postable', 'Physical workshop and cashier drawer cash on hand.'),
  ('1115', 'Favara Instant Gateway Clearing', 'ASSET', 'BANK_AND_CASH', '1110', 3, 'MVR', 'control', 'Favara instant national payment gateway in-transit settlements.'),
  ('1200', 'Accounts Receivable', 'ASSET', 'ACCOUNTS_RECEIVABLE', '1100', 2, 'MULTI', 'header', 'Amounts owed by customers for delivered goods and services.'),
  ('1210', 'Trade Debtors Control Account', 'ASSET', 'ACCOUNTS_RECEIVABLE', '1200', 3, 'MVR', 'control', 'General ledger control account for all unpaid customer sales invoices.'),
  ('1300', 'Inventory and Stock Assets', 'ASSET', 'INVENTORY', '1100', 2, 'MVR', 'header', 'Physical stock held for resale, spare parts, and transit items.'),
  ('1310', 'Merchandise & Spare Parts Inventory', 'ASSET', 'INVENTORY', '1300', 3, 'MVR', 'control', 'On-hand inventory valuation under perpetual moving-average method.'),
  ('1320', 'Goods in Transit (Sea Freight & Clearing)', 'ASSET', 'INVENTORY', '1300', 3, 'MVR', 'postable', 'Imported containers and dhoni shipments currently in transit.'),
  ('1330', 'Work-in-Progress (WIP)', 'ASSET', 'INVENTORY', '1300', 3, 'MVR', 'control', 'Jobs and production started but not complete. Absorbs direct labour and overhead; relieved to COGS on completion.'),
  ('1400', 'Statutory Tax Receivables', 'ASSET', 'INPUT_TAX_RECOVERABLE', '1100', 2, 'MVR', 'header', 'Amounts recoverable from MIRA. Grouping only; balances sit on the children.'),
  ('1410', 'Input GST Recoverable (MIRA)', 'ASSET', 'INPUT_TAX_RECOVERABLE', '1400', 3, 'MVR', 'control', 'GST incurred on qualifying business purchases and claimable as input tax. Reported gross on GST-201 and settled net against output GST; never netted into a single opaque balance.'),
  ('1500', 'Fixed Assets (Property, Plant & Equipment)', 'ASSET', 'FIXED_ASSET', '1000', 1, 'MVR', 'header', 'Long-term physical operational equipment, vehicles, and facilities.'),
  ('1510', 'Workshop Machinery & Diagnostic Equipment', 'ASSET', 'FIXED_ASSET', '1500', 2, 'MVR', 'postable', 'Lifts, diagnostic scanners, compressors, and specialized workshop tools.'),
  ('1590', 'Accumulated Depreciation - Fixed Assets', 'ASSET', 'ACCUMULATED_DEPRECIATION', '1500', 2, 'MVR', 'system', 'Contra-asset account tracking cumulative fixed asset depreciation.'),
  ('2000', 'Liabilities', 'LIABILITY', 'CURRENT_LIABILITY', null, 0, 'MULTI', 'header', 'Company financial obligations to suppliers, tax authorities, and lenders.'),
  ('2100', 'Current Liabilities', 'LIABILITY', 'CURRENT_LIABILITY', '2000', 1, 'MULTI', 'header', 'Obligations due within one year or normal business operating cycle.'),
  ('2110', 'Accounts Payable (Trade Creditors)', 'LIABILITY', 'ACCOUNTS_PAYABLE', '2100', 2, 'MULTI', 'control', 'Amounts owed to suppliers for purchased inventory and services.'),
  ('2120', 'MIRA Tax & Statutory Payables', 'LIABILITY', 'TAX_PAYABLE', '2100', 2, 'MVR', 'header', 'Statutory tax collections owed to Maldives Inland Revenue Authority.'),
  ('2121', 'MIRA Output GST Payable (8%)', 'LIABILITY', 'TAX_PAYABLE', '2120', 3, 'MVR', 'control', 'General goods and services tax collected on customer sales.'),
  ('2122', 'MIRA Tourism GST (TGST 16%)', 'LIABILITY', 'TAX_PAYABLE', '2120', 3, 'MVR', 'control', 'Tourism sector GST applicable to resort and marine tourist contracts.'),
  ('2123', 'MIRA Green Tax Payable', 'LIABILITY', 'TAX_PAYABLE', '2120', 3, 'MVR', 'control', 'Per-guest-night environmental levy collected and owed to MIRA.'),
  ('2124', 'MIRA Employee Withholding Tax (EWT) Payable', 'LIABILITY', 'WITHHOLDING_TAX_PAYABLE', '2120', 3, 'MVR', 'control', 'Employee withholding tax deducted from remuneration and owed to MIRA. Payroll-generated only. No rate is encoded in this account.'),
  ('2125', 'MIRA Non-resident Withholding Tax (NWT) Payable', 'LIABILITY', 'WITHHOLDING_TAX_PAYABLE', '2120', 3, 'MVR', 'control', 'Withholding tax on specified payments to non-residents, owed to MIRA. Rate varies by payment category, so no rate is encoded here.'),
  ('2126', 'MIRA Income Tax Payable', 'LIABILITY', 'TAX_PAYABLE', '2120', 3, 'MVR', 'control', 'Current income tax liability owed to MIRA. Written by the tax provision, never by hand.'),
  ('2130', 'MPAO / MRPS Pension Contributions Payable', 'LIABILITY', 'PENSION_PAYABLE', '2100', 2, 'MVR', 'control', 'Employee and employer statutory 7% pension deductions.'),
  ('2140', 'Net Salaries & Wages Payable', 'LIABILITY', 'ACCRUED_EXPENSES', '2100', 2, 'MVR', 'control', 'Net pay owed to staff after statutory deductions, until disbursed.'),
  ('2150', 'Customer Advances & Deposits', 'LIABILITY', 'CURRENT_LIABILITY', '2100', 2, 'MVR', 'control', 'Money received before delivery. A liability until earned; never recognised as revenue on receipt.'),
  ('3000', 'Equity', 'EQUITY', 'OWNERS_EQUITY', null, 0, 'MVR', 'header', 'Owner/shareholder residual interest in the assets of the company.'),
  ('3100', 'Owner''s Capital & Share Capital', 'EQUITY', 'OWNERS_EQUITY', '3000', 1, 'MVR', 'postable', 'Contributed equity capital by the founding partners/shareholders.'),
  ('3200', 'Retained Earnings', 'EQUITY', 'RETAINED_EARNINGS', '3000', 1, 'MVR', 'system', 'Cumulative net earnings retained in the business from prior periods.'),
  ('4000', 'Revenue', 'REVENUE', 'OPERATING_REVENUE', null, 0, 'MULTI', 'header', 'Gross inflows of economic benefits arising in the course of ordinary activities.'),
  ('4110', 'Workshop & Job Labor Revenue', 'REVENUE', 'SERVICE_REVENUE', '4000', 1, 'MVR', 'postable', 'Billed service labor and technician diagnostic fees.'),
  ('4120', 'Spare Parts & Merchandise Sales', 'REVENUE', 'SALES_REVENUE', '4000', 1, 'MVR', 'postable', 'Revenue from sales of inventory, filters, oils, and replacement parts.'),
  ('4210', 'Sales Discounts Given', 'REVENUE', 'DISCOUNT_GIVEN', '4000', 1, 'MVR', 'postable', 'Contra-revenue account for promotional and customer volume rebates.'),
  ('4310', 'Realized Foreign Exchange Gain', 'REVENUE', 'OTHER_INCOME', '4000', 1, 'MVR', 'system', 'Settlement-date gain on a foreign-currency receivable or payable. Written by the settlement engine.'),
  ('5000', 'Cost of Goods Sold (COGS)', 'EXPENSE', 'COST_OF_GOODS_SOLD', null, 0, 'MVR', 'header', 'Direct costs attributable to the production and supply of sold inventory.'),
  ('5110', 'Cost of Parts & Materials Consumed', 'EXPENSE', 'COST_OF_GOODS_SOLD', '5000', 1, 'MVR', 'control', 'Cost of inventory items expensed upon customer invoice fulfillment.'),
  ('5210', 'Import Customs Duties & Port Charges', 'EXPENSE', 'COST_OF_GOODS_SOLD', '5000', 1, 'MVR', 'postable', 'Maldives Customs Service clearing tariffs and Male Commercial Port fees.'),
  ('5220', 'Manufacturing Scrap & Waste', 'EXPENSE', 'COST_OF_GOODS_SOLD', '5000', 1, 'MVR', 'postable', 'Production loss written off to cost of sales.'),
  ('5230', 'Factory Overhead Absorbed', 'EXPENSE', 'COST_OF_GOODS_SOLD', '5000', 1, 'MVR', 'system', 'Overhead applied to work-in-progress at the standard absorption rate.'),
  ('5240', 'Direct Labor Absorbed', 'EXPENSE', 'COST_OF_GOODS_SOLD', '5000', 1, 'MVR', 'system', 'Technician time charged to work-in-progress. Cost of production, not administrative payroll.'),
  ('6000', 'Operating Expenses', 'EXPENSE', 'OPERATING_EXPENSE', null, 0, 'MVR', 'header', 'General administrative, rent, payroll, and operational overhead.'),
  ('6110', 'Staff Base Salaries & Allowances', 'EXPENSE', 'PAYROLL_EXPENSE', '6000', 1, 'MVR', 'postable', 'Monthly payroll, food allowances, and overtime compensation.'),
  ('6120', 'Employer Pension Contribution (MRPS 7%)', 'EXPENSE', 'PAYROLL_EXPENSE', '6000', 1, 'MVR', 'postable', 'Employer''s 7% MRPS contribution. An expense, distinct from the employee''s 7% deduction.'),
  ('6210', 'Workshop & Garage Rent', 'EXPENSE', 'RENT_AND_LEASE', '6000', 1, 'MVR', 'postable', 'Facility lease for workshop bays, offices, and storage yards.'),
  ('6220', 'Electricity, Water & Utilities', 'EXPENSE', 'UTILITIES', '6000', 1, 'MVR', 'postable', 'Power, water, and waste utility expenses.'),
  ('6310', 'Bank & Merchant Gateway Fees', 'EXPENSE', 'BANK_FEES_AND_CHARGES', '6000', 1, 'MVR', 'postable', 'Merchant acquiring discount rate and Favara transfer transaction fees.'),
  ('6410', 'Realized Foreign Exchange Loss', 'EXPENSE', 'OPERATING_EXPENSE', '6000', 1, 'MVR', 'system', 'Settlement-date loss on a foreign-currency receivable or payable. Counterpart to 4310.'),
  ('6910', 'Depreciation Expense - Workshop Equipment', 'EXPENSE', 'DEPRECIATION_EXPENSE', '6000', 1, 'MVR', 'system', 'Period straight-line depreciation allocation for capital equipment.'),
  ('6920', 'Current Income Tax Expense', 'EXPENSE', 'TAX_EXPENSE', '6000', 1, 'MVR', 'system', 'Income tax charge for the period. Counterpart to 2126; tax computation lives outside the chart.')
) as s(code, name, account_class, subtype, parent_code, level, currency, posting_control, description);

-- Parents and children arrive in one statement, so the parent FK is deferred above.
-- Settle it here: the hierarchy must be whole before anything else touches the table.
set constraints all immediate;

-- 3. Constrain journal_lines against the chart ------------------------------
-- Fail LOUDLY rather than silently dropping or coercing anything. A posted line
-- referencing an account that does not exist is exactly the defect SERP-340
-- fixed in the client; if any survive here, a human must rule on them.
do $$
declare
  orphan record;
  n integer := 0;
begin
  for orphan in
    select jl.organisation_id, jl.account_code, count(*) as lines
      from public.journal_lines jl
      left join public.chart_of_accounts coa
        on coa.organisation_id = jl.organisation_id and coa.code = jl.account_code
     where coa.code is null
     group by jl.organisation_id, jl.account_code
  loop
    n := n + 1;
    raise warning 'journal_lines references unknown account % (org %, % lines)',
      orphan.account_code, orphan.organisation_id, orphan.lines;
  end loop;
  if n > 0 then
    raise exception 'SERP-344: % account code(s) posted to but absent from the chart. '
      'Resolve each before constraining the ledger; do not delete posted history.', n;
  end if;
end
$$;

alter table public.journal_lines
  add constraint journal_lines_account_fk
  foreign key (organisation_id, account_code)
  references public.chart_of_accounts (organisation_id, code);

-- 4. Posting control, enforced in the database ------------------------------
create or replace function app_private.enforce_posting_control()
returns trigger language plpgsql
security definer
set search_path = public, app_private, pg_temp as $$
declare
  ctl text;
  nm  text;
begin
  select posting_control, name into ctl, nm
    from public.chart_of_accounts
   where organisation_id = new.organisation_id and code = new.account_code;

  if ctl is null then
    raise exception 'account % does not exist in the chart', new.account_code;
  end if;

  if ctl = 'header' then
    raise exception 'account % (%) is a header and holds no balance; post to one of its children',
      new.account_code, nm;
  end if;

  if ctl = 'archived' then
    raise exception 'account % (%) is archived and cannot receive new postings', new.account_code, nm;
  end if;

  -- Control and system accounts are reachable only by their owning engine, which
  -- runs as service_role.
  --
  -- NOTE: 'postgres' is deliberately NOT exempt. An earlier draft of this trigger
  -- exempted the superuser so that migrations could seed freely, and the result was
  -- that the control could not be proven at all -- every test ran as postgres and
  -- every control account accepted a manual line. That is the same defect as running
  -- an RLS probe as superuser: the guard is present and never exercised. A migration
  -- that genuinely needs to seed a control account must disable this trigger
  -- explicitly, which is visible in the migration and auditable afterwards.
  if ctl in ('control', 'system') and current_user <> 'service_role' then
    raise exception
      'account % (%) is a % account; it is written by its owning process, not by manual journal',
      new.account_code, nm, ctl;
  end if;

  return new;
end
$$;

create trigger journal_lines_posting_control
before insert or update on public.journal_lines
for each row execute function app_private.enforce_posting_control();

-- 5. Correct stale GL references left by earlier migrations -----------------
-- 202608250018 seeded bank_accounts.gl_account_code with 1010/1020/1030, which
-- were the ad-hoc posting-engine codes retired by SERP-340. They are not in the
-- canonical chart and would dangle.
update public.bank_accounts set gl_account_code = '1114' where gl_account_code = '1010' and account_type = 'cash_drawer';
update public.bank_accounts set gl_account_code = '1114' where gl_account_code = '1020' and account_type = 'petty_cash';
update public.bank_accounts set gl_account_code = '1111' where gl_account_code in ('1010','1030') and account_type = 'operating';
update public.bank_accounts set gl_account_code = '1112' where gl_account_code = '1040';
update public.bank_accounts set gl_account_code = null
 where gl_account_code is not null
   and gl_account_code not in (select code from public.chart_of_accounts);

-- 6. Row-level security ------------------------------------------------------
alter table public.chart_of_accounts enable row level security;

create policy chart_of_accounts_tenant on public.chart_of_accounts
for select to public
using (organisation_id = app_private.current_organisation_id());

revoke all on public.chart_of_accounts from public, anon;
grant select on public.chart_of_accounts to authenticated;
grant all on public.chart_of_accounts to service_role;

commit;
