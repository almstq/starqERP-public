begin;

-- =============================================================================
-- SERP-144: Customer, vehicle and phone persistence on garage_jobs & pulse
-- (DEC-054 / DEC-072)
-- =============================================================================

alter table public.garage_jobs
  add column if not exists customer_name text,
  add column if not exists vehicle_reg text,
  add column if not exists customer_phone text;

-- Backfill discrete customer & vehicle columns from historical summary
update public.garage_jobs
   set customer_name = split_part(summary, ' - ', 1),
       vehicle_reg = split_part(summary, ' - ', 2)
 where customer_name is null
   and summary like '% - %';

-- ─────────────────────────────────────────────────────────────────────────────
-- api_garage_command (Hardened with customer_name, vehicle_reg, customer_phone)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.api_garage_command(
  target_org uuid,
  target_person uuid,
  target_seat text,
  command_key uuid,
  command jsonb,
  request_identifier uuid
) returns jsonb language plpgsql security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  existing public.idempotency_keys%rowtype;
  event_name text := upper(trim(coalesce(command->>'type', command->>'sop', '')));
  scm_step text := lower(trim(coalesce(command->>'scm_step', command->>'action', '')));
  required_seat text;
  target_job public.garage_jobs%rowtype;
  target_job_id uuid;
  target_job_no text;
  next_state text;
  is_valid_trans boolean;
  dyn_err text;
  expected_states text[];
  event_payload jsonb;
  event_id uuid := gen_random_uuid();
  response jsonb;
  request_digest text := app_private.canonical_jsonb_sha256(command);
  c_name text;
  v_reg text;
  c_phone text;
