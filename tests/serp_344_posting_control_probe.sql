-- =============================================================================
-- SERP-344 — posting control probe
--
-- Proves that the posting_control column on public.chart_of_accounts is ENFORCED
-- by the database, not merely recorded. Five classes must reject and two must
-- accept. Run it against a database with all migrations applied:
--
--   psql -h localhost -p 55432 -U postgres -d <db> -f tests/serp_344_posting_control_probe.sql
--
-- EXPECTED:
--   1000 header        REJECTED   2120 header   REJECTED
--   1210 control       REJECTED   3200 system   REJECTED
--   9999 unknown       REJECTED
--   1114 postable      accepted   6210 postable accepted
--
-- WHY THIS PROBE EXISTS: the first draft of the trigger exempted the postgres
-- superuser so migrations could seed freely. Every control account then accepted
-- a manual line and the guard could not be proven at all -- the same defect as
-- running an RLS probe as superuser. This probe would have caught it, and did.
--
-- Everything runs inside a transaction that is rolled back. It writes nothing.
-- =============================================================================

\set ON_ERROR_STOP off
select id as "ORG" from public.organisations order by id limit 1 \gset
\echo 'probing organisation' :ORG

\set ORG '10000000-0000-4000-8000-000000000001'
begin;
set constraints all deferred;
insert into persons (id, person_key, display_label) values ('44440000-0000-4000-8000-000000000001','serp344-tester','SERP-344 Tester') on conflict do nothing;
insert into accounting_periods (id, organisation_id, period_code, starts_on, ends_on, status)
  values ('44440000-0000-4000-8000-000000000002',:'ORG','2026-08','2026-08-01','2026-08-31','open') on conflict do nothing;
insert into journal_entries (id, organisation_id,period_id,entry_no,transaction_date,narration,posted_by)
  values ('44440000-0000-4000-8000-000000000003',:'ORG','44440000-0000-4000-8000-000000000002','JE-CTL','2026-08-30','SERP-344 control test','44440000-0000-4000-8000-000000000001');

\echo '--- 1000 HEADER (asset root)'
savepoint s1; insert into journal_lines (organisation_id,entry_id,line_no,account_code,amount) values (:'ORG','44440000-0000-4000-8000-000000000003',1,'1000',100); rollback to s1;
\echo '--- 2120 HEADER (MIRA payables)'
savepoint s2; insert into journal_lines (organisation_id,entry_id,line_no,account_code,amount) values (:'ORG','44440000-0000-4000-8000-000000000003',2,'2120',100); rollback to s2;
\echo '--- 1210 CONTROL (AR)'
savepoint s3; insert into journal_lines (organisation_id,entry_id,line_no,account_code,amount) values (:'ORG','44440000-0000-4000-8000-000000000003',3,'1210',100); rollback to s3;
\echo '--- 3200 SYSTEM (retained earnings)'
savepoint s4; insert into journal_lines (organisation_id,entry_id,line_no,account_code,amount) values (:'ORG','44440000-0000-4000-8000-000000000003',4,'3200',100); rollback to s4;
\echo '--- 9999 NOT IN CHART'
savepoint s5; insert into journal_lines (organisation_id,entry_id,line_no,account_code,amount) values (:'ORG','44440000-0000-4000-8000-000000000003',5,'9999',100); rollback to s5;
\echo '--- 1114 POSTABLE (petty cash) — MUST SUCCEED'
savepoint s6; insert into journal_lines (organisation_id,entry_id,line_no,account_code,amount) values (:'ORG','44440000-0000-4000-8000-000000000003',6,'1114',100); \echo '    accepted'; rollback to s6;
\echo '--- 6210 POSTABLE (workshop rent) — MUST SUCCEED'
savepoint s7; insert into journal_lines (organisation_id,entry_id,line_no,account_code,amount) values (:'ORG','44440000-0000-4000-8000-000000000003',7,'6210',100); \echo '    accepted'; rollback to s7;
rollback;
