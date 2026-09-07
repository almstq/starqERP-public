begin;

-- =============================================================================
-- Migration: 202608250013_workflow_stages.sql
-- SERP-162: Workflow Stages as Seed Data (Audit Critical #6)
-- Eliminates hardcoded workflow transition strings from application & database
-- logic, enabling tenant-configurable dynamic workflows and custom stages.
-- =============================================================================

-- 1. Create workflow_templates table
create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  workflow_code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, workflow_code),
  unique (organisation_id, id)
);

-- 2. Create workflow_stages table
create table public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  workflow_template_id uuid not null,
  stage_code text not null,
  stage_name text not null,
  stage_order integer not null check (stage_order >= 0),
  command_name text,
  required_seat text,
  allowed_from_stages text[] not null default '{}',
  is_initial boolean not null default false,
  is_terminal boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, workflow_template_id, stage_code),
  unique (organisation_id, id),
  foreign key (organisation_id, workflow_template_id)
    references public.workflow_templates(organisation_id, id)
);

-- 3. Dynamic Workflow Transition Validation Function
create or replace function app_private.validate_workflow_transition(
  target_org uuid,
  target_workflow text,
  current_state text,
  event_name text
) returns table (
  next_state text,
  is_valid boolean,
  err_msg text
) language plpgsql security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  target_stage public.workflow_stages%rowtype;
  norm_event text := upper(trim(coalesce(event_name, '')));
begin
  select ws.*
    into target_stage
    from public.workflow_stages ws
    join public.workflow_templates wt
      on wt.id = ws.workflow_template_id
     and wt.organisation_id = ws.organisation_id
   where ws.organisation_id = target_org
     and wt.workflow_code = target_workflow
     and upper(trim(ws.command_name)) = norm_event
     and ws.active = true
     and wt.active = true;

  if not found then
    return query select null::text, false, 'unsupported_command'::text;
    return;
  end if;

  if target_stage.is_initial and (current_state is null or current_state = '') then
    return query select target_stage.stage_code, true, null::text;
    return;
  end if;

  if current_state is not null and current_state = any(target_stage.allowed_from_stages) then
    return query select target_stage.stage_code, true, null::text;
    return;
  end if;

  return query select target_stage.stage_code, false, 'illegal_workflow_transition'::text;
  return;
end;
$$;

-- 4. Seed Standard Automotive Repair Workflow for Club Ignition
do $$
declare
  ci_org uuid := '30222026-0000-4000-8000-000000000001';
  tmpl_id uuid;
begin
  insert into public.workflow_templates (id, organisation_id, workflow_code, name, description)
  values (
    '30222026-0000-4000-8000-000000000801',
    ci_org,
    'garage_job',
    'Automotive Repair & Refinishing Standard Workflow',
    'Club Ignition 13-stage end-to-end garage operation workflow'
  )
  on conflict (organisation_id, workflow_code) do update set
    name = excluded.name,
    description = excluded.description,
    active = true
  returning id into tmpl_id;

  if tmpl_id is null then
    select id into tmpl_id from public.workflow_templates
     where organisation_id = ci_org and workflow_code = 'garage_job';
  end if;

  insert into public.workflow_stages
    (organisation_id, workflow_template_id, stage_code, stage_name, stage_order,
     command_name, required_seat, allowed_from_stages, is_initial, is_terminal)
  values
    (ci_org, tmpl_id, 'call', 'Customer Call / Inquiry', 1, 'CALL', 'counter', '{}', true, false),
    (ci_org, tmpl_id, 'booked', 'Booking Scheduled', 2, 'BOOKING', 'counter', '{"call"}', false, false),
    (ci_org, tmpl_id, 'intake', 'Vehicle Intake / Inspection', 3, 'INTAKE', 'counter', '{"call","booked"}', false, false),
    (ci_org, tmpl_id, 'estimated', 'Work Estimate Generated', 4, 'ESTIMATE', 'counter', '{"intake"}', false, false),
    (ci_org, tmpl_id, 'authorised', 'Customer Authorisation Received', 5, 'AUTHORISATION', 'counter', '{"estimated"}', false, false),
    (ci_org, tmpl_id, 'job_card', 'Job Card Raised', 6, 'JOB_CARD', 'counter', '{"authorised"}', false, false),
    (ci_org, tmpl_id, 'parts', 'Parts & Consumables Procured', 7, 'PARTS_PROCUREMENT', 'technician', '{"job_card","work"}', false, false),
    (ci_org, tmpl_id, 'work', 'Workshop Mechanical/Body Work', 8, 'WORK', 'technician', '{"job_card","parts"}', false, false),
    (ci_org, tmpl_id, 'qc', 'Quality Control & Final Inspection', 9, 'QC', 'qc_signer', '{"work"}', false, false),
    (ci_org, tmpl_id, 'handover', 'Vehicle Customer Handover', 10, 'HANDOVER', 'counter', '{"qc"}', false, false),
    (ci_org, tmpl_id, 'invoice_payment', 'Invoice Raised & Payment Collected', 11, 'INVOICE_PAYMENT', 'counter', '{"handover"}', false, false),
    (ci_org, tmpl_id, 'closed', 'Job Closed & Archival', 12, 'CLOSE', 'counter', '{"invoice_payment"}', false, true)
  on conflict (organisation_id, workflow_template_id, stage_code) do update set
    stage_name = excluded.stage_name,
    stage_order = excluded.stage_order,
    command_name = excluded.command_name,
    required_seat = excluded.required_seat,
    allowed_from_stages = excluded.allowed_from_stages,
    is_initial = excluded.is_initial,
    is_terminal = excluded.is_terminal,
    active = true;