begin
  if not app_private.assert_active_seat(target_org, target_person, target_seat) then
    raise exception 'seat_not_authorized';
  end if;

  if event_name not in ('CALL', 'BOOKING', 'INTAKE', 'ESTIMATE', 'AUTHORISATION',
                        'JOB_CARD', 'PARTS_PROCUREMENT', 'PURCHASE', 'WORK', 'QC',
                        'HANDOVER', 'INVOICE_PAYMENT', 'CLOSE') then
    raise exception 'unsupported_command';
  end if;

  required_seat := case
    when event_name in ('CALL', 'BOOKING', 'INTAKE', 'ESTIMATE', 'AUTHORISATION',
                        'JOB_CARD', 'HANDOVER', 'INVOICE_PAYMENT', 'CLOSE') then 'counter'
    when event_name in ('PARTS_PROCUREMENT', 'WORK') then 'technician'
    when event_name = 'QC' then 'qc_signer'
    else null
  end;

  if event_name = 'PURCHASE' then
    if scm_step not in ('need', 'quote', 'award', 'receive', 'match', 'pay') then
      raise exception 'unsupported_purchase_step';
    end if;
    if not app_private.purchase_step_seat_is_legal(scm_step, target_seat) then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  else
    if required_seat is null or required_seat <> target_seat then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  end if;

  -- Idempotency Claim First
  begin
    insert into public.idempotency_keys
      (organisation_id, key, command_type, request_hash, state, expires_at)
    values
      (target_org, command_key, event_name, request_digest, 'processing', now() + interval '7 days');
  exception when unique_violation then
    select * into existing
      from public.idempotency_keys
     where organisation_id = target_org and key = command_key;

    if not found then
      raise exception 'idempotency_replay_missing';
    end if;
    if existing.request_hash <> request_digest or existing.command_type <> event_name then
      raise exception 'idempotency_key_conflict';
    end if;
    return coalesce(
      existing.response_body,
      jsonb_build_object('ok', false, 'state', existing.state)
    );
  end;

  if event_name = 'CALL' then
    c_name := nullif(left(trim(coalesce(command->>'customer_name', command->>'customer', '')), 200), '');
    v_reg := nullif(left(trim(coalesce(command->>'vehicle_reg', command->>'vehicle', '')), 100), '');
    c_phone := nullif(left(trim(coalesce(command->>'phone', command->>'customer_phone', '')), 50), '');

    if c_name is null or v_reg is null or coalesce((command->>'consent')::boolean, false) is not true then
      raise exception 'call_requires_customer_vehicle_and_consent';
    end if;

    target_job_id := gen_random_uuid();
    target_job_no := app_private.allocate_document_no(target_org, 'garage_job');
    insert into public.garage_jobs
      (id, organisation_id, job_no, state, summary, customer_name, vehicle_reg, customer_phone)
    values
      (target_job_id, target_org, target_job_no, 'call',
       left(c_name || ' - ' || v_reg, 500),
       c_name, v_reg, c_phone);
    next_state := 'call';
  else
    target_job_id := nullif(command->>'job_id', '')::uuid;
    if target_job_id is null and nullif(trim(command->>'job_no'), '') is not null then
      select id into target_job_id from public.garage_jobs
       where organisation_id = target_org and job_no = trim(command->>'job_no');
    end if;
    if target_job_id is null then
      raise exception 'job_required';
    end if;
    select * into target_job from public.garage_jobs
     where organisation_id = target_org and id = target_job_id for update;
    if not found then
      raise exception 'job_not_found';
    end if;
    target_job_no := target_job.job_no;
    c_name := target_job.customer_name;
    v_reg := target_job.vehicle_reg;
    c_phone := target_job.customer_phone;

    if event_name = 'PURCHASE' then
      next_state := target_job.state;
    else
      select v.next_state, v.is_valid, v.err_msg
        into next_state, is_valid_trans, dyn_err
        from app_private.validate_workflow_transition(target_org, 'garage_job', target_job.state, event_name) v;

      if not coalesce(is_valid_trans, false) then
        raise exception 'illegal_state_transition';
      end if;
    end if;
  end if;

  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'summary', nullif(left(trim(coalesce(command->>'summary', '')), 500), ''),
    'customer_name', coalesce(c_name, nullif(left(trim(coalesce(command->>'customer_name', command->>'customer', '')), 200), '')),
    'phone', coalesce(c_phone, nullif(left(trim(coalesce(command->>'phone', command->>'customer_phone', '')), 50), '')),
    'customer_phone', coalesce(c_phone, nullif(left(trim(coalesce(command->>'phone', command->>'customer_phone', '')), 50), '')),
    'vehicle_reg', coalesce(v_reg, nullif(left(trim(coalesce(command->>'vehicle_reg', command->>'vehicle', '')), 100), '')),
    'scm_step', nullif(scm_step, ''),
    'item', nullif(left(trim(coalesce(command->>'item', command->>'description', '')), 300), ''),
    'qty', nullif(command->>'qty', ''),
    'amount', nullif(coalesce(command->>'amount', command->>'cost', ''), '')
  ));

  insert into public.job_events
    (id, organisation_id, job_id, event_type, from_state, to_state,
     actor_person_id, acting_seat, idempotency_key, payload)
  values
    (event_id, target_org, target_job_id, event_name,
     case when event_name = 'CALL' then null else target_job.state end,
     next_state, target_person, target_seat, command_key, event_payload);

  if event_name <> 'PURCHASE' and event_name <> 'CALL' then
    update public.garage_jobs
       set state = next_state,
           version = version + 1,
           closed_at = case when next_state = 'closed' then now() else closed_at end
     where organisation_id = target_org and id = target_job_id;
  end if;

  response := jsonb_build_object(
    'ok', true,
    'state', 'accepted',
    'event', jsonb_build_object(
      'id', event_id,
      'type', event_name,
      'job_id', target_job_id,
      'job_no', target_job_no,
      'customer_name', c_name,
      'vehicle_reg', v_reg,
      'phone', c_phone,
      'to_state', next_state,
      'fields', event_payload
    )
  );

  update public.idempotency_keys
     set state = 'accepted', response_code = 200, response_body = response
   where organisation_id = target_org and key = command_key;

  insert into public.audit_events
    (organisation_id, actor_person_id, acting_seat, action, object_type,
     object_id, request_id, after_state, metadata)
  values
    (target_org, target_person, target_seat, 'garage.' || lower(event_name),
     'job_event', event_id, request_identifier, response,
     jsonb_build_object('idempotency_key', command_key));

  return response;
