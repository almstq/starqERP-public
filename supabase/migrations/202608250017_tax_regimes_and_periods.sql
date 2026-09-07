begin;

-- =============================================================================
-- Migration: 202608250017_tax_regimes_and_periods.sql
-- SERP-164: Tax as Effective-Dated Periods with Registration Status (Maldives GST)
-- Decouples tax from static percentages into time-of-supply rate schedules
-- and first-class organisation registration status (registered vs not_registered).
-- =============================================================================

-- 1. Create tax_rate_schedules table (Statutory Tax Schedules by Time of Supply)
create table public.tax_rate_schedules (
  id uuid primary key default gen_random_uuid(),
  tax_type text not null check (tax_type in ('gst_general', 'gst_tourism')),
  rate numeric(6, 4) not null check (rate >= 0 and rate <= 1),
  effective_from date not null,
  effective_to date,
  description text not null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

-- 2. Create tax_registrations table (Tenant Registration Status by Tax Type & Period)
create table public.tax_registrations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  tax_type text not null check (tax_type in ('gst_general', 'gst_tourism', 'income_tax', 'withholding_tax')),
  registration_status text not null check (registration_status in ('registered', 'not_registered', 'pending', 'suspended', 'cancelled')),
  tin text,
  tan text,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  unique (organisation_id, tax_type, effective_from),
  unique (organisation_id, id),
  check (effective_to is null or effective_to >= effective_from)
);

-- 3. Seed Maldives Statutory GST Rate Schedules
insert into public.tax_rate_schedules (tax_type, rate, effective_from, effective_to, description)
values
  -- General Sector GST (GGST)
  ('gst_general', 0.0600, '2011-10-02', '2022-12-31', 'Maldives GGST 6% (Historical)'),
  ('gst_general', 0.0800, '2023-01-01', null,         'Maldives GGST 8% (Current)'),
  -- Tourism Sector GST (TGST)
  ('gst_tourism', 0.1200, '2015-11-01', '2022-12-31', 'Maldives TGST 12% (Historical)'),
  ('gst_tourism', 0.1600, '2023-01-01', '2025-06-30', 'Maldives TGST 16% (Historical)'),
  ('gst_tourism', 0.1700, '2025-07-01', null,         'Maldives TGST 17% (Current from 1 July 2025)');

-- 4. Seed Tenant Initial Registrations
-- Club Ignition: Registered for GGST (TIN 1186844)
insert into public.tax_registrations (organisation_id, tax_type, registration_status, tin, effective_from)
values
  ('30222026-0000-4000-8000-000000000001', 'gst_general', 'registered', '1186844', '2026-08-01'),
  ('30222026-0000-4000-8000-000000000001', 'income_tax',  'registered', '1186844', '2026-08-01')
on conflict (organisation_id, tax_type, effective_from) do nothing;

-- Starq Technologies: Not Registered for GST (TIN 1186669, CIT Active)
insert into public.tax_registrations (organisation_id, tax_type, registration_status, tin, effective_from)
values
  ('29552026-0000-4000-8000-000000000001', 'gst_general', 'not_registered', '1186669', '2026-08-01'),
  ('29552026-0000-4000-8000-000000000001', 'income_tax',  'registered',     '1186669', '2026-08-01')
on conflict (organisation_id, tax_type, effective_from) do nothing;

-- 5. Calculation Function: Dynamic Time-of-Supply Line Tax Evaluator
create or replace function app_private.calculate_line_tax(
  target_org uuid,
  target_tax_type text,
  supply_date date,
  tax_mode text,
  line_amount numeric
)
returns table (
  is_taxable boolean,
  tax_rate numeric(6, 4),
  base_amount numeric(14, 2),
  tax_amount numeric(14, 2),
  gross_amount numeric(14, 2),
  err_msg text
) language plpgsql stable security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  v_status text;
  v_rate numeric(6, 4);
  v_amt numeric(14, 2) := round(coalesce(line_amount, 0), 2);
  v_base numeric(14, 2);
  v_tax numeric(14, 2);
  v_gross numeric(14, 2);
begin
  if tax_mode not in ('inclusive', 'exclusive', 'zero_rated', 'exempt') then
    return query select false, 0.0000::numeric(6,4), 0.00::numeric(14,2), 0.00::numeric(14,2), 0.00::numeric(14,2), 'invalid_tax_mode';
    return;
  end if;

  -- 1. Check Organisation Registration Status on supply_date
  select tr.registration_status into v_status
    from public.tax_registrations tr
   where tr.organisation_id = target_org
     and tr.tax_type = target_tax_type
     and supply_date >= tr.effective_from
     and (tr.effective_to is null or supply_date <= tr.effective_to)
   order by tr.effective_from desc
   limit 1;

  -- If not found or not registered -> NO GST CAN BE CHARGED
  if v_status is null or v_status <> 'registered' then
    return query select false, 0.0000::numeric(6,4), v_amt, 0.00::numeric(14,2), v_amt, null::text;
    return;
  end if;

  -- 2. Non-taxable modes (zero_rated / exempt)
  if tax_mode in ('zero_rated', 'exempt') then
    return query select false, 0.0000::numeric(6,4), v_amt, 0.00::numeric(14,2), v_amt, null::text;
    return;
  end if;

  -- 3. Resolve Statutory Rate by Time of Supply
  select trs.rate into v_rate
    from public.tax_rate_schedules trs
   where trs.tax_type = target_tax_type
     and supply_date >= trs.effective_from
     and (trs.effective_to is null or supply_date <= trs.effective_to)
   order by trs.effective_from desc
   limit 1;

  if v_rate is null then
    return query select false, 0.0000::numeric(6,4), 0.00::numeric(14,2), 0.00::numeric(14,2), 0.00::numeric(14,2), 'no_tax_rate_for_supply_date';
    return;
  end if;

  -- 4. Compute Base and Tax by Tax Mode
  if tax_mode = 'exclusive' then
    v_base := v_amt;
    v_tax := round(v_base * v_rate, 2);
    v_gross := v_base + v_tax;
  elsif tax_mode = 'inclusive' then
    v_gross := v_amt;
    v_base := round(v_gross / (1 + v_rate), 2);
    v_tax := v_gross - v_base;
  end if;

  return query select true, v_rate, v_base, v_tax, v_gross, null::text;
end;
$$;

-- 6. Row-Level Security
alter table public.tax_registrations enable row level security;
alter table public.tax_rate_schedules enable row level security;

create policy tax_registrations_tenant on public.tax_registrations
for select to public
using (organisation_id = app_private.current_organisation_id());

create policy tax_rate_schedules_read on public.tax_rate_schedules
for select to public
using (true);

revoke all on public.tax_registrations, public.tax_rate_schedules from public, anon;
grant select on public.tax_registrations, public.tax_rate_schedules to authenticated;
grant all on public.tax_registrations, public.tax_rate_schedules to service_role;

commit;
