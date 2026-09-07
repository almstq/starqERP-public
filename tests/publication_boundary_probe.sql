\set ON_ERROR_STOP on

-- =============================================================================
-- SERP-125 — permissioned publication boundary probe
--
-- Proves the four acceptance criteria against a real database, on the real read
-- path, with positive controls so that "nothing was visible" can never pass as
-- "nothing leaked":
--
--   AC1  publication is an explicit, audited act; nothing publishable by default
--   AC2  an unpublished record is invisible to the publication read path
--   AC3  the publishable surface is a narrow named projection, not a filter
--   AC4  revoking publication is effective
--
-- Runs entirely inside a transaction and rolls back. Nothing persists.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Section 0 — structural: the projection is narrow, and narrow by construction
-- -----------------------------------------------------------------------------

do $$
declare
  v_cols text[];
  v_expected text[] := array[
    'organisation_id', 'product_id', 'channel', 'public_name',
    'public_description', 'public_price_amount', 'public_price_currency',
    'published_at'
  ];
  v_leaked text[];
begin
  if not exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'publication_feed'
  ) then
    raise exception 'SERP-125 AC3: publication_feed does not exist';
  end if;

  select array_agg(column_name::text order by column_name)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'publication_feed';

  if v_cols is distinct from (select array_agg(c order by c) from unnest(v_expected) c) then
    raise exception 'SERP-125 AC3: publication_feed columns drifted. found=%, expected=%',
      v_cols, (select array_agg(c order by c) from unnest(v_expected) c);
  end if;

  -- The private columns of products must not be reachable through the feed.
  -- This is the assertion that would catch someone "helpfully" widening the
  -- projection later.
  select array_agg(column_name::text)
    into v_leaked
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'publication_feed'
     and column_name in ('sku', 'income_account', 'cogs_account', 'inventory_account',
                         'unit_cost', 'quantity', 'active', 'sale_allowed', 'state');

  if v_leaked is not null then
    raise exception 'SERP-125 AC3: private columns exposed on the feed: %', v_leaked;
  end if;

  -- security_invoker is what makes the row policy load-bearing rather than
  -- decorative. Without it the view runs as owner and bypasses RLS entirely.
  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'publication_feed'
       and c.reloptions @> array['security_invoker=true']
  ) then
    raise exception 'SERP-125 AC2: publication_feed is not security_invoker; the row policy is not load-bearing';
  end if;

  raise notice '  OK  Section 0: projection is narrow, named, and invoker-scoped';
end
$$;

-- -----------------------------------------------------------------------------
-- Section 1 — AC1: nothing is publishable by default
-- -----------------------------------------------------------------------------

do $$
declare
  v_default text;
  v_count integer;
begin
  select column_default into v_default
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'product_publications'
     and column_name = 'state';

  if v_default is null or v_default not like '%revoked%' then
    raise exception 'SERP-125 AC1: product_publications.state does not default to revoked (found %)', v_default;
  end if;

  -- Both fixture products exist and neither has been published.
  select count(*) into v_count from public.products
   where id in ('00000000-0000-4000-8000-000000125301',
                '00000000-0000-4000-8000-000000125302');
  if v_count <> 2 then
    raise exception 'SERP-125 fixture missing: expected 2 products, found %', v_count;
  end if;

  select count(*) into v_count from public.publication_feed;
  if v_count <> 0 then
    raise exception 'SERP-125 AC1: feed is not empty before any publication act (% rows)', v_count;
  end if;

  raise notice '  OK  Section 1: private by default — products exist, feed is empty';
end
$$;

-- -----------------------------------------------------------------------------
-- Section 2 — AC1/AC2: a row inserted WITHOUT the publication act stays invisible
--   This is the case that catches a boundary implemented as a mere flag: writing
--   the row is not the same as publishing it.
-- -----------------------------------------------------------------------------

insert into public.product_publications
  (organisation_id, product_id, public_name, public_description)
values
  ('00000000-0000-4000-8000-000000125001', '00000000-0000-4000-8000-000000125301',
   'Smuggled Listing', 'Inserted directly, never published');

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.product_publications
   where product_id = '00000000-0000-4000-8000-000000125301';
  if v_count <> 1 then
    raise exception 'SERP-125 setup: direct insert did not land';
  end if;

  select count(*) into v_count from public.publication_feed
   where product_id = '00000000-0000-4000-8000-000000125301';
  if v_count <> 0 then
    raise exception 'SERP-125 AC2: a directly inserted, unpublished row reached the feed';
  end if;

  raise notice '  OK  Section 2: an unpublished row is invisible on the read path';