end
$$;

alter function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid)
  set search_path = public, app_private, extensions, pg_temp;

revoke all on function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- api_garage_pulse (Hardened with customer_name, vehicle_reg, customer_phone)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.api_garage_pulse(
  target_org uuid
) returns jsonb language plpgsql security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  active_job public.garage_jobs%rowtype;
  next_event text;
  required_seat text;
begin
  select * into active_job from public.garage_jobs
   where organisation_id = target_org and state not in ('closed', 'cancelled')
   order by opened_at desc limit 1;

  if active_job.id is null then
    next_event := 'CALL';
    required_seat := 'counter';
  else
    next_event := case active_job.state
      when 'call' then 'BOOKING'
      when 'booked' then 'INTAKE'
      when 'intake' then 'ESTIMATE'
      when 'estimated' then 'AUTHORISATION'
      when 'authorised' then 'JOB_CARD'
      when 'job_card' then 'PARTS_PROCUREMENT'
      when 'parts' then 'WORK'
      when 'work' then 'QC'
      when 'qc' then 'HANDOVER'
      when 'handover' then 'INVOICE_PAYMENT'
      when 'invoice_payment' then 'CLOSE'
      else null
    end;
    required_seat := case
      when next_event in ('CALL', 'BOOKING', 'INTAKE', 'ESTIMATE', 'AUTHORISATION', 'JOB_CARD', 'HANDOVER', 'INVOICE_PAYMENT', 'CLOSE') then 'counter'
      when next_event in ('PARTS_PROCUREMENT', 'WORK') then 'technician'
      when next_event = 'QC' then 'qc_signer'
      else null
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', j.id,
      'job_id', j.id,
      'job_no', j.job_no,
      'state', j.state,
      'step', upper(j.state),
      'summary', j.summary,
      'customer_name', coalesce(j.customer_name, split_part(j.summary, ' - ', 1)),
      'vehicle_reg', coalesce(j.vehicle_reg, split_part(j.summary, ' - ', 2)),
      'customer_phone', j.customer_phone,
      'phone', j.customer_phone,
      'version', j.version,
      'opened_at', j.opened_at,
      'closed_at', j.closed_at
    ) order by j.opened_at desc) from public.garage_jobs j
      where j.organisation_id = target_org), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'type', e.event_type, 'job_id', e.job_id,
      'from_state', e.from_state, 'to_state', e.to_state,
      'actor_person_id', e.actor_person_id, 'actor_role', e.acting_seat,
      'fields', e.payload, 'ts', e.occurred_at
    ) order by e.occurred_at desc) from (
      select * from public.job_events where organisation_id = target_org
      order by occurred_at desc limit 30
    ) e), '[]'::jsonb),
    'campaign', jsonb_build_object(
      'empty', active_job.id is null,
      'job_id', active_job.id,
      'job_no', active_job.job_no,
      'customer_name', active_job.customer_name,
      'vehicle_reg', active_job.vehicle_reg,
      'phone', active_job.customer_phone,
      'event_type', next_event,
      'legal_next_step', next_event,
      'title', case when active_job.id is null then 'Bay empty' else 'Next legal play' end,
      'play', case when next_event is null then 'No legal play available'
                   else replace(initcap(lower(next_event)), '_', ' ') end,
      'required_seat', required_seat
    )
  );
end
$$;

alter function public.api_garage_pulse(uuid)
  set search_path = public, app_private, extensions, pg_temp;

revoke all on function public.api_garage_pulse(uuid)
  from public, anon, authenticated;
grant execute on function public.api_garage_pulse(uuid)
  to authenticated, service_role;

commit;
