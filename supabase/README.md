# STARQ ERP PostgreSQL migrations

Status: linked foundation; the three controlled migrations were applied to the
founder-authorized Starq Books Supabase project on 2026-08-20. No seed or live
data import has been applied.

This directory is the migration authority for the proposed Supabase PostgreSQL data plane described in `docs/foundation/CLOUD-DATA-ARCHITECTURE.md`.

## Rules

- Every schema change is an ordered SQL migration.
- Do not change a remote schema in the dashboard.
- `seed.sql` contains synthetic data only.
- Never place database passwords, service-role keys, live emails, tokens or connection strings here.
- Flutter does not connect directly to these tables in the first controlled release.
- Existing journals remain the accounting source of truth until DEC-008 is explicitly superseded.
- Current JSON and JSONL files are migration sources, not automatically authoritative database rows.

## Migration order

1. `202608200001_core_foundation.sql` — organisations, people, memberships, seats, idempotency, attachments and audit.
2. `202608200002_garage_inventory.sql` — contacts, vehicles, catalogue, locations, stock, jobs and immutable job events.
3. `202608200003_commercial_accounting.sql` — commercial documents, periods, journal proposals and balanced posted journals.
4. `202608200004_pilot_security.sql` — controlled tenant bootstrap, document sequences, security evidence and disabled-by-default automation identities.
5. `202608200005_garage_api.sql` — atomic, idempotent and server-authoritative garage command/query functions for the standalone client.
6. `202608200006_garage_api_search_path.sql` — pins the garage command function to the controlled extension schema used for request hashing.
7. `202608200007_garage_api_self_test.sql` — executes authorization, command and idempotent-replay evidence inside a rolled-back PostgreSQL subtransaction.

## Verification status

The Supabase CLI is installed and this repository is linked to project reference
`wthabguvueewgtabjsdo`. Remote PostgreSQL executed all three migrations, and
`supabase db lint --linked --level warning` reported no schema errors on
2026-08-20. RLS behaviour, reset, rollback and restore remain unverified.

The local Docker stack has not been started because its storage location has not
been verified against the D:-only rule.

The repository-only structural check can be run without a database:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-cloud-schema.ps1
```

This repository-only check does not by itself prove remote PostgreSQL execution,
RLS behaviour or migration correctness. See
`docs/foundation/CLOUD-DEPLOYMENT-RECORD.md` for the remote evidence boundary.

## Cutover prohibition

Do not seed, import live data or enable pilot cutover until:

- schema and RLS review passes;
- a disposable reset succeeds;
- migration and rollback evidence exists;
- a restore rehearsal passes;
- founder authorizes the pilot cutover.
