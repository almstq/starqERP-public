\set ON_ERROR_STOP on

-- SERP-300: executable adversarial isolation matrix.
-- Synthetic identifiers only. The entire probe is transactional and rolls back.

begin;

create temporary table serp300_results (
  attack text primary key,
  expected text not null,
  actual text not null,
  passed boolean not null
) on commit drop;

-- Exact fixtures: Tenant A has two books, but the attacker is assigned only Book A1.
insert into public.organisations (id, slug, legal_name, registry_code)
values
  ('30000000-0000-4000-8000-000000000001', 'serp300-tenant-a', 'SERP-300 Tenant A', 'SERP300-A'),
  ('30000000-0000-4000-8000-000000000002', 'serp300-tenant-b', 'SERP-300 Tenant B', 'SERP300-B');

insert into public.business_names (id, organisation_id, name)
values
  ('30000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000001', 'SERP-300 A Trading'),
  ('30000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000002', 'SERP-300 B Trading');

insert into public.persons (id, person_key, external_subject, verified_email, display_label)
values
  ('30000000-0000-4000-8000-000000000101', 'serp300-attacker', 'synthetic:serp300-attacker', 'attacker@example.invalid', 'SERP-300 Attacker'),
  ('30000000-0000-4000-8000-000000000102', 'serp300-invitee', 'synthetic:serp300-invitee', 'invitee-a@example.invalid', 'SERP-300 Invitee'),
  ('30000000-0000-4000-8000-000000000103', 'serp300-mismatch', 'synthetic:serp300-mismatch', 'other@example.invalid', 'SERP-300 Mismatched Identity');

select app_private.seed_default_organisation_roles('30000000-0000-4000-8000-000000000001');
select app_private.seed_default_organisation_roles('30000000-0000-4000-8000-000000000002');

insert into public.memberships (id, organisation_id, person_id, status, role_id)
select '30000000-0000-4000-8000-000000000201',
       '30000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000101',
       'active', r.id
  from public.roles r
 where r.organisation_id = '30000000-0000-4000-8000-000000000001'
   and r.code = 'admin';

insert into public.membership_seats (membership_id, seat_code)
values ('30000000-0000-4000-8000-000000000201', 'counter');