end
$$;

delete from public.product_publications
 where product_id = '00000000-0000-4000-8000-000000125301';

-- -----------------------------------------------------------------------------
-- Section 3 — AC1: merchant-controlled. The counter seat is refused.
-- -----------------------------------------------------------------------------

do $$
declare
  v_refused boolean := false;
begin
  begin
    perform public.api_publish_product(
      '00000000-0000-4000-8000-000000125001',
      '00000000-0000-4000-8000-000000125102',   -- counter person
      'counter',
      '00000000-0000-4000-8000-000000125301',
      jsonb_build_object('public_name', 'Counter tried to publish this')
    );
  exception
    when others then
      v_refused := true;
  end;

  if not v_refused then
    raise exception 'SERP-125 AC1: the counter seat was allowed to publish';
  end if;

  if exists (select 1 from public.publication_feed
              where product_id = '00000000-0000-4000-8000-000000125301') then
    raise exception 'SERP-125 AC1: refused publish still reached the feed';
  end if;

  raise notice '  OK  Section 3: publication is merchant-controlled — counter seat refused';
end
$$;

-- -----------------------------------------------------------------------------
-- Section 4 — AC1: the owner publishes, and the act is audited
--   POSITIVE CONTROL. If this section fails to make the row visible, every
--   invisibility assertion above is worthless.
-- -----------------------------------------------------------------------------

do $$
declare
  v_result jsonb;
  v_audit integer;
  v_visible integer;
  v_name text;
begin
  v_result := public.api_publish_product(
    '00000000-0000-4000-8000-000000125001',
    '00000000-0000-4000-8000-000000125101',     -- owner person
    'owner',
    '00000000-0000-4000-8000-000000125301',
    jsonb_build_object(
      'public_name', 'Synthetic A Product',
      'public_description', 'Listed by the merchant',
      'public_price_amount', '250.00',
      'public_price_currency', 'MVR'
    )
  );

  if coalesce(v_result ->> 'state', '') <> 'published' then
    raise exception 'SERP-125 AC1: publish did not report published state (got %)', v_result;
  end if;

  select count(*), max(public_name) into v_visible, v_name
    from public.publication_feed
   where product_id = '00000000-0000-4000-8000-000000125301';

  if v_visible <> 1 then
    raise exception 'SERP-125 POSITIVE CONTROL FAILED: published row is not on the feed';
  end if;
  if v_name <> 'Synthetic A Product' then
    raise exception 'SERP-125 AC3: feed returned unexpected name %', v_name;
  end if;

  select count(*) into v_audit
    from public.audit_events
   where action = 'erp.publish'
     and object_type = 'publication'
     and organisation_id = '00000000-0000-4000-8000-000000125001'
     and acting_seat = 'owner';

  if v_audit <> 1 then
    raise exception 'SERP-125 AC1: publication was not audited (% erp.publish rows)', v_audit;
  end if;

  raise notice '  OK  Section 4: owner published, row is visible, act is audited';
end
$$;

-- -----------------------------------------------------------------------------
-- Section 5 — AC2/AC3 under a real, powerless role on the real read path
--   Everything above ran as the migration owner, which bypasses non-forced RLS.
--   This section re-checks visibility as a role that genuinely cannot cheat.
-- -----------------------------------------------------------------------------

create role serp125_publication_probe noinherit nologin nosuperuser nobypassrls;
grant serp125_publication_probe to current_user;
grant usage on schema public, app_private to serp125_publication_probe;
grant select on all tables in schema public to serp125_publication_probe;

-- Tenant B publishes too, so the feed can be shown to be cross-tenant for
-- published rows while still refusing unpublished ones.
select public.api_publish_product(
  '00000000-0000-4000-8000-000000125002',
  '00000000-0000-4000-8000-000000125103',
  'owner',
  '00000000-0000-4000-8000-000000125302',
  jsonb_build_object('public_name', 'Synthetic B Product')
);

set local role serp125_publication_probe;
set local row_security = on;

do $$
declare
  attrs record;
  v_count integer;
