begin;

-- =============================================================================
-- Migration: 202608270025_books_and_operating_activities.sql
-- Tier 3 Operating Activity & Multi-Book Architecture
--
-- Hierarchy:
--   Tenant / Legal Entity (public.organisations)
--     ├── Business Name / Trading Name (public.business_names) [Optional, 1..N]
--     └── Book / Operating Activity (public.books) [1..N]
--           └── Location / Branch (public.locations via public.book_locations) [1..N]
--
-- Invariants Enforced:
-- 1. Composite Tenant-Safety: books(organisation_id, business_name_id) -> business_names(organisation_id, id)
-- 2. Single Default Active Book per Organisation via Partial Unique Index
-- 3. Deterministic Backfill of default books for existing organisations
-- 4. Book Memberships for granular user access control
-- 5. Book-Location M:N junction supporting shared facilities
-- =============================================================================

-- 1. Ensure public.business_names has composite unique key for tenant-safe FK references
alter table public.business_names
  add constraint business_names_org_id_uq unique (organisation_id, id);

-- 2. Ensure public.memberships has composite unique key for tenant-safe FK references
alter table public.memberships
  add constraint memberships_org_id_uq unique (organisation_id, id);

-- 3. Create public.books table
create table public.books (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  business_name_id uuid,
  archetype_id text not null default 'general_business' check (archetype_id in (
    'general_business', 'automotive_workshop', 'wholesale_trading',
    'marine_service', 'construction_contracting', 'retail'
  )),
  code text not null check (code ~ '^[A-Z0-9]{2,8}$'),
  name text not null,
  currency character(3) not null default 'MVR',
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  unique (organisation_id, code),
  unique (organisation_id, name),
  unique (organisation_id, id),
  foreign key (organisation_id, business_name_id)
    references public.business_names(organisation_id, id) on delete set null
);

-- 4. Single Default Active Book Invariant per Organisation
create unique index books_single_default_uq
  on public.books(organisation_id)
  where (is_default = true and status = 'active');

-- 5. Create public.book_memberships (Granular Book Access Control)
create table public.book_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  membership_id uuid not null,
  book_id uuid not null,
  granted_at timestamptz not null default now(),
  unique (membership_id, book_id),
  unique (organisation_id, id),
  foreign key (organisation_id, membership_id)
    references public.memberships(organisation_id, id) on delete cascade,
  foreign key (organisation_id, book_id)
    references public.books(organisation_id, id) on delete cascade
);

-- 6. Create public.book_locations (M:N Shared Facilities)
create table public.book_locations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  book_id uuid not null,
  location_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (book_id, location_id),
  unique (organisation_id, id),
  foreign key (organisation_id, book_id)
    references public.books(organisation_id, id) on delete cascade,
  foreign key (organisation_id, location_id)
    references public.locations(organisation_id, id) on delete cascade
);

-- 7. Add book_id column to core execution-plane domain tables
alter table public.garage_jobs add column if not exists book_id uuid;
alter table public.commercial_documents add column if not exists book_id uuid;
alter table public.journal_entries add column if not exists book_id uuid;
alter table public.audit_events add column if not exists book_id uuid;

-- 8. Deterministic Backfill: Provision default book for every existing organisation
do $$
declare
  org record;
  biz_name record;
  default_book_id uuid;
  book_code text;
  book_name text;
  book_archetype text;
