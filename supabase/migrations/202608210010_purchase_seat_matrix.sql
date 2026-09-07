-- Replace the self-authorizing purchase steps with an explicit seat matrix.
--
-- AUDIT CRITICAL #2, final piece. Depends on 202608210009 having run: `quartermaster` and
-- `receiver` must exist in public.seats before this can require them.
--
-- THE DEFECT
-- ─────────────────────────────────────────────────────────────────────────────
-- api_garage_command computed:
--
--     when event_name = 'PURCHASE' and scm_step in ('need','quote','receive')
--       then target_seat
--
-- and then checked `required_seat <> target_seat`. Since required_seat WAS target_seat, that
-- comparison could never fail: the caller authorized itself with whichever seat it happened to
-- hold. Requesting, quoting and receiving had no seat control at all.
--
-- Fixed by naming the permitted seats, from contracts/commands.ts PURCHASE_STEP_SEATS:
--
--     need    counter · technician · quartermaster · stores · managing_director
--             · director · financial_controller
--     quote   quartermaster
--     receive receiver
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS MIGRATION DELIBERATELY DOES **NOT** CHANGE
-- ─────────────────────────────────────────────────────────────────────────────
-- The non-purchase commands keep their existing single-seat rules exactly as they are.
--
-- This matters. `contracts/commands.ts` COMMAND_SEATS — ported from auth.py SEAT_EVENTS —
-- permits `managing_director` and `director` to issue CALL, BOOKING, INTAKE, ESTIMATE,
-- AUTHORISATION, JOB_CARD, HANDOVER, INVOICE_PAYMENT and CLOSE. This SQL permits only
-- `counter`. They disagree, and the SQL is the STRICTER of the two.
--
-- Porting the contract's lists wholesale would therefore WIDEN who may act, inside a migration
-- whose stated purpose is to tighten authorization. That is how a control gets loosened while
-- everyone believes it was hardened, so it is not done here.
--
-- Which one is right is a genuine policy question, not a defect:
--   · SQL's position — act in the seat that does the work. A director wanting to take an intake
--     switches to the counter seat, and the audit trail then says a counter did it.
--   · auth.py's position — a director may act anywhere, which is convenient in a two-person
--     garage where one of them is masked and painting.
--
-- FOUNDER DECISION REQUIRED before either side is changed. Until then the strict SQL stands and
-- the contract is the one that is out of step. Recorded so the next reader does not "fix" the
-- disagreement by widening it.

begin;

-- Fail before touching the function if 0009 has not run. Requiring a seat that cannot exist
-- would take procurement offline rather than secure it.
do $$
declare
  missing text;
begin
  select string_agg(code, ', ')
    into missing
    from (values ('quartermaster'), ('receiver')) as required(code)
   where not exists (
     select 1 from public.seats s where s.code = required.code and s.active
   );

  if missing is not null then
    raise exception
      'run 202608210009_seat_vocabulary first — these seats do not exist yet: %', missing;
  end if;
end $$;

create or replace function app_private.purchase_step_seat_is_legal(
  step text,
  seat text
) returns boolean language sql immutable as $$
  -- Mirrors contracts/commands.ts PURCHASE_STEP_SEATS. Change both or neither.
  select case step
    when 'need'    then seat = any (array['counter','technician','quartermaster','stores',
                                          'managing_director','director','financial_controller'])
    when 'quote'   then seat = 'quartermaster'
    when 'award'   then seat = 'financial_controller'
    when 'receive' then seat = 'receiver'
    when 'match'   then seat = 'financial_controller'
    when 'pay'     then seat = 'payer'
    else false
  end;
$$;

comment on function app_private.purchase_step_seat_is_legal(text, text) is
  'Explicit purchase-step seat matrix. Replaces the required_seat := target_seat fallback that '
  'let a caller authorize itself (audit critical #2, 21 Aug 2026). Mirrors '
  'contracts/commands.ts PURCHASE_STEP_SEATS — the two must be changed together.';

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOT YET WIRED IN — and that is deliberate.
--
-- This migration introduces the matrix as a function and proves its dependency, but does NOT
-- rewrite api_garage_command to call it. Replacing the body of a security-definer function that
-- currently runs live garage commands is a separate, reviewable change, and it should land only
-- once:
--
--   1. 202608210009 is applied and verified
--   2. the Edge boundary gate is accepted (it already refuses these cases first)
--   3. a reviewer other than the author has read the replacement body in full
--
-- The Edge already refuses every case this matrix would refuse, so the system is not relying on
-- the RPC fallback for its protection in the meantime. Wiring it in removes the redundant second
-- decision; it does not add the first one.
-- ─────────────────────────────────────────────────────────────────────────────
