begin;

-- =============================================================================
-- Migration: 202609031047_payment_provider_tenant_scope.sql
-- SERP-351 — bounded correction on current main
--
-- Founder/Nexus recovered correction surface:
--   1. Correct the PR #32 RLS/evidence semantics without changing the approved
--      architecture.
--   2. Satisfy DEC-105 / F7: payment_intents and payment_attempts must carry a
--      tenant-safe config_id relationship to the exact provider-config row.
--   3. Satisfy DEC-106 / F8: activation authority is auditable evidence, not a
--      bare boolean.
--
-- This migration stays inside DEC-097 Option B:
--   - payment_provider_config is tenant-scoped
--   - organisation_id is NOT NULL
--   - no platform-wide aggregation
--   - no client write policy
--
-- Fail-closed rule:
--   Existing rows are not silently backfilled. If historical rows already exist
--   without enough information to infer the exact tenant/config relationship,
--   this migration raises and stops rather than inventing provenance.
-- =============================================================================

-- 1. payment_provider_config becomes explicitly tenant-scoped ------------------
alter table public.payment_provider_config
  add column organisation_id uuid;

do $$
begin
  if exists (select 1 from public.payment_provider_config) then
    raise exception
      'SERP-351: payment_provider_config already contains rows; organisation_id cannot be inferred safely';
  end if;
end $$;

alter table public.payment_provider_config
  alter column organisation_id set not null,
  drop constraint payment_provider_config_provider_id_environment_key,
  add constraint payment_provider_config_org_provider_env_key
    unique (organisation_id, provider_id, environment),
  add constraint payment_provider_config_org_id_key
    unique (organisation_id, id),
  add constraint payment_provider_config_org_id_provider_key
    unique (organisation_id, id, provider_id),
  add constraint payment_provider_config_organisation_id_fkey
    foreign key (organisation_id) references public.organisations(id);

comment on table public.payment_provider_config is
  'Tenant-scoped payment-provider configuration. Holds no secret values. Service-role write only.';

-- 2. F7 / DEC-105 — exact config identity on intents and attempts -------------
alter table public.payment_intents
  add column config_id uuid;

do $$
begin
  if exists (select 1 from public.payment_intents) then
    raise exception
      'SERP-351 / DEC-105: payment_intents already contains rows; config_id cannot be inferred safely';
  end if;
end $$;

alter table public.payment_intents
  alter column config_id set not null,
  add constraint payment_intents_org_config_provider_fkey
    foreign key (organisation_id, config_id, provider_id)
    references public.payment_provider_config(organisation_id, id, provider_id),
  add constraint payment_intents_org_id_provider_config_key
    unique (organisation_id, id, provider_id, config_id);

create index payment_intents_org_config_idx
  on public.payment_intents (organisation_id, config_id);

alter table public.payment_attempts
  add column config_id uuid;

do $$
begin
  if exists (select 1 from public.payment_attempts) then
    raise exception
      'SERP-351 / DEC-105: payment_attempts already contains rows; config_id cannot be inferred safely';
  end if;
end $$;

alter table public.payment_attempts
  drop constraint if exists payment_attempts_organisation_id_intent_id_fkey,
  alter column config_id set not null,
  add constraint payment_attempts_org_config_provider_fkey
    foreign key (organisation_id, config_id, provider_id)
    references public.payment_provider_config(organisation_id, id, provider_id),
  add constraint payment_attempts_org_intent_provider_config_fkey
    foreign key (organisation_id, intent_id, provider_id, config_id)
    references public.payment_intents(organisation_id, id, provider_id, config_id);

create index payment_attempts_org_config_idx
  on public.payment_attempts (organisation_id, config_id);

-- 3. F8 / DEC-106 — auditable activation authority evidence -------------------
alter table public.payment_provider_config
  add column activation_authority_reference text,
  add column activation_authority_recorded_by uuid references public.persons(id),
  add column activation_authority_recorded_at timestamptz,
  add column activation_authority_audit_event_id bigint references public.audit_events(id),
  add constraint payment_provider_config_activation_authority_bundle_complete
    check (
      (
        activation_authority_reference is null
        and activation_authority_recorded_by is null
        and activation_authority_recorded_at is null
        and activation_authority_audit_event_id is null
      )
      or
      (
        length(btrim(activation_authority_reference)) > 0
        and activation_authority_recorded_by is not null
        and activation_authority_recorded_at is not null
        and activation_authority_audit_event_id is not null
      )
    );

