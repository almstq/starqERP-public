begin;

-- =============================================================================
-- Migration: 202608250012_settlement_allocations.sql
-- SERP-181: Gate G6 & Amendment A3 — Settlement Allocations Domain & Migration
-- Hardened with deterministic row-level serialization, refund document support,
-- and strict function permission boundaries.
-- =============================================================================

-- 1. Expand commercial_documents.document_type check constraint
-- Supports direct expenses, petty cash vouchers, bank charges, and refunds natively
-- without creating fictitious supplier bills.
alter table public.commercial_documents
  drop constraint if exists commercial_documents_document_type_check,
  add constraint commercial_documents_document_type_check
  check (document_type in (
    'estimate', 'quotation', 'purchase_order', 'goods_receipt',
    'supplier_bill', 'sales_invoice', 'credit_note', 'receipt',
    'payment', 'refund', 'direct_expense', 'petty_cash_voucher', 'bank_charge'
  ));

-- 2. Create settlement_allocations table
create table public.settlement_allocations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  payment_document_id uuid not null,
  settled_document_id uuid not null,
  allocated_amount numeric(20, 6) not null check (allocated_amount > 0),
  currency character(3) not null,
  allocated_at timestamptz not null default now(),
  allocated_by uuid not null references public.persons(id),
  reversal_of uuid,
  reversal_reason text,
  notes text,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, payment_document_id)
    references public.commercial_documents(organisation_id, id),
  foreign key (organisation_id, settled_document_id)
    references public.commercial_documents(organisation_id, id),
  foreign key (organisation_id, reversal_of)
    references public.settlement_allocations(organisation_id, id)
);

-- 3. Append-only trigger (no updates or deletes allowed)
create trigger settlement_allocations_append_only
before update or delete on public.settlement_allocations
for each row execute function app_private.reject_mutation();

-- 4. Allocation validation trigger function with deterministic locking
create or replace function app_private.assert_settlement_allocation_valid()
returns trigger language plpgsql as $$
declare
  pay_doc record;
  settled_doc record;
  reversal_target record;
  prior_allocated_pay numeric(20, 6);
  prior_allocated_settled numeric(20, 6);
  prior_reversed_amount numeric(20, 6);
