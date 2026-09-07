\set ON_ERROR_STOP on

-- SERP-124: prove the checked-in tenant policies as a role that cannot bypass RLS.
-- The database used by this probe is disposable and contains synthetic fixtures only.

begin;

create temporary table expected_public_tables (table_name text primary key) on commit drop;
insert into expected_public_tables (table_name) values
  ('organisations'), ('business_names'), ('persons'), ('memberships'), ('seats'),
  ('membership_seats'), ('idempotency_keys'), ('attachments'), ('audit_events'),
  ('contacts'), ('vehicles'), ('products'), ('product_prices'), ('locations'),
  ('inventory_items'), ('stock_movements'), ('garage_jobs'), ('job_events'),
  ('accounting_periods'), ('commercial_documents'), ('commercial_document_lines'),
  ('journal_proposals'), ('journal_proposal_lines'), ('journal_entries'),
  ('journal_lines'), ('document_sequences'), ('security_events'),
  ('automation_principals'), ('automation_capability_grants'), ('command_approvals'),
  ('settlement_allocations'),
  -- SERP-125: the one deliberately-partial-public table in this schema. It carries
  -- RLS + 2 policies like the rest, but one of those policies (see below) grants a
  -- scoped, cross-tenant read for published rows by design. Classified separately
  -- below rather than folded into the fully-isolated 'protected-by-RLS' bucket.
  ('product_publications'),
  -- Added 2026-09-07: this list had not been updated since SERP-124 while 25 real
  -- tables were added across later migrations (chart of accounts, payments,
  -- workflow, SoD audit, tax, RBAC, invitations, books, goods receipts, outbox).
  -- Verified via pg_class against a fresh migration-only database - nothing here
  -- was removed, this only adds tables that already exist and were previously
  -- invisible to this catalogue-drift check entirely.
  ('chart_of_accounts'), ('bank_accounts'),
  ('books'), ('book_locations'), ('book_memberships'),
  ('goods_receipts'), ('goods_receipt_lines'),
  ('payment_providers'), ('payment_provider_config'), ('payment_intents'),
  ('payment_attempts'), ('payment_refunds'), ('payment_settlements'),
  ('payment_settlement_items'), ('provider_events'),
  ('workflow_stages'), ('workflow_templates'),
  ('sod_exceptions'), ('sod_exception_dispositions'),
  ('tax_registrations'), ('tax_rate_schedules'),
  ('roles'), ('role_permissions'), ('invitations'),
  ('transactional_outbox');

