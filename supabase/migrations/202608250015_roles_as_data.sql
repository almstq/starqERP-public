begin;

-- =============================================================================
-- Migration: 202608250015_roles_as_data.sql
-- SERP-163: Roles as Data Over Seats & Founder Auto-Activation (Amendment A8)
-- Roles manage visibility and permissions (module x action), while Seats
-- remain the immutable authorization layer for segregation of duties.
-- =============================================================================

-- 1. Update memberships.status check constraint to support 'pending'
alter table public.memberships
  drop constraint if exists memberships_status_check,
  add constraint memberships_status_check
  check (status in ('pending', 'active', 'suspended', 'ended'));

-- 2. Create roles table
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, code),
  unique (organisation_id, id)
);

-- 3. Create role_permissions table
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  role_id uuid not null,
  module text not null,
  action text not null,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, role_id, module, action),
  unique (organisation_id, id),
  foreign key (organisation_id, role_id)
    references public.roles(organisation_id, id) on delete cascade
);

-- 4. Add role_id to memberships
alter table public.memberships
  add column if not exists role_id uuid;

alter table public.memberships
  drop constraint if exists memberships_role_fk,
  add constraint memberships_role_fk
  foreign key (organisation_id, role_id)
  references public.roles(organisation_id, id);

-- 5. Seed 10 Standard Base Roles for an Organisation Helper Function
create or replace function app_private.seed_default_organisation_roles(target_org uuid)
returns void language plpgsql security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  r_owner uuid;
  r_admin uuid;
  r_fc uuid;
  r_counter uuid;
  r_tech uuid;
  r_qc uuid;
  r_qm uuid;
  r_recv uuid;
  r_payer uuid;
  r_auditor uuid;
begin
  -- 1. Owner
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'owner', 'Owner', 'Full organisation ownership and administration', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_owner;

  -- 2. Admin
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'admin', 'Administrator', 'System administration and team management', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_admin;

  -- 3. Financial Controller
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'financial_controller', 'Financial Controller', 'General ledger, statutory accounting, and approvals', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_fc;

  -- 4. Counter Operator
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'counter_operator', 'Counter Operator', 'Customer intake, estimate delivery, and billing', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_counter;

  -- 5. Technician
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'technician', 'Technician', 'Workshop job cards, repair work, and parts consumption', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_tech;

  -- 6. Quality Inspector
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'quality_inspector', 'Quality Inspector', 'QC inspection, testing, and final sign-off', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_qc;

  -- 7. Quartermaster
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'quartermaster', 'Quartermaster', 'Procurement, vendor quotations, and RFQs', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_qm;

  -- 8. Receiver
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'receiver', 'Receiver', 'Goods receipt, inventory intake, and warehouse checks', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_recv;

  -- 9. Payer
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'payer', 'Payer', 'Treasury, supplier payment disbursements, and settlement', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_payer;

  -- 10. Auditor
  insert into public.roles (organisation_id, code, name, description, is_system)
  values (target_org, 'auditor', 'Auditor', 'Read-only compliance, audit log inspection, and statutory reporting', true)
  on conflict (organisation_id, code) do update set name = excluded.name
  returning id into r_auditor;

  -- Grant full permissions to Owner & Admin
  insert into public.role_permissions (organisation_id, role_id, module, action, granted)
  values
    (target_org, r_owner, 'garage', 'admin', true),
    (target_org, r_owner, 'finance', 'admin', true),
    (target_org, r_owner, 'inventory', 'admin', true),
    (target_org, r_owner, 'settings', 'admin', true),
    (target_org, r_admin, 'garage', 'admin', true),
    (target_org, r_admin, 'settings', 'admin', true)
  on conflict (organisation_id, role_id, module, action) do nothing;
end;
$$;

-- 6. Seed default roles for Club Ignition and Starq Technologies
select app_private.seed_default_organisation_roles('30222026-0000-4000-8000-000000000001');
select app_private.seed_default_organisation_roles('29552026-0000-4000-8000-000000000001');

-- 7. Enable Row Level Security on roles and role_permissions
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

create policy roles_tenant on public.roles
for all to public
using (organisation_id = app_private.current_organisation_id())
with check (organisation_id = app_private.current_organisation_id());

create policy role_permissions_tenant on public.role_permissions
for all to public
using (organisation_id = app_private.current_organisation_id())
with check (organisation_id = app_private.current_organisation_id());

revoke all on public.roles, public.role_permissions from public, anon;
grant select on public.roles, public.role_permissions to authenticated;
grant all on public.roles, public.role_permissions to service_role;

commit;
