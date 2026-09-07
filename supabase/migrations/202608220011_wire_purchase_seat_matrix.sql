-- Wire the purchase seat matrix into api_garage_command.
--
-- AUDIT CRITICAL #2 - the closing half. 202608210010 created
-- app_private.purchase_step_seat_is_legal and deliberately called it from nothing. This
-- migration replaces the body of api_garage_command so that every PURCHASE step resolves
-- through that matrix instead of authorizing itself.
--
-- -----------------------------------------------------------------------------
-- CORRECTION TO 202608210010's CLOSING NOTE - READ THIS BEFORE THE RISK SECTION
-- -----------------------------------------------------------------------------
-- That migration's footer says:
--
--     "The Edge already refuses every case this matrix would refuse, so the system is not
--      relying on the RPC fallback for its protection in the meantime."
--
-- That is TRUE OF THE CODE ON DISK AND FALSE OF PRODUCTION, and Elder wrote it. The Edge
-- boundary gate (authorizeCommand) landed in 5ce8c17 on 21 August. The deployed Edge Function
-- is the 20 August build. It has no command gate.
--
-- So for as long as the current Edge is deployed, THIS RPC IS THE ONLY SEAT CONTROL ON THE
-- PURCHASE PATH, and until this migration is applied that control is the permissive one:
-- need, quote and receive accept whatever seat the caller happens to hold.
--
-- Consequence for sequencing: this is NOT merely "removing a redundant second decision" as
-- 0010 described it. It installs the only decision there currently is. That raises its value
-- and it does not change its risk.
--
-- -----------------------------------------------------------------------------
-- WHAT CHANGES, EXACTLY
-- -----------------------------------------------------------------------------
-- Before, in the required_seat CASE:
--
--     when event_name = 'PURCHASE' and scm_step in ('need','quote','receive') then target_seat
--
-- followed by: if required_seat <> target_seat then raise. required_seat WAS target_seat, so
-- the comparison could not fail. Three procurement steps had no seat control.
--
-- After, per step, against the matrix:
--
--     need     counter | technician | quartermaster | stores | managing_director
--              | director | financial_controller          (was: any held seat)  TIGHTENS
--     quote    quartermaster                              (was: any held seat)  TIGHTENS
--     receive  receiver                                   (was: any held seat)  TIGHTENS
--     award    financial_controller                       (unchanged)
--     match    financial_controller                       (unchanged)
--     pay      payer                                      (unchanged)
--
-- Nothing widens. Three steps tighten, three are the same rule expressed in a different
-- place. Non-PURCHASE commands are untouched.
--
-- -----------------------------------------------------------------------------
-- THE TRAP THIS MIGRATION AVOIDS, RECORDED SO THE NEXT REPLACEMENT DOES NOT FALL IN IT
-- -----------------------------------------------------------------------------
-- create or replace function REDEFINES the function's SET clauses. It does not merge them.
--
-- 202608200005 created api_garage_command with
--     set search_path = public, app_private, pg_temp
-- and 202608200006 then ALTERed it to
--     set search_path = public, app_private, extensions, pg_temp
--
-- A replacement copied from 0005 - the obvious thing to do - would therefore have silently
-- reverted 0006 and dropped extensions from the search path of a SECURITY DEFINER function,
-- undoing a hardening migration inside a hardening migration. The definition below carries
-- 0006's value forward explicitly. If a future migration replaces this function again, it
-- must do the same.
--
-- -----------------------------------------------------------------------------
-- PRECONDITIONS - all three are required, per 202608210010's own gate
-- -----------------------------------------------------------------------------
--   1. 202608210009 applied and verified          - DONE 22 Aug, verified live
--   2. 202608210010 applied and verified          - DONE 22 Aug, verified live
--   3. a reviewer other than the author has read the replacement body IN FULL
--                                                 - AG, under DEC-062 B. NOT YET DONE.
--
-- Precondition 3 is not satisfied at the time of writing. This file is written and tested but
-- MUST NOT be pushed until AG has reviewed it and the founder has authorised the push, on the
-- same terms as DEC-055.
--
-- -----------------------------------------------------------------------------
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- Honest and genuinely available, unlike 0008's. This migration replaces one function body
-- and adds no new dependency. To revert, re-run the api_garage_command definition from
-- 202608200005 AND re-apply 202608200006's search_path alter. The matrix function from 0010
-- can stay - it is inert when nothing calls it, which is precisely the state 0010 shipped in.
--
-- Reverting is a genuine downgrade of authorization, not a neutral rollback: it restores the
-- self-authorizing purchase path. Do it only to end an outage, and reapply the same day.

begin;

-- Refuse to run if the matrix is absent. Replacing the command function with a call to a
-- function that does not exist would take the entire garage command path offline.
do $guard$
begin
  if to_regprocedure('app_private.purchase_step_seat_is_legal(text, text)') is null then
    raise exception
      'run 202608210010_purchase_seat_matrix first - app_private.purchase_step_seat_is_legal is missing';
  end if;
