begin;

-- =============================================================================
-- Migration: 202608270026_organisation_applications_and_provisioning.sql
-- Tier 1 & Control Plane Business Onboarding and Atomic Tenant Provisioning
--
-- Flow:
-- 1. External Google User (No tenant membership) -> Submits Application
-- 2. Persisted to platform.tenant_applications
-- 3. Starq HQ Operator (platform_entitlement) reviews in Applications queue
-- 4. Operator approves -> platform.provision_approved_application executes atomic RPC:
--      - public.organisations (Legal Entity)
--      - public.business_names (Trading Brand)
--      - public.locations (Physical Branch)
--      - public.books (Operating Activity & Ledger)
--      - public.book_locations (Facility Junction)
--      - public.memberships (Owner Membership for Applicant)
--      - public.membership_seats (Managing Director Seat)
--      - public.book_memberships (Default Book Access)
--      - Workflow stages & archetype defaults
--      - platform.tenant_registry (Tenant metadata)
--      - platform.provisioning_runs (Audit log)
--      - platform.tenant_applications (Marked approved)
-- =============================================================================

create table if not exists platform.tenant_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_person_id uuid not null references public.persons(id),
  applicant_email text not null,
  applicant_name text not null,
  name text not null,
  legal_name text not null,
  archetype_id text not null check (archetype_id in (
    'general_business', 'automotive_workshop', 'wholesale_trading',
    'marine_service', 'construction_contracting', 'retail'
  )),
  primary_book_name text not null,
  primary_book_code text not null check (primary_book_code ~ '^[A-Z0-9]{2,8}$'),
  island text not null,
  atoll text not null,
  phone text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'info_requested')),
  notes text,
  rejection_reason text,
  info_request_note text,
  provisioned_organisation_id uuid references public.organisations(id),
  reviewed_by uuid references public.persons(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Access is restricted strictly to platform service_role
revoke all on table platform.tenant_applications from public, anon, authenticated;
grant select, insert, update, delete on table platform.tenant_applications to service_role;

-- =============================================================================
-- Stored Procedure: platform.provision_approved_application
-- Executes atomic provisioning across all 5 tiers of the organizational spine
-- =============================================================================
create or replace function platform.provision_approved_application(
  p_application_id uuid,
  p_reviewer_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, pg_temp
as $$
declare
  v_app platform.tenant_applications%rowtype;
  v_org_id uuid;
  v_biz_name_id uuid;
  v_location_id uuid;
  v_book_id uuid;
  v_membership_id uuid;
  v_slug text;
  v_registry_code text;
  v_template_id uuid;
begin
  -- 1. Fetch and validate application
  select * into v_app
  from platform.tenant_applications
  where id = p_application_id;

  if not found then
    raise exception 'application_not_found';
  end if;

  if v_app.status = 'approved' then
    raise exception 'application_already_approved';
  end if;

  -- 2. Generate slug and registry code
  v_slug := lower(regexp_replace(v_app.name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then
    v_slug := 'org-' || substring(v_app.id::text from 1 for 8);
  end if;

  -- Disambiguate slug if already exists
  if exists (select 1 from public.organisations where slug = v_slug) then
    v_slug := v_slug || '-' || substring(v_app.id::text from 1 for 4);
  end if;

  v_registry_code := 'C-' || upper(substring(v_app.id::text from 1 for 6)) || '-' || to_char(now(), 'YYYY');

  -- 3. Create Organisation (Legal Entity)
  insert into public.organisations (
    name,
    legal_name,
    slug,
    registry_code,
    status
  ) values (
    v_app.name,
    v_app.legal_name,
    v_slug,
    v_registry_code,
    'active'
  ) returning id into v_org_id;

  -- 4. Create Business Name (Trading Brand)
  insert into public.business_names (
    organisation_id,
    name,
    is_primary,
    status
  ) values (
    v_org_id,
    v_app.name,
    true,
    'active'
  ) returning id into v_biz_name_id;

  -- 5. Create Primary Location
  insert into public.locations (
    organisation_id,
    name,
    island,
    atoll,
    is_headquarters,
    status
  ) values (
    v_org_id,
    v_app.island || ' Main Branch',
    v_app.island,
    v_app.atoll,
    true,
    'active'
  ) returning id into v_location_id;

  -- 6. Create Primary Operating Book
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
    v_biz_name_id,
    v_app.archetype_id,
    v_app.primary_book_code,
    v_app.primary_book_name,
    'MVR',
    true,
    'active'
  ) returning id into v_book_id;

  -- 7. Link Book to Location
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

  -- 8. Create Owner Membership for Applicant
  insert into public.memberships (
    organisation_id,
    person_id,
    role,
    status
  ) values (
    v_org_id,
    v_app.applicant_person_id,
    'managing_director',
    'active'
  ) returning id into v_membership_id;

  -- 9. Grant Managing Director Seat
  insert into public.membership_seats (
    membership_id,
    seat_code
  ) values (
    v_membership_id,
    'managing_director'
  );

  -- 10. Grant Book Membership
  insert into public.book_memberships (
    organisation_id,
    membership_id,
    book_id
  ) values (
    v_org_id,
    v_membership_id,
    v_book_id
  );

  -- 11. Seed Default Workflow Template for the Archetype
  insert into public.workflow_templates (
    organisation_id,
    name,
    description,
    is_active
  ) values (
    v_org_id,
    case
      when v_app.archetype_id = 'automotive_workshop' then 'Workshop Service Standard Rail'
      when v_app.archetype_id = 'marine_service' then 'Marine Vessel Service Rail'
      when v_app.archetype_id = 'retail' then 'Retail Fulfillment Rail'
      else 'Standard Operating Service Rail'
    end,
    'Auto-provisioned default operational workflow for ' || v_app.name,
    true
  ) returning id into v_template_id;

  -- Seed stages
  insert into public.workflow_stages (organisation_id, template_id, name, stage_order, required_role, is_mandatory, is_terminal)
  values
    (v_org_id, v_template_id, 'Intake & Vehicle Check', 1, 'counter', true, false),
    (v_org_id, v_template_id, 'Technician Inspection', 2, 'technician', true, false),
    (v_org_id, v_template_id, 'Parts Allocation & Repair', 3, 'technician', true, false),
    (v_org_id, v_template_id, 'Quality Control Inspection', 4, 'qc_signer', true, false),
    (v_org_id, v_template_id, 'Invoicing & Customer Handover', 5, 'counter', true, true);

  -- 12. Register in platform.tenant_registry
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
    '202608270026',
    false,
    1
  );

  -- 13. Record provisioning run
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

  -- 14. Update Application Record
  update platform.tenant_applications set
    status = 'approved',
    provisioned_organisation_id = v_org_id,
    reviewed_by = p_reviewer_person_id,
    reviewed_at = now(),
    updated_at = now()
  where id = p_application_id;

  -- 15. Return structured result
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

revoke all on function platform.provision_approved_application(uuid, uuid) from public, anon, authenticated;
grant execute on function platform.provision_approved_application(uuid, uuid) to service_role;

commit;
