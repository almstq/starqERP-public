begin;

do $$
declare
  test_person uuid := '00000000-0000-4000-8000-000000000701';
  test_membership uuid := '00000000-0000-4000-8000-000000000702';
  test_key uuid := '00000000-0000-4000-8000-000000000703';
  test_request uuid := '00000000-0000-4000-8000-000000000704';
  first_result jsonb;
  replay_result jsonb;
begin
  begin
    insert into public.persons (id, person_key, external_subject, display_label, status)
    values (test_person, '__cloud_self_test__', '__cloud_self_test__', 'Cloud self test', 'active');

    insert into public.memberships (id, organisation_id, person_id, status)
    values (test_membership, '30222026-0000-4000-8000-000000000001', test_person, 'active');

    insert into public.membership_seats (membership_id, seat_code)
    values (test_membership, 'counter');

    first_result := public.api_garage_command(
      '30222026-0000-4000-8000-000000000001',
      test_person,
      'counter',
      test_key,
      jsonb_build_object(
        'type', 'CALL',
        'customer_name', 'Synthetic self test',
        'vehicle_reg', 'TEST-ONLY',
        'consent', true,
        'summary', 'Transactional cloud self test'
      ),
      test_request
    );

    if coalesce(first_result->>'ok', 'false') <> 'true'
       or first_result->>'state' <> 'accepted'
       or first_result#>>'{event,type}' <> 'CALL' then
      raise exception 'cloud_self_test_command_failed';
    end if;

    replay_result := public.api_garage_command(
      '30222026-0000-4000-8000-000000000001',
      test_person,
      'counter',
      test_key,
      jsonb_build_object(
        'type', 'CALL',
        'customer_name', 'Synthetic self test',
        'vehicle_reg', 'TEST-ONLY',
        'consent', true,
        'summary', 'Transactional cloud self test'
      ),
      test_request
    );

    if replay_result#>>'{event,id}' <> first_result#>>'{event,id}' then
      raise exception 'cloud_self_test_idempotency_failed';
    end if;

    raise exception using errcode = 'ZX701', message = 'rollback_cloud_self_test';
  exception when sqlstate 'ZX701' then
    null;
  end;

  if exists (select 1 from public.persons where id = test_person)
     or exists (select 1 from public.idempotency_keys where key = test_key)
     or exists (select 1 from public.job_events where idempotency_key = test_key) then
    raise exception 'cloud_self_test_rollback_failed';
  end if;
end
$$;

commit;