begin
  select rolsuper, rolbypassrls into attrs from pg_roles where rolname = current_user;
  if current_user <> 'serp125_publication_probe'
     or attrs.rolsuper or attrs.rolbypassrls
     or current_setting('row_security') <> 'on' then
    raise exception 'SERP-125 probe role can bypass RLS';
  end if;

  if exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles o on o.oid = c.relowner
     where n.nspname = 'public' and c.relkind = 'r' and o.rolname = current_user
  ) then
    raise exception 'SERP-125 probe role owns a tested table';
  end if;

  -- No tenant claim at all: the anonymous listing reader.
  perform set_config('app.organisation_id', '', true);
  perform set_config('app.person_id', '', true);

  -- Published rows from BOTH tenants are visible: a listing is cross-tenant.
  select count(*) into v_count from public.publication_feed;
  if v_count <> 2 then
    raise exception 'SERP-125 AC2 positive control: expected 2 published rows on the feed, found %', v_count;
  end if;

  -- The private ERP record behind them is not.
  select count(*) into v_count from public.products;
  if v_count <> 0 then
    raise exception 'SERP-125 AC2: % product rows reachable with no tenant claim', v_count;
  end if;

  raise notice '  OK  Section 5: powerless role sees published listings only, never the ERP record';
end
$$;

reset role;

-- -----------------------------------------------------------------------------
-- Section 6 — AC4: revocation is effective, and does not destroy the record
-- -----------------------------------------------------------------------------

do $$
declare
  v_result jsonb;
  v_count integer;
  v_state text;
  v_audit integer;
begin
  v_result := public.api_revoke_publication(
    '00000000-0000-4000-8000-000000125001',
    '00000000-0000-4000-8000-000000125101',
    'owner',
    '00000000-0000-4000-8000-000000125301'
  );

  if coalesce(v_result ->> 'state', '') <> 'revoked' then
    raise exception 'SERP-125 AC4: revoke did not report revoked state (got %)', v_result;
  end if;

  select count(*) into v_count from public.publication_feed
   where product_id = '00000000-0000-4000-8000-000000125301';
  if v_count <> 0 then
    raise exception 'SERP-125 AC4: revoked row is still on the feed';
  end if;

  -- RULE 2: the row survives revocation. Revoking is a state, not a delete.
  select state into v_state from public.product_publications
   where product_id = '00000000-0000-4000-8000-000000125301';
  if v_state is null then
    raise exception 'SERP-125 RULE 2: revocation deleted the publication row';
  end if;
  if v_state <> 'revoked' then
    raise exception 'SERP-125 AC4: state after revoke is % not revoked', v_state;
  end if;

  select count(*) into v_audit from public.audit_events
   where action = 'erp.unpublish' and object_type = 'publication';
  if v_audit <> 1 then
    raise exception 'SERP-125 AC4: revocation was not audited (% rows)', v_audit;
  end if;

  -- The other tenant is untouched by A's revocation.
  select count(*) into v_count from public.publication_feed;
  if v_count <> 1 then
    raise exception 'SERP-125 AC4: revocation changed the wrong rows (feed has %)', v_count;
  end if;

  raise notice '  OK  Section 6: revocation is effective, audited, and non-destructive';
end
$$;

-- -----------------------------------------------------------------------------
-- Section 7 — AC1: re-publishing after revocation works and is audited again
-- -----------------------------------------------------------------------------

do $$
declare
  v_count integer;
begin
  perform public.api_publish_product(
    '00000000-0000-4000-8000-000000125001',
    '00000000-0000-4000-8000-000000125101',
    'owner',
    '00000000-0000-4000-8000-000000125301',
    jsonb_build_object('public_name', 'Synthetic A Product', 'public_price_amount', '275.00')
  );

  select count(*) into v_count from public.publication_feed
   where product_id = '00000000-0000-4000-8000-000000125301';
  if v_count <> 1 then
    raise exception 'SERP-125: re-publication after revocation did not take effect';
  end if;

  select count(*) into v_count from public.audit_events
   where object_type = 'publication';
  if v_count <> 4 then
    raise exception 'SERP-125 AC1: expected 4 publication audit rows, found %', v_count;
  end if;

  raise notice '  OK  Section 7: re-publication works and every act left an audit row';
end
$$;

do $$
begin
  raise notice '';
  raise notice '=== SERP-125 publication boundary probe: ALL SECTIONS PASSED (0-7) ===';
end
$$;

rollback;
