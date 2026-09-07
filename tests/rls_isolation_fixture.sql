\set ON_ERROR_STOP on

-- Synthetic tenants for SERP-124. These identifiers and labels represent no real company/person.
insert into public.organisations (id, slug, legal_name, registry_code)
values
  ('00000000-0000-4000-8000-000000000001', 'serp124-tenant-a', 'Synthetic Tenant A', 'SYNTH-A'),
  ('00000000-0000-4000-8000-000000000002', 'serp124-tenant-b', 'Synthetic Tenant B', 'SYNTH-B');

insert into public.persons (id, person_key, external_subject, display_label)
values
  ('00000000-0000-4000-8000-000000000101', 'serp124-probe-person',
   'synthetic:serp124-probe', 'Synthetic RLS Probe');

-- One person deliberately belongs to both tenants. The organisation claim must still prevent
-- tenant B visibility while tenant A is active.
insert into public.memberships (id, organisation_id, person_id)
values
  ('00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000101');

-- commercial_documents' RLS policy (202608280028) requires app_private.has_book_access
-- (organisation_id, book_id), which needs a book_memberships row linking the caller's
-- membership to that book. Real production wires this automatically (organisation
-- provisioning's "Grant Book Membership" step, 202608270026, and staff-invitation
-- acceptance, 202608270027) - moved earlier in this file (before commercial_documents
-- needs to reference book_id) from where it was originally inserted alongside the
-- other newly-tracked tables.
insert into public.books (id, organisation_id, code, name, currency, status)
values
  ('00000000-0000-4000-8000-000000003011', '00000000-0000-4000-8000-000000000001', 'SYNA', 'Synthetic A Book', 'MVR', 'active'),
  ('00000000-0000-4000-8000-000000003012', '00000000-0000-4000-8000-000000000002', 'SYNB', 'Synthetic B Book', 'MVR', 'active');

insert into public.book_memberships (id, organisation_id, membership_id, book_id)
values
  ('00000000-0000-4000-8000-000000003021', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000003011'),
  ('00000000-0000-4000-8000-000000003022', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000003012');

-- Every policy-bearing table gets a row for each tenant. This is intentionally verbose: an empty
-- table returns zero rows even under a broken permissive policy, so catalogue checks alone are not
-- behavioral isolation proof.
insert into public.business_names (id, organisation_id, name)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', 'Synthetic A Trading Name'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000002', 'Synthetic B Trading Name');

insert into public.idempotency_keys (organisation_id, key, command_type, request_hash)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000401', 'synthetic-a', 'hash-a'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000402', 'synthetic-b', 'hash-b');

insert into public.attachments
  (id, organisation_id, object_type, object_id, storage_key, sha256, media_type, byte_length, created_by)
values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000001', 'synthetic',
   '00000000-0000-4000-8000-000000000591', 'serp124/a', repeat('a', 64), 'text/plain', 1,
   '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000002', 'synthetic',
   '00000000-0000-4000-8000-000000000592', 'serp124/b', repeat('b', 64), 'text/plain', 1,
   '00000000-0000-4000-8000-000000000101');

insert into public.audit_events (organisation_id, actor_person_id, action, object_type)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'synthetic-a', 'serp124'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'synthetic-b', 'serp124');

insert into public.contacts (id, organisation_id, kind, display_name)
values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000001', 'customer', 'Synthetic A Contact'),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000002', 'customer', 'Synthetic B Contact');

insert into public.vehicles (id, organisation_id, customer_id, registration_no)
values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000601', 'SYN-A'),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000602', 'SYN-B');

insert into public.products (id, organisation_id, sku, kind, name)
values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000001', 'SERP124-A', 'stock', 'Synthetic A Product'),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000002', 'SERP124-B', 'stock', 'Synthetic B Product');

insert into public.product_prices (id, organisation_id, product_id, amount, valid_from)
values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000801', 1, now()),
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000802', 1, now());

insert into public.locations (id, organisation_id, code, name, kind)
values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001', 'SERP124-A', 'Synthetic A Location', 'warehouse'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000002', 'SERP124-B', 'Synthetic B Location', 'warehouse');

insert into public.inventory_items (organisation_id, location_id, product_id, quantity_status)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001',
   '00000000-0000-4000-8000-000000000801', 'counted'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001002',
   '00000000-0000-4000-8000-000000000802', 'counted');