end $$;

-- 5. Seed Standard SCM Procurement Workflow for Starq Technologies
do $$
declare
  st_org uuid := '29552026-0000-4000-8000-000000000001';
  tmpl_id uuid;
begin
  insert into public.workflow_templates (id, organisation_id, workflow_code, name, description)
  values (
    '29552026-0000-4000-8000-000000000802',
    st_org,
    'procurement',
    'SCM Six-Step Procurement Workflow',
    'Starq Technologies corporate procurement ladder'
  )
  on conflict (organisation_id, workflow_code) do update set
    name = excluded.name,
    description = excluded.description,
    active = true
  returning id into tmpl_id;

  if tmpl_id is null then
    select id into tmpl_id from public.workflow_templates
     where organisation_id = st_org and workflow_code = 'procurement';
  end if;

  insert into public.workflow_stages
    (organisation_id, workflow_template_id, stage_code, stage_name, stage_order,
     command_name, required_seat, allowed_from_stages, is_initial, is_terminal)
  values
    (st_org, tmpl_id, 'need', 'Requisition / Need Expressed', 1, 'PURCHASE', 'counter', '{}', true, false),
    (st_org, tmpl_id, 'quote', 'Vendor Quotation Gathered', 2, 'PURCHASE', 'quartermaster', '{"need"}', false, false),
    (st_org, tmpl_id, 'award', 'Contract / PO Awarded', 3, 'PURCHASE', 'financial_controller', '{"quote"}', false, false),
    (st_org, tmpl_id, 'receive', 'Goods Received & Inspected', 4, 'PURCHASE', 'receiver', '{"award"}', false, false),
    (st_org, tmpl_id, 'match', '3-Way Match Reconciled', 5, 'PURCHASE', 'financial_controller', '{"receive"}', false, false),
    (st_org, tmpl_id, 'pay', 'Supplier Disbursement Executed', 6, 'PURCHASE', 'payer', '{"match"}', false, true)
  on conflict (organisation_id, workflow_template_id, stage_code) do update set
    stage_name = excluded.stage_name,
    stage_order = excluded.stage_order,
    command_name = excluded.command_name,
    required_seat = excluded.required_seat,
    allowed_from_stages = excluded.allowed_from_stages,
    is_initial = excluded.is_initial,
    is_terminal = excluded.is_terminal,
    active = true;
end $$;

-- 6. Enable Row-Level Security
alter table public.workflow_templates enable row level security;
alter table public.workflow_stages enable row level security;

create policy workflow_templates_tenant on public.workflow_templates
for all to public
using (organisation_id = app_private.current_organisation_id())
with check (organisation_id = app_private.current_organisation_id());

create policy workflow_stages_tenant on public.workflow_stages
for all to public
using (organisation_id = app_private.current_organisation_id())
with check (organisation_id = app_private.current_organisation_id());

revoke all on public.workflow_templates, public.workflow_stages from public, anon;
grant select on public.workflow_templates, public.workflow_stages to authenticated;
grant all on public.workflow_templates, public.workflow_stages to service_role;

commit;
