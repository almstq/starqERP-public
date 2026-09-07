begin;

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  period_code text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'soft_closed', 'closed')),
  unique (organisation_id, period_code),
  unique (organisation_id, id),
  check (ends_on >= starts_on)
);

create table public.commercial_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  document_type text not null check (document_type in ('estimate', 'quotation', 'purchase_order', 'goods_receipt', 'supplier_bill', 'sales_invoice', 'credit_note', 'receipt', 'payment')),
  document_no text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'issued', 'void', 'settled')),
  contact_id uuid,
  currency character(3) not null default 'MVR',
  document_date date,
  due_date date,
  tax_total numeric(20, 6) not null default 0,
  gross_total numeric(20, 6) not null default 0,
  source_type text,
  source_id uuid,
  version bigint not null default 1,
  issued_at timestamptz,
  issued_by uuid references public.persons(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, document_type, document_no),
  unique (organisation_id, id),
  foreign key (organisation_id, contact_id)
    references public.contacts(organisation_id, id),
  check ((status in ('issued', 'settled') and document_no is not null and issued_at is not null) or status not in ('issued', 'settled')),
  check (gross_total >= 0 and tax_total >= 0)
);

create table public.commercial_document_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  document_id uuid not null,
  line_no integer not null check (line_no > 0),
  product_id uuid,
  description text not null,
  quantity numeric(20, 6) not null check (quantity > 0),
  unit_price numeric(20, 6) not null check (unit_price >= 0),
  tax_rate numeric(9, 6) not null default 0 check (tax_rate >= 0),
  net_amount numeric(20, 6) not null,
  tax_amount numeric(20, 6) not null default 0,
  gross_amount numeric(20, 6) not null,
  unique (organisation_id, document_id, line_no),
  foreign key (organisation_id, document_id)
    references public.commercial_documents(organisation_id, id),
  foreign key (organisation_id, product_id)
    references public.products(organisation_id, id),
  check (gross_amount = net_amount + tax_amount)
);

create table public.journal_proposals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  source_type text not null,
  source_id uuid,
  status text not null default 'draft' check (status in ('draft', 'validated', 'rejected', 'posted')),
  narration text not null,
  transaction_date date not null,
  currency character(3) not null default 'MVR',
  created_by uuid not null references public.persons(id),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  posted_entry_id uuid,
  unique (organisation_id, id)
);

create table public.journal_proposal_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid not null,
  line_no integer not null check (line_no > 0),
  account_code text not null,
  amount numeric(20, 6) not null check (amount <> 0),
  unique (organisation_id, proposal_id, line_no),
  foreign key (organisation_id, proposal_id)
    references public.journal_proposals(organisation_id, id)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  period_id uuid not null,
  entry_no text not null,
  transaction_date date not null,
  narration text not null,
  source_proposal_id uuid,
  posted_by uuid not null references public.persons(id),
  posted_at timestamptz not null default now(),
  reversal_of uuid,
  unique (organisation_id, entry_no),
  unique (organisation_id, id),
  foreign key (organisation_id, period_id)
    references public.accounting_periods(organisation_id, id),
  foreign key (organisation_id, source_proposal_id)
    references public.journal_proposals(organisation_id, id),
  foreign key (organisation_id, reversal_of)
    references public.journal_entries(organisation_id, id)
);

alter table public.journal_proposals
  add constraint journal_proposals_posted_entry_fk
  foreign key (organisation_id, posted_entry_id)
  references public.journal_entries(organisation_id, id);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  entry_id uuid not null,
  line_no integer not null check (line_no > 0),
  account_code text not null,
  amount numeric(20, 6) not null check (amount <> 0),
  unique (organisation_id, entry_id, line_no),
  foreign key (organisation_id, entry_id)
    references public.journal_entries(organisation_id, id)
);

create or replace function app_private.reject_issued_document_mutation()
returns trigger language plpgsql as $$
begin
  if old.status in ('issued', 'settled') then
    raise exception 'issued commercial documents are immutable; create a controlled correction';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger commercial_documents_issued_immutable
before update or delete on public.commercial_documents
for each row execute function app_private.reject_issued_document_mutation();

create trigger journal_entries_append_only
before update or delete on public.journal_entries
for each row execute function app_private.reject_mutation();
create trigger journal_lines_append_only
before update or delete on public.journal_lines
for each row execute function app_private.reject_mutation();

create or replace function app_private.assert_balanced_journal()
returns trigger language plpgsql as $$
declare
  target_entry uuid;
  target_org uuid;
  balance numeric(20, 6);
  line_count integer;
begin
  target_entry := coalesce(new.entry_id, old.entry_id);
  target_org := coalesce(new.organisation_id, old.organisation_id);
  select count(*), coalesce(sum(amount), 0) into line_count, balance
    from public.journal_lines
    where organisation_id = target_org and entry_id = target_entry;
  if line_count < 2 then
    raise exception 'journal entry % requires at least two lines', target_entry;
  end if;
  if balance <> 0 then
    raise exception 'journal entry % is not balanced: %', target_entry, balance;
  end if;
  return null;
end
$$;

create or replace function app_private.assert_new_journal_entry()
returns trigger language plpgsql as $$
declare
  balance numeric(20, 6);
  line_count integer;
begin
  select count(*), coalesce(sum(amount), 0) into line_count, balance
    from public.journal_lines
    where organisation_id = new.organisation_id and entry_id = new.id;
  if line_count < 2 then
    raise exception 'journal entry % requires at least two lines', new.id;
  end if;
  if balance <> 0 then
    raise exception 'journal entry % is not balanced: %', new.id, balance;
  end if;
  return null;
end
$$;

create constraint trigger journal_lines_balanced
after insert or update or delete on public.journal_lines
deferrable initially deferred
for each row execute function app_private.assert_balanced_journal();

create constraint trigger journal_entry_requires_balanced_lines
after insert on public.journal_entries
deferrable initially deferred
for each row execute function app_private.assert_new_journal_entry();

alter table public.accounting_periods enable row level security;
alter table public.commercial_documents enable row level security;
alter table public.commercial_document_lines enable row level security;
alter table public.journal_proposals enable row level security;
alter table public.journal_proposal_lines enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

create policy accounting_periods_current on public.accounting_periods using (app_private.has_organisation_access(organisation_id));
create policy commercial_documents_current on public.commercial_documents using (app_private.has_organisation_access(organisation_id));
create policy commercial_document_lines_current on public.commercial_document_lines using (app_private.has_organisation_access(organisation_id));
create policy journal_proposals_current on public.journal_proposals using (app_private.has_organisation_access(organisation_id));
create policy journal_proposal_lines_current on public.journal_proposal_lines using (app_private.has_organisation_access(organisation_id));
create policy journal_entries_current on public.journal_entries using (app_private.has_organisation_access(organisation_id));
create policy journal_lines_current on public.journal_lines using (app_private.has_organisation_access(organisation_id));

revoke all on public.accounting_periods, public.commercial_documents,
  public.commercial_document_lines, public.journal_proposals,
  public.journal_proposal_lines, public.journal_entries, public.journal_lines
  from anon, authenticated;

commit;