insert into public.stock_movements
  (id, organisation_id, location_id, product_id, movement_type, quantity, source_type,
   idempotency_key, occurred_at, recorded_by)
values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000801',
   'opening', 1, 'serp124', '00000000-0000-4000-8000-000000001191', now(),
   '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000802',
   'opening', 1, 'serp124', '00000000-0000-4000-8000-000000001192', now(),
   '00000000-0000-4000-8000-000000000101');

insert into public.garage_jobs (id, organisation_id, job_no, customer_id, vehicle_id, summary)
values
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000000001', 'SERP124-A',
   '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000701', 'Synthetic A Job'),
  ('00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000000002', 'SERP124-B',
   '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000702', 'Synthetic B Job');

insert into public.job_events
  (id, organisation_id, job_id, event_type, actor_person_id, acting_seat, idempotency_key)
values
  ('00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000001201', 'synthetic', '00000000-0000-4000-8000-000000000101',
   'owner', '00000000-0000-4000-8000-000000001391'),
  ('00000000-0000-4000-8000-000000001302', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000001202', 'synthetic', '00000000-0000-4000-8000-000000000101',
   'owner', '00000000-0000-4000-8000-000000001392');

insert into public.accounting_periods (id, organisation_id, period_code, starts_on, ends_on)
values
  ('00000000-0000-4000-8000-000000001401', '00000000-0000-4000-8000-000000000001', 'SERP124-A', '2026-01-01', '2026-12-31'),
  ('00000000-0000-4000-8000-000000001402', '00000000-0000-4000-8000-000000000002', 'SERP124-B', '2026-01-01', '2026-12-31');

insert into public.commercial_documents (id, organisation_id, document_type, contact_id, book_id)
values
  ('00000000-0000-4000-8000-000000001501', '00000000-0000-4000-8000-000000000001', 'estimate',
   '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000003011'),
  ('00000000-0000-4000-8000-000000001502', '00000000-0000-4000-8000-000000000002', 'estimate',
   '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000003012');

insert into public.commercial_document_lines
  (id, organisation_id, document_id, line_no, product_id, description, quantity, unit_price, net_amount, gross_amount)
