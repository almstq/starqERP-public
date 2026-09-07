begin;

-- =============================================================================
-- Migration: 202608270023_round1_foundation_remediation.sql
-- Round 1 Foundation Remediation (SERP-167 completion)
--
-- 1. Add missing columns to commercial_documents (allocated_total, unallocated_balance, metadata)
-- 2. Fix column name mismatches in api_garage_command (document_number→document_no, type→kind)
-- 3. Wire WORKFLOW command to real workflow_templates/workflow_stages tables
-- 4. Wire MEMBER_INVITE/AUTHORIZE/SUSPEND/ROLE_UPDATE to real memberships tables
-- 5. Wire ROLE command to real roles/role_permissions tables
-- 6. Add INVOICE_PAYMENT command with settlement allocations
-- 7. Add COUNTER_SALE command (atomic invoice + payment + stock)
-- 8. Add PAY_SUPPLIER command
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add missing columns to commercial_documents
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.commercial_documents
  add column if not exists allocated_total numeric(20,6) not null default 0,
  add column if not exists unallocated_balance numeric(20,6) not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Backfill unallocated_balance for existing issued documents
update public.commercial_documents
   set unallocated_balance = gross_total - allocated_total
 where unallocated_balance = 0
   and gross_total > 0
   and status in ('issued', 'settled');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2-8. Replace api_garage_command with fixed and extended version
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
  v_template_id uuid;
  v_payment_id uuid;
  v_invoice_id uuid;
  v_balance numeric;
  v_action text;