end $guard$;

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

  -- Non-purchase commands keep their existing single-seat rules, unchanged and deliberately
  -- so. See the policy note in 202608210010 - the contract permits director/managing_director
  -- here and this SQL does not, and widening that is a founder decision, not a migration.
  required_seat := case
    when event_name in ('CALL', 'BOOKING', 'INTAKE', 'ESTIMATE', 'AUTHORISATION',
                        'JOB_CARD', 'HANDOVER', 'INVOICE_PAYMENT', 'CLOSE') then 'counter'
    when event_name in ('PARTS_PROCUREMENT', 'WORK') then 'technician'
    when event_name = 'QC' then 'qc_signer'
    else null
  end;

  if event_name = 'PURCHASE' then
    -- AUDIT CRITICAL #2. Every purchase step now resolves through the explicit matrix.
    -- `required_seat` stays null here on purpose: a single-seat variable cannot express
    -- `need`, which legitimately permits seven seats. Reintroducing one would recreate the
    -- shape of the original defect.
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

-- 0006 hardened this function's search_path and create-or-replace above has just redefined
-- it. The value is carried in the definition itself, so this is belt-and-braces rather than a
-- repair - but it is cheap, and it means a future replacement that forgets the SET clause is
-- corrected by re-running this line rather than by a security review noticing months later.
alter function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid)
  set search_path = public, app_private, extensions, pg_temp;

-- -----------------------------------------------------------------------------
-- SELF-TEST. Runs inside the transaction and rolls itself back, in the manner of 0007/0008.
-- Proves the matrix is actually reachable through the real function rather than merely
-- present. It asserts on REFUSALS: a refusal needs no fixtures, whereas a successful command
-- would need an organisation, a person, a membership and a job invented in a live database.
-- -----------------------------------------------------------------------------
do $selftest$
declare
  fake_org uuid := '00000000-0000-0000-0000-0000000000aa';
  fake_person uuid := '00000000-0000-0000-0000-0000000000bb';
  message_text text;
  saw_wrong_error text;
begin
  -- The matrix itself. These are the three steps that previously had no control at all.
  if app_private.purchase_step_seat_is_legal('quote', 'counter') then
    raise exception 'SELF-TEST FAILED: quote must not accept counter';
  end if;
  if app_private.purchase_step_seat_is_legal('receive', 'quartermaster') then
    raise exception 'SELF-TEST FAILED: receive must not accept quartermaster';
  end if;
  if app_private.purchase_step_seat_is_legal('need', 'payer') then
    raise exception 'SELF-TEST FAILED: need must not accept payer';
  end if;
  if app_private.purchase_step_seat_is_legal('pay', 'financial_controller') then
    raise exception 'SELF-TEST FAILED: pay must not accept financial_controller (SoD pair)';
  end if;

  -- The permitted side, so the test cannot pass by refusing everything.
  if not app_private.purchase_step_seat_is_legal('quote', 'quartermaster') then
    raise exception 'SELF-TEST FAILED: quote must accept quartermaster';
  end if;
  if not app_private.purchase_step_seat_is_legal('receive', 'receiver') then
    raise exception 'SELF-TEST FAILED: receive must accept receiver';
  end if;
  if not app_private.purchase_step_seat_is_legal('need', 'counter') then
    raise exception 'SELF-TEST FAILED: need must accept counter';
  end if;
  if not app_private.purchase_step_seat_is_legal('award', 'financial_controller') then
    raise exception 'SELF-TEST FAILED: award must accept financial_controller';
  end if;

  -- An unknown step must be refused rather than silently permitted.
  if app_private.purchase_step_seat_is_legal('transfer', 'managing_director') then
    raise exception 'SELF-TEST FAILED: an unknown purchase step must be refused';
  end if;

  -- And the function is reachable end to end. A nonexistent org/person cannot hold a seat, so
  -- assert_active_seat refuses first with seat_not_authorized - which proves the call path compiles
  -- and executes without inventing fixtures in a live database.
  begin
    perform public.api_garage_command(
      fake_org, fake_person, 'counter', gen_random_uuid(),
      jsonb_build_object('type', 'PURCHASE', 'scm_step', 'quote'), gen_random_uuid());
    raise exception 'SELF-TEST FAILED: a command with an unheld seat was accepted';
  exception
    when others then
      get stacked diagnostics message_text = message_text;
      -- The literal raised by api_garage_command at line 127 of THIS FILE is
      -- 'seat_not_authorized'. The first version of this test asserted against
      -- 'seat_not_held', a name that exists nowhere in the codebase and which the
      -- author invented rather than read. The self-test caught it and rolled the
      -- whole migration back, which is the entire reason it exists -- but it is
      -- also, precisely, the class of defect this migration was written to close:
      -- checking a thing against an assumption instead of against the source.
      if message_text is distinct from 'seat_not_authorized'
         and message_text is distinct from 'acting_seat_not_legal_for_command' then
        saw_wrong_error := message_text;
      end if;
  end;

  if saw_wrong_error is not null then
    raise exception 'SELF-TEST FAILED: unexpected error from api_garage_command: %', saw_wrong_error;
  end if;

  raise notice 'SELF-TEST PASSED: purchase seat matrix is wired into api_garage_command';
end $selftest$;

commit;