values
  ('00000000-0000-4000-8000-000000001601', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000001501', 1, '00000000-0000-4000-8000-000000000801', 'Synthetic A Line', 1, 1, 1, 1),
  ('00000000-0000-4000-8000-000000001602', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000001502', 1, '00000000-0000-4000-8000-000000000802', 'Synthetic B Line', 1, 1, 1, 1);

-- app_private.enforce_posting_control() (202608300035) validates journal_lines.account_code
-- against public.chart_of_accounts(organisation_id, code) - which is seeded only as a one-time
-- backfill for organisations that already existed when that migration ran. These synthetic
-- tenants are created above, after all migrations, so they get no chart_of_accounts rows from
-- that backfill and no trigger auto-provisions one for a newly-created organisation. The fake
-- 'SYN-A-DR'-style codes below also could never satisfy chart_of_accounts.code's own check
-- constraint (`code ~ '^[1-6][0-9]{3}$'` - exactly 4 digits) even if seeded. Use two real
-- canonical codes from that migration's 55-account set instead of inventing schema-invalid ones.
insert into public.chart_of_accounts (organisation_id, code, name, account_class, subtype, parent_code, level, currency, posting_control, description)
values
  ('00000000-0000-4000-8000-000000000001', '1111', 'Bank of Maldives (BML) MVR Main', 'ASSET', 'BANK_AND_CASH', null, 3, 'MVR', 'postable', 'Synthetic RLS fixture account (SERP-124/337).'),
  ('00000000-0000-4000-8000-000000000001', '4110', 'Workshop & Job Labor Revenue', 'REVENUE', 'SERVICE_REVENUE', null, 1, 'MVR', 'postable', 'Synthetic RLS fixture account (SERP-124/337).'),
  ('00000000-0000-4000-8000-000000000002', '1111', 'Bank of Maldives (BML) MVR Main', 'ASSET', 'BANK_AND_CASH', null, 3, 'MVR', 'postable', 'Synthetic RLS fixture account (SERP-124/337).'),
  ('00000000-0000-4000-8000-000000000002', '4110', 'Workshop & Job Labor Revenue', 'REVENUE', 'SERVICE_REVENUE', null, 1, 'MVR', 'postable', 'Synthetic RLS fixture account (SERP-124/337).');

insert into public.journal_proposals
  (id, organisation_id, source_type, narration, transaction_date, created_by)
values
  ('00000000-0000-4000-8000-000000001701', '00000000-0000-4000-8000-000000000001', 'serp124',
   'Synthetic A Proposal', '2026-08-24', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001702', '00000000-0000-4000-8000-000000000002', 'serp124',
   'Synthetic B Proposal', '2026-08-24', '00000000-0000-4000-8000-000000000101');

insert into public.journal_proposal_lines (id, organisation_id, proposal_id, line_no, account_code, amount)
values
  ('00000000-0000-4000-8000-000000001801', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000001701', 1, 'SYN-A', 1),
  ('00000000-0000-4000-8000-000000001802', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000001702', 1, 'SYN-B', 1);

begin;
insert into public.journal_entries
  (id, organisation_id, period_id, entry_no, transaction_date, narration, posted_by)
values
  ('00000000-0000-4000-8000-000000001901', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000001401', 'SERP124-A', '2026-08-24', 'Synthetic A Entry',
   '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001902', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000001402', 'SERP124-B', '2026-08-24', 'Synthetic B Entry',
   '00000000-0000-4000-8000-000000000101');

insert into public.journal_lines (id, organisation_id, entry_id, line_no, account_code, amount)
values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000001901', 1, '1111', 1),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000001901', 2, '4110', -1),
  ('00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000001902', 1, '1111', 1),
  ('00000000-0000-4000-8000-000000002004', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000001902', 2, '4110', -1);
commit;

insert into public.document_sequences (organisation_id, sequence_type, prefix)
values
  ('00000000-0000-4000-8000-000000000001', 'serp124', 'A-'),
  ('00000000-0000-4000-8000-000000000002', 'serp124', 'B-');

insert into public.security_events (organisation_id, principal_kind, event_type, outcome)
values
  ('00000000-0000-4000-8000-000000000001', 'human', 'serp124-a', 'accepted'),
  ('00000000-0000-4000-8000-000000000002', 'human', 'serp124-b', 'accepted');

insert into public.automation_principals (id, organisation_id, principal_key, display_label)
values
  ('00000000-0000-4000-8000-000000002101', '00000000-0000-4000-8000-000000000001', 'serp124-a', 'Synthetic A Principal'),
  ('00000000-0000-4000-8000-000000002102', '00000000-0000-4000-8000-000000000002', 'serp124-b', 'Synthetic B Principal');

insert into public.command_approvals
  (id, organisation_id, automation_principal_id, command_type, command_hash, expires_at)
values
  ('00000000-0000-4000-8000-000000002201', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000002101', 'serp124-a', repeat('a', 64), now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000002202', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000002102', 'serp124-b', repeat('b', 64), now() + interval '1 hour');

insert into public.commercial_documents
  (id, organisation_id, document_type, document_no, status, contact_id, currency, gross_total, issued_at, issued_by, book_id)
values
  ('00000000-0000-4000-8000-000000002301', '00000000-0000-4000-8000-000000000001', 'payment', 'RLS-PAY-A', 'issued', '00000000-0000-4000-8000-000000000601', 'MVR', 100, now(), '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000003011'),
  ('00000000-0000-4000-8000-000000002302', '00000000-0000-4000-8000-000000000002', 'payment', 'RLS-PAY-B', 'issued', '00000000-0000-4000-8000-000000000602', 'MVR', 100, now(), '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000003012'),
  ('00000000-0000-4000-8000-000000002303', '00000000-0000-4000-8000-000000000001', 'sales_invoice', 'RLS-INV-A', 'issued', '00000000-0000-4000-8000-000000000601', 'MVR', 100, now(), '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000003011'),
  ('00000000-0000-4000-8000-000000002304', '00000000-0000-4000-8000-000000000002', 'sales_invoice', 'RLS-INV-B', 'issued', '00000000-0000-4000-8000-000000000602', 'MVR', 100, now(), '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000003012');

insert into public.settlement_allocations
  (id, organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
values
  ('00000000-0000-4000-8000-000000002401', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000002301', '00000000-0000-4000-8000-000000002303', 100, 'MVR',
   '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000002402', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000002302', '00000000-0000-4000-8000-000000002304', 100, 'MVR',
   '00000000-0000-4000-8000-000000000101');

-- SERP-337: seed data for the 21 tenant-scoped tables that joined expected_policies
-- alongside the expected_public_tables/expected_policies fixes in
-- tests/rls_isolation_probe.sql. Same rationale as the header comment above: an
-- empty table passes the tenant-B-invisible half of the check by accident, not by
-- proof, and the behavioural loop in the probe also needs a tenant-A positive
-- control row per table or it raises "tenant A positive control missing".
-- (payment_provider_config is seeded here too, not because it is in that loop --
-- it carries no policy and is correctly absent from expected_policies -- but
-- because payment_intents/payment_attempts now require a real config_id.)

insert into public.bank_accounts (id, organisation_id, institution_code, institution_name, account_name, account_type, currency)
values
  ('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000000001', 'SYN', 'Synthetic Bank', 'Synthetic A Operating', 'operating', 'MVR'),
  ('00000000-0000-4000-8000-000000003002', '00000000-0000-4000-8000-000000000002', 'SYN', 'Synthetic Bank', 'Synthetic B Operating', 'operating', 'MVR');


insert into public.book_locations (id, organisation_id, book_id, location_id, is_primary)
values
  ('00000000-0000-4000-8000-000000003031', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000003011', '00000000-0000-4000-8000-000000001001', true),
  ('00000000-0000-4000-8000-000000003032', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000003012', '00000000-0000-4000-8000-000000001002', true);

insert into public.goods_receipts (id, organisation_id, receipt_no, received_by)
values
  ('00000000-0000-4000-8000-000000003041', '00000000-0000-4000-8000-000000000001', 'GR-SYN-A', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000003042', '00000000-0000-4000-8000-000000000002', 'GR-SYN-B', '00000000-0000-4000-8000-000000000101');

insert into public.goods_receipt_lines (id, organisation_id, receipt_id, line_no, item_key, quantity)
values
  ('00000000-0000-4000-8000-000000003051', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000003041', 1, 'SYN-ITEM-A', 1),
  ('00000000-0000-4000-8000-000000003052', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000003042', 1, 'SYN-ITEM-B', 1);

insert into public.payment_provider_config (id, organisation_id, provider_id, environment)
values
  ('00000000-0000-4000-8000-000000003061', '00000000-0000-4000-8000-000000000001', 'MOCK', 'sandbox'),
  ('00000000-0000-4000-8000-000000003062', '00000000-0000-4000-8000-000000000002', 'MOCK', 'sandbox');

insert into public.payment_intents (id, organisation_id, provider_id, config_id, amount, currency, created_by)
values
  ('00000000-0000-4000-8000-000000003071', '00000000-0000-4000-8000-000000000001', 'MOCK',
   '00000000-0000-4000-8000-000000003061', 100, 'MVR', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000003072', '00000000-0000-4000-8000-000000000002', 'MOCK',
   '00000000-0000-4000-8000-000000003062', 100, 'MVR', '00000000-0000-4000-8000-000000000101');

insert into public.payment_attempts (id, organisation_id, intent_id, provider_id, config_id, amount, currency)
values
  ('00000000-0000-4000-8000-000000003081', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000003071', 'MOCK', '00000000-0000-4000-8000-000000003061', 100, 'MVR'),
  ('00000000-0000-4000-8000-000000003082', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000003072', 'MOCK', '00000000-0000-4000-8000-000000003062', 100, 'MVR');

insert into public.payment_refunds (id, organisation_id, intent_id, provider_id, amount, currency, reason, requested_by)
values
  ('00000000-0000-4000-8000-000000003091', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000003071', 'MOCK', 10, 'MVR', 'Synthetic RLS fixture refund', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000003092', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000003072', 'MOCK', 10, 'MVR', 'Synthetic RLS fixture refund', '00000000-0000-4000-8000-000000000101');

insert into public.payment_settlements (id, organisation_id, provider_id, batch_reference, gross_amount, fee_amount, net_amount, currency, settled_at)
values
  ('00000000-0000-4000-8000-000000003101', '00000000-0000-4000-8000-000000000001', 'MOCK', 'SYN-BATCH-A', 100, 5, 95, 'MVR', now()),
  ('00000000-0000-4000-8000-000000003102', '00000000-0000-4000-8000-000000000002', 'MOCK', 'SYN-BATCH-B', 100, 5, 95, 'MVR', now());

insert into public.payment_settlement_items (id, organisation_id, settlement_id, payment_document_id, gross_amount, fee_amount, currency)
values
  ('00000000-0000-4000-8000-000000003111', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000003101', '00000000-0000-4000-8000-000000002301', 100, 5, 'MVR'),
  ('00000000-0000-4000-8000-000000003112', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000003102', '00000000-0000-4000-8000-000000002302', 100, 5, 'MVR');

insert into public.workflow_templates (id, organisation_id, workflow_code, name)
values
  ('00000000-0000-4000-8000-000000003121', '00000000-0000-4000-8000-000000000001', 'synthetic_wf', 'Synthetic A Workflow'),
  ('00000000-0000-4000-8000-000000003122', '00000000-0000-4000-8000-000000000002', 'synthetic_wf', 'Synthetic B Workflow');

insert into public.workflow_stages (id, organisation_id, workflow_template_id, stage_code, stage_name, stage_order)
values
  ('00000000-0000-4000-8000-000000003131', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000003121', 'start', 'Start', 1),
  ('00000000-0000-4000-8000-000000003132', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000003122', 'start', 'Start', 1);

insert into public.sod_exceptions (id, organisation_id, purchase_id, person_id, pair_name, step_a, step_b, segregation_capacity)
values
  ('00000000-0000-4000-8000-000000003141', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000003191', '00000000-0000-4000-8000-000000000101', 'synthetic_pair', 'step_a', 'step_b', 'solo'),
  ('00000000-0000-4000-8000-000000003142', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000003192', '00000000-0000-4000-8000-000000000101', 'synthetic_pair', 'step_a', 'step_b', 'solo');

insert into public.sod_exception_dispositions (id, organisation_id, exception_id, disposition, disposed_by, reason)
values
  ('00000000-0000-4000-8000-000000003151', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000003141', 'self_reviewed', '00000000-0000-4000-8000-000000000101', 'Synthetic RLS fixture disposition'),
  ('00000000-0000-4000-8000-000000003152', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000003142', 'self_reviewed', '00000000-0000-4000-8000-000000000101', 'Synthetic RLS fixture disposition');

insert into public.tax_registrations (id, organisation_id, tax_type, registration_status, effective_from)
values
  ('00000000-0000-4000-8000-000000003161', '00000000-0000-4000-8000-000000000001', 'gst_general', 'registered', '2026-01-01'),
  ('00000000-0000-4000-8000-000000003162', '00000000-0000-4000-8000-000000000002', 'gst_general', 'registered', '2026-01-01');

insert into public.roles (id, organisation_id, code, name)
values
  ('00000000-0000-4000-8000-000000003171', '00000000-0000-4000-8000-000000000001', 'synthetic_role', 'Synthetic Role A'),
  ('00000000-0000-4000-8000-000000003172', '00000000-0000-4000-8000-000000000002', 'synthetic_role', 'Synthetic Role B');

insert into public.role_permissions (id, organisation_id, role_id, module, action)
values
  ('00000000-0000-4000-8000-000000003181', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000003171', 'synthetic', 'read'),
  ('00000000-0000-4000-8000-000000003182', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000003172', 'synthetic', 'read');

insert into public.invitations (id, organisation_id, email, name)
values
  ('00000000-0000-4000-8000-000000003201', '00000000-0000-4000-8000-000000000001', 'synth-a@example.invalid', 'Synthetic A Invitee'),
  ('00000000-0000-4000-8000-000000003202', '00000000-0000-4000-8000-000000000002', 'synth-b@example.invalid', 'Synthetic B Invitee');

insert into public.transactional_outbox (id, organisation_id, event_type, aggregate_type, aggregate_id, payload)
values
  ('00000000-0000-4000-8000-000000003211', '00000000-0000-4000-8000-000000000001', 'synthetic.event', 'synthetic',
   '00000000-0000-4000-8000-000000003291', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000003212', '00000000-0000-4000-8000-000000000002', 'synthetic.event', 'synthetic',
   '00000000-0000-4000-8000-000000003292', '{}'::jsonb);
