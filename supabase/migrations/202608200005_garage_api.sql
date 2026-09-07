begin;

create or replace function app_private.assert_active_seat(
  target_org uuid,
  target_person uuid,
  target_seat text
) returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.memberships m
      join public.membership_seats ms on ms.membership_id = m.id
     where m.organisation_id = target_org
       and m.person_id = target_person
       and m.status = 'active'
       and m.valid_from <= now()
       and (m.valid_to is null or m.valid_to > now())
       and ms.seat_code = target_seat
       and ms.revoked_at is null
  )
$$;

create or replace function public.api_garage_command(
  target_org uuid,
  target_person uuid,
  target_seat text,
  command_key uuid,
  command jsonb,
  request_identifier uuid
) returns jsonb language plpgsql security definer
set search_path = public, app_private, pg_temp as $$
declare
  existing public.idempotency_keys%rowtype;
  event_name text := upper(trim(coalesce(command->>'type', command->>'sop', '')));
  scm_step text := lower(trim(coalesce(command->>'scm_step', command->>'action', '')));
  required_seat text;
  target_job public.garage_jobs%rowtype;
  target_job_id uuid;
  target_job_no text;
  next_state text;
  expected_states text[];
  event_payload jsonb;
  event_id uuid := gen_random_uuid();
  response jsonb;
  request_digest text := encode(digest(command::text, 'sha256'), 'hex');
begin
  if not app_private.assert_active_seat(target_org, target_person, target_seat) then
    raise exception 'seat_not_authorized';
  end if;

  select * into existing
    from public.idempotency_keys
   where organisation_id = target_org and key = command_key;
  if found then
    if existing.request_hash <> request_digest or existing.command_type <> event_name then
      raise exception 'idempotency_key_conflict';
    end if;
    return coalesce(existing.response_body, jsonb_build_object('ok', false, 'state', existing.state));
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
    when event_name = 'PURCHASE' and scm_step in ('award', 'match') then 'financial_controller'
    when event_name = 'PURCHASE' and scm_step = 'pay' then 'payer'
    when event_name = 'PURCHASE' and scm_step in ('need', 'quote', 'receive') then target_seat
    else null
  end;

  if event_name = 'PURCHASE' and scm_step not in ('need', 'quote', 'award', 'receive', 'match', 'pay') then
    raise exception 'unsupported_purchase_step';
  end if;
  if required_seat is null or required_seat <> target_seat then
    raise exception 'acting_seat_not_legal_for_command';
  end if;

  insert into public.idempotency_keys
    (organisation_id, key, command_type, request_hash, state, expires_at)
  values
    (target_org, command_key, event_name, request_digest, 'processing', now() + interval '7 days');

  if event_name = 'CALL' then
    if nullif(trim(coalesce(command->>'customer_name', command->>'customer', '')), '') is null
       or nullif(trim(coalesce(command->>'vehicle_reg', command->>'vehicle', '')), '') is null
       or coalesce((command->>'consent')::boolean, false) is not true then
      raise exception 'call_requires_customer_vehicle_and_consent';
    end if;
    target_job_id := gen_random_uuid();
    target_job_no := app_private.allocate_document_no(target_org, 'garage_job');
    insert into public.garage_jobs
      (id, organisation_id, job_no, state, summary)
    values
      (target_job_id, target_org, target_job_no, 'call',
       left(trim(command->>'customer_name') || ' - ' || trim(command->>'vehicle_reg'), 500));
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

    next_state := case event_name
      when 'BOOKING' then 'booked'
      when 'INTAKE' then 'intake'
      when 'ESTIMATE' then 'estimated'
      when 'AUTHORISATION' then 'authorised'
      when 'JOB_CARD' then 'job_card'
      when 'PARTS_PROCUREMENT' then 'parts'
      when 'WORK' then 'work'
      when 'QC' then 'qc'
      when 'HANDOVER' then 'handover'
      when 'INVOICE_PAYMENT' then 'invoice_payment'
      when 'CLOSE' then 'closed'
      else target_job.state
    end;
    expected_states := case event_name
      when 'BOOKING' then array['call']
      when 'INTAKE' then array['booked']
      when 'ESTIMATE' then array['intake']
      when 'AUTHORISATION' then array['estimated']
      when 'JOB_CARD' then array['authorised']
      when 'PARTS_PROCUREMENT' then array['job_card']
      when 'WORK' then array['job_card', 'parts']
      when 'QC' then array['work']
      when 'HANDOVER' then array['qc']
      when 'INVOICE_PAYMENT' then array['handover']
      when 'CLOSE' then array['invoice_payment']
      when 'PURCHASE' then array[target_job.state]
      else array[]::text[]
    end;
    if not (target_job.state = any(expected_states)) then
      raise exception 'illegal_state_transition';
    end if;
  end if;

  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'summary', nullif(left(trim(coalesce(command->>'summary', '')), 500), ''),
    'customer_name', nullif(left(trim(coalesce(command->>'customer_name', command->>'customer', '')), 200), ''),
    'phone', nullif(left(trim(coalesce(command->>'phone', '')), 50), ''),
    'vehicle_reg', nullif(left(trim(coalesce(command->>'vehicle_reg', command->>'vehicle', '')), 100), ''),
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