begin
  -- Temporarily set session_replication_role to replica to allow atomic backfill of append-only audit/journal records
  set local session_replication_role = 'replica';

  for org in select id, slug, legal_name from public.organisations loop
    -- Check if a book already exists
    if not exists (select 1 from public.books where organisation_id = org.id) then
      -- Derive deterministic archetype & code
      if org.slug like '%ignition%' or org.slug like '%garage%' then
        book_archetype := 'automotive_workshop';
        book_code := 'INK';
        book_name := 'Ignition Ink Workshop';
      elsif org.slug like '%starq%' then
        book_archetype := 'general_business';
        book_code := 'STQ';
        book_name := 'Starq Technologies Software & R&D';
      else
        book_archetype := 'general_business';
        book_code := upper(substring(org.slug from 1 for 3));
        if length(book_code) < 2 then
          book_code := 'MAIN';
        end if;
        book_name := org.legal_name || ' Main Book';
      end if;

      -- Check for existing business name
      select id into biz_name from public.business_names
       where organisation_id = org.id
       order by created_at asc limit 1;

      insert into public.books (
        organisation_id,
        business_name_id,
        archetype_id,
        code,
        name,
        is_default,
        status
      ) values (
        org.id,
        biz_name.id,
        book_archetype,
        book_code,
        book_name,
        true,
        'active'
      ) returning id into default_book_id;

      -- If starq tenant, also provision Starq Dynamics as secondary book
      if org.slug = 'starq-technologies' or org.slug = 'starq' then
        insert into public.books (
          organisation_id,
          archetype_id,
          code,
          name,
          is_default,
          status
        ) values (
          org.id,
          'general_business',
          'DYN',
          'Starq Dynamics Management Services',
          false,
          'active'
        ) on conflict do nothing;
      end if;

      -- Backfill existing execution records for this organization
      update public.garage_jobs
         set book_id = default_book_id
       where organisation_id = org.id and book_id is null;

      update public.commercial_documents
         set book_id = default_book_id
       where organisation_id = org.id and book_id is null;

      update public.journal_entries
         set book_id = default_book_id
       where organisation_id = org.id and book_id is null;

      update public.audit_events
         set book_id = default_book_id
       where organisation_id = org.id and book_id is null;

      -- Grant existing memberships access to the default book
      insert into public.book_memberships (organisation_id, membership_id, book_id)
      select m.organisation_id, m.id, default_book_id
        from public.memberships m
       where m.organisation_id = org.id
      on conflict do nothing;

      -- Link existing locations to the default book
      insert into public.book_locations (organisation_id, book_id, location_id, is_primary)
      select loc.organisation_id, default_book_id, loc.id, true
        from public.locations loc
       where loc.organisation_id = org.id
      on conflict do nothing;

    end if;
  end loop;

  -- Restore normal replication role
  set local session_replication_role = 'origin';
end $$;

-- 9. Enforce Tenant-Safe Composite Foreign Keys on execution tables
alter table public.garage_jobs
  add constraint garage_jobs_book_fk
  foreign key (organisation_id, book_id)
  references public.books(organisation_id, id);

alter table public.commercial_documents
  add constraint commercial_documents_book_fk
  foreign key (organisation_id, book_id)
  references public.books(organisation_id, id);

alter table public.journal_entries
  add constraint journal_entries_book_fk
  foreign key (organisation_id, book_id)
  references public.books(organisation_id, id);

alter table public.audit_events
  add constraint audit_events_book_fk
  foreign key (organisation_id, book_id)
  references public.books(organisation_id, id);

-- 10. Indexes for performance & reporting aggregation
create index if not exists books_org_idx on public.books(organisation_id);
create index if not exists books_biz_name_idx on public.books(organisation_id, business_name_id);
create index if not exists book_memberships_idx on public.book_memberships(organisation_id, membership_id, book_id);
create index if not exists book_locations_idx on public.book_locations(organisation_id, book_id, location_id);
create index if not exists garage_jobs_book_idx on public.garage_jobs(organisation_id, book_id);
create index if not exists commercial_docs_book_idx on public.commercial_documents(organisation_id, book_id);
create index if not exists journal_entries_book_idx on public.journal_entries(organisation_id, book_id);

-- 11. Row Level Security Policies
alter table public.books enable row level security;
alter table public.book_memberships enable row level security;
alter table public.book_locations enable row level security;

create policy books_tenant_isolation on public.books
  for all using (organisation_id = app_private.current_organisation_id());

create policy book_memberships_tenant_isolation on public.book_memberships
  for all using (organisation_id = app_private.current_organisation_id());

create policy book_locations_tenant_isolation on public.book_locations
  for all using (organisation_id = app_private.current_organisation_id());

commit;
