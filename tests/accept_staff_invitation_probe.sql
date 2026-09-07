-- -----------------------------------------------------------------------------
-- accept_staff_invitation_probe.sql
--
-- Proves that public.accept_staff_invitation(uuid, uuid) actually EXECUTES —
-- the function the Edge calls at supabase/functions/starq-api/index.ts:541.
--
-- WHY THIS EXISTS AT ALL
-- A clean CREATE proves syntax only. plpgsql function bodies are not semantically
-- checked, so a body full of non-existent column names applies without complaint.
-- Migration 0029 was withdrawn on 29 Aug 2026 for exactly that: it applied clean
-- and could not run, because it inserted memberships.updated_at, a column that
-- does not exist. Creating a function is not evidence that it works. Running it is.
--
-- HISTORY
-- The first version of this probe had never been run by its author and failed at
-- line 12. It carried four defects, every one the same class it was written to
-- catch: it inserted organisations.updated_at and persons.updated_at (neither
-- column exists), passed role_id => 'viewer' when role_id is uuid, and ignored
-- memberships_role_fk, which is composite on (organisation_id, role_id).
--
-- Runs inside a transaction and rolls back. It leaves nothing behind.
--
-- Usage:
--   docker exec -i <container> psql -U supabase_admin -d <db> -v ON_ERROR_STOP=1 \
--     < tests/accept_staff_invitation_probe.sql
-- -----------------------------------------------------------------------------

\set ON_ERROR_STOP on

begin;

do $probe$
declare
  v_org        uuid;
  v_role       uuid;
  v_person     uuid;
  v_invitation uuid;
  v_result     jsonb;
  v_unbound    uuid;
  v_unbound_rs jsonb;
  m            record;
  inv          record;
begin
  -- An organisation that actually has roles: memberships_role_fk is composite,
  -- FOREIGN KEY (organisation_id, role_id) REFERENCES roles(organisation_id, id),
  -- so the role must belong to the SAME organisation as the invitation.
  select o.id into v_org
    from public.organisations o
    join public.roles r on r.organisation_id = o.id
   group by o.id
  having count(r.id) > 0
   limit 1;

  if v_org is null then
    raise exception 'PROBE SETUP FAILED: no organisation has any roles';
  end if;

  select id into v_role from public.roles where organisation_id = v_org order by id limit 1;

  -- ---------------------------------------------------------------------------
  -- CASE 1 — it must FAIL CLOSED when the identity is not bound.
  -- This is asserted first, deliberately. A function that accepts invitations is
  -- only safe if it refuses the unbound case, and that is the case a happy-path
  -- test never reaches.
  -- Note: no updated_at on persons. The old probe invented one.
  -- ---------------------------------------------------------------------------
  insert into public.persons (person_key, external_subject, display_label, status)
  values ('probe-unbound-' || gen_random_uuid()::text, null, 'Unbound Probe', 'active')
  returning id into v_unbound;

  insert into public.invitations (organisation_id, email, name, role_id, status)
  values (v_org, 'unbound@example.test', 'Unbound Probe', v_role, 'pending')
  returning id into v_invitation;

  select public.accept_staff_invitation(v_invitation, v_unbound) into v_unbound_rs;

  if coalesce((v_unbound_rs->>'ok')::boolean, false) then
    raise exception 'FAIL: an unbound identity was allowed to accept an invitation: %', v_unbound_rs;
  end if;
  raise notice 'PASS: fails closed for an unbound identity — %', v_unbound_rs->>'error';

  -- ---------------------------------------------------------------------------
  -- CASE 2 — the happy path.
  -- ---------------------------------------------------------------------------
  insert into public.persons (person_key, external_subject, display_label, status, verified_email)
  values ('probe-' || gen_random_uuid()::text, 'probe-subject', 'Probe Invitee', 'active', 'probe@example.test')
  returning id into v_person;

  insert into public.invitations (organisation_id, email, name, role_id, job_title, status)
  values (v_org, 'probe@example.test', 'Probe Invitee', v_role, 'Probe', 'pending')
  returning id into v_invitation;

  -- THE ACTUAL TEST. Everything above is setup.
  select public.accept_staff_invitation(v_invitation, v_person) into v_result;

  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'FAIL: acceptance returned %', v_result;
  end if;
  raise notice 'PASS: accepted — %', v_result;

  -- a membership must exist, be active, and carry the INVITED role
  select * into m from public.memberships
   where organisation_id = v_org and person_id = v_person;
  if not found then
    raise exception 'FAIL: no membership was created';
  end if;
  if m.status <> 'active' then
    raise exception 'FAIL: membership status is %, expected active', m.status;
  end if;
  if m.role_id is distinct from v_role then
    raise exception 'FAIL: invited role was not recorded — membership role_id is %, invited %', m.role_id, v_role;
  end if;
  raise notice 'PASS: membership active and the invited role was recorded';

  -- the invitation must be consumed, not left pending
  select * into inv from public.invitations where id = v_invitation;
  if inv.status = 'pending' then
    raise exception 'FAIL: invitation still pending after acceptance';
  end if;
  if inv.accepted_at is null then
    raise exception 'FAIL: invitation accepted_at was not set';
  end if;
  raise notice 'PASS: invitation consumed — status=%, accepted_at set', inv.status;

  -- a role invitation must NOT synthesize a seat grant.
  -- Roles govern visibility; seats govern EXECUTION. Seat assignment stays an
  -- explicit admin action. This is the defect that got migration 0029 withdrawn,
  -- so it is asserted here permanently.
  if exists (select 1 from public.membership_seats where membership_id = m.id) then
    raise exception 'FAIL: accepting a ROLE invitation granted a SEAT. Roles govern visibility, seats govern execution — seat assignment must stay an explicit admin action.';
  end if;
  raise notice 'PASS: no seat synthesized from a role invitation';

  raise notice '--------------------------------------------------';
  raise notice 'accept_staff_invitation(uuid, uuid) EXECUTES CORRECTLY';
  raise notice '--------------------------------------------------';
end
$probe$;

rollback;
