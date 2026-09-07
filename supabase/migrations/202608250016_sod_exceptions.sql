begin;

-- =============================================================================
-- Migration: 202608250016_sod_exceptions.sql
-- SERP-177: Segregation of Duties Tracked Exceptions & Capacity Derivation (DEC-065)
-- Resolves the solo operator reality by recording immutable audit exceptions
-- rather than hard-blocking or silent pass-throughs.
-- =============================================================================

-- 1. Create sod_exceptions table (Append-Only)
create table public.sod_exceptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  purchase_id uuid not null,
  person_id uuid not null references public.persons(id),
  pair_name text not null,
  step_a text not null,
  step_b text not null,
  step_a_event_id uuid,
  step_b_event_id uuid,
  step_a_timestamp timestamptz not null default now(),
  step_b_timestamp timestamptz not null default now(),
  segregation_capacity text not null check (segregation_capacity in ('solo', 'segregated')),
  disposition text not null default 'open' check (disposition in ('open', 'self_reviewed', 'investigated', 'accepted_with_reason')),
  disposition_by uuid references public.persons(id),
  disposition_at timestamptz,
  disposition_reason text,
  is_self_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organisation_id, id)
);

-- 2. Create sod_exception_dispositions table (Append-Only audit history)
create table public.sod_exception_dispositions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  exception_id uuid not null,
  disposition text not null check (disposition in ('self_reviewed', 'investigated', 'accepted_with_reason')),
  disposed_by uuid not null references public.persons(id),
  reason text not null,
  is_self_review boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (organisation_id, exception_id)
    references public.sod_exceptions(organisation_id, id) on delete cascade
);

-- 3. Append-Only Triggers: Refuse UPDATE and DELETE outright
create or replace function app_private.prevent_sod_exception_mutation()
returns trigger language plpgsql security definer as $$
begin
  raise exception 'ERR_IMMUTABLE_AUDIT: sod_exceptions records cannot be modified or deleted';
end;
$$;

create trigger trg_sod_exceptions_immutable
before update or delete on public.sod_exceptions
for each row execute function app_private.prevent_sod_exception_mutation();

create trigger trg_sod_dispositions_immutable
before update or delete on public.sod_exception_dispositions
for each row execute function app_private.prevent_sod_exception_mutation();

-- 4. Function: Evaluate Organisation Segregation Capacity
-- Derived dynamically from active memberships in the organisation.
create or replace function app_private.evaluate_segregation_capacity(
  target_org uuid,
  counterpart_seat text
)
returns text language plpgsql stable security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  eligible_count integer;
begin
  select count(distinct m.person_id) into eligible_count
    from public.memberships m
    join public.membership_seats ms on ms.membership_id = m.id
   where m.organisation_id = target_org
     and m.status = 'active'
     and ms.seat_code = counterpart_seat
     and ms.revoked_at is null;

  if eligible_count >= 2 then
    return 'segregated';
  else
    return 'solo';
  end if;
end;
$$;

-- 5. Function: Record SoD Exception
create or replace function app_private.record_sod_exception(
  target_org uuid,
  p_purchase_id uuid,
  p_person_id uuid,
  p_pair_name text,
  p_step_a text,
  p_step_b text,
  p_step_a_ts timestamptz,
  p_capacity text
)
returns uuid language plpgsql security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  v_id uuid;
begin
  insert into public.sod_exceptions (
    organisation_id,
    purchase_id,
    person_id,
    pair_name,
    step_a,
    step_b,
    step_a_timestamp,
    step_b_timestamp,
    segregation_capacity,
    disposition,
    is_self_review
  ) values (
    target_org,
    p_purchase_id,
    p_person_id,
    p_pair_name,
    p_step_a,
    p_step_b,
    p_step_a_ts,
    now(),
    p_capacity,
    'open',
    false
  ) returning id into v_id;

  return v_id;
end;
$$;

-- 6. Function: Append SoD Disposition (Honest Self-Review Labelling)
create or replace function app_private.append_sod_disposition(
  target_org uuid,
  p_exception_id uuid,
  p_disposer_id uuid,
  p_disposition text,
  p_reason text
)
returns uuid language plpgsql security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  v_disp_id uuid;
  v_actor_id uuid;
  v_is_self boolean;
begin
  select person_id into v_actor_id
    from public.sod_exceptions
   where organisation_id = target_org and id = p_exception_id;

  if not found then
    raise exception 'sod_exception_not_found';
  end if;

  v_is_self := (v_actor_id = p_disposer_id);

  insert into public.sod_exception_dispositions (
    organisation_id,
    exception_id,
    disposition,
    disposed_by,
    reason,
    is_self_review
  ) values (
    target_org,
    p_exception_id,
    p_disposition,
    p_disposer_id,
    p_reason,
    v_is_self
  ) returning id into v_disp_id;

  return v_disp_id;
end;
$$;

-- 7. Row Level Security on sod_exceptions & dispositions
alter table public.sod_exceptions enable row level security;
alter table public.sod_exception_dispositions enable row level security;

create policy sod_exceptions_tenant on public.sod_exceptions
for select to public
using (organisation_id = app_private.current_organisation_id());

create policy sod_dispositions_tenant on public.sod_exception_dispositions
for select to public
using (organisation_id = app_private.current_organisation_id());

revoke all on public.sod_exceptions, public.sod_exception_dispositions from public, anon;
grant select on public.sod_exceptions, public.sod_exception_dispositions to authenticated;
grant all on public.sod_exceptions, public.sod_exception_dispositions to service_role;

commit;