create temporary table expected_policies (
  table_name text not null,
  policy_name text not null,
  primary key (table_name, policy_name)
) on commit drop;
insert into expected_policies (table_name, policy_name) values
  ('organisations', 'organisations_current'),
  ('business_names', 'business_names_current'),
  ('memberships', 'memberships_current'),
  ('idempotency_keys', 'idempotency_current'),
  ('attachments', 'attachments_current'),
  ('audit_events', 'audit_current'),
  ('contacts', 'contacts_current'),
  ('vehicles', 'vehicles_current'),
  ('products', 'products_current'),
  ('product_prices', 'product_prices_current'),
  ('locations', 'locations_current'),
  ('inventory_items', 'inventory_items_current'),
  ('stock_movements', 'stock_movements_current'),
  ('garage_jobs', 'garage_jobs_current'),
  ('job_events', 'job_events_current'),
  ('accounting_periods', 'accounting_periods_current'),
  ('commercial_documents', 'commercial_documents_current'),
  ('commercial_document_lines', 'commercial_document_lines_current'),
  ('journal_proposals', 'journal_proposals_current'),
  ('journal_proposal_lines', 'journal_proposal_lines_current'),
  ('journal_entries', 'journal_entries_current'),
  ('journal_lines', 'journal_lines_current'),
  ('document_sequences', 'document_sequences_current'),
  ('security_events', 'security_events_current'),
  ('automation_principals', 'automation_principals_current'),
  ('command_approvals', 'command_approvals_current'),
  ('settlement_allocations', 'settlement_allocations_current'),
  -- SERP-125: _current is the ordinary tenant-scoped rule (matches the pattern of
  -- every other table above). _published is NOT tenant-scoped by design -- it is
  -- the public listing rule, deliberately readable across tenants for rows in
  -- state='published'. Both are still enumerated here so the drift check above
  -- can see them; the generic cross-tenant loop further below explicitly skips
  -- this table because that policy makes the "zero cross-tenant rows" invariant
  -- inapplicable to it -- see the comment at that loop.
  ('product_publications', 'product_publications_current'),
  ('product_publications', 'product_publications_published'),
  -- Added 2026-09-07, alongside the expected_public_tables fix above: this list
  -- had not been updated since SERP-124 either, so every real policy on the 25
  -- newer tables was "unexpected" and tripped the drift check below. Verified by
  -- grepping `create policy ... on public.<table>` across supabase/migrations/*.sql
  -- for each of the 25 tables and listing exactly what exists -- nothing invented.
  --
  -- Two of the 25 carry NO policy by design (deny-by-default, service-role only,
  -- same pattern as payment_provider_config/provider_events already documented
  -- above) and correctly have no row here: payment_provider_config (no client
  -- read/write policy -- 202608290031_payment_provider_registry.sql section 5,
  -- reaffirmed by 202609031047_payment_provider_tenant_scope.sql section 4) and
  -- provider_events (no client read policy at all -- raw webhook bodies are
  -- dispute evidence, not for the browser -- 202608290033_provider_events.sql).
  ('chart_of_accounts', 'chart_of_accounts_tenant'),          -- 202608300035_chart_of_accounts_as_data.sql
  ('bank_accounts', 'bank_accounts_tenant'),                  -- 202608250018_bank_accounts_entities.sql
  ('books', 'books_tenant_isolation'),                        -- 202608270025_books_and_operating_activities.sql
  ('book_locations', 'book_locations_tenant_isolation'),      -- 202608270025_books_and_operating_activities.sql
  ('book_memberships', 'book_memberships_tenant_isolation'),  -- 202608270025_books_and_operating_activities.sql
  ('goods_receipts', 'goods_receipts_tenant'),                -- 202608300036_goods_receipts.sql
  ('goods_receipt_lines', 'goods_receipt_lines_tenant'),      -- 202608300036_goods_receipts.sql
  -- payment_providers_read is a GLOBAL reference-data policy (`using (true)`,
  -- no organisation_id column on the table at all -- it is a 3-row registry of
  -- provider codes 'MOCK'/'BML'/'MIB', deliberately readable by every tenant so
  -- the UI can offer payment methods). See the exclusion for this table in the
  -- tenant A/B behavioural loop further below -- 202608290031 section 5.
  ('payment_providers', 'payment_providers_read'),            -- 202608290031_payment_provider_registry.sql
  ('payment_intents', 'payment_intents_current'),             -- 202608290032_payment_intents_and_attempts.sql
  ('payment_attempts', 'payment_attempts_current'),           -- 202608290032_payment_intents_and_attempts.sql
  ('payment_refunds', 'payment_refunds_current'),             -- 202608290032_payment_intents_and_attempts.sql
  ('payment_settlements', 'payment_settlements_current'),     -- 202608290034_payment_settlements.sql
  ('payment_settlement_items', 'payment_settlement_items_current'), -- 202608290034_payment_settlements.sql
  ('workflow_templates', 'workflow_templates_tenant'),        -- 202608250013_workflow_stages.sql
  ('workflow_stages', 'workflow_stages_tenant'),              -- 202608250013_workflow_stages.sql
  ('sod_exceptions', 'sod_exceptions_tenant'),                -- 202608250016_sod_exceptions.sql
  ('sod_exception_dispositions', 'sod_dispositions_tenant'),  -- 202608250016_sod_exceptions.sql
  ('tax_registrations', 'tax_registrations_tenant'),          -- 202608250017_tax_regimes_and_periods.sql
  -- tax_rate_schedules_read is likewise GLOBAL (`using (true)`, no
  -- organisation_id column): a single statutory GST rate table shared by every
  -- tenant, not tenant data. Same behavioural-loop exclusion as payment_providers.
  ('tax_rate_schedules', 'tax_rate_schedules_read'),          -- 202608250017_tax_regimes_and_periods.sql
  ('roles', 'roles_tenant'),                                  -- 202608250015_roles_as_data.sql
  ('role_permissions', 'role_permissions_tenant'),            -- 202608250015_roles_as_data.sql
  ('invitations', 'invitations_tenant_isolation'),            -- 202608270027_staff_invitations_and_lifecycle.sql
  ('transactional_outbox', 'transactional_outbox_current');   -- 202608260022_transactional_outbox_and_audit.sql

do $$
begin
  if exists (
    (select table_name from expected_public_tables
     except
     select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r')
    union all
    (select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
     except
     select table_name from expected_public_tables)
  ) then
    raise exception 'SERP-124 public table catalogue drifted';
  end if;

  if exists (
    (select table_name, policy_name from expected_policies
     except
     select c.relname, p.polname
       from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public')
    union all
    (select c.relname, p.polname
       from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
     except
     select table_name, policy_name from expected_policies)
  ) then
    raise exception 'SERP-124 RLS policy catalogue drifted';
  end if;
end
$$;

-- Classification required by SERP-124. A table with a policy is reported as RLS-protected;
-- a table with no policy is acceptable only when the normal authenticated role lacks SELECT.
create temporary table protection_report on commit drop as
select e.table_name,
       c.relrowsecurity as rls_enabled,
       count(p.oid)::integer as policy_count,
       has_table_privilege('authenticated', format('public.%I', e.table_name), 'SELECT')
         as authenticated_can_select,
       case
         -- SERP-125: classified ahead of the generic RLS bucket because one of its
         -- two policies (product_publications_published) is a deliberate, evidenced
         -- cross-tenant read for published rows -- not the full tenant isolation the
         -- other 27 'protected-by-RLS' tables provide. See publication_boundary_probe.sql
         -- for the behavioural proof of that boundary.
         when e.table_name = 'product_publications' then 'protected-with-scoped-public-read'
         when c.relrowsecurity and count(p.oid) > 0 then 'protected-by-RLS'
         when not has_table_privilege(
           'authenticated', format('public.%I', e.table_name), 'SELECT'
         ) then 'protected-by-revoked-grant'
         else 'NOT PROTECTED'
       end as protection
  from expected_public_tables e
  join pg_class c on c.relname = e.table_name
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  left join pg_policy p on p.polrelid = c.oid
 group by e.table_name, c.relrowsecurity;

-- Counts updated 2026-09-07 alongside the two catalogue fixes above: 25 tables
-- joined expected_public_tables, of which 23 carry a real policy (protected-by-RLS,
-- including the two global-reference tables payment_providers/tax_rate_schedules --
-- this classification does not distinguish tenant-scoped from global-readable, it
-- only asks "is there RLS + a policy") and 2 are deny-by-default with no policy
-- and no authenticated grant (payment_provider_config, provider_events), landing
-- in protected-by-revoked-grant like the original 4. 32+25=57, 27+23=50, 4+2=6.
do $$
begin
  if (select count(*) from protection_report) <> 57 then
    raise exception 'SERP-124/337 expected 57 classified public tables';
  end if;
  if (select count(*) from protection_report where protection = 'protected-by-RLS') <> 50 then
    raise exception 'SERP-124/337 expected 50 RLS-protected tables';
  end if;
  if (select count(*) from protection_report where protection = 'protected-by-revoked-grant') <> 6 then
    raise exception 'SERP-124/337 expected 6 revoked-grant-protected tables';
  end if;
  if (select count(*) from protection_report where protection = 'protected-with-scoped-public-read') <> 1 then
    raise exception 'SERP-125 expected exactly 1 scoped-public-read table (product_publications)';
  end if;
  if exists (select 1 from protection_report where protection = 'NOT PROTECTED') then
    raise exception 'SERP-124 found an unprotected public table';
  end if;
end
$$;

select table_name, rls_enabled, policy_count, authenticated_can_select, protection
  from protection_report
 order by table_name;

-- The probe gets SELECT deliberately so revoked grants cannot masquerade as an RLS pass.
create role serp124_rls_probe noinherit nologin nosuperuser nobypassrls;
grant serp124_rls_probe to current_user;
grant usage on schema public, app_private to serp124_rls_probe;
grant select on all tables in schema public to serp124_rls_probe;
grant select on expected_policies to serp124_rls_probe;

set local role serp124_rls_probe;
set local row_security = on;

do $$
declare
  attrs record;
  table_record record;
  visible boolean;
begin
  select rolsuper, rolbypassrls into attrs
    from pg_roles where rolname = current_user;

  if current_user <> 'serp124_rls_probe'
     or attrs.rolsuper
     or attrs.rolbypassrls
     or current_setting('row_security') <> 'on' then
    raise exception 'SERP-124 probe role can bypass RLS';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles owner_role on owner_role.oid = c.relowner
     where n.nspname = 'public'
       and c.relkind = 'r'
       and owner_role.rolname = current_user
  ) then
    raise exception 'SERP-124 probe role owns a tested table';
  end if;

  -- No tenant/person claim: every RLS-enabled table must expose zero rows --
  -- except product_publications (SERP-125), skipped below. Its
  -- product_publications_published policy checks only state = 'published' and
  -- carries no organisation/person claim check at all: a published row is meant
  -- to be visible with NO tenant claim, since that is what makes it a public
  -- listing rather than a leak. See publication_boundary_probe.sql for the
  -- dedicated behavioural proof of that boundary.
  --
  -- payment_providers and tax_rate_schedules (added SERP-337) are skipped for
  -- the same reason as each other, and a different reason from
  -- product_publications: both carry a single `using (true)` policy with no
  -- organisation/person claim check of any kind, because both are global
  -- reference data seeded once by their migration and meant to be visible to
  -- every tenant regardless of claim (the 3-row payment provider registry --
  -- 202608290031_payment_provider_registry.sql section 5; the statutory GST
  -- rate table -- 202608250017_tax_regimes_and_periods.sql section 6). A
  -- no-claim session is expected to see these rows; that is not a leak.
  perform set_config('app.organisation_id', '', true);
  perform set_config('app.person_id', '', true);
  for table_record in
    select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and c.relname not in ('product_publications', 'payment_providers', 'tax_rate_schedules')
     order by c.relname
  loop
    execute format('select exists (select 1 from public.%I limit 1)', table_record.table_name)
       into visible;
    if visible then
      raise exception 'SERP-124 no-claim probe exposed rows from %', table_record.table_name;
    end if;
  end loop;
end
$$;

-- Synthetic tenant A claim. The same synthetic person has memberships in A and B, so the
-- target=current-organisation check is what prevents tenant B visibility.
select set_config('app.person_id', '00000000-0000-4000-8000-000000000101', true);
select set_config('app.organisation_id', '00000000-0000-4000-8000-000000000001', true);

do $$
declare
  policy_table record;
  tenant_a_count bigint;
  tenant_b_count bigint;
  tenant_column text;
begin
  for policy_table in
    select distinct table_name from expected_policies
     -- SERP-125: skip here, not a gap. This loop's invariant is "tenant A can never
     -- see tenant B's rows by any query shape" -- true for all 27 fully-isolated
     -- tables, but NOT the intended behaviour for product_publications, whose
     -- product_publications_published policy deliberately admits another tenant's
     -- PUBLISHED rows (that is the whole point of a publication feed). Running this
     -- table through this loop would either fail on correct behaviour, or pass by
     -- accident of the fixture happening to hold no cross-tenant published row --
     -- both worse than an explicit skip. The boundary this table actually promises
     -- (private by default, explicit + audited publish, revocable) is proved
     -- instead by tests/publication_boundary_probe.sql.
     --
     -- payment_providers and tax_rate_schedules are excluded for a different
     -- reason: this loop's tenant_column := 'organisation_id' assumption does
     -- not hold for them at all -- neither table HAS an organisation_id column.
     -- Both are global reference data by design (payment_providers: the 3-row
     -- provider registry, `using (true)`, 202608290031_payment_provider_registry.sql
     -- section 5; tax_rate_schedules: the statutory GST rate table, `using (true)`,
     -- 202608250017_tax_regimes_and_periods.sql section 6) -- there is no tenant
     -- boundary for this loop to prove on them, and running the composed query
     -- would fail with "column organisation_id does not exist" rather than a
     -- meaningful assertion.
     where table_name not in ('product_publications', 'payment_providers', 'tax_rate_schedules')
     order by table_name
  loop
    tenant_column := case when policy_table.table_name = 'organisations' then 'id' else 'organisation_id' end;
    execute format('select count(*) from public.%I where %I = $1', policy_table.table_name, tenant_column)
      into tenant_a_count using '00000000-0000-4000-8000-000000000001'::uuid;
    execute format('select count(*) from public.%I where %I = $1', policy_table.table_name, tenant_column)
      into tenant_b_count using '00000000-0000-4000-8000-000000000002'::uuid;

    if tenant_a_count = 0 then
      raise exception 'SERP-124 tenant A positive control missing for %', policy_table.table_name;
    end if;
    if tenant_b_count <> 0 then
      raise exception 'SERP-124 tenant B rows crossed the boundary in %', policy_table.table_name;
    end if;
  end loop;
end
$$;

select current_user as asserted_probe_role,
       current_setting('row_security') as row_security,
       (select rolsuper from pg_roles where rolname = current_user) as superuser,
       (select rolbypassrls from pg_roles where rolname = current_user) as bypass_rls,
       (select count(distinct table_name) from expected_policies
         where table_name not in ('product_publications', 'payment_providers', 'tax_rate_schedules')
       ) as policies_behaviorally_exercised,
       (select count(*) from public.organisations) as visible_organisations,
       (select count(*) from public.memberships) as visible_memberships;

reset role;
rollback;
