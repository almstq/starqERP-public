\set ON_ERROR_STOP on

-- =============================================================================
-- SERP-125 publication boundary fixture.
--
-- Synthetic. These identifiers, companies and people represent nothing real.
--
-- Deliberately self-contained rather than layered on the SERP-124 fixture: the
-- publication probe must not go red because someone edited an unrelated
-- isolation fixture.
--
-- Shape:
--   Tenant A  - a merchant with an owner seat and a counter seat, and a product
--   Tenant B  - a second merchant with its own owner and product, so the feed
--               can be shown to be cross-tenant for published rows and still
--               tenant-blind for unpublished ones
-- =============================================================================

insert into public.organisations (id, slug, legal_name, registry_code)
values
  ('00000000-0000-4000-8000-000000125001', 'serp125-tenant-a', 'Synthetic Publication Tenant A', 'SYNTH-P-A'),
  ('00000000-0000-4000-8000-000000125002', 'serp125-tenant-b', 'Synthetic Publication Tenant B', 'SYNTH-P-B');

insert into public.persons (id, person_key, external_subject, display_label)
values
  ('00000000-0000-4000-8000-000000125101', 'serp125-owner-a',   'synthetic:serp125-owner-a',   'Synthetic Owner A'),
  ('00000000-0000-4000-8000-000000125102', 'serp125-counter-a', 'synthetic:serp125-counter-a', 'Synthetic Counter A'),
  ('00000000-0000-4000-8000-000000125103', 'serp125-owner-b',   'synthetic:serp125-owner-b',   'Synthetic Owner B');

insert into public.memberships (id, organisation_id, person_id)
values
  ('00000000-0000-4000-8000-000000125201',
   '00000000-0000-4000-8000-000000125001', '00000000-0000-4000-8000-000000125101'),
  ('00000000-0000-4000-8000-000000125202',
   '00000000-0000-4000-8000-000000125001', '00000000-0000-4000-8000-000000125102'),
  ('00000000-0000-4000-8000-000000125203',
   '00000000-0000-4000-8000-000000125002', '00000000-0000-4000-8000-000000125103');

-- The counter seat is the point of the fixture: it is a legitimate, active
-- member of tenant A. If publication were merely "authenticated", it would be
-- allowed. Merchant-controlled means it is not.
insert into public.membership_seats (membership_id, seat_code)
values
  ('00000000-0000-4000-8000-000000125201', 'owner'),
  ('00000000-0000-4000-8000-000000125202', 'counter'),
  ('00000000-0000-4000-8000-000000125203', 'owner');

-- Products carry private columns on purpose. income_account and cogs_account
-- are exactly the kind of field that must never reach a listing, and the probe
-- asserts they cannot.
insert into public.products
  (id, organisation_id, sku, kind, name, income_account, cogs_account, inventory_account)
values
  ('00000000-0000-4000-8000-000000125301', '00000000-0000-4000-8000-000000125001',
   'SERP125-A', 'stock', 'Synthetic A Product', '4000-SECRET-INCOME', '5000-SECRET-COGS', '1300-SECRET-STOCK'),
  ('00000000-0000-4000-8000-000000125302', '00000000-0000-4000-8000-000000125002',
   'SERP125-B', 'stock', 'Synthetic B Product', '4000-SECRET-INCOME-B', '5000-SECRET-COGS-B', '1300-SECRET-STOCK-B');
