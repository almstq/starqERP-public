begin;

-- SERP-298: the HQ control plane exposes tenant metadata and lifecycle commands
-- without granting platform operators ambient access to tenant execution data.
create table platform.operator_audit (
  id bigint generated always as identity primary key,
  actor_person_id uuid not null references public.persons(id),
  operator_role text not null check (operator_role in ('platform_support', 'platform_admin')),
  action text not null,
  target_organisation_id uuid references public.organisations(id),
  request_key uuid not null,
  request_hash text not null,
  outcome text not null check (outcome in ('accepted', 'rejected')),
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (actor_person_id, request_key)
);

create trigger operator_audit_append_only
before update or delete on platform.operator_audit
for each row execute function app_private.reject_mutation();

-- A suspended organisation must fail closed across every policy which delegates
-- to this canonical helper. Membership alone is not sufficient authority.
create or replace function app_private.has_organisation_access(target uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.memberships m
      join public.organisations o on o.id = m.organisation_id
     where m.organisation_id = target
       and m.person_id = app_private.current_person_id()
       and m.status = 'active'
       and o.status = 'active'
       and m.valid_from <= now()
       and (m.valid_to is null or m.valid_to > now())
  )
  and target = app_private.current_organisation_id()
$$;

create or replace function platform.require_operator(p_actor uuid, p_admin boolean default false)
returns text language plpgsql stable security definer
set search_path = platform, public, pg_temp as $$
declare v_role text;
begin
  select operator_role into v_role
    from platform.operator_principals
   where person_id = p_actor and active = true;
  if v_role is null then raise exception 'platform_operator_required'; end if;
  if p_admin and v_role <> 'platform_admin' then raise exception 'platform_admin_required'; end if;
  return v_role;
end
$$;

create or replace function platform.list_tenants(p_actor uuid)
returns jsonb language plpgsql security definer
set search_path = platform, public, app_private, extensions, pg_temp as $$
declare v_role text; v_result jsonb; v_request uuid := gen_random_uuid();
begin
  v_role := platform.require_operator(p_actor, false);
  select coalesce(jsonb_agg(jsonb_build_object(
    'organisation_id', o.id,
    'slug', o.slug,
    'legal_name', o.legal_name,
    'organisation_status', o.status,
    'archetype_id', tr.archetype_id,
    'plan_code', tr.plan_code,
    'subscription_status', tr.subscription_status,
    'provisioning_status', tr.provisioning_status,
    'active_seats', tr.active_seats,
    'schema_version', tr.schema_version,
    'books', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'is_default', b.is_default) order by b.code)
                         from public.books b where b.organisation_id = o.id and b.status = 'active'), '[]'::jsonb)
  ) order by o.legal_name), '[]'::jsonb) into v_result
  from platform.tenant_registry tr
  join public.organisations o on o.id = tr.organisation_id;

  insert into platform.operator_audit(actor_person_id, operator_role, action, request_key, request_hash, outcome, after_state)
  values (p_actor, v_role, 'tenant.list', v_request, encode(digest('tenant.list', 'sha256'), 'hex'), 'accepted', jsonb_build_object('tenant_count', jsonb_array_length(v_result)));
  return v_result;
end
$$;

create or replace function platform.provision_tenant(p_actor uuid, p_request_key uuid, p_command jsonb)
returns jsonb language plpgsql security definer
set search_path = platform, public, app_private, extensions, pg_temp as $$
declare
  v_role text; v_hash text; v_existing platform.operator_audit%rowtype;
  v_org uuid := gen_random_uuid(); v_business uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid(); v_book uuid := gen_random_uuid();
  v_owner_role uuid; v_invitation uuid; v_result jsonb;
  v_slug text := lower(trim(coalesce(p_command->>'slug', '')));
  v_legal_name text := trim(coalesce(p_command->>'legal_name', ''));
  v_archetype text := coalesce(nullif(p_command->>'archetype_id', ''), 'general_business');
  v_book_code text := upper(trim(coalesce(p_command->>'book_code', 'MAIN')));
  v_book_name text := trim(coalesce(p_command->>'book_name', 'Main Book'));
  v_owner_email text := lower(trim(coalesce(p_command->>'owner_email', '')));
  v_owner_name text := trim(coalesce(p_command->>'owner_name', ''));
