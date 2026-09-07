begin;

-- SERP-182
-- 0013 remains reserved for the live-row workflow migration described by SERP-162.
-- This migration fixes concurrent replay behavior without changing business policy.

create or replace function app_private.canonical_jsonb_sha256(payload jsonb)
returns text
language sql
immutable
strict
set search_path = extensions, pg_temp
as $$
  -- jsonb has already discarded insignificant whitespace and normalized object-key order.
  -- The helper names that invariant so later command functions do not drift back to raw JSON text.
  select encode(digest(payload::text, 'sha256'), 'hex')
$$;

revoke all on function app_private.canonical_jsonb_sha256(jsonb)
  from public, anon, authenticated;

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

  -- Claim first. If another identical request owns the key, the unique constraint waits for
  -- that transaction and raises unique_violation after it commits. The handler then reads and
  -- returns the winner's durable response. No business mutation occurs before this claim.
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

alter function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid)
  set search_path = public, app_private, extensions, pg_temp;

revoke all on function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid)
  to service_role;

commit;
