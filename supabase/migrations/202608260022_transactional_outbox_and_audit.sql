begin;

-- =============================================================================
-- Migration: 202608260022_transactional_outbox_and_audit.sql
-- SERP-034: Append-only audit, transactional outbox and exception foundation (M0 main base)
--
-- Delivers transactional outbox and append-only event persistence guarantees
-- ensuring business mutations and attributable event records commit together.
-- =============================================================================

-- 1. Create transactional_outbox table
create table if not exists public.transactional_outbox (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null,
  headers jsonb not null default '{}'::jsonb,
  actor_person_id uuid references public.persons(id),
  acting_seat text references public.seats(code),
  status text not null default 'pending' check (status in ('pending', 'published', 'failed', 'dead_letter')),
  retry_count integer not null default 0 check (retry_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (organisation_id, id)
);

-- 2. Row Level Security
alter table public.transactional_outbox enable row level security;
alter table public.transactional_outbox force row level security;

create policy transactional_outbox_current on public.transactional_outbox
  for all using (organisation_id = app_private.current_organisation_id());

-- 3. Append-Only / Immutability Protection for Outbox Payload
create or replace function app_private.prevent_outbox_payload_mutation()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'ERR_IMMUTABLE_OUTBOX: transactional_outbox entries cannot be deleted';
  elsif TG_OP = 'UPDATE' then
    if OLD.payload is distinct from NEW.payload
       or OLD.aggregate_id is distinct from NEW.aggregate_id
       or OLD.aggregate_type is distinct from NEW.aggregate_type
       or OLD.event_type is distinct from NEW.event_type
       or OLD.organisation_id is distinct from NEW.organisation_id
       or OLD.actor_person_id is distinct from NEW.actor_person_id
       or OLD.acting_seat is distinct from NEW.acting_seat
       or OLD.created_at is distinct from NEW.created_at then
      raise exception 'ERR_IMMUTABLE_OUTBOX: transactional_outbox core payload and metadata cannot be modified';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_transactional_outbox_immutability
before update or delete on public.transactional_outbox
for each row execute function app_private.prevent_outbox_payload_mutation();

-- 4. Function: Write Outbox Event atomically
create or replace function app_private.append_outbox_event(
  target_org uuid,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id text,
  p_payload jsonb,
  p_headers jsonb default '{}'::jsonb,
  p_actor uuid default null,
  p_seat text default null
)
returns uuid language plpgsql security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  v_outbox_id uuid;
begin
  insert into public.transactional_outbox (
    organisation_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    headers,
    actor_person_id,
    acting_seat,
    status
  ) values (
    target_org,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    p_payload,
    p_headers,
    p_actor,
    p_seat,
    'pending'
  ) returning id into v_outbox_id;

  return v_outbox_id;
end;
$$;

commit;
