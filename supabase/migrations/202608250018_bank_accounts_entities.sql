begin;

-- =============================================================================
-- Migration: 202608250018_bank_accounts_entities.sql
-- SERP-165: Bank Accounts as First-Class Entities & Multi-Currency Support (Amendment A4)
-- Replaces hardcoded bank columns with dynamic organisation-scoped bank accounts,
-- supporting operating, treasury, clearing, cash drawer, and petty cash accounts
-- across open ISO 4217 currencies (MVR, USD, EUR, SGD, AED, GBP, etc.).
-- NO RAW ACCOUNT NUMBERS ARE HARDCODED OR STORED IN MIGRATIONS.
-- =============================================================================

-- 1. Create bank_accounts table
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  institution_code text not null,
  institution_name text not null,
  account_name text not null,
  account_type text not null check (account_type in ('operating', 'treasury', 'clearing', 'pos_settlement', 'cash_drawer', 'petty_cash')),
  account_identifier_mask text,
  currency character(3) not null default 'MVR',
  gl_account_code text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, id)
);

-- 2. Seed Initial Account Placeholders for Club Ignition
-- (Uses synthetic placeholder names; real account numbers are configured in settings)
insert into public.bank_accounts (
  organisation_id, institution_code, institution_name, account_name, account_type,
  account_identifier_mask, currency, gl_account_code, is_default
) values
  ('30222026-0000-4000-8000-000000000001', 'CASH', 'Cash on Hand', 'Workshop Cash Drawer', 'cash_drawer', 'CASH-DRAWER-01', 'MVR', '1010', false),
  ('30222026-0000-4000-8000-000000000001', 'CASH', 'Petty Cash', 'H. Kiev Petty Cash Box', 'petty_cash', 'PETTY-CASH-01', 'MVR', '1020', false),
  ('30222026-0000-4000-8000-000000000001', 'BML',  'Bank of Maldives', 'Primary Operating MVR', 'operating', 'BML-MVR-PENDING', 'MVR', '1030', true);

-- 3. Seed Initial Account Placeholders for Starq Technologies
insert into public.bank_accounts (
  organisation_id, institution_code, institution_name, account_name, account_type,
  account_identifier_mask, currency, gl_account_code, is_default
) values
  ('29552026-0000-4000-8000-000000000001', 'CASH', 'Cash on Hand', 'HQ Cash on Hand', 'cash_drawer', 'CASH-DRAWER-01', 'MVR', '1010', false),
  ('29552026-0000-4000-8000-000000000001', 'BML',  'Bank of Maldives', 'Primary Operating MVR', 'operating', 'BML-MVR-PENDING', 'MVR', '1030', true);

-- 4. Row-Level Security
alter table public.bank_accounts enable row level security;

create policy bank_accounts_tenant on public.bank_accounts
for select to public
using (organisation_id = app_private.current_organisation_id());

revoke all on public.bank_accounts from public, anon;
grant select on public.bank_accounts to authenticated;
grant all on public.bank_accounts to service_role;

commit;