create or replace function public.api_garage_pulse(
  target_org uuid,
  target_person uuid,
  target_seat text
) returns jsonb language plpgsql stable security definer
set search_path = public, app_private, pg_temp as $$
declare
  active_job public.garage_jobs%rowtype;
  next_event text;
  required_seat text;
  result jsonb;
begin
  if not app_private.assert_active_seat(target_org, target_person, target_seat) then
    raise exception 'seat_not_authorized';
  end if;
  select * into active_job from public.garage_jobs
   where organisation_id = target_org and state not in ('closed', 'cancelled')
   order by opened_at asc limit 1;

  if not found then
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

  select jsonb_build_object(
    'ok', true,
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', j.id, 'job_id', j.id, 'job_no', j.job_no, 'state', j.state,
      'step', upper(j.state), 'summary', j.summary, 'version', j.version,
      'opened_at', j.opened_at, 'closed_at', j.closed_at
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
      'event_type', next_event,
      'legal_next_step', next_event,
      'title', case when active_job.id is null then 'Bay empty' else 'Next legal play' end,
      'play', case when next_event is null then 'No legal play available'
                   else replace(initcap(lower(next_event)), '_', ' ') end,
      'cta_label', case when next_event is null then 'NO LEGAL ACTION'
                        else upper(replace(next_event, '_', ' ')) end,
      'stamp', coalesce(next_event, 'BLOCKED'),
      'required_seat', required_seat,
      'legal_seat', required_seat,
      'locked', required_seat is null or target_seat <> required_seat,
      'is_authorized', required_seat is not null and target_seat = required_seat,
      'wait', false
    )
  ) into result;
  return result;
end
$$;

create or replace function public.api_garage_purchases(
  target_org uuid,
  target_person uuid,
  target_seat text
) returns jsonb language plpgsql stable security definer
set search_path = public, app_private, pg_temp as $$
begin
  if not app_private.assert_active_seat(target_org, target_person, target_seat) then
    raise exception 'seat_not_authorized';
  end if;
  return jsonb_build_object(
    'ok', true,
    'purchases', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'type', e.event_type, 'job_id', e.job_id,
      'actor_person_id', e.actor_person_id, 'actor_role', e.acting_seat,
      'fields', e.payload, 'ts', e.occurred_at
    ) order by e.occurred_at desc)
    from public.job_events e
    where e.organisation_id = target_org and e.event_type = 'PURCHASE'), '[]'::jsonb)
  );
end
$$;

revoke all on function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.api_garage_pulse(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.api_garage_purchases(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid) to service_role;
grant execute on function public.api_garage_pulse(uuid, uuid, text) to service_role;
grant execute on function public.api_garage_purchases(uuid, uuid, text) to service_role;

commit;
