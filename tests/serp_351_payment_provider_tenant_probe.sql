begin;

-- =============================================================================
-- Probe: serp_351_payment_provider_tenant_probe.sql
-- SERP-351 bounded correction — structure/evidence assertions
--
-- This probe verifies the corrected current-main shape after applying the
-- SERP-351 correction migration. It intentionally checks database structure,
-- trigger presence, and guard/audit semantics. It does NOT claim a live
-- cross-tenant runtime probe against a disposable Supabase instance.
-- =============================================================================

-- 1. payment_provider_config is tenant-scoped and not platform-wide -----------
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and column_name = 'organisation_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'SERP-351 FAIL: payment_provider_config.organisation_id missing or nullable';
  end if;

  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and constraint_name = 'payment_provider_config_provider_id_environment_key'
  ) then
    raise exception 'SERP-351 FAIL: platform-wide unique(provider_id, environment) still present';
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and constraint_name = 'payment_provider_config_org_provider_env_key'
      and constraint_type = 'UNIQUE'
  ) then
    raise exception 'SERP-351 FAIL: tenant-scoped unique(organisation_id, provider_id, environment) missing';
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and constraint_name = 'payment_provider_config_org_id_provider_key'
      and constraint_type = 'UNIQUE'
  ) then
    raise exception 'SERP-351 FAIL: unique(organisation_id, id, provider_id) missing';
  end if;
end $$;

-- 2. F7 / DEC-105 — intents and attempts carry config_id ----------------------
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_intents'
      and column_name = 'config_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'SERP-351 FAIL: payment_intents.config_id missing or nullable';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_attempts'
      and column_name = 'config_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'SERP-351 FAIL: payment_attempts.config_id missing or nullable';
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payment_intents'
      and constraint_name = 'payment_intents_org_config_provider_fkey'
      and constraint_type = 'FOREIGN KEY'
  ) then
    raise exception 'SERP-351 FAIL: payment_intents config FK missing';
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payment_attempts'
      and constraint_name = 'payment_attempts_org_config_provider_fkey'
      and constraint_type = 'FOREIGN KEY'
  ) then
    raise exception 'SERP-351 FAIL: payment_attempts config FK missing';
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payment_attempts'
      and constraint_name = 'payment_attempts_org_intent_provider_config_fkey'
      and constraint_type = 'FOREIGN KEY'
  ) then
    raise exception 'SERP-351 FAIL: payment_attempts intent+provider+config FK missing';
  end if;
end $$;

-- 3. F8 / DEC-106 — evidence bundle and audit trail exist ---------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and column_name = 'activation_authority_reference'
  ) then
    raise exception 'SERP-351 FAIL: activation_authority_reference missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and column_name = 'activation_authority_recorded_by'
  ) then
    raise exception 'SERP-351 FAIL: activation_authority_recorded_by missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and column_name = 'activation_authority_recorded_at'
  ) then
    raise exception 'SERP-351 FAIL: activation_authority_recorded_at missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and column_name = 'activation_authority_audit_event_id'
  ) then
    raise exception 'SERP-351 FAIL: activation_authority_audit_event_id missing';
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and constraint_name = 'payment_provider_config_activation_authority_bundle_complete'
      and constraint_type = 'CHECK'
  ) then
    raise exception 'SERP-351 FAIL: activation authority bundle check missing';
  end if;
end $$;

-- 4. Trigger/function semantics ------------------------------------------------
do $$
declare
  guard_def text;
  audit_def text;
begin
  if not exists (
    select 1 from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'payment_provider_config'
      and trigger_name = 'payment_provider_config_activation_audit_capture'
  ) then
    raise exception 'SERP-351 FAIL: payment_provider_config_activation_audit_capture trigger missing';
  end if;

  if not exists (
    select 1 from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'payment_provider_config'
      and trigger_name = 'payment_provider_config_activation_guard'
  ) then
    raise exception 'SERP-351 FAIL: payment_provider_config_activation_guard trigger missing';
  end if;

  select pg_get_functiondef('app_private.capture_provider_activation_authority_audit()'::regprocedure)
    into audit_def;
  if audit_def not like '%insert into public.audit_events%' then
    raise exception 'SERP-351 FAIL: activation-authority audit function does not insert audit_events';
  end if;

  select pg_get_functiondef('app_private.assert_provider_config_activation()'::regprocedure)
    into guard_def;
  if guard_def not like '%activation authority evidence incomplete%' then
    raise exception 'SERP-351 FAIL: activation guard does not enforce evidence completeness';
  end if;
end $$;

-- 5. RLS posture correction: config remains service-role-only -----------------
do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'payment_provider_config'
      and c.relrowsecurity = true
  ) then
    raise exception 'SERP-351 FAIL: RLS not enabled on payment_provider_config';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_provider_config'
  ) then
    raise exception 'SERP-351 FAIL: payment_provider_config has a client policy; config must remain service-role-only';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'payment_provider_config'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'SERP-351 FAIL: anon/authenticated still hold direct privileges on payment_provider_config';
  end if;
end $$;

rollback;
