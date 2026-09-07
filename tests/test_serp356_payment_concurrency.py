#!/usr/bin/env python3
"""SERP-356 — payment concurrency: the races the single-session probe cannot reach.

serp_356_payment_failure_modes_probe.sql proves twelve failure modes are guarded,
but every case there runs in ONE session. A constraint that holds against a single
writer can still lose to two, and the two that matter for money are:

  1. TWO REFUNDS RACING THE CEILING GUARD.
     app_private.assert_refund_within_capture reads prior refunds, then decides.
     Read-then-decide is the classic lost-update shape: if both transactions read
     "0 refunded" before either commits, both may conclude there is room, and the
     intent ends up over-refunded with each refund individually valid.

  2. TWO WRITERS ON ONE SETTLEMENT BATCH.
     unique (organisation_id, provider_id, batch_reference) should mean a batch
     settles once. A unique index genuinely serialises, so this is the control:
     if case 1 fails and case 2 passes, the difference isolates the defect to the
     read-then-decide guard rather than to the harness.

WHAT A PASS MEANS: exactly one transaction commits, the other is refused, and the
database is left holding the correct total. Not "no error" — the stored total is
checked afterwards, because the failure mode is silent.

Run against a database with all migrations applied:
  python tests/test_serp356_payment_concurrency.py [--port 55432] [--db serp356conc]
"""

from __future__ import annotations

import argparse
import sys
import threading
import uuid

try:
    import psycopg2
except ImportError:  # pragma: no cover
    try:
        import psycopg as psycopg2
    except ImportError:
        print("ERROR: psycopg2 or psycopg required", file=sys.stderr)
        sys.exit(1)

ORG = "10000000-0000-4000-8000-000000000001"
WHO = "35600000-0000-4000-8000-0000000000ff"


def connect(args):
    return psycopg2.connect(
        host=args.host, port=args.port, dbname=args.db, user=args.user
    )


def setup(conn, intent_id):
    """A person, a provider, an intent captured at 100000, one attempt."""
    cur = conn.cursor()
    cur.execute(
        "insert into public.persons (id, person_key, display_label) values (%s,%s,%s) "
        "on conflict (id) do nothing",
        (WHO, "serp356-conc", "SERP-356 Concurrency Actor"),
    )
    cur.execute(
        "insert into public.payment_providers (id, display_name, spec_status) "
        "values ('MOCK','Mock Provider','IMPLEMENTED') on conflict (id) do nothing"
    )
    cur.execute(
        "insert into public.payment_intents "
        "(id, organisation_id, provider_id, status, amount, currency, created_by) "
        "values (%s,%s,'MOCK','succeeded',100000,'MVR',%s)",
        (intent_id, ORG, WHO),
    )
    cur.execute(
        "insert into public.payment_attempts "
        "(id, organisation_id, intent_id, provider_id, status, amount, currency, provider_reference) "
        "values (%s,%s,%s,'MOCK','succeeded',100000,'MVR',%s)",
        (str(uuid.uuid4()), ORG, intent_id, "CONC-CAPTURE-1"),
    )
    conn.commit()


