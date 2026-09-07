begin;

-- =============================================================================
-- Migration: 202609060049_dec033_critical3_sod_audit_trigger.sql
-- DEC-033 CRITICAL-3: wire the SoD exception infrastructure (202608250016)
-- into the actual purchase event stream. That migration built
-- sod_exceptions/sod_exception_dispositions and the evaluate/record
-- functions but nothing ever called them (confirmed by grep: zero call
-- sites anywhere outside 202608250016 itself, per the DEC-033 readiness
-- packet posted to the Operations Room on 2026-09-06).
--
-- FOUNDER RULING, explicit: this is an AUDIT-RECORDING trigger, not a hard
-- block. sod_exceptions exists specifically to let a solo operator (one
-- person legitimately holding both seats in a small team) keep working
-- while the exception is captured for review - see 202608250016's own
-- header: "Resolves the solo operator reality by recording immutable audit
-- exceptions rather than hard-blocking or silent pass-throughs." A BEFORE
-- trigger that raises would recreate exactly the failure mode this
-- infrastructure was built to avoid. This is AFTER INSERT and never raises.
-- =============================================================================

-- The three forbidden pairs, per the seat-matrix self-test in 202608220011
-- (which already refuses 'pay' to financial_controller as a SoD pair) and
-- the review-pack UI's own documented pairs: award+pay, quote+award,
-- receive+match. Each pair's SECOND step, when performed by the same
-- person who did the FIRST, is what gets recorded.
create or replace function app_private.check_purchase_sod_pair()
returns trigger language plpgsql security definer
set search_path = public, app_private, extensions, pg_temp as $$
declare
  v_scm_step text;
  v_paired_step text;
  v_pair_name text;
  v_prior_event record;
  v_capacity text;
  v_counterpart_seat text;
begin
  -- Only PURCHASE events carry scm_step; everything else is out of scope.
  if new.event_type <> 'PURCHASE' then
    return new;
  end if;

  v_scm_step := new.payload->>'scm_step';

  v_paired_step := case v_scm_step
    when 'pay' then 'award'
    when 'award' then 'quote'
    when 'match' then 'receive'
    else null
  end;
  v_counterpart_seat := case v_scm_step
    when 'pay' then 'payer'
    when 'award' then 'quartermaster'
    when 'match' then 'receiver'
    else null
  end;
  v_pair_name := case v_scm_step
    when 'pay' then 'award_pay'
    when 'award' then 'quote_award'
    when 'match' then 'receive_match'
    else null
  end;

  -- Not the second half of a tracked pair - nothing to check.
  if v_paired_step is null then
    return new;
  end if;

  -- Find the prior event for the SAME job (purchase) and the paired step,
  -- done by the SAME person. Multiple prior matches are possible across a
  -- long-running purchase; the earliest is the one that actually created
  -- the segregation question.
  select je.actor_person_id, je.occurred_at
    into v_prior_event
    from public.job_events je
   where je.organisation_id = new.organisation_id
     and je.job_id = new.job_id
     and je.event_type = 'PURCHASE'
     and je.payload->>'scm_step' = v_paired_step
     and je.actor_person_id = new.actor_person_id
   order by je.occurred_at asc
   limit 1;

  if not found then
    -- Either a different person did the paired step (properly segregated
    -- already), or the paired step hasn't happened yet. Nothing to record.
    return new;
  end if;

  v_capacity := app_private.evaluate_segregation_capacity(new.organisation_id, v_counterpart_seat);

  perform app_private.record_sod_exception(
    new.organisation_id,
    new.job_id,
    new.actor_person_id,
    v_pair_name,
    v_paired_step,
    v_scm_step,
    v_prior_event.occurred_at,
    v_capacity
  );

  -- AFTER trigger, no raise: the purchase step this row represents has
  -- already been committed. This is audit recording, never a block.
  return new;
exception
  -- An audit trigger must never take down the purchase path it is
  -- observing. A failure here becomes a logged warning, not a rejected
  -- insert - the operational insert this trigger rides on has already
  -- succeeded and must stay succeeded.
  when others then
    raise warning 'check_purchase_sod_pair failed for job_event %: %', new.id, sqlerrm;
    return new;
end;
$$;

create trigger job_events_sod_audit
after insert on public.job_events
for each row execute function app_private.check_purchase_sod_pair();

commit;
