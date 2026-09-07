-- =============================================================================
-- Test Probe: tests/tax_regimes_probe.sql
-- SERP-164: Tax Periods as Data, Time-of-Supply Rate Selection & Registration Status Probe
-- =============================================================================

begin;

create temp table probe_results (
  test_name text not null,
  passed boolean not null,
  detail text
);

do $$
declare
  ci_org uuid := '20000000-0000-4000-8000-000000000001';
  st_org uuid := '10000000-0000-4000-8000-000000000001';
  res record;
  sched_count integer;
begin
  -- ---------------------------------------------------------------------------
  -- Suite 1: Verify Seed Schedules Count
  -- ---------------------------------------------------------------------------
  select count(*) into sched_count from public.tax_rate_schedules;
  if sched_count = 5 then
    insert into probe_results values ('seed_tax_schedules', true, '5 Maldives statutory tax schedules present (GGST 6/8%, TGST 12/16/17%)');
  else
    insert into probe_results values ('seed_tax_schedules', false, 'Expected 5 tax rate schedules, got ' || sched_count);
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 2: Registered Tenant (Club Ignition) Computes 8% GST
  -- ---------------------------------------------------------------------------
  select * into res from app_private.calculate_line_tax(ci_org, 'gst_general', '2026-08-25', 'exclusive', 1000.00);
  if res.is_taxable and res.tax_rate = 0.0800 and res.tax_amount = 80.00 and res.gross_amount = 1080.00 then
    insert into probe_results values ('registered_tenant_exclusive_gst', true, 'CI charged 8% GST (1000 -> 80 tax, 1080 gross)');
  else
    insert into probe_results values ('registered_tenant_exclusive_gst', false, 'CI calculation failed: tax=' || coalesce(res.tax_amount::text, 'null'));
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 3: Not-Registered Tenant (Starq Technologies) CANNOT Charge GST
  -- ---------------------------------------------------------------------------
  select * into res from app_private.calculate_line_tax(st_org, 'gst_general', '2026-08-25', 'exclusive', 1000.00);
  if not res.is_taxable and res.tax_rate = 0.0000 and res.tax_amount = 0.00 and res.gross_amount = 1000.00 then
    insert into probe_results values ('not_registered_tenant_zero_gst', true, 'ST not_registered status strictly prevents GST charge (0.00 tax)');
  else
    insert into probe_results values ('not_registered_tenant_zero_gst', false, 'ST incorrectly charged GST: tax=' || coalesce(res.tax_amount::text, 'null'));
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 4: Historical Time-of-Supply Rate Selection (30 June 2025 vs 1 July 2025)
  -- ---------------------------------------------------------------------------
  -- Temporarily register CI for tourism to test historical rate resolution
  insert into public.tax_registrations (organisation_id, tax_type, registration_status, effective_from)
  values (ci_org, 'gst_tourism', 'registered', '2020-01-01');

  -- 4a. 30 June 2025 -> must resolve to 16%
  select * into res from app_private.calculate_line_tax(ci_org, 'gst_tourism', '2025-06-30', 'exclusive', 1000.00);
  if res.is_taxable and res.tax_rate = 0.1600 and res.tax_amount = 160.00 then
    -- 4b. 1 July 2025 -> must resolve to 17%
    select * into res from app_private.calculate_line_tax(ci_org, 'gst_tourism', '2025-07-01', 'exclusive', 1000.00);
    if res.is_taxable and res.tax_rate = 0.1700 and res.tax_amount = 170.00 then
      insert into probe_results values ('historical_time_of_supply_rates', true, 'Historical supply on 30 June 2025 resolved to 16%, and 1 July 2025 resolved to 17%');
    else
      insert into probe_results values ('historical_time_of_supply_rates', false, '1 July 2025 17% TGST resolution failed');
    end if;
  else
    insert into probe_results values ('historical_time_of_supply_rates', false, '30 June 2025 16% TGST resolution failed');
  end if;

  -- ---------------------------------------------------------------------------
  -- Suite 5: Tax Modes (Inclusive, Zero-Rated, Exempt)
  -- ---------------------------------------------------------------------------
  -- 5a. Inclusive: 108.00 gross with 8% GST -> 100.00 base, 8.00 tax
  select * into res from app_private.calculate_line_tax(ci_org, 'gst_general', '2026-08-25', 'inclusive', 108.00);
  if res.base_amount = 100.00 and res.tax_amount = 8.00 and res.gross_amount = 108.00 then
    -- 5b. Zero-Rated: 100.00 -> 0.00 tax, 100.00 gross
    select * into res from app_private.calculate_line_tax(ci_org, 'gst_general', '2026-08-25', 'zero_rated', 100.00);
    if not res.is_taxable and res.tax_amount = 0.00 and res.gross_amount = 100.00 then
      -- 5c. Exempt: 100.00 -> 0.00 tax, 100.00 gross
      select * into res from app_private.calculate_line_tax(ci_org, 'gst_general', '2026-08-25', 'exempt', 100.00);
      if not res.is_taxable and res.tax_amount = 0.00 and res.gross_amount = 100.00 then
        insert into probe_results values ('tax_modes_calculation', true, 'Inclusive, zero-rated, and exempt tax modes calculate correctly');
      else
        insert into probe_results values ('tax_modes_calculation', false, 'Exempt calculation failed');
      end if;
    else
      insert into probe_results values ('tax_modes_calculation', false, 'Zero-rated calculation failed');
    end if;
  else
    insert into probe_results values ('tax_modes_calculation', false, 'Inclusive calculation failed');
  end if;

end $$;

select
  case when count(*) = 5 and bool_and(passed)
    then 'TAX REGIMES SQL PROBE: ALL 5 SUITES PASSED'
    else 'TAX REGIMES SQL PROBE: FAIL'
  end as probe_result
from probe_results;

select test_name, passed, detail from probe_results order by test_name;

rollback;