def race(args, work, n=2):
    """Run `work` in n threads released simultaneously. Returns per-thread outcomes."""
    barrier = threading.Barrier(n)
    outcomes: list[tuple[int, bool, str]] = []
    lock = threading.Lock()

    def runner(i):
        conn = connect(args)
        try:
            cur = conn.cursor()
            cur.execute("begin")
            barrier.wait()  # both threads inside a transaction before either writes
            work(cur, i)
            conn.commit()
            with lock:
                outcomes.append((i, True, "committed"))
        except Exception as exc:  # noqa: BLE001 — the refusal is the result
            conn.rollback()
            with lock:
                outcomes.append((i, False, type(exc).__name__ + ": " + str(exc).strip().split("\n")[0]))
        finally:
            conn.close()

    threads = [threading.Thread(target=runner, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    return sorted(outcomes)


def case_refund_ceiling(args) -> bool:
    """Two refunds of 60,000 each against a 100,000 capture. Only one may land."""
    intent_id = str(uuid.uuid4())
    conn = connect(args)
    setup(conn, intent_id)
    conn.close()

    def work(cur, i):
        cur.execute(
            "insert into public.payment_refunds "
            "(id, organisation_id, intent_id, provider_id, status, amount, currency, reason, requested_by) "
            "values (%s,%s,%s,'MOCK','created',60000,'MVR',%s,%s)",
            (str(uuid.uuid4()), ORG, intent_id, f"Concurrency probe refund {i}", WHO),
        )

    outcomes = race(args, work)
    committed = [o for o in outcomes if o[1]]

    conn = connect(args)
    cur = conn.cursor()
    cur.execute(
        "select coalesce(sum(amount),0) from public.payment_refunds where intent_id = %s",
        (intent_id,),
    )
    total = cur.fetchone()[0]
    conn.close()

    print("\n1. TWO REFUNDS RACING THE CEILING GUARD")
    print("   capture 100000, two concurrent refunds of 60000 each")
    for i, ok, msg in outcomes:
        print(f"   thread {i}: {'COMMITTED' if ok else 'refused'} — {msg[:96]}")
    print(f"   total refunded now: {total}")

    ok = len(committed) == 1 and total <= 100000
    if ok:
        print("   PASS — exactly one refund landed and the capture is not exceeded")
    else:
        print(f"   FAIL — {len(committed)} committed, total {total} against a capture of 100000")
        print("   The ceiling guard reads prior refunds then decides; under concurrency")
        print("   both transactions can read the same prior state and both conclude")
        print("   there is room. The guard needs a lock on the intent row, or the")
        print("   refund total needs a constraint that cannot be raced.")
    return ok


def case_settlement_batch(args) -> bool:
    """Two writers on one batch reference. The unique index should serialise them."""
    batch = "CONC-BATCH-" + uuid.uuid4().hex[:8]

    def work(cur, i):
        cur.execute(
            "insert into public.payment_settlements "
            "(id, organisation_id, provider_id, batch_reference, gross_amount, fee_amount, net_amount, currency, settled_at) "
            "values (%s,%s,'MOCK',%s,100000,500,99500,'MVR',now())",
            (str(uuid.uuid4()), ORG, batch),
        )

    outcomes = race(args, work)
    committed = [o for o in outcomes if o[1]]

    conn = connect(args)
    cur = conn.cursor()
    cur.execute(
        "select count(*) from public.payment_settlements where batch_reference = %s",
        (batch,),
    )
    rows = cur.fetchone()[0]
    conn.close()

    print("\n2. TWO WRITERS ON ONE SETTLEMENT BATCH  (control case)")
    print(f"   batch {batch}, two concurrent inserts")
    for i, ok, msg in outcomes:
        print(f"   thread {i}: {'COMMITTED' if ok else 'refused'} — {msg[:96]}")
    print(f"   rows stored for this batch: {rows}")

    ok = len(committed) == 1 and rows == 1
    print("   PASS — the unique index serialised them" if ok
          else f"   FAIL — {len(committed)} committed, {rows} rows stored")
    return ok


def main() -> int:
    ap = argparse.ArgumentParser(description="SERP-356 payment concurrency")
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=55432)
    ap.add_argument("--db", default="serp356conc")
    ap.add_argument("--user", default="postgres")
    args = ap.parse_args()

    print("SERP-356 — payment concurrency")
    print(f"target: {args.host}:{args.port}/{args.db}")

    results = [case_refund_ceiling(args), case_settlement_batch(args)]

    print("\n" + "=" * 66)
    if all(results):
        print("SERP-356 CONCURRENCY: PASS — both races serialise correctly")
        return 0
    print("SERP-356 CONCURRENCY: FAIL — see the case above")
    print("A read-then-decide guard that holds for one writer and loses to two is")
    print("the most expensive kind of defect here: every individual refund looks")
    print("valid, and the total is only wrong when someone reconciles.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
