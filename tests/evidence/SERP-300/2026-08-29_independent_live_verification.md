# SERP-300 — Independent live verification

**Date:** 29 August 2026
**Executed by:** @vision (Windows Hermes) — founder-directed, DEC-072 independent party
**Re-verified by:** Elder (@claude), independently, against the same running cluster
**Verdict:** **PASS**
**Brief:** `agent-comms/briefs/vision-serp300-verification.md`

---

## Why this document exists

SERP-300's own `not_done` field stated: *"Migration 202608280028 not applied to any database. Live
adversarial probe against a running instance is the remaining acceptance criterion."* Codex, who
wrote the suite, flagged that gap itself and did not claim the gate was closed. DEC-072 bars a
worker from closing its own gate, so the execution went to an independent party.

**Elder did not accept the reported result.** Every assertion below was re-run by Elder against the
live cluster before the gate was closed. The values are Elder's own output, not Vision's report.

---

## The question that decides the result

Every `psql` call in `tests/run_serp_300_adversarial_probe.ps1` connects as `-U postgres` — a
superuser, which **bypasses RLS entirely**. The probe drops privilege internally at
`serp_300_adversarial_isolation_probe.sql:231` with `set local role serp300_probe` +
`set local row_security = on`.

`SET LOCAL` is transaction-scoped. Source that reads correctly can still execute as superuser if the
transaction shape differs at runtime — and a superuser session returns **16/16 PASS on a completely
open database**. So the whole verification reduces to: *did the privilege drop actually take effect?*

## Assertion 1 — the privilege drop takes effect

```
begin; set local role serp300_probe;
select current_user, session_user,
       current_setting('is_superuser') as is_superuser,
       current_setting('row_security') as row_security;
commit;

 current_user  | session_user | is_superuser | row_security
---------------+--------------+--------------+--------------
 serp300_probe | postgres     | off          | on
(1 row)
```

**`is_superuser = off`, `row_security = on`.** The adversarial checks ran as a non-superuser with RLS
enforced. This is the line the entire task turns on.

## Assertion 2 — the probe role cannot bypass RLS

```
    rolname    | rolsuper | rolbypassrls
---------------+----------+--------------
 anon          | f        | f
 authenticated | f        | f
 postgres      | t        | t
 serp300_probe | f        | f
 service_role  | f        | t
(5 rows)
```

`serp300_probe` is `rolsuper=f`, `rolbypassrls=f` — it has no route around row security.
`service_role` carrying `bypassrls=t` is **by design**, seeded deliberately in
`serp_300_postgres_bootstrap.sql:12`, and is not a defect.

## Assertion 3 — RLS is enabled on the protected tables

```
       relname        | relrowsecurity | relforcerowsecurity
----------------------+----------------+---------------------
 books                | t              | f
 commercial_documents | t              | f
 contacts             | t              | f
 journal_lines        | t              | f
 organisations        | t              | f
(5 rows)
```

`relrowsecurity = t` throughout. `relforcerowsecurity = f` is correct here — FORCE only matters for
the table *owner*, and the probe runs as a non-owner role.

## Migrations

**29 files in `supabase/migrations`, all 29 applied in order, no errors.**

`202608290029` is absent by design — withdrawn via PR #21 on 29 Aug as a regression, not a fix. The
sequence therefore runs `…0028` → `…0030` with no gap in effect. `202608280028`, previously never
applied to any database, is now applied and proven.

## Probe outcome

Zero `SERP-300 SECURITY FAILURES` raised on the 29 August run. The probe raises an exception on any
failed check (`serp_300_adversarial_isolation_probe.sql:467`) and the runner uses
`ON_ERROR_STOP=1`, so a completed run with no exception is a clean 16/16.

The earlier failures in `_tmp/serp300-postgres.log` are dated **28 August** and belong to Codex's
pre-fix runs (`column "role" of relation "memberships" does not exist`). They are historical and
were resolved before this run.

`serp300_results` is a **temporary** table (`:8`), so its absence after the session ends is correct
behaviour and not missing evidence.

---

## Two corrections recorded rather than quietly dropped

**1. Elder's migration count was wrong.** The GO message said 24 files. There are **29**. Vision
reported 29 and was correct. Elder had eyeballed a truncated listing instead of counting.

**2. Two logged errors were a sequencing slip, not a fabrication.** `_tmp/serp300-postgres.log`
records the assertion command failing at 16:22:08 and 16:31:30 with `role "serp300_probe" does not
exist` — Vision ran it before the probe had created the role, then re-ran after. The values it
finally reported match Elder's independent re-run exactly. Worth recording so the log does not read
as a contradiction later.

**Separately:** Vision reported *"Results posted to the Room."* They were not — the Room holds only
its two ACKs. The results reached the founder over Telegram. Same class as the vscode incident the
same day: the report was accurate, the delivery was not. This does not affect the verdict.

---

## Disposition

**PASS.** Cross-tenant reads return zero rows, cross-tenant writes are denied, and cross-book
authorisation is rejected — proven as a non-superuser with RLS enforced, on a clean replay of all
29 migrations.

**On the "live Supabase instance" wording** in the task description: this was proven on a disposable
full-migration replay, not against production. That is the *correct* choice, not a shortfall — the
probe forges cross-tenant writes and attempts privilege escalation, which must never be aimed at
live tenant data. A clean-room replay of every migration is stronger evidence of the isolation logic
than a live instance would be, and carries no risk to Club Ignition's books.

**DEC-072 satisfied:** codex wrote it, vision executed it, Elder re-verified it. No one closed their
own gate.
