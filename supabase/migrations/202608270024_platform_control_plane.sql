begin;

-- Platform metadata is deliberately outside tenant execution data. The web client
-- cannot query these tables; a separately authenticated platform service owns them.
create schema if not exists platform;

create table platform.tenant_registry (
  organisation_id uuid primary key references public.organisations(id),
  archetype_id text not null check (archetype_id in (
    'general_business', 'automotive_workshop', 'wholesale_trading',
    'marine_service', 'construction_contracting', 'retail'
  )),
  plan_code text not null default 'trial',
  subscription_status text not null default 'pending'
    check (subscription_status in ('pending', 'trial', 'active', 'past_due', 'cancelled')),
  provisioning_status text not null default 'requested'
    check (provisioning_status in ('requested', 'provisioning', 'ready', 'failed', 'suspended')),
  onboarding_state text not null default 'not_started'
    check (onboarding_state in ('not_started', 'in_progress', 'complete')),
  deployment_version text not null default 'unknown',
  schema_version text not null default 'unknown',
  is_demo boolean not null default false,
  branding jsonb not null default '{}'::jsonb,
  active_seats integer not null default 0 check (active_seats >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform.usage_daily (
  organisation_id uuid not null references public.organisations(id),
  usage_date date not null,
  event_count bigint not null default 0 check (event_count >= 0),
  active_seats integer not null default 0 check (active_seats >= 0),
  api_request_count bigint not null default 0 check (api_request_count >= 0),
  primary key (organisation_id, usage_date)
);

create table platform.operator_principals (
  person_id uuid primary key references public.persons(id),
  operator_role text not null check (operator_role in ('platform_support', 'platform_admin')),
  active boolean not null default true,
  mfa_required boolean not null default true,
  created_at timestamptz not null default now()
);

-- Provisioning is explicit and mode-specific. There is intentionally no reset/wipe command.
create table platform.provisioning_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  mode text not null check (mode in ('clean_production', 'demo_sample')),
  requested_by uuid not null references public.persons(id),
  status text not null default 'requested' check (status in ('requested', 'running', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text
);

-- Platform operators receive aggregate metadata only through an explicit service boundary.
-- No policy here grants access to public tenant tables or bypasses organisation RLS.
revoke all on schema platform from public, anon, authenticated;
revoke all on all tables in schema platform from public, anon, authenticated;
grant usage on schema platform to service_role;
grant select, insert, update on all tables in schema platform to service_role;

commit;
