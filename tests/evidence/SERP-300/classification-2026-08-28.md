# SERP-300 clean-room classification evidence — 2026-08-28

Repository state used for this run:

- Branch: `codex/serp-300-adversarial-isolation`
- Worktree: `D:\StarqTech\worktrees\serp-300-codex`
- HEAD: `fda71811cdb77dea5e0f39eac9d09231ee1845bf`
- PostgreSQL: local disposable cluster, database `serp300`, port `55432`
- Migration input: every checked-in SQL migration from `202608200001` through `202608270027`, sorted by filename
- Live tenant data: not read

## Replay result

All 27 migrations applied successfully to a newly recreated synthetic database. PostgreSQL accepts both PL/pgSQL function definitions because the invalid column references are resolved when the statements execute, not when the function bodies are created.

## Exact behavioral results

The final result table from `tests/serp_300_adversarial_isolation_probe.sql` was:

| Attack/check | Exact clean-room result |
|---|---|
| Cross-tenant SELECT / UPDATE / DELETE / INSERT | All four passed: Tenant B remained invisible and immutable |
| Book A2 SELECT | `1 Book A2 rows` |
| Book A2 UPDATE | `1 rows affected` |
| Book A2 DELETE | `1 rows affected` |
| `accept_staff_invitation` mode | `SECURITY DEFINER` |
| Authenticated direct invitation invocation | `authenticated entered SECURITY DEFINER body: 42703: column "role" of relation "memberships" does not exist` |
| Invitation RPC service invocation | `42703: column "role" of relation "memberships" does not exist` |
| Invitation RPC schema contract | `7 missing: audit_events.details, audit_events.event_type, audit_events.person_id, book_memberships.created_at, membership_seats.created_at, memberships.role, memberships.updated_at` |
| `provision_approved_application` boundary | `SECURITY DEFINER; anon=f authenticated=f service_role=t` |
| Provisioning RPC service invocation | `42703: column "name" of relation "organisations" does not exist` |
| Provisioning RPC schema contract | `12 missing: business_names.is_primary, locations.atoll, locations.is_headquarters, locations.island, locations.status, memberships.role, organisations.name, workflow_stages.is_mandatory, workflow_stages.name, workflow_stages.required_role, workflow_stages.template_id, workflow_templates.is_active` |

The probe ended red with PostgreSQL exit code `3`, as required for an unfixed regression suite.

## Catalogue evidence for execution privileges

Fresh replay catalogue query:

| Function | Owner | `prosecdef` | ACL | anon | authenticated | service_role |
|---|---|---:|---|---:|---:|---:|
| `public.accept_staff_invitation(uuid,uuid,text)` | `postgres` | `true` | `NULL` | `true` | `true` | `true` |
| `platform.provision_approved_application(uuid,uuid)` | `postgres` | `true` | `{postgres=X/postgres,service_role=X/postgres}` | `false` | `false` | `true` |

A null function ACL retains PostgreSQL's default `PUBLIC EXECUTE`. The authenticated call was also executed under `SET LOCAL ROLE authenticated`; entering the body and reaching its invalid membership insert proves this was not only a catalogue interpretation.

## Policy evidence for Book A2

The only clean-room policy on `public.commercial_documents` was:

```text
commercial_documents_current | ALL | {public} | app_private.has_organisation_access(organisation_id)
```

Migration `0025` describes `book_memberships` as "Granular Book Access Control", but it does not replace or constrain this organisation-only policy after adding `commercial_documents.book_id`.

## Linked live-schema corroboration

The preserved read-only remote lint in `remote-db-lint-before.txt` independently reported:

- `platform.provision_approved_application`: SQLSTATE `42703`, `organisations.name` absent.
- `public.accept_staff_invitation`: SQLSTATE `42703`, `memberships.role` absent.

This lint is corroboration only. Classification is based on the disposable all-migration replay above.

## Classification

1. Unauthorized Book A2 SELECT / UPDATE / DELETE — **confirmed defect**.
2. Authenticated execution of invitation RPC — **confirmed defect**.
3. Invitation RPC live-schema error — **confirmed defect**.
4. Migration `0027` references fields absent from replay — **schema drift**.
5. Live functions reference nonexistent organisation/schema fields — **schema drift**, with confirmed runtime failure of the provisioning RPC.

No listed finding was a false positive. The older `legacy-rls-coverage-drift.txt` failure is a harness catalogue-maintenance artifact in the pre-existing SERP-124 probe and is not evidence against these classifications.
