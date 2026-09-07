-- tests/job_customer_vehicle_phone_probe.sql
-- Probes for SERP-144: Customer, vehicle and phone persistence on garage_jobs & pulse

begin;

do $$
declare
  org_id uuid := '00000000-0000-4000-8000-000000000001';
  person_id uuid := '00000000-0000-4000-8000-000000000002';
  cmd_key uuid := gen_random_uuid();
  req_id uuid := gen_random_uuid();
  call_res jsonb;
  pulse_res jsonb;
  job_row public.garage_jobs%rowtype;
  first_job jsonb;
begin
  -- 1. Check schema columns exist
  if not exists (
    select 1 from information_schema.columns 
     where table_schema = 'public' and table_name = 'garage_jobs' and column_name = 'customer_name'
  ) or not exists (
    select 1 from information_schema.columns 
     where table_schema = 'public' and table_name = 'garage_jobs' and column_name = 'vehicle_reg'
  ) or not exists (
    select 1 from information_schema.columns 
     where table_schema = 'public' and table_name = 'garage_jobs' and column_name = 'customer_phone'
  ) then
    raise exception 'SERP-144 probe: required columns missing on garage_jobs';
  end if;

  -- 2. Execute api_garage_command CALL with Ali / 7774356 / AA01A-P2327
  call_res := public.api_garage_command(
    org_id,
    person_id,
    'counter',
    cmd_key,
    jsonb_build_object(
      'sop', 'CALL',
      'customer_name', 'Ali Musthaq',
      'phone', '7774356',
      'vehicle_reg', 'AA01A-P2327',
      'consent', true
    ),
    req_id
  );

  if (call_res->>'ok')::boolean is not true then
    raise exception 'SERP-144 probe: api_garage_command CALL failed: %', call_res;
  end if;

  -- 3. Verify public.garage_jobs row contains discrete fields
  select * into job_row from public.garage_jobs
   where organisation_id = org_id and job_no = call_res->'event'->>'job_no';

  if job_row.customer_name <> 'Ali Musthaq' then
    raise exception 'SERP-144 probe: customer_name mismatch. Expected Ali Musthaq, got %', job_row.customer_name;
  end if;
  if job_row.vehicle_reg <> 'AA01A-P2327' then
    raise exception 'SERP-144 probe: vehicle_reg mismatch. Expected AA01A-P2327, got %', job_row.vehicle_reg;
  end if;
  if job_row.customer_phone <> '7774356' then
    raise exception 'SERP-144 probe: customer_phone mismatch. Expected 7774356, got %', job_row.customer_phone;
  end if;

  -- 4. Verify api_garage_pulse returns discrete fields in jobs array and campaign
  pulse_res := public.api_garage_pulse(org_id);
  first_job := pulse_res->'jobs'->0;

  if first_job->>'customer_name' <> 'Ali Musthaq' then
    raise exception 'SERP-144 probe: pulse customer_name mismatch: %', first_job;
  end if;
  if first_job->>'vehicle_reg' <> 'AA01A-P2327' then
    raise exception 'SERP-144 probe: pulse vehicle_reg mismatch: %', first_job;
  end if;
  if first_job->>'customer_phone' <> '7774356' or first_job->>'phone' <> '7774356' then
    raise exception 'SERP-144 probe: pulse phone mismatch: %', first_job;
  end if;

  raise notice 'SERP-144 SQL probe PASS: customer_name, vehicle_reg, and phone persisted and pulsed cleanly';
end
$$;

rollback;
