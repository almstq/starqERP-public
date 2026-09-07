-- Seat vocabulary — seed the four seats the procurement flow requires.
--
-- WHY THIS EXISTS
-- ─────────────────────────────────────────────────────────────────────────────
-- `public.seats` was seeded in 202608200004 with eight codes, and
-- `membership_seats.seat_code` is a FOREIGN KEY to it. `auth.py` meanwhile
-- defines eleven seats, and the SCM flow requires two that were never seeded:
--
--     quote   → quartermaster     (missing)
--     receive → receiver          (missing)
--
-- So `api_garage_command` could not enforce a correct seat matrix for
-- need/quote/receive: the seats those steps demand did not exist, and writing
-- one raised a foreign-key violation rather than a permission error. That is
-- why the function falls back to
--
--     when event_name = 'PURCHASE' and scm_step in ('need','quote','receive')
--       then target_seat
--
-- which makes `required_seat <> target_seat` unfailable — the caller authorizes
-- itself with whichever seat it holds. The audit recorded that as critical #2;
-- this migration removes its root cause.
--
-- ORDER OF REPAIR — this file is step 1 of 3. Do not reorder:
--   1. THIS: seed the missing seats so they can be granted at all
--   2. widen DB_SEEDED_SEATS in supabase/functions/starq-api/index.ts
--   3. replace the target_seat fallback with the matrix in
--      contracts/commands.ts (COMMAND_SEATS / PURCHASE_STEP_SEATS)
--
-- Fixing the matrix before this migration would convert a silent authorization
-- hole into a hard outage: procurement would become impossible because no
-- grantable seat satisfies quote or receive.
--
-- SAFETY
-- Additive only. It inserts rows into a reference table and grants nothing to
-- anybody — a seat existing is not a seat held. No membership, no grant and no
-- revocation is touched, so this cannot widen anyone's access on its own.
--
-- Authority: Elder review 2026-08-21, sixth finding.
-- Contract:  contracts/commands.ts — SEATS.

begin;

insert into public.seats (code, label, description)
values
  ('quartermaster', 'Quartermaster', 'Collects quotes only — no award, no signature, no payment'),
  ('receiver',      'Receiver',      'Goods-in and GRN count — cannot match or pay for what it received'),
  ('stores',        'Stores',        'Stock movements, quote comparison, leftover materials'),
  ('ledger_poster', 'Ledger poster', 'Appends to the books. Operational events are not the books (DEC-008)')
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  active = true;

-- Fail loudly here rather than let step 2 discover it at runtime: widening the
-- Edge allowlist against a database that lacks these codes produces foreign-key
-- errors on sign-in, which is a far worse way to find out.
do $$
declare
  missing text;
begin
  select string_agg(code, ', ')
    into missing
    from (values
      ('owner'), ('managing_director'), ('director'), ('financial_controller'),
      ('quartermaster'), ('receiver'), ('payer'), ('counter'),
      ('technician'), ('qc_signer'), ('stores'), ('ledger_poster')
    ) as required(code)
   where not exists (
     select 1 from public.seats s where s.code = required.code and s.active
   );

  if missing is not null then
    raise exception 'seat vocabulary incomplete — missing or inactive: %', missing;
  end if;
end $$;

commit;
