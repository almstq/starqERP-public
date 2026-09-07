begin;

create extension if not exists pgcrypto;
create schema if not exists app_private;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  legal_name text not null,
  registry_code text unique,
  base_currency character(3) not null default 'MVR',
  business_timezone text not null default 'Indian/Maldives',
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now()
);

create table public.business_names (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  registry_code text,
  name text not null,
  activity_code text,
  status text not null default 'active' check (status in ('active', 'dormant', 'closed')),
  created_at timestamptz not null default now(),
  unique (organisation_id, name),
  unique (organisation_id, registry_code)
);

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  person_key text not null unique,
  external_subject text unique,
  display_label text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'placeholder')),
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id),
  status text not null default 'active' check (status in ('active', 'suspended', 'ended')),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id, person_id),
  check (valid_to is null or valid_to > valid_from)
);

create table public.seats (
  code text primary key,
  label text not null,
  description text not null default '',
  active boolean not null default true
);

create table public.membership_seats (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  seat_code text not null references public.seats(code),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (membership_id, seat_code),
  check (revoked_at is null or revoked_at >= granted_at)
);

create table public.idempotency_keys (
  organisation_id uuid not null references public.organisations(id),
  key uuid not null,
  command_type text not null,
  request_hash text not null,
  state text not null default 'processing' check (state in ('processing', 'accepted', 'rejected', 'unknown')),
  response_code integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (organisation_id, key)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  object_type text not null,
  object_id uuid not null,
  storage_key text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-fA-F]{64}$'),
  media_type text not null,
  byte_length bigint not null check (byte_length >= 0),
  created_by uuid not null references public.persons(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, storage_key)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organisation_id uuid references public.organisations(id),
  actor_person_id uuid references public.persons(id),
  acting_seat text references public.seats(code),
  action text not null,
  object_type text not null,
  object_id uuid,
  request_id uuid,
  occurred_at timestamptz not null default now(),
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create or replace function app_private.current_person_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.person_id', true), '')::uuid
$$;

create or replace function app_private.current_organisation_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.organisation_id', true), '')::uuid
$$;

create or replace function app_private.has_organisation_access(target uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.memberships m
    where m.organisation_id = target
      and m.person_id = app_private.current_person_id()
      and m.status = 'active'
      and m.valid_from <= now()
      and (m.valid_to is null or m.valid_to > now())
  )
  and target = app_private.current_organisation_id()
$$;

create or replace function app_private.reject_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end
$$;

create trigger audit_events_append_only
before update or delete on public.audit_events
for each row execute function app_private.reject_mutation();

alter table public.organisations enable row level security;
alter table public.business_names enable row level security;
alter table public.persons enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_seats enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_events enable row level security;

create policy organisations_current on public.organisations
  using (app_private.has_organisation_access(id));
create policy business_names_current on public.business_names
  using (app_private.has_organisation_access(organisation_id));
create policy memberships_current on public.memberships
  using (app_private.has_organisation_access(organisation_id));
create policy idempotency_current on public.idempotency_keys
  using (app_private.has_organisation_access(organisation_id));
create policy attachments_current on public.attachments
  using (app_private.has_organisation_access(organisation_id));
create policy audit_current on public.audit_events
  using (organisation_id is not null and app_private.has_organisation_access(organisation_id));

revoke all on public.organisations, public.business_names, public.persons,
  public.memberships, public.membership_seats, public.seats,
  public.idempotency_keys, public.attachments, public.audit_events
  from anon, authenticated;

commit;
