\set ON_ERROR_STOP on
\echo 'SERP-298 CHECK 01: service-only RPC ACL'
do $$ begin
  if has_function_privilege('authenticated', 'platform.list_tenants(uuid)', 'execute') then raise exception 'authenticated_can_list_platform_tenants'; end if;
  if has_function_privilege('authenticated', 'platform.provision_tenant(uuid,uuid,jsonb)', 'execute') then raise exception 'authenticated_can_provision_platform_tenant'; end if;
end $$;

insert into public.persons(id,person_key,display_label) values
 ('29800000-0000-4000-8000-000000000001','serp298-admin','SERP 298 Admin'),
 ('29800000-0000-4000-8000-000000000002','serp298-support','SERP 298 Support'),
 ('29800000-0000-4000-8000-000000000003','serp298-user','SERP 298 Tenant User');
insert into platform.operator_principals(person_id,operator_role) values
 ('29800000-0000-4000-8000-000000000001','platform_admin'),
 ('29800000-0000-4000-8000-000000000002','platform_support');

\echo 'SERP-298 CHECK 02: admin provisions archetype, book, registry, and pending owner invitation'
set role service_role;
select platform.provision_tenant(
 '29800000-0000-4000-8000-000000000001',
 '29800000-0000-4000-8000-000000000010',
 '{"slug":"serp-298-probe","legal_name":"SERP 298 Probe Pvt Ltd","archetype_id":"automotive_workshop","book_code":"GAR","book_name":"Garage Book","owner_email":"owner298@example.test","owner_name":"Probe Owner"}'::jsonb
) as provision_result \gset
reset role;
create temp table probe_context as select (:'provision_result'::jsonb->>'organisation_id')::uuid as organisation_id;
do $$ begin
  if not exists (select 1 from platform.tenant_registry where organisation_id=(select organisation_id from probe_context) and archetype_id='automotive_workshop' and provisioning_status='ready') then raise exception 'registry_not_ready'; end if;
  if not exists (select 1 from public.books where organisation_id=(select organisation_id from probe_context) and code='GAR' and is_default) then raise exception 'book_not_provisioned'; end if;
  if not exists (select 1 from public.invitations where organisation_id=(select organisation_id from probe_context) and email='owner298@example.test' and status='pending') then raise exception 'owner_invitation_missing'; end if;
  if exists (select 1 from public.memberships where organisation_id=(select organisation_id from probe_context)) then raise exception 'ambient_owner_membership_created'; end if;
end $$;

\echo 'SERP-298 CHECK 03: support can list metadata but cannot mutate'
set role service_role;
select platform.list_tenants('29800000-0000-4000-8000-000000000002') as tenant_list \gset
reset role;
create temp table tenant_list_context as select :'tenant_list'::jsonb as payload;
do $$ begin
  if (select jsonb_array_length(payload) from tenant_list_context) < 1 then raise exception 'tenant_list_empty'; end if;
  begin
    perform platform.provision_tenant('29800000-0000-4000-8000-000000000002','29800000-0000-4000-8000-000000000011','{"slug":"must-fail","legal_name":"Must Fail","owner_email":"x@example.test","owner_name":"X"}'::jsonb);
    raise exception 'support_provision_unexpectedly_succeeded';
  exception when others then
    if sqlerrm <> 'platform_admin_required' then raise; end if;
  end;
end $$;

\echo 'SERP-298 CHECK 04: suspension makes canonical tenant RLS fail closed'
insert into public.memberships(organisation_id,person_id,status) values ((:'provision_result'::jsonb->>'organisation_id')::uuid,'29800000-0000-4000-8000-000000000003','active');
insert into public.book_memberships(organisation_id,membership_id,book_id)
select m.organisation_id,m.id,b.id from public.memberships m join public.books b on b.organisation_id=m.organisation_id and b.is_default where m.person_id='29800000-0000-4000-8000-000000000003';
insert into public.commercial_documents(organisation_id,book_id,document_type,status,gross_total)
select organisation_id,id,'sales_invoice','draft',10 from public.books where organisation_id=(:'provision_result'::jsonb->>'organisation_id')::uuid and is_default;
grant select on public.commercial_documents to authenticated;
set role authenticated;
select set_config('app.person_id','29800000-0000-4000-8000-000000000003',false);
select set_config('app.organisation_id',(:'provision_result'::jsonb->>'organisation_id'),false);
create temp table active_count as select count(*) as value from public.commercial_documents;
reset role;
do $$ begin if (select value from active_count) <> 1 then raise exception 'active_tenant_expected_one_row'; end if; end $$;
set role service_role;
select platform.set_tenant_status('29800000-0000-4000-8000-000000000001',(:'provision_result'::jsonb->>'organisation_id')::uuid,'29800000-0000-4000-8000-000000000012','suspend','probe') as suspended \gset
reset role;
set role authenticated;
select set_config('app.person_id','29800000-0000-4000-8000-000000000003',false);
select set_config('app.organisation_id',(:'provision_result'::jsonb->>'organisation_id'),false);
create temp table suspended_count as select count(*) as value from public.commercial_documents;
reset role;
do $$ begin if (select value from suspended_count) <> 0 then raise exception 'suspended_tenant_leaked_rows'; end if; end $$;

\echo 'SERP-298 CHECK 05: reactivation restores tenant authority and audit is immutable'
set role service_role;
select platform.set_tenant_status('29800000-0000-4000-8000-000000000001',(:'provision_result'::jsonb->>'organisation_id')::uuid,'29800000-0000-4000-8000-000000000013','reactivate','probe') as reactivated \gset
reset role;
set role authenticated;
select set_config('app.person_id','29800000-0000-4000-8000-000000000003',false);
select set_config('app.organisation_id',(:'provision_result'::jsonb->>'organisation_id'),false);
create temp table reactivated_count as select count(*) as value from public.commercial_documents;
reset role;
do $$ begin
  if (select value from reactivated_count) <> 1 then raise exception 'reactivation_did_not_restore_access'; end if;
  if (select count(*) from platform.operator_audit where action in ('tenant.list','tenant.provision','tenant.suspend','tenant.reactivate')) <> 4 then raise exception 'operator_audit_incomplete'; end if;
  begin update platform.operator_audit set outcome='rejected'; raise exception 'audit_update_unexpectedly_succeeded';
  exception when others then if sqlerrm not like '%append-only%' then raise; end if; end;
end $$;

\echo 'SERP-298 CHECK 06: idempotent replay returns the durable winner; changed payload conflicts'
set role service_role;
select platform.provision_tenant('29800000-0000-4000-8000-000000000001','29800000-0000-4000-8000-000000000010','{"slug":"serp-298-probe","legal_name":"SERP 298 Probe Pvt Ltd","archetype_id":"automotive_workshop","book_code":"GAR","book_name":"Garage Book","owner_email":"owner298@example.test","owner_name":"Probe Owner"}'::jsonb);
reset role;
do $$ begin
  begin perform platform.provision_tenant('29800000-0000-4000-8000-000000000001','29800000-0000-4000-8000-000000000010','{"slug":"changed","legal_name":"Changed","owner_email":"x@example.test","owner_name":"X"}'::jsonb); raise exception 'conflict_not_detected';
  exception when others then if sqlerrm <> 'idempotency_key_conflict' then raise; end if; end;
end $$;
\echo 'SERP-298 platform control-plane probe: PASS (6/6)'
