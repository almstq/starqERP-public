begin;

-- =============================================================================
-- Migration: 202609031046_permissioned_publication_boundary.sql
-- SERP-125 — Permissioned publication boundary (vision section 19 and 27)
--
-- THE RULE THIS ENFORCES
--   Private ERP data is not Hoadhaa data. A merchant's operational record -
--   cost, supplier, stock, customer, GL mapping - must be STRUCTURALLY
--   incapable of reaching a public listing without an explicit, recorded act
--   of publication by that merchant.
--
-- WHY IT IS BUILT NOW AND NOT IN 2028
--   The master arc puts Hoadhaa integration in 2028, but the boundary is a
--   property of the accounting spine being written today. Retrofitting it
--   after the ledger exists means touching every table and every read path.
--   Built in now it costs one table and one view.
--
-- HOW THE BOUNDARY IS CONSTRUCTED
--   1. PROJECTION, NOT A FILTER. public.product_publications is a narrow,
--      separately-declared surface. It is NOT a flag on public.products and
--      NOT a view over it. A column added to products is therefore private by
--      construction: it cannot appear downstream until someone deliberately
--      adds it here. This is the load-bearing decision - a filter over the
--      full record leaks every future column by default; a projection leaks
--      nothing by default.
--   2. PRIVATE BY DEFAULT. state defaults to 'revoked'. Inserting a row
--      publishes nothing. Publication requires the explicit act below.
--   3. THE ACT IS AUDITED. api_publish_product / api_revoke_publication write
--      public.audit_events in the same transaction as the state change. There
--      is no code path that changes publication state without an audit row.
--   4. MERCHANT-CONTROLLED. Only the owner, managing_director and director
--      seats may publish or revoke. A counter or technician seat cannot put a
--      merchant's prices in public.
--   5. REVOCATION IS A STATE, NOT A DELETE. RULE 2 - nothing is deleted.
--      Revoking sets state='revoked'; the row and its history remain.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   It does not grant anon or authenticated anything. Today no role outside
--   service_role can reach the feed. Opening it to a public reader is a
--   separate, deliberate act for the Hoadhaa era (DEC-077 keeps Hoadhaa out
--   of the starqERP working set). The boundary is built and proven first; the
--   door is opened later, by decision.
-- =============================================================================

-- 1. The narrow named projection ---------------------------------------------
--    Every publishable field is enumerated here explicitly. Note what is
--    ABSENT and can never leak through this surface: income_account,
--    cogs_account, inventory_account, sku, cost, supplier, stock level.
--    Note also that actor identity is absent by design - who published is
--    recorded in public.audit_events, which is append-only, rather than
--    carried on a row a public reader can see.

create table public.product_publications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  product_id uuid not null,
  channel text not null default 'hoadhaa' check (channel in ('hoadhaa')),

  -- the projection itself
  public_name text not null,
  public_description text,
  public_price_amount numeric(20, 6) check (public_price_amount >= 0),
  public_price_currency character(3) not null default 'MVR',

  -- publication state
  state text not null default 'revoked' check (state in ('published', 'revoked')),
  published_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),

  unique (organisation_id, product_id, channel),
  unique (organisation_id, id),

  -- tenant-safe composite reference: a publication cannot point at another
  -- tenant's product even under a superuser insert
  foreign key (organisation_id, product_id)
    references public.products(organisation_id, id),

  -- a published row must carry the timestamp of the act that published it
  constraint product_publications_published_has_timestamp
    check (state <> 'published' or published_at is not null)
);

create index product_publications_feed_idx
  on public.product_publications (channel, organisation_id)
  where state = 'published';

-- 2. The publication read path ------------------------------------------------
--    security_invoker = true is load-bearing. Without it the view runs with
--    owner rights and silently bypasses the row policy below, which would make
--    the boundary a property of view ownership rather than of a stated,
--    testable rule. With it, the policy is what admits a row, and the probe
--    can prove it.
--    The view is also the column-level narrowing: state, revoked_at and
--    created_at are governance, not publication, and do not appear here.

create view public.publication_feed
with (security_invoker = true) as
select
  p.organisation_id,
  p.product_id,
  p.channel,
  p.public_name,
  p.public_description,
  p.public_price_amount,
  p.public_price_currency,
  p.published_at
from public.product_publications p
where p.state = 'published';

comment on view public.publication_feed is
  'SERP-125: the only sanctioned ERP-to-public read path. Published rows only, projection columns only.';

-- 3. Row policies -------------------------------------------------------------
--    Two, with different jobs:
--    _current   - the house tenant rule. A merchant manages its own
--                 publications, in any state, and sees no other tenant's.
--    _published - the public listing rule. Admits published rows only,
--                 regardless of tenancy, because a listing is cross-tenant by
--                 definition. This is the policy the feed depends on and the
--                 one the probe attacks.

alter table public.product_publications enable row level security;

create policy product_publications_current on public.product_publications
  using (app_private.has_organisation_access(organisation_id));

create policy product_publications_published on public.product_publications
  for select using (state = 'published');

-- 4. The explicit, audited act ------------------------------------------------

