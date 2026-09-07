begin;

-- =============================================================================
-- Migration: 202608300037_inter_book_accounts.sql
-- SERP-316 — Due From / Due To Related Book.
--
-- Starq Technologies builds the product; Starq Dynamics sells the service that
-- runs on it. Two registered activities of ONE legal entity, keeping separate
-- books, charging each other. Every such charge is revenue in one book and cost
-- in the other, and neither is revenue or cost of the entity as a whole — a
-- group cannot make money selling to itself.
--
-- Until now there was NOWHERE FOR THAT BALANCE TO LIVE. The chart had no
-- inter-book account at either end, so the receivable and payable the entity
-- owed itself had to be recorded as ordinary trade debtors and creditors, where
-- they are indistinguishable from real third-party balances and cannot be
-- eliminated on consolidation.
--
-- 1220 must equal 2160 across all books of an entity. The consolidation REPORTS
-- any difference rather than absorbing it — see domain/interBookTransfers.ts,
-- which replaces a Math.min() that made the two agree by discarding the gap.
-- =============================================================================

insert into public.chart_of_accounts
  (organisation_id, code, name, account_class, subtype, parent_code, level, currency, posting_control, description)
select o.id, s.code, s.name, s.account_class, s.subtype, s.parent_code, s.level, s.currency, s.posting_control, s.description
from public.organisations o
cross join (values
  ('1220', 'Due From Related Book', 'ASSET', 'ACCOUNTS_RECEIVABLE', '1200', 3, 'MVR', 'control',
   'SERP-316. What this book is owed by another book of the SAME legal entity. Not a trade debtor: the entity cannot owe itself in any statutory sense, so this balance is eliminated on consolidation and must never appear on an external balance sheet.'),
  ('2160', 'Due To Related Book', 'LIABILITY', 'CURRENT_LIABILITY', '2100', 2, 'MVR', 'control',
   'SERP-316. The mirror of 1220. The sum of 1220 across all books must equal the sum of 2160; any difference means a transfer was recorded on one side only, and the consolidation reports it.')
) as s(code, name, account_class, subtype, parent_code, level, currency, posting_control, description)
on conflict (organisation_id, code) do nothing;

-- CONTROL, not postable. An inter-book balance may only be moved by an
-- inter-book transfer, which posts both sides at once. Allowing a manual
-- journal into one side is exactly how the two ends stop agreeing, and the
-- posting-control trigger from migration 0035 enforces it.

commit;
