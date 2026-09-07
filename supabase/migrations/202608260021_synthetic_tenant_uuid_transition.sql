begin;

-- =============================================================================
-- Migration: 202608260021_synthetic_tenant_uuid_transition.sql
-- SERP-275: Forward-only migration transitioning legacy tenant UUIDs (which
-- embedded company registration numbers 29552026 and 30222026) to deterministic
-- non-identifying synthetic UUIDs across all referencing tables.
-- =============================================================================

do $$
declare
  old_st uuid := '29552026-0000-4000-8000-000000000001';
  new_st uuid := '10000000-0000-4000-8000-000000000001';

  old_ci uuid := '30222026-0000-4000-8000-000000000001';
  new_ci uuid := '20000000-0000-4000-8000-000000000001';

  old_st_wf uuid := '29552026-0000-4000-8000-000000000802';
  new_st_wf uuid := '10000000-0000-4000-8000-000000000802';

  old_ci_wf uuid := '30222026-0000-4000-8000-000000000801';
  new_ci_wf uuid := '20000000-0000-4000-8000-000000000801';
begin
  -- Temporarily set session_replication_role to replica to allow atomic key restructuring
  set local session_replication_role = 'replica';
  -- 1. Disambiguate legacy unique constraints (slug and registry_code)
  -- Appending temporary transition suffix prevents unique constraint violation
  -- when inserting new synthetic organisation rows.
  update public.organisations
     set slug = slug || '-legacy-transition',
         registry_code = null
   where id in (old_st, old_ci);

  -- 2. Insert target synthetic organisation rows with canonical slugs
  insert into public.organisations (id, slug, legal_name, registry_code, base_currency, business_timezone, status)
  select new_st, 'starq', legal_name, null, base_currency, business_timezone, status
    from public.organisations where id = old_st
  on conflict (id) do update set
    slug = excluded.slug,
    legal_name = excluded.legal_name,
    status = excluded.status;

  insert into public.organisations (id, slug, legal_name, registry_code, base_currency, business_timezone, status)
  select new_ci, 'club-ignition', legal_name, null, base_currency, business_timezone, status
    from public.organisations where id = old_ci
  on conflict (id) do update set
    slug = excluded.slug,
    legal_name = excluded.legal_name,
    status = excluded.status;

  -- 3. Temporarily disable append-only triggers on historical/audit tables
  if exists (select 1 from pg_trigger where tgname = 'audit_events_append_only') then
    alter table public.audit_events disable trigger audit_events_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'security_events_append_only') then
    alter table public.security_events disable trigger security_events_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'job_events_append_only') then
    alter table public.job_events disable trigger job_events_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'stock_movements_append_only') then
    alter table public.stock_movements disable trigger stock_movements_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'journal_entries_append_only') then
    alter table public.journal_entries disable trigger journal_entries_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'journal_lines_append_only') then
    alter table public.journal_lines disable trigger journal_lines_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'settlement_allocations_append_only') then
    alter table public.settlement_allocations disable trigger settlement_allocations_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'sod_exceptions_append_only') then
    alter table public.sod_exceptions disable trigger sod_exceptions_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'sod_exception_dispositions_append_only') then
    alter table public.sod_exception_dispositions disable trigger sod_exception_dispositions_append_only;
  end if;

  -- 4. Update Business Names and Locations
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'business_names') then
    update public.business_names set id = '10000000-0000-4000-8000-000000000002', organisation_id = new_st where id = '29552026-0000-4000-8000-000000000002';
    update public.business_names set id = '10000000-0000-4000-8000-000000000003', organisation_id = new_st where id = '29552026-0000-4000-8000-000000000003';
    update public.business_names set id = '20000000-0000-4000-8000-000000000002', organisation_id = new_ci where id = '30222026-0000-4000-8000-000000000002';
    update public.business_names set organisation_id = new_st where organisation_id = old_st;
    update public.business_names set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'locations') then
    update public.locations set organisation_id = new_st where organisation_id = old_st;
    update public.locations set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 5. Update Roles, Role Permissions, and Memberships (handling composite FKs)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'roles') then
    alter table public.role_permissions drop constraint if exists role_permissions_organisation_id_role_id_fkey;
    alter table public.memberships drop constraint if exists memberships_role_fk;

    update public.roles set organisation_id = new_st where organisation_id = old_st;
    update public.roles set organisation_id = new_ci where organisation_id = old_ci;

    update public.role_permissions set organisation_id = new_st where organisation_id = old_st;
    update public.role_permissions set organisation_id = new_ci where organisation_id = old_ci;

    update public.memberships set organisation_id = new_st where organisation_id = old_st;
    update public.memberships set organisation_id = new_ci where organisation_id = old_ci;

    alter table public.role_permissions add constraint role_permissions_organisation_id_role_id_fkey
      foreign key (organisation_id, role_id) references public.roles(organisation_id, id) on delete cascade;
    alter table public.memberships add constraint memberships_role_fk
      foreign key (organisation_id, role_id) references public.roles(organisation_id, id);
  else
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'memberships') then
      update public.memberships set organisation_id = new_st where organisation_id = old_st;
      update public.memberships set organisation_id = new_ci where organisation_id = old_ci;
    end if;
  end if;

  -- 6. Update Document Sequences
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'document_sequences') then
    update public.document_sequences set organisation_id = new_st where organisation_id = old_st;
    update public.document_sequences set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 7. Update Audit Events and Security Events
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'audit_events') then
    update public.audit_events set organisation_id = new_st where organisation_id = old_st;
    update public.audit_events set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'security_events') then
    update public.security_events set organisation_id = new_st where organisation_id = old_st;
    update public.security_events set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 8. Update Automation Principals and Command Approvals
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'automation_principals') then
    update public.automation_principals set organisation_id = new_st where organisation_id = old_st;
    update public.automation_principals set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'command_approvals') then
    update public.command_approvals set organisation_id = new_st where organisation_id = old_st;
    update public.command_approvals set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 9. Update Customers, Vehicles, Garage Jobs, and Job Events
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'customers') then
    update public.customers set organisation_id = new_st where organisation_id = old_st;
    update public.customers set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vehicles') then
    update public.vehicles set organisation_id = new_st where organisation_id = old_st;
    update public.vehicles set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'garage_jobs') then
    update public.garage_jobs set organisation_id = new_st where organisation_id = old_st;
    update public.garage_jobs set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'job_events') then
    update public.job_events set organisation_id = new_st where organisation_id = old_st;
    update public.job_events set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 10. Update Stock & SCM Tables
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'product_categories') then
    update public.product_categories set organisation_id = new_st where organisation_id = old_st;
    update public.product_categories set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_items') then
    update public.stock_items set organisation_id = new_st where organisation_id = old_st;
    update public.stock_items set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_batches') then
    update public.stock_batches set organisation_id = new_st where organisation_id = old_st;
    update public.stock_batches set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_movements') then
    update public.stock_movements set organisation_id = new_st where organisation_id = old_st;
    update public.stock_movements set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'suppliers') then
    update public.suppliers set organisation_id = new_st where organisation_id = old_st;
    update public.suppliers set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'purchase_orders') then
    update public.purchase_orders set organisation_id = new_st where organisation_id = old_st;
    update public.purchase_orders set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'purchase_order_lines') then
    update public.purchase_order_lines set organisation_id = new_st where organisation_id = old_st;
    update public.purchase_order_lines set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'job_card_parts') then
    update public.job_card_parts set organisation_id = new_st where organisation_id = old_st;
    update public.job_card_parts set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'job_card_labour') then
    update public.job_card_labour set organisation_id = new_st where organisation_id = old_st;
    update public.job_card_labour set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 11. Update Accounting Tables
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chart_of_accounts') then
    update public.chart_of_accounts set organisation_id = new_st where organisation_id = old_st;
    update public.chart_of_accounts set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'journal_entries') then
    update public.journal_entries set organisation_id = new_st where organisation_id = old_st;
    update public.journal_entries set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'journal_lines') then
    update public.journal_lines set organisation_id = new_st where organisation_id = old_st;
    update public.journal_lines set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'commercial_invoices') then
    update public.commercial_invoices set organisation_id = new_st where organisation_id = old_st;
    update public.commercial_invoices set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'commercial_invoice_lines') then
    update public.commercial_invoice_lines set organisation_id = new_st where organisation_id = old_st;
    update public.commercial_invoice_lines set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'commercial_payments') then
    update public.commercial_payments set organisation_id = new_st where organisation_id = old_st;
    update public.commercial_payments set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'commercial_expenses') then
    update public.commercial_expenses set organisation_id = new_st where organisation_id = old_st;
    update public.commercial_expenses set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'settlement_allocations') then
    update public.settlement_allocations set organisation_id = new_st where organisation_id = old_st;
    update public.settlement_allocations set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 12. Update Workflow Templates & Stages (handling composite FKs)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'workflow_templates') then
    alter table public.workflow_stages drop constraint if exists workflow_stages_organisation_id_workflow_template_id_fkey;

    update public.workflow_templates
       set id = new_ci_wf, organisation_id = new_ci
     where id = old_ci_wf and organisation_id = old_ci;

    update public.workflow_templates
       set id = new_st_wf, organisation_id = new_st
     where id = old_st_wf and organisation_id = old_st;

    update public.workflow_templates set organisation_id = new_ci where organisation_id = old_ci;
    update public.workflow_templates set organisation_id = new_st where organisation_id = old_st;

    update public.workflow_stages
       set organisation_id = new_ci, workflow_template_id = new_ci_wf
     where workflow_template_id = old_ci_wf and organisation_id = old_ci;

    update public.workflow_stages
       set organisation_id = new_st, workflow_template_id = new_st_wf
     where workflow_template_id = old_st_wf and organisation_id = old_st;

    update public.workflow_stages set organisation_id = new_ci where organisation_id = old_ci;
    update public.workflow_stages set organisation_id = new_st where organisation_id = old_st;

    alter table public.workflow_stages add constraint workflow_stages_organisation_id_workflow_template_id_fkey
      foreign key (organisation_id, workflow_template_id)
      references public.workflow_templates(organisation_id, id);
  end if;

  -- 13. Update SoD Exceptions
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sod_exceptions') then
    update public.sod_exceptions set organisation_id = new_st where organisation_id = old_st;
    update public.sod_exceptions set organisation_id = new_ci where organisation_id = old_ci;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sod_exception_dispositions') then
    update public.sod_exception_dispositions set organisation_id = new_st where organisation_id = old_st;
    update public.sod_exception_dispositions set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 14. Update Tax Registrations
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tax_registrations') then
    update public.tax_registrations set organisation_id = new_st where organisation_id = old_st;
    update public.tax_registrations set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 15. Update Bank Accounts
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bank_accounts') then
    update public.bank_accounts set organisation_id = new_st where organisation_id = old_st;
    update public.bank_accounts set organisation_id = new_ci where organisation_id = old_ci;
  end if;

  -- 16. Re-enable append-only triggers
  if exists (select 1 from pg_trigger where tgname = 'audit_events_append_only') then
    alter table public.audit_events enable trigger audit_events_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'security_events_append_only') then
    alter table public.security_events enable trigger security_events_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'job_events_append_only') then
    alter table public.job_events enable trigger job_events_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'stock_movements_append_only') then
    alter table public.stock_movements enable trigger stock_movements_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'journal_entries_append_only') then
    alter table public.journal_entries enable trigger journal_entries_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'journal_lines_append_only') then
    alter table public.journal_lines enable trigger journal_lines_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'settlement_allocations_append_only') then
    alter table public.settlement_allocations enable trigger settlement_allocations_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'sod_exceptions_append_only') then
    alter table public.sod_exceptions enable trigger sod_exceptions_append_only;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'sod_exception_dispositions_append_only') then
    alter table public.sod_exception_dispositions enable trigger sod_exception_dispositions_append_only;
  end if;

  -- 17. Delete old legacy organisation rows now that all child references are migrated
  delete from public.organisations where id in (old_st, old_ci);

  -- Restore normal replication role
  set local session_replication_role = 'origin';
end $$;

commit;