create or replace function app_private.capture_provider_activation_authority_audit()
returns trigger language plpgsql as $$
declare
  audit_id bigint;
  evidence_present boolean;
  evidence_changed boolean;
begin
  new.id := coalesce(new.id, gen_random_uuid());

  evidence_present := coalesce(length(btrim(new.activation_authority_reference)) > 0, false)
    or new.activation_authority_recorded_by is not null
    or new.activation_authority_recorded_at is not null;

  if evidence_present then
    if not coalesce(length(btrim(new.activation_authority_reference)) > 0, false) then
      raise exception
        'cannot record activation authority for provider % in organisation % without a non-secret approval reference',
        new.provider_id, new.organisation_id;
    end if;

    if new.activation_authority_recorded_by is null then
      new.activation_authority_recorded_by := app_private.current_person_id();
    end if;

    if new.activation_authority_recorded_by is null then
      raise exception
        'cannot record activation authority for provider % in organisation % without recorder identity',
        new.provider_id, new.organisation_id;
    end if;

    if new.activation_authority_recorded_at is null then
      new.activation_authority_recorded_at := now();
    end if;
  end if;

  evidence_present := coalesce(length(btrim(new.activation_authority_reference)) > 0, false)
    and new.activation_authority_recorded_by is not null
    and new.activation_authority_recorded_at is not null;

  if tg_op = 'INSERT' then
    evidence_changed := evidence_present;
  else
    evidence_changed := new.activation_authority_reference is distinct from old.activation_authority_reference
      or new.activation_authority_recorded_by is distinct from old.activation_authority_recorded_by
      or new.activation_authority_recorded_at is distinct from old.activation_authority_recorded_at;
  end if;

  if evidence_present and (new.activation_authority_audit_event_id is null or evidence_changed) then
    insert into public.audit_events (
      organisation_id,
      actor_person_id,
      action,
      object_type,
      object_id,
      occurred_at,
      after_state,
      metadata
    ) values (
      new.organisation_id,
      new.activation_authority_recorded_by,
      'payment_provider_config.activation_authority_recorded',
      'payment_provider_config',
      new.id,
      new.activation_authority_recorded_at,
      jsonb_build_object(
        'provider_id', new.provider_id,
        'environment', new.environment,
        'activation_authority_reference', new.activation_authority_reference
      ),
      jsonb_build_object(
        'provider_id', new.provider_id,
        'environment', new.environment,
        'activation_authority_reference', new.activation_authority_reference
      )
    )
    returning id into audit_id;

    new.activation_authority_audit_event_id := audit_id;
  end if;

  return new;
end $$;

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
      'BANK_SPEC_REQUIRED: cannot activate production configuration for % — its specification is not yet documented',
      new.provider_id;
  end if;

  if new.environment = 'production' and prov.is_executable is not true then
    raise exception
      'cannot activate production configuration for % — adapter is not executable',
      new.provider_id;
  end if;

  if new.environment = 'production' and not (
    coalesce(length(btrim(new.activation_authority_reference)) > 0, false)
    and new.activation_authority_recorded_by is not null
    and new.activation_authority_recorded_at is not null
    and new.activation_authority_audit_event_id is not null
  ) then
    raise exception
      'cannot activate production configuration for provider % in organisation % — activation authority evidence incomplete',
      new.provider_id, new.organisation_id;
  end if;

  return new;
end $$;

drop trigger if exists payment_provider_config_activation_audit_capture
  on public.payment_provider_config;
create trigger payment_provider_config_activation_audit_capture
  before insert or update on public.payment_provider_config
  for each row execute function app_private.capture_provider_activation_authority_audit();

drop trigger if exists payment_provider_config_activation_guard
  on public.payment_provider_config;
create trigger payment_provider_config_activation_guard
  before insert or update on public.payment_provider_config
  for each row execute function app_private.assert_provider_config_activation();

-- 4. RLS posture correction ---------------------------------------------------
-- payment_provider_config names secrets and remains service-role only.
-- No client read or write policy is added here. The old PR #32 claim that tenant
-- sessions gained read access is corrected by this migration and its evidence.

commit;
