begin;

-- registry_code is deliberately null here and must stay null in tracked seed data.
--
-- It previously carried the two real company registration numbers as literals. Those match
-- FORBIDDEN_ALWAYS in starqNexus/scripts/check-tier.mjs — a real registry code identifies a real
-- legal person, and DEC-012 keeps that out of anything publishable. It blocked the DEC-089 push
-- until it was removed; see 00_STARQ_HQ/reports/security/2026-08-24_starqERP-pre-push-secret-scan.md
--
-- The column is nullable and nothing in the contract reads it, so a null seed is behaviourally
-- identical. Real registry codes belong to tenant onboarding or an untracked local seed, never here.
insert into public.organisations (id, slug, legal_name, registry_code)
values
  ('29552026-0000-4000-8000-000000000001', 'starq', 'Starq Technologies Pvt Ltd', null),
  ('30222026-0000-4000-8000-000000000001', 'club-ignition', 'Club Ignition Pvt Ltd', null)
on conflict (id) do nothing;

insert into public.business_names (id, organisation_id, registry_code, name, activity_code)
values
  ('29552026-0000-4000-8000-000000000002', '29552026-0000-4000-8000-000000000001', null, 'Starq Dynamics', '8211'),
  ('29552026-0000-4000-8000-000000000003', '29552026-0000-4000-8000-000000000001', null, 'Hoadhaa Network', null),
  ('30222026-0000-4000-8000-000000000002', '30222026-0000-4000-8000-000000000001', null, 'Ignition Ink', '4520')
on conflict (id) do nothing;

insert into public.seats (code, label, description)
values
  ('owner', 'Owner', 'Organisation owner'),
  ('managing_director', 'Managing Director', 'Managing director seat'),
  ('director', 'Director', 'Director seat'),
  ('counter', 'Counter', 'Garage call, booking and intake'),
  ('technician', 'Technician', 'Garage work execution'),
  ('qc_signer', 'QC signer', 'Independent quality sign-off'),
  ('financial_controller', 'Financial controller', 'Award and matching control'),
  ('payer', 'Payer', 'Payment release control')
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  active = true;

create table public.document_sequences (
  organisation_id uuid not null references public.organisations(id),
  sequence_type text not null,
  next_value bigint not null default 1 check (next_value > 0),
  prefix text not null,
  padding integer not null default 4 check (padding between 1 and 12),
  primary key (organisation_id, sequence_type)
);

insert into public.document_sequences (organisation_id, sequence_type, prefix, padding)
values ('30222026-0000-4000-8000-000000000001', 'garage_job', 'CI-JOB-', 4)
on conflict (organisation_id, sequence_type) do nothing;

create or replace function app_private.allocate_document_no(target_org uuid, target_type text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  current_value bigint;
  current_prefix text;
  current_padding integer;
begin
  update public.document_sequences
     set next_value = next_value + 1
   where organisation_id = target_org and sequence_type = target_type
   returning next_value - 1, prefix, padding
        into current_value, current_prefix, current_padding;
  if not found then
    raise exception 'unknown document sequence % for organisation %', target_type, target_org;
  end if;
  return current_prefix || lpad(current_value::text, current_padding, '0');
end
$$;

create table public.security_events (
  id bigint generated always as identity primary key,
  organisation_id uuid references public.organisations(id),
  principal_kind text not null check (principal_kind in ('anonymous', 'human', 'automation', 'service')),
  principal_ref text,
  event_type text not null,
  outcome text not null check (outcome in ('accepted', 'rejected', 'blocked', 'error')),
  request_id uuid,
  source_hash text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create trigger security_events_append_only
before update or delete on public.security_events
for each row execute function app_private.reject_mutation();

create table public.automation_principals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  principal_key text not null,
  display_label text not null,
  status text not null default 'disabled' check (status in ('disabled', 'active', 'revoked')),
  credential_fingerprint text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (organisation_id, principal_key),
  check (expires_at is null or expires_at > created_at)
);

create table public.automation_capability_grants (
  id uuid primary key default gen_random_uuid(),
  automation_principal_id uuid not null references public.automation_principals(id) on delete cascade,
  capability text not null,
  maximum_amount numeric(20, 6),
  requires_human_approval boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_to timestamptz not null,
  created_at timestamptz not null default now(),
  unique (automation_principal_id, capability, valid_from),
  check (maximum_amount is null or maximum_amount >= 0),
  check (valid_to > valid_from)
);

create table public.command_approvals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  automation_principal_id uuid references public.automation_principals(id),
  command_type text not null,
  command_hash text not null check (command_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'consumed')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_by uuid references public.persons(id),
  decided_at timestamptz,
  consumed_at timestamptz,
  unique (organisation_id, command_hash),
  check (expires_at > requested_at),
  check ((status in ('approved', 'rejected') and decided_by is not null and decided_at is not null)
      or status not in ('approved', 'rejected'))
);

alter table public.document_sequences enable row level security;
alter table public.security_events enable row level security;
alter table public.automation_principals enable row level security;
alter table public.automation_capability_grants enable row level security;
alter table public.command_approvals enable row level security;

create policy document_sequences_current on public.document_sequences
  using (app_private.has_organisation_access(organisation_id));
create policy security_events_current on public.security_events
  using (organisation_id is not null and app_private.has_organisation_access(organisation_id));
create policy automation_principals_current on public.automation_principals
  using (app_private.has_organisation_access(organisation_id));
create policy command_approvals_current on public.command_approvals
  using (app_private.has_organisation_access(organisation_id));

revoke all on public.document_sequences, public.security_events,
  public.automation_principals, public.automation_capability_grants,
  public.command_approvals from anon, authenticated;

revoke all on function app_private.allocate_document_no(uuid, text) from public, anon, authenticated;
grant execute on function app_private.allocate_document_no(uuid, text) to service_role;

commit;