create or replace function public.api_publish_product(
  target_org uuid,
  target_person uuid,
  target_seat text,
  target_product uuid,
  publication jsonb,
  request_identifier uuid default null
) returns jsonb language plpgsql security definer
set search_path = public, app_private, pg_temp as $$
declare
  v_name text;
  v_description text;
  v_amount numeric(20, 6);
  v_currency character(3);
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
begin
  if not app_private.assert_active_seat(target_org, target_person, target_seat) then
    raise exception 'seat_not_authorized';
  end if;

  -- merchant-controlled: publication is an ownership decision, not a
  -- counter-staff one
  if target_seat not in ('owner', 'managing_director', 'director') then
    raise exception 'acting_seat_not_legal_for_command';
  end if;

  if not exists (
    select 1 from public.products
     where organisation_id = target_org and id = target_product
  ) then
    raise exception 'product_not_found';
  end if;

  v_name := nullif(trim(coalesce(publication ->> 'public_name', '')), '');
  if v_name is null then
    raise exception 'public_name_required';
  end if;

  v_description := nullif(trim(coalesce(publication ->> 'public_description', '')), '');
  v_amount := nullif(publication ->> 'public_price_amount', '')::numeric;
  v_currency := coalesce(nullif(trim(coalesce(publication ->> 'public_price_currency', '')), ''), 'MVR');

  select to_jsonb(pp) into v_before
    from public.product_publications pp
   where pp.organisation_id = target_org
     and pp.product_id = target_product
     and pp.channel = 'hoadhaa';

  insert into public.product_publications as pp
    (organisation_id, product_id, channel, public_name, public_description,
     public_price_amount, public_price_currency, state, published_at, revoked_at)
  values
    (target_org, target_product, 'hoadhaa', v_name, v_description,
     v_amount, v_currency, 'published', now(), null)
  on conflict (organisation_id, product_id, channel) do update set
    public_name = excluded.public_name,
    public_description = excluded.public_description,
    public_price_amount = excluded.public_price_amount,
    public_price_currency = excluded.public_price_currency,
    state = 'published',
    published_at = now(),
    revoked_at = null
  returning pp.id into v_id;

  select to_jsonb(pp) into v_after
    from public.product_publications pp where pp.id = v_id;

  insert into public.audit_events
    (organisation_id, actor_person_id, acting_seat, action, object_type,
     object_id, request_id, before_state, after_state, metadata)
  values
    (target_org, target_person, target_seat, 'erp.publish', 'publication',
     v_id, request_identifier, v_before, v_after,
     jsonb_build_object('channel', 'hoadhaa', 'product_id', target_product));

  return jsonb_build_object(
    'ok', true,
    'state', 'published',
    'publication', jsonb_build_object('id', v_id, 'product_id', target_product, 'channel', 'hoadhaa')
  );
end
$$;

create or replace function public.api_revoke_publication(
  target_org uuid,
  target_person uuid,
  target_seat text,
  target_product uuid,
  request_identifier uuid default null
) returns jsonb language plpgsql security definer
set search_path = public, app_private, pg_temp as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
begin
  if not app_private.assert_active_seat(target_org, target_person, target_seat) then
    raise exception 'seat_not_authorized';
  end if;

  if target_seat not in ('owner', 'managing_director', 'director') then
    raise exception 'acting_seat_not_legal_for_command';
  end if;

  select pp.id, to_jsonb(pp) into v_id, v_before
    from public.product_publications pp
   where pp.organisation_id = target_org
     and pp.product_id = target_product
     and pp.channel = 'hoadhaa';

  if v_id is null then
    raise exception 'publication_not_found';
  end if;

  -- RULE 2: revocation is a state change, never a delete. The row and its
  -- history survive so the act remains auditable.
  update public.product_publications
     set state = 'revoked',
         revoked_at = now()
   where id = v_id;

  select to_jsonb(pp) into v_after
    from public.product_publications pp where pp.id = v_id;

  insert into public.audit_events
    (organisation_id, actor_person_id, acting_seat, action, object_type,
     object_id, request_id, before_state, after_state, metadata)
  values
    (target_org, target_person, target_seat, 'erp.unpublish', 'publication',
     v_id, request_identifier, v_before, v_after,
     jsonb_build_object('channel', 'hoadhaa', 'product_id', target_product));

  return jsonb_build_object(
    'ok', true,
    'state', 'revoked',
    'publication', jsonb_build_object('id', v_id, 'product_id', target_product, 'channel', 'hoadhaa')
  );
end
$$;

-- 5. Grants -------------------------------------------------------------------
--    Same shape as every other table in this schema: nothing for anon or
--    authenticated. The feed is reachable only by service_role until a public
--    reader is authorised by decision.

alter function public.api_publish_product(uuid, uuid, text, uuid, jsonb, uuid)
  set search_path = public, app_private, pg_temp;
alter function public.api_revoke_publication(uuid, uuid, text, uuid, uuid)
  set search_path = public, app_private, pg_temp;

revoke all on public.product_publications from anon, authenticated;
revoke all on public.publication_feed from anon, authenticated;

revoke all on function public.api_publish_product(uuid, uuid, text, uuid, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.api_revoke_publication(uuid, uuid, text, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.api_publish_product(uuid, uuid, text, uuid, jsonb, uuid)
  to service_role;
grant execute on function public.api_revoke_publication(uuid, uuid, text, uuid, uuid)
  to service_role;

commit;
