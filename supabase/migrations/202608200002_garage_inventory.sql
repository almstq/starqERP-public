begin;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  kind text not null check (kind in ('customer', 'supplier', 'both')),
  display_name text not null,
  phone text,
  email text,
  tax_identifier text,
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days >= 0),
  credit_limit numeric(20, 6) check (credit_limit is null or credit_limit >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  customer_id uuid,
  registration_no text,
  make text,
  model text,
  colour text,
  notes text,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, customer_id)
    references public.contacts(organisation_id, id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  sku text not null,
  kind text not null check (kind in ('service', 'stock', 'consumable')),
  name text not null,
  income_account text,
  cogs_account text,
  inventory_account text,
  active boolean not null default true,
  sale_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organisation_id, sku),
  unique (organisation_id, id)
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  product_id uuid not null,
  currency character(3) not null default 'MVR',
  amount numeric(20, 6) not null check (amount >= 0),
  valid_from timestamptz not null,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  foreign key (organisation_id, product_id)
    references public.products(organisation_id, id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  code text not null,
  name text not null,
  kind text not null check (kind in ('office', 'workshop', 'warehouse', 'vehicle', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, code),
  unique (organisation_id, id)
);

create table public.inventory_items (
  organisation_id uuid not null references public.organisations(id),
  location_id uuid not null,
  product_id uuid not null,
  quantity_status text not null check (quantity_status in ('not_counted', 'counted', 'not_for_sale', 'service')),
  unit text,
  version bigint not null default 1,
  primary key (organisation_id, location_id, product_id),
  foreign key (organisation_id, location_id)
    references public.locations(organisation_id, id),
  foreign key (organisation_id, product_id)
    references public.products(organisation_id, id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  location_id uuid not null,
  product_id uuid not null,
  movement_type text not null check (movement_type in ('opening', 'count', 'receipt', 'issue', 'adjustment', 'return', 'transfer_in', 'transfer_out')),
  quantity numeric(20, 6) not null check (quantity <> 0),
  unit_cost numeric(20, 6) check (unit_cost is null or unit_cost >= 0),
  source_type text not null,
  source_id uuid,
  idempotency_key uuid not null,
  occurred_at timestamptz not null,
  recorded_by uuid not null references public.persons(id),
  recorded_at timestamptz not null default now(),
  unique (organisation_id, idempotency_key),
  foreign key (organisation_id, location_id)
    references public.locations(organisation_id, id),
  foreign key (organisation_id, product_id)
    references public.products(organisation_id, id)
);

create table public.garage_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  job_no text not null,
  customer_id uuid,
  vehicle_id uuid,
  state text not null default 'call' check (state in ('call', 'booked', 'intake', 'estimated', 'authorised', 'job_card', 'parts', 'work', 'qc', 'handover', 'invoice_payment', 'closed', 'cancelled')),
  summary text not null,
  version bigint not null default 1,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (organisation_id, job_no),
  unique (organisation_id, id),
  foreign key (organisation_id, customer_id)
    references public.contacts(organisation_id, id),
  foreign key (organisation_id, vehicle_id)
    references public.vehicles(organisation_id, id),
  check ((state = 'closed' and closed_at is not null) or state <> 'closed')
);

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  job_id uuid not null,
  event_type text not null,
  from_state text,
  to_state text,
  actor_person_id uuid not null references public.persons(id),
  acting_seat text not null references public.seats(code),
  idempotency_key uuid not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (organisation_id, idempotency_key),
  foreign key (organisation_id, job_id)
    references public.garage_jobs(organisation_id, id)
);

create trigger stock_movements_append_only
before update or delete on public.stock_movements
for each row execute function app_private.reject_mutation();
create trigger job_events_append_only
before update or delete on public.job_events
for each row execute function app_private.reject_mutation();

alter table public.contacts enable row level security;
alter table public.vehicles enable row level security;
alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.garage_jobs enable row level security;
alter table public.job_events enable row level security;

create policy contacts_current on public.contacts using (app_private.has_organisation_access(organisation_id));
create policy vehicles_current on public.vehicles using (app_private.has_organisation_access(organisation_id));
create policy products_current on public.products using (app_private.has_organisation_access(organisation_id));
create policy product_prices_current on public.product_prices using (app_private.has_organisation_access(organisation_id));
create policy locations_current on public.locations using (app_private.has_organisation_access(organisation_id));
create policy inventory_items_current on public.inventory_items using (app_private.has_organisation_access(organisation_id));
create policy stock_movements_current on public.stock_movements using (app_private.has_organisation_access(organisation_id));
create policy garage_jobs_current on public.garage_jobs using (app_private.has_organisation_access(organisation_id));
create policy job_events_current on public.job_events using (app_private.has_organisation_access(organisation_id));

revoke all on public.contacts, public.vehicles, public.products,
  public.product_prices, public.locations, public.inventory_items,
  public.stock_movements, public.garage_jobs, public.job_events
  from anon, authenticated;

commit;