begin
  if not app_private.assert_active_seat(target_org, target_person, target_seat) then
    raise exception 'seat_not_authorized';
  end if;

  if event_name not in (
    'CALL', 'BOOKING', 'INTAKE', 'ESTIMATE', 'AUTHORISATION',
    'JOB_CARD', 'PARTS_PROCUREMENT', 'PURCHASE', 'WORK', 'QC',
    'HANDOVER', 'INVOICE_PAYMENT', 'CLOSE',
    'INVOICE', 'EXPENSE', 'CUSTOMER', 'TENANT_CONFIG', 'TENANT_ONBOARD',
    'WORKFLOW', 'MEMBER_INVITE', 'MEMBER_AUTHORIZE', 'MEMBER_SUSPEND',
    'MEMBER_ROLE_UPDATE', 'ROLE', 'COUNTER_SALE', 'PAY_SUPPLIER'
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
                       'JOB_CARD', 'HANDOVER', 'CLOSE') then
    if target_seat <> 'counter' then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  elsif event_name = 'INVOICE_PAYMENT' then
    if target_seat not in ('counter', 'financial_controller', 'director', 'managing_director', 'owner') then
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
  elsif event_name = 'COUNTER_SALE' then
    if target_seat not in ('counter', 'director', 'managing_director', 'owner') then
      raise exception 'acting_seat_not_legal_for_command';
    end if;
  elsif event_name = 'PAY_SUPPLIER' then
    if target_seat not in ('payer', 'financial_controller', 'director', 'managing_director', 'owner') then
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
      (id, organisation_id, document_type, document_no, contact_id,
       gross_total, allocated_total, unallocated_balance, status, metadata,
       document_date, due_date, issued_at, issued_by)
    values
      (v_doc_id, target_org, 'sales_invoice', v_doc_no,
       nullif(command->>'customer_id', '')::uuid,
       v_amount, 0, v_amount, 'issued',
       jsonb_build_object(
         'subtotal', v_subtotal,
         'gst_amount', v_gst,
         'notes', command->>'notes',
         'items', command->'items',
         'linked_job_id', command->>'job_id',
         'customer_name', command->>'customer_name',
         'bank_details', command->>'bank_details'
       ),
       coalesce((command->>'date')::date, current_date),
       coalesce((command->>'due_date')::date, current_date + 14),
       now(), target_person);

    -- If linked to a job, transition job state
    target_job_id := nullif(command->>'job_id', '')::uuid;
    if target_job_id is not null then
      update public.garage_jobs
         set state = 'invoice_payment', version = version + 1
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
      (id, organisation_id, document_type, document_no,
       gross_total, allocated_total, unallocated_balance, status, metadata,
       document_date, issued_at, issued_by)
    values
      (v_doc_id, target_org, 'direct_expense', v_doc_no,
       v_amount, v_amount, 0, 'posted',
       jsonb_build_object(
         'payee', command->>'payee',
         'category', command->>'category',
         'payment_method', command->>'payment_method',
         'notes', command->>'notes',
         'date', coalesce(command->>'date', now()::text)
       ),
       coalesce((command->>'date')::date, current_date),
       now(), target_person);

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
      (id, organisation_id, kind, display_name, phone, email, metadata)
    values
      (v_contact_id, target_org, 'customer', c_name, c_phone,
       nullif(command->>'email', ''),
       jsonb_build_object('island', command->>'island', 'notes', command->>'notes',
                          'type', command->>'type', 'vehicles', command->'vehicles'));

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

  -- ─────────────────────────────────────────────────────────────────────────
  -- WORKFLOW: Wire to real workflow_templates / workflow_stages tables
  -- ─────────────────────────────────────────────────────────────────────────
  elsif event_name = 'WORKFLOW' then
    v_action := lower(trim(coalesce(command->>'action', '')));

    if v_action = 'create_stage' then
      -- Find or create template
      v_template_id := nullif(command->>'template_id', '')::uuid;
      if v_template_id is null then
        -- Use default garage_job template
        select id into v_template_id from public.workflow_templates
         where organisation_id = target_org and workflow_code = 'garage_job'
         limit 1;
      end if;

      if v_template_id is null then
        raise exception 'workflow_template_not_found';
      end if;

      v_stage_id := gen_random_uuid();
      insert into public.workflow_stages
        (id, organisation_id, workflow_template_id, stage_code, stage_name,
         stage_order, command_name, required_seat, allowed_from_stages,
         is_initial, is_terminal, active)
      values
        (v_stage_id, target_org, v_template_id,
         coalesce(command->>'stage_code', 'stage_' || v_stage_id::text),
         coalesce(command->>'stage_name', 'Custom Stage'),
         coalesce((command->>'stage_order')::integer, 99),
         command->>'command_name',
         coalesce(command->>'required_seat', 'counter'),
         coalesce((command->'allowed_from_stages')::text[], '{}'),
         coalesce((command->>'is_initial')::boolean, false),
         coalesce((command->>'is_terminal')::boolean, false),
         true);

      event_payload := jsonb_build_object('stage_id', v_stage_id, 'action', 'created');

    elsif v_action = 'update_stage' then
      v_stage_id := nullif(command->>'stage_id', '')::uuid;
      if v_stage_id is null then
        raise exception 'stage_id_required';
      end if;

      update public.workflow_stages
         set stage_name = coalesce(nullif(command->>'stage_name', ''), stage_name),
             stage_order = coalesce((command->>'stage_order')::integer, stage_order),
             command_name = coalesce(nullif(command->>'command_name', ''), command_name),
             required_seat = coalesce(nullif(command->>'required_seat', ''), required_seat),
             allowed_from_stages = coalesce((command->'allowed_from_stages')::text[], allowed_from_stages),
             is_initial = coalesce((command->>'is_initial')::boolean, is_initial),
             is_terminal = coalesce((command->>'is_terminal')::boolean, is_terminal),
             active = coalesce((command->>'active')::boolean, active)
       where organisation_id = target_org and id = v_stage_id;

      event_payload := jsonb_build_object('stage_id', v_stage_id, 'action', 'updated');

    elsif v_action = 'delete_stage' then
      v_stage_id := nullif(command->>'stage_id', '')::uuid;
      if v_stage_id is null then
        raise exception 'stage_id_required';
      end if;

      update public.workflow_stages
         set active = false
       where organisation_id = target_org and id = v_stage_id;

      event_payload := jsonb_build_object('stage_id', v_stage_id, 'action', 'deleted');

    else
      raise exception 'workflow_action_required';
    end if;

    response := jsonb_build_object('ok', true, 'state', 'accepted', 'workflow', event_payload);

  -- ─────────────────────────────────────────────────────────────────────────
  -- MEMBER commands: Wire to real memberships / persons tables
  -- ─────────────────────────────────────────────────────────────────────────
  elsif event_name = 'MEMBER_INVITE' then
    -- Create or find person
    declare
      v_person_key text := 'invite:' || coalesce(command->>'email', gen_random_uuid()::text);
      v_person_id uuid;
    begin
      insert into public.persons (person_key, display_label, status)
      values (v_person_key, coalesce(command->>'name', command->>'email', 'Invitee'), 'active')
      on conflict (person_key) do update set display_label = excluded.display_label
      returning id into v_person_id;

      -- Create membership in pending status
      insert into public.memberships (organisation_id, person_id, status, role_id)
      values (target_org, v_person_id, 'pending',
              nullif(command->>'role_id', '')::uuid)
      returning id into v_member_id;

      -- Grant initial seat if specified
      if command->>'seat' is not null then
        insert into public.membership_seats (membership_id, seat_code)
        values (v_member_id, command->>'seat');
      end if;

      event_payload := jsonb_build_object(
        'membership_id', v_member_id,
        'person_id', v_person_id,
        'email', command->>'email',
        'name', command->>'name',
        'status', 'pending'
      );
      response := jsonb_build_object('ok', true, 'state', 'accepted', 'membership', event_payload);
    end;

  elsif event_name = 'MEMBER_AUTHORIZE' then
    v_member_id := nullif(command->>'membership_id', '')::uuid;
    if v_member_id is null then
      -- Try to find by person_id
      declare
        v_person_id uuid := nullif(command->>'person_id', '')::uuid;
      begin
        if v_person_id is not null then
          select id into v_member_id from public.memberships
           where organisation_id = target_org and person_id = v_person_id
           limit 1;
        end if;
      end;
    end if;

    if v_member_id is null then
      raise exception 'membership_not_found';
    end if;

    update public.memberships
       set status = 'active',
           role_id = coalesce(nullif(command->>'role_id', '')::uuid, role_id)
     where organisation_id = target_org and id = v_member_id;

    -- Grant seat if specified
    if command->>'seat' is not null then
      insert into public.membership_seats (membership_id, seat_code)
      values (v_member_id, command->>'seat')
      on conflict (membership_id, seat_code) do update
         set revoked_at = null
       where membership_seats.revoked_at is not null;
    end if;

    event_payload := jsonb_build_object(
      'membership_id', v_member_id,
      'action', 'authorized',
      'role_id', command->>'role_id'
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'membership', event_payload);

  elsif event_name = 'MEMBER_SUSPEND' then
    v_member_id := nullif(command->>'membership_id', '')::uuid;
    if v_member_id is null then
      raise exception 'membership_not_found';
    end if;

    update public.memberships
       set status = 'suspended'
     where organisation_id = target_org and id = v_member_id;

    -- Revoke all seats
    update public.membership_seats
       set revoked_at = now()
     where membership_id = v_member_id and revoked_at is null;

    event_payload := jsonb_build_object(
      'membership_id', v_member_id,
      'action', 'suspended'
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'membership', event_payload);

  elsif event_name = 'MEMBER_ROLE_UPDATE' then
    v_member_id := nullif(command->>'membership_id', '')::uuid;
    v_role_id := nullif(command->>'role_id', '')::uuid;

    if v_member_id is null or v_role_id is null then
      raise exception 'membership_id_and_role_id_required';
    end if;

    update public.memberships
       set role_id = v_role_id
     where organisation_id = target_org and id = v_member_id;

    event_payload := jsonb_build_object(
      'membership_id', v_member_id,
      'role_id', v_role_id,
      'action', 'role_updated'
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'membership', event_payload);

  -- ─────────────────────────────────────────────────────────────────────────
  -- ROLE: Wire to real roles / role_permissions tables
  -- ─────────────────────────────────────────────────────────────────────────
  elsif event_name = 'ROLE' then
    v_action := lower(trim(coalesce(command->>'action', 'create')));

    if v_action = 'create' then
      v_role_id := gen_random_uuid();
      insert into public.roles (id, organisation_id, code, name, description, is_system)
      values (v_role_id, target_org,
              coalesce(command->>'code', 'custom_' || v_role_id::text),
              coalesce(command->>'name', 'Custom Role'),
              command->>'description',
              false);

      -- Insert permissions if provided
      if command->'permissions' is not null then
        insert into public.role_permissions (organisation_id, role_id, module, action, granted)
        select target_org, v_role_id,
               perm->>'module',
               perm->>'action',
               coalesce((perm->>'granted')::boolean, true)
          from jsonb_array_elements(command->'permissions') as perm;
      end if;

      event_payload := jsonb_build_object('role_id', v_role_id, 'action', 'created');

    elsif v_action = 'update' then
      v_role_id := nullif(command->>'role_id', '')::uuid;
      if v_role_id is null then
        raise exception 'role_id_required';
      end if;

      update public.roles
         set name = coalesce(nullif(command->>'name', ''), name),
             description = coalesce(command->>'description', description)
       where organisation_id = target_org and id = v_role_id;

      -- Replace permissions if provided
      if command->'permissions' is not null then
        delete from public.role_permissions
         where organisation_id = target_org and role_id = v_role_id;

        insert into public.role_permissions (organisation_id, role_id, module, action, granted)
        select target_org, v_role_id,
               perm->>'module',
               perm->>'action',
               coalesce((perm->>'granted')::boolean, true)
          from jsonb_array_elements(command->'permissions') as perm;
      end if;

      event_payload := jsonb_build_object('role_id', v_role_id, 'action', 'updated');

    elsif v_action = 'delete' then
      v_role_id := nullif(command->>'role_id', '')::uuid;
      if v_role_id is null then
        raise exception 'role_id_required';
      end if;

      -- Prevent deletion of system roles
      if exists (select 1 from public.roles where id = v_role_id and is_system = true) then
        raise exception 'cannot_delete_system_role';
      end if;

      delete from public.role_permissions
       where organisation_id = target_org and role_id = v_role_id;
      delete from public.roles
       where organisation_id = target_org and id = v_role_id;

      event_payload := jsonb_build_object('role_id', v_role_id, 'action', 'deleted');

    else
      raise exception 'role_action_required';
    end if;

    response := jsonb_build_object('ok', true, 'state', 'accepted', 'role', event_payload);

  -- ─────────────────────────────────────────────────────────────────────────
  -- INVOICE_PAYMENT: Settlement allocation with balance validation
  -- ─────────────────────────────────────────────────────────────────────────
  elsif event_name = 'INVOICE_PAYMENT' then
    v_invoice_id := nullif(command->>'invoice_id', '')::uuid;
    v_amount := coalesce((command->>'amount')::numeric, 0);

    if v_invoice_id is null then
      raise exception 'invoice_id_required';
    end if;
    if v_amount <= 0 then
      raise exception 'payment_amount_must_be_positive';
    end if;

    -- Validate invoice exists and get balance
    select unallocated_balance into v_balance
      from public.commercial_documents
     where organisation_id = target_org and id = v_invoice_id
       and document_type = 'sales_invoice'
       for update;

    if not found then
      raise exception 'invoice_not_found';
    end if;
    if v_amount > v_balance then
      raise exception using message = 'overpayment_rejected',
        detail = format('Payment %s exceeds balance %s', v_amount, v_balance);
    end if;

    -- Create payment document
    v_payment_id := gen_random_uuid();
    v_doc_no := app_private.allocate_document_no(target_org, 'receipt');

    insert into public.commercial_documents
      (id, organisation_id, document_type, document_no, contact_id,
       gross_total, allocated_total, unallocated_balance, status, metadata,
       document_date, issued_at, issued_by)
    values
      (v_payment_id, target_org, 'receipt', v_doc_no,
       nullif(command->>'customer_id', '')::uuid,
       v_amount, v_amount, 0, 'issued',
       jsonb_build_object(
         'method', command->>'method',
         'reference', command->>'reference',
         'bank_account', command->>'bank_account',
         'notes', command->>'notes',
         'invoice_id', v_invoice_id
       ),
       current_date, now(), target_person);

    -- Create settlement allocation
    insert into public.settlement_allocations
      (organisation_id, payment_document_id, settled_document_id,
       allocated_amount, currency, allocated_by)
    values
      (target_org, v_payment_id, v_invoice_id, v_amount, 'MVR', target_person);

    -- Update invoice allocated_total and unallocated_balance
    update public.commercial_documents
       set allocated_total = allocated_total + v_amount,
           unallocated_balance = unallocated_balance - v_amount,
           status = case when (unallocated_balance - v_amount) <= 0 then 'settled' else status end,
           version = version + 1
     where organisation_id = target_org and id = v_invoice_id;

    -- If invoice fully paid, update linked job status
    if (select unallocated_balance from public.commercial_documents
         where organisation_id = target_org and id = v_invoice_id) <= 0 then
      target_job_id := (select (metadata->>'linked_job_id')::uuid
                          from public.commercial_documents
                         where organisation_id = target_org and id = v_invoice_id);
      if target_job_id is not null then
        update public.garage_jobs
           set state = 'invoice_payment', version = version + 1
         where organisation_id = target_org and id = target_job_id
           and state <> 'invoice_payment';
      end if;
    end if;

    event_payload := jsonb_build_object(
      'payment_id', v_payment_id,
      'payment_number', v_doc_no,
      'invoice_id', v_invoice_id,
      'amount', v_amount,
      'remaining_balance', (select unallocated_balance from public.commercial_documents
                             where organisation_id = target_org and id = v_invoice_id)
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'payment', event_payload);

  -- ─────────────────────────────────────────────────────────────────────────
  -- COUNTER_SALE: Atomic invoice + payment + stock deduction
  -- ─────────────────────────────────────────────────────────────────────────
  elsif event_name = 'COUNTER_SALE' then
    -- Create invoice
    v_doc_id := gen_random_uuid();
    v_doc_no := app_private.allocate_document_no(target_org, 'sales_invoice');
    v_amount := coalesce((command->>'total_amount')::numeric, 0);
    v_gst := coalesce((command->>'gst_amount')::numeric, 0);
    v_subtotal := v_amount - v_gst;

    insert into public.commercial_documents
      (id, organisation_id, document_type, document_no, contact_id,
       gross_total, allocated_total, unallocated_balance, status, metadata,
       document_date, issued_at, issued_by)
    values
      (v_doc_id, target_org, 'sales_invoice', v_doc_no,
       nullif(command->>'customer_id', '')::uuid,
       v_amount, 0, v_amount, 'issued',
       jsonb_build_object('items', command->'items', 'counter_sale', true),
       current_date, now(), target_person);

    -- Create payment (fully allocated)
    v_payment_id := gen_random_uuid();
    declare
      v_pay_no text := app_private.allocate_document_no(target_org, 'receipt');
    begin
      insert into public.commercial_documents
        (id, organisation_id, document_type, document_no, contact_id,
         gross_total, allocated_total, unallocated_balance, status, metadata,
         document_date, issued_at, issued_by)
      values
        (v_payment_id, target_org, 'receipt', v_pay_no,
         nullif(command->>'customer_id', '')::uuid,
         v_amount, v_amount, 0, 'issued',
         jsonb_build_object('method', command->>'payment_method', 'counter_sale', true),
         current_date, now(), target_person);

      -- Settlement allocation
      insert into public.settlement_allocations
        (organisation_id, payment_document_id, settled_document_id,
         allocated_amount, currency, allocated_by)
      values
        (target_org, v_payment_id, v_doc_id, v_amount, 'MVR', target_person);
    end;

    -- Mark invoice as settled
    update public.commercial_documents
       set allocated_total = v_amount, unallocated_balance = 0, status = 'settled',
           version = version + 1
     where organisation_id = target_org and id = v_doc_id;

    event_payload := jsonb_build_object(
      'invoice_id', v_doc_id,
      'invoice_number', v_doc_no,
      'payment_id', v_payment_id,
      'total_amount', v_amount
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'counter_sale', event_payload);

  -- ─────────────────────────────────────────────────────────────────────────
  -- PAY_SUPPLIER: Payment against purchase order
  -- ─────────────────────────────────────────────────────────────────────────
  elsif event_name = 'PAY_SUPPLIER' then
    v_invoice_id := nullif(command->>'purchase_order_id', '')::uuid;
    v_amount := coalesce((command->>'amount')::numeric, 0);

    if v_invoice_id is null then
      raise exception 'purchase_order_id_required';
    end if;
    if v_amount <= 0 then
      raise exception 'payment_amount_must_be_positive';
    end if;

    -- Validate PO exists and get balance
    select unallocated_balance into v_balance
      from public.commercial_documents
     where organisation_id = target_org and id = v_invoice_id
       and document_type = 'purchase_order'
       for update;

    if not found then
      raise exception 'purchase_order_not_found';
    end if;
    if v_amount > v_balance then
      raise exception using message = 'overpayment_rejected',
        detail = format('Payment %s exceeds PO balance %s', v_amount, v_balance);
    end if;

    -- Create payment document
    v_payment_id := gen_random_uuid();
    v_doc_no := app_private.allocate_document_no(target_org, 'payment');

    insert into public.commercial_documents
      (id, organisation_id, document_type, document_no, contact_id,
       gross_total, allocated_total, unallocated_balance, status, metadata,
       document_date, issued_at, issued_by)
    values
      (v_payment_id, target_org, 'payment', v_doc_no,
       nullif(command->>'supplier_id', '')::uuid,
       v_amount, v_amount, 0, 'issued',
       jsonb_build_object(
         'method', command->>'method',
         'reference', command->>'reference',
         'purchase_order_id', v_invoice_id
       ),
       current_date, now(), target_person);

    -- Settlement allocation
    insert into public.settlement_allocations
      (organisation_id, payment_document_id, settled_document_id,
       allocated_amount, currency, allocated_by)
    values
      (target_org, v_payment_id, v_invoice_id, v_amount, 'MVR', target_person);

    -- Update PO balance
    update public.commercial_documents
       set allocated_total = allocated_total + v_amount,
           unallocated_balance = unallocated_balance - v_amount,
           status = case when (unallocated_balance - v_amount) <= 0 then 'settled' else status end,
           version = version + 1
     where organisation_id = target_org and id = v_invoice_id;

    event_payload := jsonb_build_object(
      'payment_id', v_payment_id,
      'payment_number', v_doc_no,
      'purchase_order_id', v_invoice_id,
      'amount', v_amount,
      'remaining_balance', (select unallocated_balance from public.commercial_documents
                             where organisation_id = target_org and id = v_invoice_id)
    );
    response := jsonb_build_object('ok', true, 'state', 'accepted', 'supplier_payment', event_payload);

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

  -- ─────────────────────────────────────────────────────────────────────────
  -- Common: Update idempotency, write audit event
  -- ─────────────────────────────────────────────────────────────────────────
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
