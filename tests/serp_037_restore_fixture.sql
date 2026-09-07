\set ON_ERROR_STOP on

insert into public.organisations (id, slug, legal_name, registry_code)
values
  ('37000000-0000-4000-8000-000000000001', 'serp-037-a', 'SERP-037 Tenant A', 'SERP037-A'),
  ('37000000-0000-4000-8000-000000000002', 'serp-037-b', 'SERP-037 Tenant B', 'SERP037-B');

insert into public.persons (id, person_key, external_subject, display_label)
values
  ('37000000-0000-4000-8000-000000000101', 'serp037-admin', 'synthetic:serp037-admin', 'SERP-037 Backup Admin'),
  ('37000000-0000-4000-8000-000000000102', 'serp037-worker', 'synthetic:serp037-worker', 'SERP-037 Tenant Worker');

insert into public.memberships (id, organisation_id, person_id, status)
values
  ('37000000-0000-4000-8000-000000000201', '37000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000102', 'active');

insert into platform.operator_principals (person_id, operator_role, active, mfa_required)
values ('37000000-0000-4000-8000-000000000101', 'platform_admin', true, true);

insert into public.audit_events (
  organisation_id, actor_person_id, action, object_type, object_id, metadata
) values (
  '37000000-0000-4000-8000-000000000001',
  '37000000-0000-4000-8000-000000000101',
  'serp037.fixture.created',
  'synthetic_fixture',
  '37000000-0000-4000-8000-000000000001',
  '{"synthetic":true}'::jsonb
);
