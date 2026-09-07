begin;

-- =============================================================================
-- Migration: 202608290031_payment_provider_registry.sql
-- SERP-351 / SERP-349 — Payment provider registry and capability model
--
-- Doctrine (Founder-approved 29 Aug 2026):
--   Payment Core owns the provider conversation. starqERP owns the money.
--
-- This table is a REGISTRY, not a ledger. It holds no balances and no
-- transactions. It records which payment providers exist, what each can
-- actually do, and — critically — whether its behaviour has been documented
-- by the bank yet.
--
-- Why it is a table and not a code constant: a provider's capabilities change
-- when a bank publishes a spec or enables a feature on a merchant account.
-- That is data, and it must be auditable and environment-specific rather than
-- requiring a deploy.
--
-- BANK_SPEC_REQUIRED is the safety property. BML and MIB register and compile,
-- but every operation refuses until real specifications exist. Nothing about
-- either bank's API is invented anywhere in this system.
-- =============================================================================

-- 1. Provider registry -------------------------------------------------------

create table public.payment_providers (
  id text primary key check (id in ('MOCK', 'BML', 'MIB')),
  display_name text not null,

  -- Whether the adapter can execute at all. Only MOCK is executable until a
  -- bank supplies specifications. This is not a feature flag: it is a
  -- statement of whether we know how to talk to the provider.
  is_executable boolean not null default false,

  -- 'IMPLEMENTED' or 'BANK_SPEC_REQUIRED'. When BANK_SPEC_REQUIRED, the
  -- adapter must raise rather than guess, and production credentials cannot
  -- be selected (enforced below).
  spec_status text not null default 'BANK_SPEC_REQUIRED'
    check (spec_status in ('IMPLEMENTED', 'BANK_SPEC_REQUIRED')),

  -- Declared capabilities. The ERP must never offer a customer an operation
  -- the provider cannot perform.
  supports_hosted_checkout boolean not null default false,
  supports_refunds boolean not null default false,
  supports_partial_refunds boolean not null default false,
  supports_webhooks boolean not null default false,
  supports_settlement_reports boolean not null default false,

  -- ISO 4217 codes this provider will accept.
  currencies character(3)[] not null default '{}',

  -- What is still missing from the bank, in the provider's own terms. Present
  -- so the gap is visible in the product rather than only in a document.
  bank_spec_gaps text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An executable provider must have a documented spec. Prevents a provider
  -- being switched on while its behaviour is still guesswork.
  constraint payment_providers_executable_requires_spec
    check (not is_executable or spec_status = 'IMPLEMENTED')
);

comment on table public.payment_providers is
  'Payment provider registry and capability model. Holds no financial data. '
  'BANK_SPEC_REQUIRED providers register and compile but refuse every operation.';

-- 2. Per-environment provider configuration ----------------------------------
-- Configuration is environment-scoped and holds NO secret values. Secrets live
-- in the platform secret store; this table records only their names, so an
-- operator can see what is configured without the values being readable.

create table public.payment_provider_config (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.payment_providers(id),
  environment text not null check (environment in ('sandbox', 'production')),

  base_url text,
  merchant_id text,

  -- NAMES of secrets, never values. A value in this column is a defect.
  credential_secret_name text,
  webhook_secret_name text,

  is_active boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (provider_id, environment)
);

comment on column public.payment_provider_config.credential_secret_name is
  'The NAME of the secret in the platform secret store. Never the value.';

-- 3. Production is gated on the bank having documented its behaviour ---------
-- The check constraint above cannot see across tables, so this trigger closes
-- the remaining path: activating production for a provider whose spec is still
-- BANK_SPEC_REQUIRED.

create or replace function app_private.assert_provider_config_activation()
returns trigger language plpgsql as $$
declare
  prov record;
begin
  if new.is_active is not true then
    return new;
  end if;

  select * into prov from public.payment_providers where id = new.provider_id;

  if prov.id is null then
    raise exception 'unknown payment provider %', new.provider_id;
  end if;

  if new.environment = 'production' and prov.spec_status <> 'IMPLEMENTED' then
    raise exception
      'BANK_SPEC_REQUIRED: cannot activate production configuration for % — '
      'its specification is not yet documented', new.provider_id;
  end if;

  if new.environment = 'production' and prov.is_executable is not true then
    raise exception
      'cannot activate production configuration for % — adapter is not executable',
      new.provider_id;
  end if;

  return new;
end $$;

create trigger payment_provider_config_activation_guard
before insert or update on public.payment_provider_config
for each row execute function app_private.assert_provider_config_activation();

-- 4. Seed --------------------------------------------------------------------
-- MOCK is executable. BML and MIB register with their gaps stated explicitly,
-- so the reason they cannot be used is visible in the data rather than implied
-- by absence.

insert into public.payment_providers (
  id, display_name, is_executable, spec_status,
  supports_hosted_checkout, supports_refunds, supports_partial_refunds,
  supports_webhooks, supports_settlement_reports, currencies, bank_spec_gaps
) values
  ('MOCK', 'Mock Provider (development and test only)',
   true, 'IMPLEMENTED',
   true, true, true, true, true,
   array['MVR', 'USD']::character(3)[],
   '{}'),

  ('BML', 'Bank of Maldives',
   false, 'BANK_SPEC_REQUIRED',
   false, false, false, false, false,
   '{}'::character(3)[],
   array[
     'API base URLs (sandbox and production)',
     'Authentication scheme',
     'Hosted checkout redirect flow',
     'Webhook delivery mechanism, signature format and secret distribution',
     'Transaction status code mapping',
     'Refund API (full and partial)',
     'Settlement timing, file format and delivery',
     'Fee structure and deduction method',
     '3-D Secure / OTP flow',
     'Supported currencies and transaction limits',
     'Sandbox credentials and merchant ID issuance'
   ]),

  ('MIB', 'Maldives Islamic Bank',
   false, 'BANK_SPEC_REQUIRED',
   false, false, false, false, false,
   '{}'::character(3)[],
   array[
     'API base URLs (sandbox and production)',
     'Authentication scheme',
     'Hosted checkout redirect flow',
     'Webhook delivery mechanism, signature format and secret distribution',
     'Transaction status code mapping',
     'Refund API (full and partial)',
     'Settlement timing, file format and delivery',
     'Fee structure and deduction method',
     'Shariah-compliance constraints on the transaction flow',
     'Supported currencies and transaction limits',
     'Sandbox credentials and merchant ID issuance'
   ])
on conflict (id) do nothing;

-- 5. Access ------------------------------------------------------------------
-- The registry is readable by authenticated users (the UI needs to know which
-- payment methods to offer) but writable only through the command boundary.
-- Configuration is not client-readable at all: it names secrets.

alter table public.payment_providers enable row level security;
alter table public.payment_provider_config enable row level security;

create policy payment_providers_read on public.payment_providers
  for select using (true);

-- No policy on payment_provider_config: deny by default, service role only.

revoke all on public.payment_providers from anon, authenticated;
revoke all on public.payment_provider_config from anon, authenticated;
grant select on public.payment_providers to authenticated;

commit;