begin
  -- Disallow self-allocation
  if new.payment_document_id = new.settled_document_id then
    raise exception 'cannot allocate document % to itself', new.payment_document_id;
  end if;

  -- Deterministic row-level locking of parent commercial documents in UUID order.
  -- This prevents deadlocks and serializes concurrent allocation attempts against
  -- the same payment or settled document under READ COMMITTED transaction isolation.
  if new.payment_document_id < new.settled_document_id then
    select * into pay_doc
      from public.commercial_documents
     where organisation_id = new.organisation_id and id = new.payment_document_id
       for update;
    select * into settled_doc
      from public.commercial_documents
     where organisation_id = new.organisation_id and id = new.settled_document_id
       for update;
  else
    select * into settled_doc
      from public.commercial_documents
     where organisation_id = new.organisation_id and id = new.settled_document_id
       for update;
    select * into pay_doc
      from public.commercial_documents
     where organisation_id = new.organisation_id and id = new.payment_document_id
       for update;
  end if;

  if pay_doc.id is null then
    raise exception 'payment document % not found in organisation %', new.payment_document_id, new.organisation_id;
  end if;
  if settled_doc.id is null then
    raise exception 'settled document % not found in organisation %', new.settled_document_id, new.organisation_id;
  end if;

  -- Status check: both documents must be issued or settled
  if pay_doc.status not in ('issued', 'settled') then
    raise exception 'payment document % status is %, must be issued or settled', pay_doc.id, pay_doc.status;
  end if;
  if settled_doc.status not in ('issued', 'settled') then
    raise exception 'settled document % status is %, must be issued or settled', settled_doc.id, settled_doc.status;
  end if;

  -- Currency check: all three currencies must match
  if pay_doc.currency <> settled_doc.currency or new.currency <> pay_doc.currency then
    raise exception 'currency mismatch: payment is %, settled doc is %, allocation is %',
      pay_doc.currency, settled_doc.currency, new.currency;
  end if;

  -- Document type role check:
  if pay_doc.document_type not in ('payment', 'receipt', 'credit_note', 'refund') then
    raise exception 'document % of type % cannot be used as payment/settlement instrument', pay_doc.id, pay_doc.document_type;
  end if;

  if pay_doc.document_type = 'refund' then
    -- Outbound refund instrument settles a credit_note or supplier_bill return
    if settled_doc.document_type not in ('credit_note', 'supplier_bill') then
      raise exception 'refund instrument % can only settle credit_note or supplier_bill, got %', pay_doc.id, settled_doc.document_type;
    end if;
  elsif pay_doc.document_type = 'credit_note' then
    -- Credit note instrument settles an unpaid sales_invoice
    if settled_doc.document_type not in ('sales_invoice') then
      raise exception 'credit_note instrument % can only settle sales_invoice, got %', pay_doc.id, settled_doc.document_type;
    end if;
  else
    -- Standard payment / receipt instrument settles receivables/payables/direct expenses
    if settled_doc.document_type not in ('sales_invoice', 'supplier_bill', 'direct_expense', 'petty_cash_voucher', 'bank_charge') then
      raise exception 'document % of type % cannot be settled by payment/receipt', settled_doc.id, settled_doc.document_type;
    end if;
  end if;

  -- Reversal handling vs standard allocation
  if new.reversal_of is not null then
    select * into reversal_target
      from public.settlement_allocations
     where organisation_id = new.organisation_id and id = new.reversal_of
       for update;
    if not found then
      raise exception 'target allocation for reversal % not found in organisation %', new.reversal_of, new.organisation_id;
    end if;
    if reversal_target.reversal_of is not null then
      raise exception 'cannot reverse a reversal allocation %', new.reversal_of;
    end if;
    if reversal_target.payment_document_id <> new.payment_document_id or
       reversal_target.settled_document_id <> new.settled_document_id then
      raise exception 'reversal documents do not match original allocation';
    end if;

    -- Check that total reversals do not exceed original allocation amount
    select coalesce(sum(allocated_amount), 0) into prior_reversed_amount
      from public.settlement_allocations
     where organisation_id = new.organisation_id and reversal_of = new.reversal_of;
    if (prior_reversed_amount + new.allocated_amount) > reversal_target.allocated_amount then
      raise exception 'reversal amount % exceeds remaining unreversed allocation amount %',
        new.allocated_amount, (reversal_target.allocated_amount - prior_reversed_amount);
    end if;

  else
    -- Standard allocation: Check that total active allocations do not exceed gross total of either document
    -- Net active allocations for payment document (active on either payment or settled side):
    select coalesce(sum(
      case when reversal_of is null then allocated_amount
           else -allocated_amount
      end
    ), 0) into prior_allocated_pay
      from public.settlement_allocations
     where organisation_id = new.organisation_id
       and (payment_document_id = new.payment_document_id or settled_document_id = new.payment_document_id);

    if (prior_allocated_pay + new.allocated_amount) > pay_doc.gross_total then
      raise exception 'allocated amount % exceeds payment % unallocated balance % (gross total %)',
        new.allocated_amount, pay_doc.id, (pay_doc.gross_total - prior_allocated_pay), pay_doc.gross_total;
    end if;

    -- Net active allocations for settled document (active on either settled or payment side):
    select coalesce(sum(
      case when reversal_of is null then allocated_amount
           else -allocated_amount
      end
    ), 0) into prior_allocated_settled
      from public.settlement_allocations
     where organisation_id = new.organisation_id
       and (settled_document_id = new.settled_document_id or payment_document_id = new.settled_document_id);

    if (prior_allocated_settled + new.allocated_amount) > settled_doc.gross_total then
      raise exception 'allocated amount % exceeds settled doc % outstanding balance % (gross total %)',
        new.allocated_amount, settled_doc.id, (settled_doc.gross_total - prior_allocated_settled), settled_doc.gross_total;
    end if;
  end if;

  return new;
end;
$$;

create trigger settlement_allocations_validate
before insert on public.settlement_allocations
for each row execute function app_private.assert_settlement_allocation_valid();

-- 5. Helper function for deriving settlement balances
create or replace function app_private.get_document_settlement_summary(
  target_org uuid,
  target_doc uuid
)
returns table (
  document_id uuid,
  organisation_id uuid,
  document_type text,
  document_no text,
  currency character(3),
  gross_total numeric(20, 6),
  allocated_total numeric(20, 6),
  unallocated_balance numeric(20, 6),
  settlement_status text
)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  doc record;
  net_allocated numeric(20, 6);
  rem numeric(20, 6);
  stat text;
begin
  if not app_private.has_organisation_access(target_org) then
    raise exception 'access denied to organisation %', target_org;
  end if;

  select d.id, d.organisation_id, d.document_type, d.document_no, d.currency, d.gross_total
    into doc
    from public.commercial_documents d
   where d.organisation_id = target_org and d.id = target_doc;

  if not found then
    return;
  end if;

  select coalesce(sum(
    case when a.reversal_of is null then a.allocated_amount
         else -a.allocated_amount
    end
  ), 0) into net_allocated
    from public.settlement_allocations a
   where a.organisation_id = target_org
     and (a.payment_document_id = target_doc or a.settled_document_id = target_doc);

  rem := doc.gross_total - net_allocated;
  if net_allocated = 0 then
    stat := 'unallocated';
  elsif rem <= 0 then
    stat := 'fully_settled';
  else
    stat := 'partially_allocated';
  end if;

  return query select
    doc.id,
    doc.organisation_id,
    doc.document_type,
    doc.document_no,
    doc.currency,
    doc.gross_total,
    net_allocated,
    rem,
    stat;
end;
$$;

-- 6. Row-Level Security & Grants
alter table public.settlement_allocations enable row level security;

create policy settlement_allocations_current on public.settlement_allocations
  using (app_private.has_organisation_access(organisation_id));

revoke all on public.settlement_allocations from anon, authenticated;
revoke all on function app_private.get_document_settlement_summary(uuid, uuid) from public, anon, authenticated;

commit;
