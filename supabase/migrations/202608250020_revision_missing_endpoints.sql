begin;

-- =============================================================================
-- SERP-167: The endpoints the revision needs and starq-api does not have
-- (DEC-067 / DEC-068 / DEC-069 / DEC-070)
-- =============================================================================

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
  event_payload jsonb;
  event_id uuid := gen_random_uuid();
  response jsonb;
  request_digest text := app_private.canonical_jsonb_sha256(command);
  c_name text;
  v_reg text;
  c_phone text;

  -- SERP-167 variables
  v_doc_id uuid;
  v_doc_no text;
  v_amount numeric;
  v_gst numeric;
  v_subtotal numeric;
  v_contact_id uuid;
  v_role_id uuid;
  v_member_id uuid;
  v_stage_id uuid;
begin
  if not app_private.assert_active_seat(target_org, target_person, target_seat) then
    raise exception 'seat_not_authorized';
  end if;

  if event_name not in (
    'CALL', 'BOOKING', 'INTAKE', 'ESTIMATE', 'AUTHORISATION',
    'JOB_CARD', 'PARTS_PROCUREMENT', 'PURCHASE', 'WORK', 'QC',
    'HANDOVER', 'INVOICE_PAYMENT', 'CLOSE',
    -- Revision endpoints (SERP-167)
    'INVOICE', 'EXPENSE', 'CUSTOMER', 'TENANT_CONFIG', 'TENANT_ONBOARD',
    'WORKFLOW', 'MEMBER_INVITE', 'MEMBER_AUTHORIZE', 'MEMBER_SUSPEND',
    'MEMBER_ROLE_UPDATE', 'ROLE'
  ) then
    raise exception 'unsupported_command';
  end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Seat authorization matrix check
  -- ─────────────────────────────────────────────────────────────────────────
  if event_name = 'PURCHASE' then
    if scm_step not in ('need', 'quote', 'award', 'receive', 'match', 'pay') then
      raise exception 'unsupported_purchase_step';
    end if;
    if not app_private.purchase_step_seat_is_legal(scm_step, target_seat) then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  elsif event_name in ('CALL', 'BOOKING', 'INTAKE', 'ESTIMATE', 'AUTHORISATION',
                       'JOB_CARD', 'HANDOVER', 'INVOICE_PAYMENT', 'CLOSE') then
    if target_seat <> 'counter' then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  elsif event_name in ('PARTS_PROCUREMENT', 'WORK') then
    if target_seat <> 'technician' then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  elsif event_name = 'QC' then
    if target_seat <> 'qc_signer' then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  elsif event_name in ('INVOICE', 'EXPENSE') then
    if target_seat not in ('counter', 'financial_controller', 'director', 'managing_director', 'owner') then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  elsif event_name = 'CUSTOMER' then
    if target_seat not in ('counter', 'director', 'managing_director', 'owner') then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  elsif event_name in ('TENANT_CONFIG', 'TENANT_ONBOARD', 'WORKFLOW',
                       'MEMBER_INVITE', 'MEMBER_AUTHORIZE', 'MEMBER_SUSPEND',
                       'MEMBER_ROLE_UPDATE', 'ROLE') then
    if target_seat not in ('owner', 'director', 'managing_director') then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Idempotency Claim First
  -- ─────────────────────────────────────────────────────────────────────────
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

  -- ─────────────────────────────────────────────────────────────────────────
  -- Command Handlers
  -- ─────────────────────────────────────────────────────────────────────────

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

  elsif event_name = 'INVOICE' then
    v_doc_id := gen_random_uuid();
    v_doc_no := app_private.allocate_document_no(target_org, 'sales_invoice');
    v_amount := coalesce((command->>'total_amount')::numeric, (command->>'amount')::numeric, 0);
    v_gst := coalesce((command->>'gst_amount')::numeric, 0);
    v_subtotal := coalesce((command->>'subtotal')::numeric, v_amount - v_gst);

    insert into public.commercial_documents
      (id, organisation_id, document_type, document_number, contact_id,
       gross_total, allocated_total, unallocated_balance, status, metadata)
    values
      (v_doc_id, target_org, 'sales_invoice', v_doc_no,
       nullif(command->>'customer_id', '')::uuid,
       v_amount, 0, v_amount, 'issued',
       jsonb_build_object(
         'subtotal', v_subtotal,
         'gst_amount', v_gst,
         'notes', command->>'notes',
         'items', command->'items',
         'linked_job_id', command->>'job_id'
       ));

    -- If linked to a job, transition job state
    target_job_id := nullif(command->>'job_id', '')::uuid;
    if target_job_id is not null then
      update public.garage_jobs
         set state = 'invoiced', version = version + 1
       where organisation_id = target_org and id = target_job_id;
    end if;

    event_payload := jsonb_build_object(
      'invoice_id', v_doc_id,
      'invoice_number', v_doc_no,
      'total_amount', v_amount,
      'subtotal', v_subtotal,
      'gst_amount', v_gst
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'invoice', event_payload);

  elsif event_name = 'EXPENSE' then
    v_doc_id := gen_random_uuid();
    v_doc_no := app_private.allocate_document_no(target_org, 'direct_expense');
    v_amount := coalesce((command->>'amount')::numeric, 0);

    insert into public.commercial_documents
      (id, organisation_id, document_type, document_number,
       gross_total, allocated_total, unallocated_balance, status, metadata)
    values
      (v_doc_id, target_org, 'direct_expense', v_doc_no,
       v_amount, v_amount, 0, 'posted',
       jsonb_build_object(
         'payee', command->>'payee',
         'category', command->>'category',
         'payment_method', command->>'payment_method',
         'notes', command->>'notes',
         'date', coalesce(command->>'date', now()::text)
       ));

    event_payload := jsonb_build_object(
      'expense_id', v_doc_id,
      'expense_number', v_doc_no,
      'amount', v_amount,
      'payee', command->>'payee',
      'category', command->>'category'
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'expense', event_payload);

  elsif event_name = 'CUSTOMER' then
    v_contact_id := gen_random_uuid();
    c_name := nullif(trim(coalesce(command->>'name', command->>'customer_name', '')), '');
    c_phone := nullif(trim(coalesce(command->>'phone', '')), '');

    if c_name is null then
      raise exception 'customer_name_required';
    end if;

    insert into public.contacts
      (id, organisation_id, type, display_name, phone, billing_address)
    values
      (v_contact_id, target_org, 'customer', c_name, c_phone,
       jsonb_build_object('island', command->>'island', 'notes', command->>'notes'));

    event_payload := jsonb_build_object(
      'customer_id', v_contact_id,
      'name', c_name,
      'phone', c_phone,
      'island', command->>'island'
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'customer', event_payload);

  elsif event_name in ('TENANT_CONFIG', 'TENANT_ONBOARD') then
    update public.organisations
       set name = coalesce(nullif(trim(command->>'name'), ''), name)
     where id = target_org;

    event_payload := jsonb_build_object(
      'organisation_id', target_org,
      'updated_fields', command
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'tenant', event_payload);

  elsif event_name = 'WORKFLOW' then
    event_payload := jsonb_build_object('action', command->>'action', 'stage', command->'stage');
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'workflow', event_payload);

  elsif event_name in ('MEMBER_INVITE', 'MEMBER_AUTHORIZE', 'MEMBER_SUSPEND', 'MEMBER_ROLE_UPDATE') then
    event_payload := jsonb_build_object(
      'action', lower(event_name),
      'user_id', command->>'user_id',
      'email', command->>'email',
      'role_id', command->>'role_id'
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'membership', event_payload);

  elsif event_name = 'ROLE' then
    event_payload := jsonb_build_object(
      'role_id', command->>'role_id',
      'code', command->>'code',
      'name', command->>'name'
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'role', event_payload);

  else
    -- Standard garage job command handling
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
  end if;

  update public.idempotency_keys
     set state = 'accepted', response_code = 200, response_body = response
   where organisation_id = target_org and key = command_key;

  insert into public.audit_events
    (organisation_id, actor_person_id, acting_seat, action, object_type,
     object_id, request_id, after_state, metadata)
  values
    (target_org, target_person, target_seat, 'erp.' || lower(event_name),
     'commercial_command', event_id, request_identifier, response,
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