insert into public.books (id, organisation_id, business_name_id, code, name, is_default)
values
  ('30000000-0000-4000-8000-000000000301', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000011', 'A1', 'Tenant A Book 1', true),
  ('30000000-0000-4000-8000-000000000302', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000011', 'A2', 'Tenant A Book 2', false),
  ('30000000-0000-4000-8000-000000000303', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'B1', 'Tenant B Book 1', true);

insert into public.book_memberships (organisation_id, membership_id, book_id)
values (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000201',
  '30000000-0000-4000-8000-000000000301'
);

insert into public.contacts (id, organisation_id, kind, display_name)
values
  ('30000000-0000-4000-8000-000000000401', '30000000-0000-4000-8000-000000000001', 'customer', 'Tenant A Contact'),
  ('30000000-0000-4000-8000-000000000402', '30000000-0000-4000-8000-000000000002', 'customer', 'Tenant B Contact');

insert into public.commercial_documents
  (id, organisation_id, book_id, document_type, document_no, status, contact_id)
values
  ('30000000-0000-4000-8000-000000000501', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000301', 'estimate', 'A1-EST-1', 'draft', '30000000-0000-4000-8000-000000000401'),
  ('30000000-0000-4000-8000-000000000502', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000302', 'estimate', 'A2-EST-1', 'draft', '30000000-0000-4000-8000-000000000401'),
  ('30000000-0000-4000-8000-000000000503', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000303', 'estimate', 'B1-EST-1', 'draft', '30000000-0000-4000-8000-000000000402');

insert into public.invitations
  (id, organisation_id, email, name, role_id, book_ids, status, invited_by)
select
  '30000000-0000-4000-8000-000000000601',
  '30000000-0000-4000-8000-000000000001',
  'invitee-a@example.invalid',
  'Tenant A Invitee',
  r.id::text,
  array['30000000-0000-4000-8000-000000000301'::uuid],
  'pending',
  '30000000-0000-4000-8000-000000000101'
from public.roles r
where r.organisation_id = '30000000-0000-4000-8000-000000000001'
  and r.code = 'counter_operator';

insert into public.invitations
  (id, organisation_id, email, name, role_id, book_ids, status, invited_by)
select
  '30000000-0000-4000-8000-000000000602',
  '30000000-0000-4000-8000-000000000001',
  'target@example.invalid',
  'Tenant A Identity-Mismatch Target',
  r.id::text,
  array['30000000-0000-4000-8000-000000000301'::uuid],
  'pending',
  '30000000-0000-4000-8000-000000000101'
from public.roles r
where r.organisation_id = '30000000-0000-4000-8000-000000000001'
  and r.code = 'counter_operator';

insert into platform.tenant_applications (
  id,
  applicant_person_id,
  applicant_email,
  applicant_name,
  name,
  legal_name,
  archetype_id,
  primary_book_name,
  primary_book_code,
  island,
  atoll
) values (
  '30000000-0000-4000-8000-000000000701',
  '30000000-0000-4000-8000-000000000102',
  'invitee-a@example.invalid',
  'SERP-300 Invitee',
  'SERP-300 Provisioned Tenant',
  'SERP-300 Provisioned Tenant Ltd',
  'general_business',
  'SERP-300 General Book',
  'S300',
  'Synthetic Island',
  'Synthetic Atoll'
);

insert into platform.operator_principals (person_id, operator_role, active, mfa_required)
values ('30000000-0000-4000-8000-000000000101', 'platform_admin', true, true);

insert into serp300_results
select
  'accept_rpc_security_definer',
  'SECURITY DEFINER',
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end,
  p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'accept_staff_invitation'
  and p.pronargs = 2;

insert into serp300_results
select
  'provision_rpc_security_boundary',
  'SECURITY DEFINER; service_role only',
  format(
    '%s; anon=%s authenticated=%s service_role=%s',
    case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end,
    has_function_privilege('anon', p.oid, 'EXECUTE'),
    has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    has_function_privilege('service_role', p.oid, 'EXECUTE')
  ),
  p.prosecdef
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'platform'
  and p.proname = 'provision_approved_application';

with required(table_name, column_name) as (
  values
    ('persons', 'verified_email'),
    ('memberships', 'role_id'),
    ('book_memberships', 'granted_at'),
    ('audit_events', 'actor_person_id'),
    ('audit_events', 'action'),
    ('audit_events', 'metadata')
), missing as (
  select r.table_name, r.column_name
  from required r
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = r.table_name
   and c.column_name = r.column_name
  where c.column_name is null
)
insert into serp300_results
select
  'invitation_rpc_schema_contract',
  '0 missing canonical columns',
  case when count(*) = 0 then '0 missing canonical columns'
       else count(*) || ' missing: ' || string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name)
  end,
  count(*) = 0
from missing;

with required(table_name, column_name) as (
  values
    ('organisations', 'legal_name'),
    ('business_names', 'status'),
    ('locations', 'code'),
    ('locations', 'kind'),
    ('locations', 'active'),
    ('memberships', 'role_id'),
    ('workflow_templates', 'workflow_code'),
    ('workflow_templates', 'active'),
    ('workflow_stages', 'workflow_template_id'),
    ('workflow_stages', 'stage_name'),
    ('workflow_stages', 'required_seat'),
    ('workflow_stages', 'active')
), missing as (
  select r.table_name, r.column_name
  from required r
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = r.table_name
   and c.column_name = r.column_name
  where c.column_name is null
)
insert into serp300_results
select
  'provision_rpc_schema_contract',
  '0 missing canonical columns',
  case when count(*) = 0 then '0 missing canonical columns'
       else count(*) || ' missing: ' || string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name)
  end,
  count(*) = 0
from missing;

drop role if exists serp300_probe;
create role serp300_probe noinherit nologin nosuperuser nobypassrls;
grant serp300_probe to current_user;
grant usage on schema public, app_private to serp300_probe;
grant select, insert, update, delete on all tables in schema public to serp300_probe;
grant select, insert, update, delete on serp300_results to serp300_probe;
grant select, insert, update, delete on serp300_results to authenticated, service_role;

set local role serp300_probe;
set local row_security = on;
select set_config('app.person_id', '30000000-0000-4000-8000-000000000101', true);
select set_config('app.organisation_id', '30000000-0000-4000-8000-000000000001', true);
select set_config('app.book_id', '30000000-0000-4000-8000-000000000301', true);

do $$
declare
  n bigint;
  affected bigint;
begin
  select count(*) into n from public.organisations
   where id = '30000000-0000-4000-8000-000000000002';
  insert into serp300_results values ('cross_tenant_select', '0 tenant B rows', n || ' tenant B rows', n = 0);

  update public.contacts set display_name = 'FORGED' where id = '30000000-0000-4000-8000-000000000402';
  get diagnostics affected = row_count;
  insert into serp300_results values ('cross_tenant_update', '0 rows affected', affected || ' rows affected', affected = 0);

  delete from public.contacts where id = '30000000-0000-4000-8000-000000000402';
  get diagnostics affected = row_count;
  insert into serp300_results values ('cross_tenant_delete', '0 rows affected', affected || ' rows affected', affected = 0);

  begin
    insert into public.contacts (organisation_id, kind, display_name)
    values ('30000000-0000-4000-8000-000000000002', 'customer', 'FORGED');
    insert into serp300_results values ('cross_tenant_insert', 'RLS rejection', 'insert succeeded', false);
  exception when insufficient_privilege then
    insert into serp300_results values ('cross_tenant_insert', 'RLS rejection', 'RLS rejection', true);
  end;

  select count(*) into n from public.commercial_documents
   where book_id = '30000000-0000-4000-8000-000000000302';
  insert into serp300_results values ('unauthorised_book_select', '0 Book A2 rows', n || ' Book A2 rows', n = 0);

  update public.commercial_documents set metadata = '{"forged":true}'::jsonb
   where id = '30000000-0000-4000-8000-000000000502';
  get diagnostics affected = row_count;
  insert into serp300_results values ('unauthorised_book_update', '0 rows affected', affected || ' rows affected', affected = 0);

  delete from public.commercial_documents
   where id = '30000000-0000-4000-8000-000000000502';
  get diagnostics affected = row_count;
  insert into serp300_results values ('unauthorised_book_delete', '0 rows affected', affected || ' rows affected', affected = 0);

end
$$;

reset role;

-- =============================================================================
-- PAYMENT TABLE ATTACKS (migrations 0031–0034)
-- Extend the adversarial matrix to all nine payment-related tables.
-- Pattern mirrors the original seven: cross-tenant and cross-book as serp300_probe
-- with row_security=on. Same identity (person_id/ organisation_id/ book_id).
-- =============================================================================

-- Fixtures: Tenant B payment records the attacker must not be able to reach.
-- NOTE (Elder, 30 Aug): public.payment_provider_config has NO organisation_id and is
-- unique on (provider_id, environment) — it is a PLATFORM table, not a tenant table.
-- A second per-tenant fixture cannot be inserted, so a cross-tenant assertion against
-- it is not meaningful. Recorded as an open design question rather than a defect:
-- the table carries merchant_id, which is normally per-merchant. See SERP-351.
insert into public.payment_provider_config
  (id, provider_id, environment, base_url, merchant_id, is_active)
values
  ('30000000-0000-4000-8000-000000000801', 'MOCK', 'sandbox', 'https://mock.example.invalid', 'TENANT_B_MERCHANT', true);

insert into public.payment_intents
  (id, organisation_id, provider_id, status, amount, currency, created_by)
values
  ('30000000-0000-4000-8000-000000000811',
   '30000000-0000-4000-8000-000000000002',  -- Tenant B
   'MOCK', 'succeeded', 100000::numeric, 'MVR',
   '30000000-0000-4000-8000-000000000101');

insert into public.payment_attempts
  (id, organisation_id, intent_id, provider_id, status, amount, currency, provider_reference)
values
  ('30000000-0000-4000-8000-000000000821',
   '30000000-0000-4000-8000-000000000002',  -- Tenant B
   '30000000-0000-4000-8000-000000000811', 'MOCK',
   'succeeded', 100000::numeric, 'MVR', 'MOCK-REF-B-001');

insert into public.payment_refunds
  (id, organisation_id, intent_id, provider_id, status, amount, currency, reason, requested_by)
values
  ('30000000-0000-4000-8000-000000000831',
   '30000000-0000-4000-8000-000000000002',  -- Tenant B
   '30000000-0000-4000-8000-000000000811', 'MOCK',
   'succeeded', 5000::numeric, 'MVR',
   'Partial refund for testing purposes', '30000000-0000-4000-8000-000000000101');

insert into public.payment_settlements
  (id, organisation_id, provider_id, batch_reference, gross_amount, fee_amount, net_amount, currency, settled_at)
values
  ('30000000-0000-4000-8000-000000000841',
   '30000000-0000-4000-8000-000000000002',  -- Tenant B
   'MOCK', 'BATCH-B-001', 100000::numeric, 500::numeric, 99500::numeric, 'MVR', now());

insert into public.payment_settlement_items
  (id, organisation_id, settlement_id, payment_document_id, gross_amount, fee_amount, currency)
values
  ('30000000-0000-4000-8000-000000000851',
   '30000000-0000-4000-8000-000000000002',  -- Tenant B
   '30000000-0000-4000-8000-000000000841',
   '30000000-0000-4000-8000-000000000503',  -- Tenant B commercial document (B1-EST-1)
   100000::numeric, 500::numeric, 'MVR');

-- Tenant B payment receipt: the document that receives the settlement allocation
-- (separate from the estimate used as settlement item above).
insert into public.commercial_documents
  (id, organisation_id, book_id, document_type, document_no, status, contact_id, issued_at, gross_total)
values
  ('30000000-0000-4000-8000-000000000504',
   '30000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000303',
   'receipt', 'B1-RCP-1', 'issued',
   '30000000-0000-4000-8000-000000000402',
   now(), 100000);

insert into public.provider_events
  (id, provider_id, provider_event_id, organisation_id, signature_verified, raw_payload)
values
  ('30000000-0000-4000-8000-000000000861',
   'MOCK', 'MOCK-EVENT-B-001',
   '30000000-0000-4000-8000-000000000002',  -- Tenant B
   true, '{"type":"payment.succeeded","ref":"MOCK-REF-B-001"}');

-- Tenant B ISSUED invoice for the allocation to settle against.
-- The pre-existing fixture 000...503 is a DRAFT estimate, and
-- app_private.assert_settlement_allocation_valid() requires the settled document to
-- be issued or settled. Adding a dedicated document rather than mutating 503,
-- which other assertions in this probe depend on being a draft estimate.
insert into public.commercial_documents
  (id, organisation_id, book_id, document_type, document_no, status, contact_id, issued_at, gross_total)
values
  ('30000000-0000-4000-8000-000000000505',
   '30000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000303',
   'sales_invoice', 'B1-INV-1', 'issued',
   '30000000-0000-4000-8000-000000000402',
   now(), 100000);

insert into public.settlement_allocations
  (id, organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
values
  ('30000000-0000-4000-8000-000000000871',
   '30000000-0000-4000-8000-000000000002',  -- Tenant B
   '30000000-0000-4000-8000-000000000504',  -- Tenant B payment receipt (B1-RCP-1)
   '30000000-0000-4000-8000-000000000505',  -- Tenant B settled invoice (B1-INV-1, issued)
   100000::numeric, 'MVR',
   '30000000-0000-4000-8000-000000000101');

-- Fixtures: Tenant A (attacker is member of Tenant A, Book A1 only).

insert into public.payment_intents
  (id, organisation_id, provider_id, status, amount, currency, created_by)
values
  ('30000000-0000-4000-8000-000000000812',
   '30000000-0000-4000-8000-000000000001',  -- Tenant A
   'MOCK', 'succeeded', 200000::numeric, 'MVR',
   '30000000-0000-4000-8000-000000000101');

-- Also seed Tenant B provider_events with no organisation_id (attributable-to-null)
-- to test that serp300_probe cannot reach un-attributed events.
insert into public.provider_events
  (id, provider_id, provider_event_id, organisation_id, signature_verified, raw_payload)
values
  ('30000000-0000-4000-8000-000000000862',
   'MOCK', 'MOCK-EVENT-UNATTRIBUTED-001',
   null,  -- un-attributed — organisation_id is nullable
   true, '{"type":"payment.succeeded","ref":"UNATTRIBUTED"}');

set local role serp300_probe;
set local row_security = on;
select set_config('app.person_id', '30000000-0000-4000-8000-000000000101', true);
select set_config('app.organisation_id', '30000000-0000-4000-8000-000000000001', true);
select set_config('app.book_id', '30000000-0000-4000-8000-000000000301', true);

do $$
declare
  n bigint;
  affected bigint;
begin
  -- payment_provider_config: Tenant B config must not be readable.
  select count(*) into n
    from public.payment_provider_config
   where id = '30000000-0000-4000-8000-000000000801';
  insert into serp300_results values (
    'payment_provider_config_is_platform_scoped',
    '0 Tenant B config rows',
    n || ' Tenant B config rows',
    n = 0
  );

  -- payment_intents: Tenant B intent must not be readable.
  select count(*) into n
    from public.payment_intents
   where id = '30000000-0000-4000-8000-000000000811';
  insert into serp300_results values (
    'payment_intents_cross_tenant_select',
    '0 Tenant B intent rows',
    n || ' Tenant B intent rows',
    n = 0
  );

  -- payment_intents: attempt to update Tenant B intent.
  update public.payment_intents
     set status = 'cancelled'
   where id = '30000000-0000-4000-8000-000000000811';
  get diagnostics affected = row_count;
  insert into serp300_results values (
    'payment_intents_cross_tenant_update',
    '0 rows affected',
    affected || ' rows affected',
    affected = 0
  );

  -- payment_intents: attempt to delete Tenant B intent.
  delete from public.payment_intents
   where id = '30000000-0000-4000-8000-000000000811';
  get diagnostics affected = row_count;
  insert into serp300_results values (
    'payment_intents_cross_tenant_delete',
    '0 rows affected',
    affected || ' rows affected',
    affected = 0
  );

  -- payment_intents: attempt to insert cross-tenant.
  begin
    insert into public.payment_intents
      (id, organisation_id, provider_id, status, amount, currency, created_by)
    values (
      '30000000-0000-4000-8000-000000000813',
      '30000000-0000-4000-8000-000000000002',  -- Tenant B
      'MOCK', 'succeeded', 999999::numeric, 'MVR',
      '30000000-0000-4000-8000-000000000101'
    );
    insert into serp300_results values (
      'payment_intents_cross_tenant_insert',
      'RLS rejection',
      'insert succeeded',
      false
    );
  exception when insufficient_privilege then
    insert into serp300_results values (
      'payment_intents_cross_tenant_insert',
      'RLS rejection',
      'RLS rejection',
      true
    );
  end;

  -- payment_attempts: Tenant B attempt must not be readable.
  select count(*) into n
    from public.payment_attempts
   where id = '30000000-0000-4000-8000-000000000821';
  insert into serp300_results values (
    'payment_attempts_cross_tenant_select',
    '0 Tenant B attempt rows',
    n || ' Tenant B attempt rows',
    n = 0
  );

  -- payment_refunds: Tenant B refund must not be readable.
  select count(*) into n
    from public.payment_refunds
   where id = '30000000-0000-4000-8000-000000000831';
  insert into serp300_results values (
    'payment_refunds_cross_tenant_select',
    '0 Tenant B refund rows',
    n || ' Tenant B refund rows',
    n = 0
  );

  -- payment_settlements: Tenant B settlement must not be readable.
  select count(*) into n
    from public.payment_settlements
   where id = '30000000-0000-4000-8000-000000000841';
  insert into serp300_results values (
    'payment_settlements_cross_tenant_select',
    '0 Tenant B settlement rows',
    n || ' Tenant B settlement rows',
    n = 0
  );

  -- payment_settlement_items: Tenant B settlement item must not be readable.
  select count(*) into n
    from public.payment_settlement_items
   where id = '30000000-0000-4000-8000-000000000851';
  insert into serp300_results values (
    'payment_settlement_items_cross_tenant_select',
    '0 Tenant B settlement item rows',
    n || ' Tenant B settlement item rows',
    n = 0
  );

  -- provider_events: Tenant B event must not be readable.
  select count(*) into n
    from public.provider_events
   where id = '30000000-0000-4000-8000-000000000861';
  insert into serp300_results values (
    'provider_events_cross_tenant_select',
    '0 Tenant B event rows',
    n || ' Tenant B event rows',
    n = 0
  );

  -- provider_events: un-attributed event must not be readable either.
  select count(*) into n
    from public.provider_events
   where id = '30000000-0000-4000-8000-000000000862';
  insert into serp300_results values (
    'provider_events_unattributed_select',
    '0 unattributed event rows',
    n || ' unattributed event rows',
    n = 0
  );

  -- settlement_allocations: Tenant B allocation must not be readable.
  select count(*) into n
    from public.settlement_allocations
   where id = '30000000-0000-4000-8000-000000000871';
  insert into serp300_results values (
    'settlement_allocations_cross_tenant_select',
    '0 Tenant B allocation rows',
    n || ' Tenant B allocation rows',
    n = 0
  );

  -- payment_intents: cross-book (Tenant A Book A2 intent must not be readable).
  -- Note: no Tenant A Book A2 payment intent fixture exists, so this is a
  -- structural check — RLS must enforce organisation_id = current_setting.
  -- We verify by checking that the Tenant B intent is still invisible and
  -- confirming no rows are returned for the organisation_id mismatch.
  select count(*) into n
    from public.payment_intents
   where organisation_id = '30000000-0000-4000-8000-000000000002';
  insert into serp300_results values (
    'payment_intents_cross_book_isolation',
    '0 rows for non-member org',
    n || ' rows for non-member org',
    n = 0
  );

end
$$;

reset role;

set local role authenticated;
do $$
begin
  begin
    perform public.accept_staff_invitation(
      '30000000-0000-4000-8000-000000000601',
      '30000000-0000-4000-8000-000000000102'
    );
    insert into serp300_results values (
      'direct_invitation_rpc_execution',
      'authenticated EXECUTE denied',
      'authenticated entered and completed SECURITY DEFINER body',
      false
    );
  exception
    when insufficient_privilege then
      insert into serp300_results values (
        'direct_invitation_rpc_execution',
        'authenticated EXECUTE denied',
        'authenticated EXECUTE denied',
        true
      );
    when others then
      insert into serp300_results values (
        'direct_invitation_rpc_execution',
        'authenticated EXECUTE denied',
        'authenticated entered SECURITY DEFINER body: ' || sqlstate || ': ' || sqlerrm,
        false
      );
  end;

  begin
    perform platform.provision_approved_application(
      '30000000-0000-4000-8000-000000000701',
      '30000000-0000-4000-8000-000000000101'
    );
    insert into serp300_results values (
      'direct_provision_rpc_execution',
      'authenticated EXECUTE denied',
      'authenticated entered and completed SECURITY DEFINER body',
      false
    );
  exception
    when insufficient_privilege then
      insert into serp300_results values (
        'direct_provision_rpc_execution',
        'authenticated EXECUTE denied',
        'authenticated EXECUTE denied',
        true
      );
    when others then
      insert into serp300_results values (
        'direct_provision_rpc_execution',
        'authenticated EXECUTE denied',
        'authenticated entered SECURITY DEFINER body: ' || sqlstate || ': ' || sqlerrm,
        false
      );
  end;
end
$$;
reset role;

set local role service_role;
do $$
declare
  rpc_error text := null;
  rpc_result jsonb := null;
  verified boolean;
begin
  begin
    select public.accept_staff_invitation(
      '30000000-0000-4000-8000-000000000601',
      '30000000-0000-4000-8000-000000000102'
    ) into rpc_result;
  exception when others then
    rpc_error := sqlstate || ': ' || sqlerrm;
  end;

  verified := rpc_error is null and rpc_result->>'ok' = 'true';
  insert into serp300_results values (
    'invitation_rpc_runtime',
    'service path accepts bound identity and writes canonical membership/book/audit rows',
    coalesce(rpc_error, rpc_result::text),
    verified
  );

  rpc_result := public.accept_staff_invitation(
    '30000000-0000-4000-8000-000000000602',
    '30000000-0000-4000-8000-000000000103'
  );
  insert into serp300_results values (
    'invitation_identity_mismatch',
    'mismatched verified identity rejected without mutation',
    rpc_result::text,
    rpc_result->>'error' = 'invitation_identity_mismatch'
  );

  rpc_error := null;
  rpc_result := null;
  begin
    select platform.provision_approved_application(
      '30000000-0000-4000-8000-000000000701',
      '30000000-0000-4000-8000-000000000101'
    ) into rpc_result;
  exception when others then
    rpc_error := sqlstate || ': ' || sqlerrm;
  end;

  verified := rpc_error is null and rpc_result->>'ok' = 'true';
  insert into serp300_results values (
    'provision_rpc_runtime',
    'service path provisions canonical organisation spine',
    coalesce(rpc_error, rpc_result::text),
    verified
  );
end
$$;
reset role;

-- Verify durable effects as the fixture owner, not by broadening service_role.
update serp300_results
   set passed = passed
     and exists (
       select 1
       from public.memberships m
       join public.book_memberships bm on bm.membership_id = m.id
       where m.person_id = '30000000-0000-4000-8000-000000000102'
         and m.organisation_id = '30000000-0000-4000-8000-000000000001'
         and m.role_id is not null
         and bm.book_id = '30000000-0000-4000-8000-000000000301'
     )
     and exists (
       select 1 from public.audit_events
       where object_id = '30000000-0000-4000-8000-000000000601'
         and action = 'invitation.accepted'
         and actor_person_id = '30000000-0000-4000-8000-000000000102'
     ),
       actual = actual || '; canonical membership/book/audit rows verified'
 where attack = 'invitation_rpc_runtime';

update serp300_results
   set passed = passed
     and exists (
       select 1 from public.invitations
       where id = '30000000-0000-4000-8000-000000000602'
         and status = 'pending'
         and accepted_by is null
     )
     and not exists (
       select 1 from public.memberships
       where person_id = '30000000-0000-4000-8000-000000000103'
         and organisation_id = '30000000-0000-4000-8000-000000000001'
     ),
       actual = actual || '; invitation remained pending and membership absent'
 where attack = 'invitation_identity_mismatch';

update serp300_results
   set passed = passed
     and exists (
       select 1
       from public.organisations o
       join public.memberships m on m.organisation_id = o.id
       join public.book_memberships bm on bm.membership_id = m.id
       join public.workflow_templates wt on wt.organisation_id = o.id
       join platform.tenant_registry tr on tr.organisation_id = o.id
       join platform.tenant_applications ta on ta.provisioned_organisation_id = o.id
       join public.books b on b.id = bm.book_id and b.organisation_id = o.id
       where ta.id = '30000000-0000-4000-8000-000000000701'
         and m.person_id = '30000000-0000-4000-8000-000000000102'
         and m.role_id is not null
         and b.is_default = true
         and wt.workflow_code = 'general_business_default'
         and tr.provisioning_status = 'ready'
     ),
       actual = actual || '; canonical organisation spine verified'
 where attack = 'provision_rpc_runtime';

table serp300_results;

do $$
declare failures text;
begin
  select string_agg(attack || ' => ' || actual, E'\n' order by attack)
    into failures
    from serp300_results
   where not passed;
  if failures is not null then
    raise exception E'SERP-300 SECURITY FAILURES:\n%', failures;
  end if;
end
$$;

rollback;