begin
  v_role := platform.require_operator(p_actor, true);
  if p_request_key is null then raise exception 'request_key_required'; end if;
  v_hash := encode(digest(p_command::text, 'sha256'), 'hex');
  select * into v_existing from platform.operator_audit where actor_person_id = p_actor and request_key = p_request_key;
  if found then
    if v_existing.request_hash <> v_hash then raise exception 'idempotency_key_conflict'; end if;
    return v_existing.after_state;
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'invalid_slug'; end if;
  if v_legal_name = '' then raise exception 'legal_name_required'; end if;
  if v_archetype not in ('general_business','automotive_workshop','wholesale_trading','marine_service','construction_contracting','retail') then raise exception 'invalid_archetype'; end if;
  if v_book_code !~ '^[A-Z0-9]{2,8}$' then raise exception 'invalid_book_code'; end if;
  if v_owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or v_owner_name = '' then raise exception 'owner_identity_required'; end if;

  insert into public.organisations(id, slug, legal_name) values (v_org, v_slug, v_legal_name);
  insert into public.business_names(id, organisation_id, name) values (v_business, v_org, v_legal_name);
  insert into public.locations(id, organisation_id, code, name, kind) values (v_location, v_org, 'MAIN', 'Main Location', 'office');
  insert into public.books(id, organisation_id, business_name_id, archetype_id, code, name, is_default)
  values (v_book, v_org, v_business, v_archetype, v_book_code, v_book_name, true);
  insert into public.book_locations(organisation_id, book_id, location_id, is_primary) values (v_org, v_book, v_location, true);
  perform app_private.seed_default_organisation_roles(v_org);
  select id into strict v_owner_role from public.roles where organisation_id = v_org and code = 'owner';
  insert into public.invitations(organisation_id, email, name, role_id, book_ids, location_ids, invited_by)
  values (v_org, v_owner_email, v_owner_name, v_owner_role::text, array[v_book], array[v_location], p_actor)
  returning id into v_invitation;
  insert into platform.tenant_registry(organisation_id, archetype_id, plan_code, subscription_status, provisioning_status, onboarding_state, schema_version)
  values (v_org, v_archetype, coalesce(nullif(p_command->>'plan_code',''), 'trial'), 'trial', 'ready', 'not_started', '202608290030');
  insert into platform.provisioning_runs(organisation_id, mode, requested_by, status, completed_at)
  values (v_org, 'clean_production', p_actor, 'ready', now());

  v_result := jsonb_build_object('organisation_id', v_org, 'book_id', v_book, 'owner_invitation_id', v_invitation, 'status', 'ready');
  insert into platform.operator_audit(actor_person_id, operator_role, action, target_organisation_id, request_key, request_hash, outcome, after_state, metadata)
  values (p_actor, v_role, 'tenant.provision', v_org, p_request_key, v_hash, 'accepted', v_result, jsonb_build_object('archetype_id', v_archetype));
  return v_result;
end
$$;

create or replace function platform.set_tenant_status(p_actor uuid, p_target_org uuid, p_request_key uuid, p_action text, p_reason text default null)
returns jsonb language plpgsql security definer
set search_path = platform, public, app_private, extensions, pg_temp as $$
declare v_role text; v_hash text; v_existing platform.operator_audit%rowtype; v_before jsonb; v_after jsonb; v_status text;
begin
  v_role := platform.require_operator(p_actor, true);
  if p_action not in ('suspend', 'reactivate') then raise exception 'invalid_tenant_action'; end if;
  v_hash := encode(digest(concat_ws('|', p_target_org::text, p_action, coalesce(p_reason,'')), 'sha256'), 'hex');
  select * into v_existing from platform.operator_audit where actor_person_id = p_actor and request_key = p_request_key;
  if found then
    if v_existing.request_hash <> v_hash then raise exception 'idempotency_key_conflict'; end if;
    return v_existing.after_state;
  end if;
  select jsonb_build_object('organisation_status', o.status, 'provisioning_status', tr.provisioning_status)
    into strict v_before from public.organisations o join platform.tenant_registry tr on tr.organisation_id=o.id where o.id=p_target_org for update;
  v_status := case when p_action='suspend' then 'suspended' else 'active' end;
  update public.organisations set status=v_status where id=p_target_org;
  update platform.tenant_registry set provisioning_status=case when p_action='suspend' then 'suspended' else 'ready' end, updated_at=now() where organisation_id=p_target_org;
  v_after := jsonb_build_object('organisation_id', p_target_org, 'organisation_status', v_status, 'provisioning_status', case when p_action='suspend' then 'suspended' else 'ready' end);
  insert into platform.operator_audit(actor_person_id, operator_role, action, target_organisation_id, request_key, request_hash, outcome, before_state, after_state, metadata)
  values (p_actor, v_role, 'tenant.' || p_action, p_target_org, p_request_key, v_hash, 'accepted', v_before, v_after, jsonb_build_object('reason', p_reason));
  return v_after;
end
$$;

revoke all on platform.operator_audit from public, anon, authenticated, service_role;
grant select on platform.operator_audit to service_role;
revoke all on function platform.require_operator(uuid, boolean), platform.list_tenants(uuid), platform.provision_tenant(uuid, uuid, jsonb), platform.set_tenant_status(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function platform.list_tenants(uuid), platform.provision_tenant(uuid, uuid, jsonb), platform.set_tenant_status(uuid, uuid, uuid, text, text) to service_role;

commit;
