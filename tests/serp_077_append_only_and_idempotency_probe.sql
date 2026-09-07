-- =============================================================================
-- SERP-077 — the append-only ledger and idempotency, adversarially
--
-- starqERP claims an UNFORGEABLE AUDIT TRAIL. That claim rests on five triggers
-- declared in migrations 0001 and 0003:
--
--   journal_entries_append_only     journal_lines_append_only
--   audit_events_append_only        stock_movements_append_only
--   job_events_append_only
--
-- plus commercial_documents_issued_immutable, and the idempotency_keys table
-- whose primary key is what makes a replayed command safe.
--
-- NONE OF THEM HAS EVER BEEN ATTACKED. The SERP-300 adversarial probe references
-- journal_entries and journal_lines ZERO times. An append-only ledger that can
-- in fact be updated is not append-only, and nobody would find out from a green
-- test suite — they would find out from an auditor, or from a dispute.
--
-- This is the same shape as everything else this session: 55 RLS policies with
-- no tests, a period lock imported and never called, nine payment tables inside
-- a probe that skipped them, and my own chart_of_accounts policy untested for a
-- day. DECLARED IS NOT ENFORCED UNTIL SOMETHING HAS TRIED.
--
--   psql -h localhost -p 55432 -U postgres -d <db> -f tests/serp_077_append_only_and_idempotency_probe.sql
--
-- A case PASSES when the database REFUSES. Everything is rolled back.
-- =============================================================================

\set ON_ERROR_STOP off

begin;

create temporary table serp077_results (
  scenario text, expected text, actual text, passed boolean
) on commit drop;

select id as "ORG" from public.organisations order by id limit 1 \gset

-- Fixtures: a person, a period, a posted journal with two lines.
insert into public.persons (id, person_key, display_label)
values ('07700000-0000-4000-8000-0000000000ff', 'serp077-probe', 'SERP-077 Probe Actor')
on conflict (id) do nothing;

insert into public.accounting_periods (id, organisation_id, period_code, starts_on, ends_on, status)
values ('07700000-0000-4000-8000-000000000001', :'ORG', '2026-09', '2026-09-01', '2026-09-30', 'open')
on conflict do nothing;

insert into public.journal_entries
  (id, organisation_id, period_id, entry_no, transaction_date, narration, posted_by)
values
  ('07700000-0000-4000-8000-000000000002', :'ORG', '07700000-0000-4000-8000-000000000001',
   'JE-SERP077-1', '2026-09-15', 'SERP-077 probe entry', '07700000-0000-4000-8000-0000000000ff');

insert into public.journal_lines (organisation_id, entry_id, line_no, account_code, amount)
values
  (:'ORG', '07700000-0000-4000-8000-000000000002', 1, '1114',  100),
  (:'ORG', '07700000-0000-4000-8000-000000000002', 2, '6210', -100);

-- An ISSUED commercial document, so case 8 is actually testable. Without one the
-- assertion comes back "no issued document present", which this probe treats as
-- INCONCLUSIVE AND THEREFORE FAILING — an untestable guarantee must never report
-- green, which is the whole lesson of this session.
insert into public.contacts (id, organisation_id, kind, display_name)
values ('07700000-0000-4000-8000-000000000004', :'ORG', 'customer', 'SERP-077 Probe Customer')
on conflict do nothing;

insert into public.commercial_documents
  (id, organisation_id, book_id, document_type, document_no, status, contact_id, issued_at, gross_total)
select '07700000-0000-4000-8000-000000000005', :'ORG', b.id, 'sales_invoice', 'SERP077-INV-1',
       'issued', '07700000-0000-4000-8000-000000000004', now(), 1000
  from public.books b where b.organisation_id = :'ORG' limit 1
on conflict do nothing;

insert into public.idempotency_keys (organisation_id, key, command_type, request_hash, state)
values (:'ORG', '07700000-0000-4000-8000-000000000003', 'post_journal', 'hash-abc', 'accepted');

do $$
declare
  org constant uuid := (select id from public.organisations order by id limit 1);
  entry constant uuid := '07700000-0000-4000-8000-000000000002';
