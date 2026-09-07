begin;

-- =============================================================================
-- Migration: 202608290033_provider_events.sql
-- SERP-350 / SERP-353 — Provider event ingress and deduplication
--
-- A webhook is NOT a financial event. Receiving one performs exactly four steps
-- and then stops:
--
--     verify signature -> deduplicate -> normalise -> enqueue
--
-- It does not post to the ledger, does not settle, does not activate a
-- subscription, and does not grant entitlement. A forged webhook must be
-- structurally incapable of moving money or opening ERP access, and the only
-- way to guarantee that is to keep the financial decision behind the command
-- boundary where the seat matrix lives.
--
-- DEDUPLICATION IS A DATABASE CONSTRAINT, NOT APPLICATION MEMORY.
-- unique (provider_id, provider_event_id) below is the deduplication. An INSERT
-- that violates it IS the duplicate detection. Two concurrent deliveries of the
-- same event cannot both succeed, regardless of what the application believes.
-- The reviewed reference implementation used an in-memory Map for this, which
-- loses to a second process, a restart, or a concurrent request.
-- =============================================================================

create table public.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.payment_providers(id),

  -- The provider's own event identifier. The unique constraint on
  -- (provider_id, provider_event_id) is the entire deduplication mechanism.
  provider_event_id text not null,

  -- Nullable, and deliberately so: an event may arrive before we can attribute
  -- it to a tenant, or be unattributable (forged, malformed, unknown reference).
  -- Attribution is resolved during normalisation. A NOT NULL here would force
  -- the ingress to guess a tenant, which is how cross-tenant leaks begin.
  organisation_id uuid references public.organisations(id),

  -- Signature verification result, recorded before anything else is decided.
  signature_verified boolean not null default false,

  -- The raw body, byte-for-byte as received. Retained verbatim because it is
  -- dispute evidence and because re-deriving it later would be reconstruction,
  -- not evidence. Never edited.
  raw_payload text not null,

  received_at timestamptz not null default now(),

  processing_state text not null default 'received'
    check (processing_state in ('received', 'normalised', 'consumed', 'rejected')),
  rejection_reason text,

  -- Set when a command has consumed this event and produced a financial effect.
  -- Its presence is the proof that the event was acted on exactly once.
  consumed_by_command_id uuid,
  consumed_at timestamptz,

  -- THE DEDUPLICATION.
  unique (provider_id, provider_event_id),

  unique (organisation_id, id),

  constraint provider_events_rejected_has_reason
    check ((processing_state = 'rejected') = (rejection_reason is not null)),

  constraint provider_events_consumed_is_timestamped
    check ((processing_state = 'consumed') = (consumed_at is not null))
);

create index provider_events_unconsumed_idx
  on public.provider_events (provider_id, received_at)
  where processing_state in ('received', 'normalised');

create index provider_events_org_idx
  on public.provider_events (organisation_id)
  where organisation_id is not null;

comment on table public.provider_events is
  'Raw provider webhook ingress. Not a financial record. Deduplication is the '
  'unique (provider_id, provider_event_id) constraint, not application logic.';

comment on column public.provider_events.raw_payload is
  'Byte-for-byte as received. Dispute evidence. Never edited, never re-derived.';

-- The raw payload is immutable once written. Everything else about an event may
-- progress; the evidence may not change under us.
create or replace function app_private.prevent_provider_event_payload_mutation()
returns trigger language plpgsql as $$
begin
  if new.raw_payload is distinct from old.raw_payload then
    raise exception 'provider_events.raw_payload is immutable (event %)', old.id;
  end if;
  if new.provider_event_id is distinct from old.provider_event_id
     or new.provider_id is distinct from old.provider_id then
    raise exception 'provider event identity is immutable (event %)', old.id;
  end if;
  return new;
end $$;

create trigger provider_events_payload_immutable
before update on public.provider_events
for each row execute function app_private.prevent_provider_event_payload_mutation();

create trigger provider_events_no_delete
before delete on public.provider_events
for each row execute function app_private.reject_mutation();

-- Access ---------------------------------------------------------------------
-- NO client read policy at all. Raw webhook bodies may carry payer identifiers
-- and are dispute evidence; they are for the server and for audit, not for the
-- browser. Deny by default, service role only.

alter table public.provider_events enable row level security;

revoke all on public.provider_events from anon, authenticated;

commit;
