begin;

create or replace function public.api_session_authority(
  target_org uuid,
  target_person uuid,
  target_seat text
) returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  with active_seats as (
    select distinct ms.seat_code
      from public.organisations o
      join public.memberships m on m.organisation_id = o.id
      join public.persons p on p.id = m.person_id
      join public.membership_seats ms on ms.membership_id = m.id
      join public.seats s on s.code = ms.seat_code
     where o.id = target_org
       and o.status = 'active'
       and p.id = target_person
       and p.status = 'active'
       and m.status = 'active'
       and m.valid_from <= now()
       and (m.valid_to is null or m.valid_to > now())
       and ms.revoked_at is null
       and s.active is true
  )
  select jsonb_build_object(
    'active', exists (select 1 from active_seats where seat_code = target_seat),
    'seats', coalesce(
      (select jsonb_agg(seat_code order by seat_code) from active_seats),
      '[]'::jsonb
    )
  )
$$;

revoke all on function public.api_session_authority(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.api_session_authority(uuid, uuid, text)
  to service_role;

do $$
declare
  test_person uuid := '00000000-0000-4000-8000-000000000801';
  test_membership uuid := '00000000-0000-4000-8000-000000000802';
  authority jsonb;
begin
  begin
    insert into public.persons (id, person_key, external_subject, display_label, status)
    values (test_person, '__session_authority_test__', '__session_authority_test__',
            'Session authority test', 'active');

    insert into public.memberships (id, organisation_id, person_id, status)
    values (test_membership, '30222026-0000-4000-8000-000000000001', test_person, 'active');

    insert into public.membership_seats (membership_id, seat_code)
    values (test_membership, 'counter');

    authority := public.api_session_authority(
      '30222026-0000-4000-8000-000000000001', test_person, 'counter'
    );
    if coalesce((authority->>'active')::boolean, false) is not true
       or not (authority->'seats' ? 'counter') then
      raise exception 'session_authority_active_seat_failed';
    end if;

    authority := public.api_session_authority(
      '29552026-0000-4000-8000-000000000001', test_person, 'counter'
    );
    if coalesce((authority->>'active')::boolean, false) is true then
      raise exception 'session_authority_cross_tenant_failed';
    end if;

    update public.membership_seats
       set revoked_at = now()
     where membership_id = test_membership and seat_code = 'counter';
    authority := public.api_session_authority(
      '30222026-0000-4000-8000-000000000001', test_person, 'counter'
    );
    if coalesce((authority->>'active')::boolean, false) is true then
      raise exception 'session_authority_revoked_seat_failed';
    end if;

    update public.membership_seats
       set revoked_at = null
     where membership_id = test_membership and seat_code = 'counter';
    update public.memberships set status = 'suspended' where id = test_membership;
    authority := public.api_session_authority(
      '30222026-0000-4000-8000-000000000001', test_person, 'counter'
    );
    if coalesce((authority->>'active')::boolean, false) is true then
      raise exception 'session_authority_suspended_membership_failed';
    end if;

    raise exception using errcode = 'ZX801', message = 'rollback_session_authority_test';
  exception when sqlstate 'ZX801' then
    null;
  end;

  if exists (select 1 from public.persons where id = test_person)
     or exists (select 1 from public.memberships where id = test_membership) then
    raise exception 'session_authority_test_rollback_failed';
  end if;
end
$$;

commit;
