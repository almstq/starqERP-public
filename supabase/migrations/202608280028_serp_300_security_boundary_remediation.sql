begin;

-- =============================================================================
-- Migration 0028: SERP-300 security-boundary remediation
--
-- Forward-only repair for the accepted 0001-0027 chain. This migration:
--   * enforces book membership at the commercial-document RLS boundary;
--   * persists the email already verified by the canonical Google identity path;
--   * replaces the stale invitation RPC with a service-bound, identity-checked RPC;
--   * replaces the stale provisioning RPC with the canonical organisation schema.
-- =============================================================================

-- The Edge identity boundary verifies Google `sub` + `email_verified=true`. Persist
-- that normalized email beside the stable external subject so privileged database
-- code can validate an invitation without trusting a caller-supplied email.
alter table public.persons
  add column if not exists verified_email text;

alter table public.persons
  drop constraint if exists persons_verified_email_normalized,
  add constraint persons_verified_email_normalized
    check (
      verified_email is null
      or (
        verified_email = lower(btrim(verified_email))
        and position('@' in verified_email) > 1
      )
    );

create unique index if not exists persons_verified_email_uq
  on public.persons (lower(verified_email))
  where verified_email is not null;

-- Book access is an execution boundary, not merely an API display filter.
create or replace function app_private.has_book_access(
  target_organisation uuid,
  target_book uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select target_book is not null
    and app_private.has_organisation_access(target_organisation)
    and exists (
      select 1
      from public.memberships m
      join public.book_memberships bm
        on bm.organisation_id = m.organisation_id
       and bm.membership_id = m.id
       and bm.book_id = target_book
      where m.organisation_id = target_organisation
        and m.person_id = app_private.current_person_id()
        and m.status = 'active'
        and m.valid_from <= now()
        and (m.valid_to is null or m.valid_to > now())
    )
$$;

drop policy if exists commercial_documents_current on public.commercial_documents;
create policy commercial_documents_current on public.commercial_documents
  for all
  using (app_private.has_book_access(organisation_id, book_id))
  with check (app_private.has_book_access(organisation_id, book_id));

-- Remove the historical three-argument entry point completely. Its PUBLIC ACL
-- allowed untrusted callers to enter a SECURITY DEFINER body and its person/email
-- arguments were both caller-controlled.
revoke all on function public.accept_staff_invitation(uuid, uuid, text)
  from public, anon, authenticated, service_role;
drop function public.accept_staff_invitation(uuid, uuid, text);

create function public.accept_staff_invitation(
  p_invitation_id uuid,
  p_authenticated_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_inv public.invitations%rowtype;
  v_person public.persons%rowtype;
  v_membership_id uuid;
  v_role_id uuid;
  v_book_id uuid;
begin
  select *
    into v_person
    from public.persons
   where id = p_authenticated_person_id
     and status = 'active'
     and external_subject is not null
     and verified_email is not null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'authenticated_identity_not_bound');
  end if;

  select *
    into v_inv
    from public.invitations
   where id = p_invitation_id
     and status = 'pending'
     and expires_at > now()
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invitation_invalid_or_expired');
  end if;

  if lower(btrim(v_inv.email)) <> v_person.verified_email then
    return jsonb_build_object('ok', false, 'error', 'invitation_identity_mismatch');
  end if;

  -- 0027 stored the role reference as text. Accept the canonical UUID text and
  -- the historical role code, then write only the canonical UUID foreign key.
  select r.id
    into v_role_id
    from public.roles r
   where r.organisation_id = v_inv.organisation_id
     and r.active = true
     and (r.id::text = v_inv.role_id or r.code = v_inv.role_id)
   order by (r.id::text = v_inv.role_id) desc
   limit 1;

  if v_role_id is null then
    return jsonb_build_object('ok', false, 'error', 'invitation_role_invalid');
  end if;

  if coalesce(cardinality(v_inv.book_ids), 0) > 0
     and exists (
       select 1
       from unnest(v_inv.book_ids) requested(book_id)
       where not exists (
         select 1
         from public.books b
         where b.id = requested.book_id
           and b.organisation_id = v_inv.organisation_id
           and b.status = 'active'
       )
     ) then
    return jsonb_build_object('ok', false, 'error', 'invitation_book_scope_invalid');
  end if;

  if coalesce(cardinality(v_inv.location_ids), 0) > 0
     and exists (
       select 1
       from unnest(v_inv.location_ids) requested(location_id)
       where not exists (
         select 1
         from public.locations l
         where l.id = requested.location_id
           and l.organisation_id = v_inv.organisation_id
           and l.active = true
       )
     ) then
    return jsonb_build_object('ok', false, 'error', 'invitation_location_scope_invalid');
  end if;

  insert into public.memberships (
    organisation_id,
    person_id,
    role_id,
    status
  ) values (
    v_inv.organisation_id,
    v_person.id,
    v_role_id,
    'active'
  )
  on conflict (organisation_id, person_id) do update
    set role_id = excluded.role_id,
        status = 'active',
        valid_to = null
  returning id into v_membership_id;

  -- Roles govern visibility; seats govern execution. A role invitation must not
  -- synthesize a seat grant. Seat assignment remains an explicit admin action.
  if coalesce(cardinality(v_inv.book_ids), 0) > 0 then
    foreach v_book_id in array v_inv.book_ids loop
      insert into public.book_memberships (
        organisation_id,
        membership_id,
        book_id
      ) values (
        v_inv.organisation_id,
        v_membership_id,
        v_book_id
      )
      on conflict (membership_id, book_id) do nothing;
    end loop;
  else
    select id
      into v_book_id
      from public.books
     where organisation_id = v_inv.organisation_id
       and is_default = true
       and status = 'active'
     limit 1;

    if v_book_id is not null then
      insert into public.book_memberships (
        organisation_id,
        membership_id,
        book_id
      ) values (
        v_inv.organisation_id,
        v_membership_id,
        v_book_id
      )
      on conflict (membership_id, book_id) do nothing;
    end if;
  end if;

  update public.invitations
     set status = 'accepted',
         accepted_at = now(),
         accepted_by = v_person.id,
         updated_at = now()
   where id = v_inv.id;

  insert into public.audit_events (
    organisation_id,
    actor_person_id,
    action,
    object_type,
    object_id,
    metadata
  ) values (
    v_inv.organisation_id,
    v_person.id,
    'invitation.accepted',
    'staff_invitation',
    v_inv.id,
    jsonb_build_object(
      'email', v_person.verified_email,
      'role_id', v_role_id,
      'membership_id', v_membership_id,
      'book_ids', v_inv.book_ids
    )
  );

  return jsonb_build_object(
    'ok', true,
    'organisation_id', v_inv.organisation_id,
    'membership_id', v_membership_id,
    'role_id', v_role_id
  );
end;
$$;

revoke all on function public.accept_staff_invitation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_staff_invitation(uuid, uuid)
  to service_role;

-- Rebuild provisioning against the canonical 0001-0027 schema. No compatibility
-- columns are added for stale assumptions such as organisations.name,
-- locations.island, memberships.role, or workflow_templates.is_active.
create or replace function platform.provision_approved_application(
  p_application_id uuid,
  p_reviewer_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, app_private, pg_temp
as $$
declare
  v_app platform.tenant_applications%rowtype;
  v_org_id uuid;
  v_business_name_id uuid;
  v_location_id uuid;
  v_book_id uuid;
  v_membership_id uuid;
  v_owner_role_id uuid;
  v_template_id uuid;
  v_slug text;
  v_registry_code text;
  v_workflow_code text;
begin
  if not exists (
    select 1
    from platform.operator_principals op
    where op.person_id = p_reviewer_person_id
      and op.active = true
      and op.operator_role = 'platform_admin'
  ) then
    raise exception 'platform_admin_required';
  end if;

  select *
    into v_app
    from platform.tenant_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception 'application_not_found';
  end if;
  if v_app.status = 'approved' then
    raise exception 'application_already_approved';
  end if;

  v_slug := lower(regexp_replace(v_app.name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then
    v_slug := 'org-' || substring(v_app.id::text from 1 for 8);
  end if;
  if exists (select 1 from public.organisations where slug = v_slug) then
    v_slug := v_slug || '-' || substring(v_app.id::text from 1 for 8);
  end if;

  v_registry_code := 'C-' || upper(substring(v_app.id::text from 1 for 6)) || '-' || to_char(now(), 'YYYY');

  insert into public.organisations (
    legal_name,
    slug,
    registry_code,
    status
  ) values (
    v_app.legal_name,
    v_slug,
    v_registry_code,
    'active'
  ) returning id into v_org_id;

  perform app_private.seed_default_organisation_roles(v_org_id);
  select id into v_owner_role_id
    from public.roles
   where organisation_id = v_org_id
     and code = 'owner'
     and active = true;

  insert into public.business_names (
    organisation_id,
    name,
    status
  ) values (
    v_org_id,
    v_app.name,
    'active'
  ) returning id into v_business_name_id;

  insert into public.locations (
    organisation_id,
    code,
    name,
    kind,
    active
  ) values (
    v_org_id,
    'MAIN',
    v_app.island || ' Main Branch',
    case when v_app.archetype_id = 'automotive_workshop' then 'workshop' else 'office' end,
    true
  ) returning id into v_location_id;

  insert into public.books (
    organisation_id,
    business_name_id,
    archetype_id,
    code,
    name,
    currency,
    is_default,
    status
  ) values (
    v_org_id,
    v_business_name_id,
    v_app.archetype_id,
    v_app.primary_book_code,
    v_app.primary_book_name,
    'MVR',
    true,
    'active'
  ) returning id into v_book_id;

  insert into public.book_locations (
    organisation_id,
    book_id,
    location_id,
    is_primary
  ) values (
    v_org_id,
    v_book_id,
    v_location_id,
    true
  );

  insert into public.memberships (
    organisation_id,
    person_id,
    role_id,
    status
  ) values (
    v_org_id,
    v_app.applicant_person_id,
    v_owner_role_id,
    'active'
  ) returning id into v_membership_id;

  insert into public.membership_seats (membership_id, seat_code)
  values (v_membership_id, 'managing_director');

  insert into public.book_memberships (
    organisation_id,
    membership_id,
    book_id
  ) values (
    v_org_id,
    v_membership_id,
    v_book_id
  );

  v_workflow_code := v_app.archetype_id || '_default';
  insert into public.workflow_templates (
    organisation_id,
    workflow_code,
    name,
    description,
    active
  ) values (
    v_org_id,
    v_workflow_code,
    case
      when v_app.archetype_id = 'automotive_workshop' then 'Workshop Service Standard Rail'
      when v_app.archetype_id = 'marine_service' then 'Marine Vessel Service Rail'
      when v_app.archetype_id = 'retail' then 'Retail Fulfilment Rail'
      else 'Standard Operating Service Rail'
    end,
    'Auto-provisioned default operational workflow for ' || v_app.name,
    true
  ) returning id into v_template_id;

  insert into public.workflow_stages (
    organisation_id,
    workflow_template_id,
    stage_code,
    stage_name,
    stage_order,
    command_name,
    required_seat,
    allowed_from_stages,
    is_initial,
    is_terminal,
    active
  ) values
    (v_org_id, v_template_id, 'intake', 'Intake', 1, 'INTAKE', 'counter', '{}', true, false, true),
    (v_org_id, v_template_id, 'inspect', 'Inspection', 2, 'INSPECT', 'technician', '{intake}', false, false, true),
    (v_org_id, v_template_id, 'execute', 'Execution', 3, 'EXECUTE', 'technician', '{inspect}', false, false, true),
    (v_org_id, v_template_id, 'quality', 'Quality Control', 4, 'QUALITY', 'qc_signer', '{execute}', false, false, true),
    (v_org_id, v_template_id, 'complete', 'Completion', 5, 'COMPLETE', 'counter', '{quality}', false, true, true);

  insert into platform.tenant_registry (
    organisation_id,
    archetype_id,
    plan_code,
    subscription_status,
    provisioning_status,
    onboarding_state,
    deployment_version,
    schema_version,
    is_demo,
    active_seats
  ) values (
    v_org_id,
    v_app.archetype_id,
    'trial',
    'trial',
    'ready',
    'in_progress',
    'v0.2.0-beta',
    '202608280028',
    false,
    1
  );

  insert into platform.provisioning_runs (
    organisation_id,
    mode,
    requested_by,
    status,
    completed_at
  ) values (
    v_org_id,
    'clean_production',
    p_reviewer_person_id,
    'ready',
    now()
  );

  update platform.tenant_applications
     set status = 'approved',
         provisioned_organisation_id = v_org_id,
         reviewed_by = p_reviewer_person_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.audit_events (
    organisation_id,
    actor_person_id,
    action,
    object_type,
    object_id,
    metadata,
    book_id
  ) values (
    v_org_id,
    p_reviewer_person_id,
    'tenant.provisioned',
    'organisation',
    v_org_id,
    jsonb_build_object('application_id', v_app.id, 'archetype_id', v_app.archetype_id),
    v_book_id
  );

  return jsonb_build_object(
    'ok', true,
    'organisation_id', v_org_id,
    'book_id', v_book_id,
    'membership_id', v_membership_id,
    'applicant_person_id', v_app.applicant_person_id,
    'slug', v_slug
  );
end;
$$;

revoke all on function platform.provision_approved_application(uuid, uuid)
  from public, anon, authenticated;
grant execute on function platform.provision_approved_application(uuid, uuid)
  to service_role;

commit;
