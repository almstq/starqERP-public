-- Synthetic fixtures only. Never replace these values with live identities.

insert into public.organisations (id, slug, legal_name, registry_code)
values
  ('00000000-0000-4000-8000-000000000001', 'demo-starq', 'Demo Starq Company', 'DEMO-C-001'),
  ('00000000-0000-4000-8000-000000000002', 'demo-garage', 'Demo Garage Company', 'DEMO-C-002');

insert into public.persons (id, person_key, external_subject, display_label)
values
  ('00000000-0000-4000-8000-000000000101', 'demo-founder', 'synthetic:founder', 'Demo Founder'),
  ('00000000-0000-4000-8000-000000000102', 'demo-operator', 'synthetic:operator', 'Demo Operator');

insert into public.seats (code, label) values
  ('director', 'Director'),
  ('financial_controller', 'Financial Controller'),
  ('payer', 'Payer'),
  ('ledger_poster', 'Ledger Poster'),
  ('managing_director', 'Managing Director'),
  ('counter', 'Counter'),
  ('technician', 'Technician'),
  ('receiver', 'Receiver'),
  ('qc_signer', 'QC Signer'),
  ('stores', 'Stores');

insert into public.memberships (id, organisation_id, person_id) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000102');

insert into public.membership_seats (membership_id, seat_code) values
  ('00000000-0000-4000-8000-000000000201', 'director'),
  ('00000000-0000-4000-8000-000000000201', 'ledger_poster'),
  ('00000000-0000-4000-8000-000000000202', 'financial_controller'),
  ('00000000-0000-4000-8000-000000000202', 'payer'),
  ('00000000-0000-4000-8000-000000000203', 'managing_director'),
  ('00000000-0000-4000-8000-000000000203', 'counter'),
  ('00000000-0000-4000-8000-000000000203', 'technician');

insert into public.locations (id, organisation_id, code, name, kind)
values ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000002', 'DEMO-WORKSHOP', 'Demo Workshop', 'workshop');

insert into public.products (id, organisation_id, sku, kind, name, income_account, cogs_account, sale_allowed)
values ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000002', 'DEMO-SVC-PAINT', 'service', 'Demo Paint Service', '4200', '5100', true);