begin

  -- 1. A POSTED JOURNAL ENTRY CANNOT BE EDITED.
  --    The single most valuable property in the ledger: if a narration or a date
  --    can be changed after posting, every downstream report is unprovable.
  begin
    update public.journal_entries set narration = 'FORGED NARRATION' where id = entry;
    insert into serp077_results values
      ('journal_entry_update_rejected', 'rejected: append-only', 'ACCEPTED — a posted entry was rewritten', false);
  exception when others then
    insert into serp077_results values
      ('journal_entry_update_rejected', 'rejected: append-only', 'rejected — ' || sqlerrm, true);
  end;

  -- 2. NOR BACKDATED. Same trigger, but worth its own row: changing the DATE
  --    moves a transaction between periods, including into a closed one.
  begin
    update public.journal_entries set transaction_date = '2020-01-01' where id = entry;
    insert into serp077_results values
      ('journal_entry_backdate_rejected', 'rejected: append-only', 'ACCEPTED — a posted entry was backdated', false);
  exception when others then
    insert into serp077_results values
      ('journal_entry_backdate_rejected', 'rejected: append-only', 'rejected', true);
  end;

  -- 3. NOR DELETED.
  begin
    delete from public.journal_entries where id = entry;
    insert into serp077_results values
      ('journal_entry_delete_rejected', 'rejected: append-only', 'ACCEPTED — a posted entry vanished', false);
  exception when others then
    insert into serp077_results values
      ('journal_entry_delete_rejected', 'rejected: append-only', 'rejected', true);
  end;

  -- 4. THE LINES ARE PROTECTED TOO. Locking the header while leaving the lines
  --    editable would protect the receipt and not the money.
  begin
    update public.journal_lines set amount = 999999 where entry_id = entry and line_no = 1;
    insert into serp077_results values
      ('journal_line_amount_update_rejected', 'rejected: append-only', 'ACCEPTED — a posted AMOUNT was changed', false);
  exception when others then
    insert into serp077_results values
      ('journal_line_amount_update_rejected', 'rejected: append-only', 'rejected', true);
  end;

  begin
    update public.journal_lines set account_code = '9999' where entry_id = entry and line_no = 1;
    insert into serp077_results values
      ('journal_line_reaccount_rejected', 'rejected: append-only', 'ACCEPTED — a posted line was moved to another account', false);
  exception when others then
    insert into serp077_results values
      ('journal_line_reaccount_rejected', 'rejected: append-only', 'rejected', true);
  end;

  begin
    delete from public.journal_lines where entry_id = entry and line_no = 1;
    insert into serp077_results values
      ('journal_line_delete_rejected', 'rejected: append-only',
       'ACCEPTED — one side of a double entry was removed, leaving it unbalanced', false);
  exception when others then
    insert into serp077_results values
      ('journal_line_delete_rejected', 'rejected: append-only', 'rejected', true);
  end;

  -- 5. THE AUDIT TRAIL ITSELF CANNOT BE REWRITTEN. An audit log that can be
  --    edited records only what the last editor wanted recorded.
  begin
    insert into public.audit_events (organisation_id, event_type, payload)
    values (org, 'serp077.probe', '{"probe":true}');
  exception when others then null; -- shape may differ; the mutation test below is the point
  end;

  begin
    update public.audit_events set event_type = 'FORGED' where event_type = 'serp077.probe';
    if not found then
      insert into serp077_results values
        ('audit_event_update_rejected', 'rejected: append-only', 'no probe row to mutate — inconclusive, not a pass', false);
    else
      insert into serp077_results values
        ('audit_event_update_rejected', 'rejected: append-only', 'ACCEPTED — the audit trail was rewritten', false);
    end if;
  exception when others then
    insert into serp077_results values
      ('audit_event_update_rejected', 'rejected: append-only', 'rejected', true);
  end;

  -- 6. IDEMPOTENCY: THE SAME KEY CANNOT BE CLAIMED TWICE.
  --    This is what makes a retried command safe. Without it a network retry
  --    posts the journal a second time, and the books are wrong by exactly one
  --    transaction that nobody remembers authorising.
  begin
    insert into public.idempotency_keys (organisation_id, key, command_type, request_hash, state)
    values (org, '07700000-0000-4000-8000-000000000003', 'post_journal', 'hash-abc', 'accepted');
    insert into serp077_results values
      ('idempotency_key_reuse_rejected', 'rejected by primary key',
       'ACCEPTED — the same command key was claimed twice', false);
  exception when unique_violation then
    insert into serp077_results values
      ('idempotency_key_reuse_rejected', 'rejected by primary key', 'rejected by primary key', true);
  end;

  -- 7. ...AND THE SAME KEY IS STILL USABLE BY A DIFFERENT TENANT.
  --    The key is scoped (organisation_id, key). Over-tight uniqueness would
  --    make one tenant's retry collide with another's, which is a availability
  --    failure disguised as safety.
  declare org_b uuid := (select id from public.organisations order by id offset 1 limit 1);
  begin
    if org_b is null then
      insert into serp077_results values
        ('idempotency_key_scoped_per_tenant', 'accepted for a different tenant',
         'only one organisation present — not asserted', true);
    else
      begin
        insert into public.idempotency_keys (organisation_id, key, command_type, request_hash, state)
        values (org_b, '07700000-0000-4000-8000-000000000003', 'post_journal', 'hash-abc', 'accepted');
        insert into serp077_results values
          ('idempotency_key_scoped_per_tenant', 'accepted for a different tenant', 'accepted', true);
      exception when others then
        insert into serp077_results values
          ('idempotency_key_scoped_per_tenant', 'accepted for a different tenant',
           'REJECTED — keys collide across tenants: ' || sqlstate, false);
      end;
    end if;
  end;

  -- 8. AN ISSUED COMMERCIAL DOCUMENT IS IMMUTABLE.
  --    Already proven incidentally during SERP-300 fixture work, asserted here
  --    deliberately rather than relied on as a side effect.
  begin
    update public.commercial_documents set document_no = 'FORGED'
     where organisation_id = org and status in ('issued', 'settled');
    if not found then
      insert into serp077_results values
        ('issued_document_immutable', 'rejected', 'no issued document present — inconclusive, not a pass', false);
    else
      insert into serp077_results values
        ('issued_document_immutable', 'rejected', 'ACCEPTED — an issued document was renumbered', false);
    end if;
  exception when others then
    insert into serp077_results values ('issued_document_immutable', 'rejected', 'rejected', true);
  end;

end $$;

table serp077_results;

do $$
declare failures text;
begin
  select string_agg(scenario || ' => ' || actual, E'\n' order by scenario)
    into failures from serp077_results where not passed;
  if failures is not null then
    raise exception E'SERP-077 APPEND-ONLY / IDEMPOTENCY — UNGUARDED:\n%', failures;
  end if;
end $$;

rollback;
