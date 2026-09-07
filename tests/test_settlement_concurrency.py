#!/usr/bin/env python3
"""SERP-181: Settlement Allocation Concurrency & Over-Allocation Serialization Test.

Proves that:
1. Two concurrent transactions attempting to allocate MVR 80 each against a single
   MVR 100 payment and MVR 100 invoice are properly serialized by row-level locking.
2. Exactly one transaction succeeds and commits.
3. The second transaction blocks, re-reads the committed state, and fails with an
   over-allocation exception.
4. Total allocated amount in the database is strictly MVR 80 (never MVR 160).

Run:
  python tests/test_settlement_concurrency.py [--port PORT] [--simulate-unlocked]
"""

from __future__ import annotations

import argparse
import sys
import threading
import time

try:
    import psycopg2
except ImportError:
    try:
        import psycopg as psycopg2
    except ImportError:
        print("ERROR: psycopg2 or psycopg required for concurrency test", file=sys.stderr)
        sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="SERP-181 Settlement Concurrency Test")
    parser.add_argument("--host", default="127.0.0.1", help="PostgreSQL host")
    parser.add_argument("--port", type=int, default=54332, help="PostgreSQL port")
    parser.add_argument("--user", default="postgres", help="PostgreSQL user")
    parser.add_argument("--password", default="synthetic-serp181-only", help="PostgreSQL password")
    parser.add_argument("--dbname", default="postgres", help="PostgreSQL dbname")
    parser.add_argument("--simulate-unlocked", action="store_true", help="Simulate unlocked trigger (red proof)")
    return parser.parse_args()


def get_connection(args):
    return psycopg2.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        dbname=args.dbname,
    )


def run_concurrency_test(args):
    org_id = "00000000-0000-4000-8000-000000000001"
    person_id = "00000000-0000-4000-8000-000000000101"
    cust_id = "00000000-0000-4000-8000-000000000601"

    pay_id = "00000000-0000-4000-8000-000000007001"
    inv_id = "00000000-0000-4000-8000-000000007002"
    alloc_1 = "00000000-0000-4000-8000-000000007101"
    alloc_2 = "00000000-0000-4000-8000-000000007102"

    setup_conn = get_connection(args)
    setup_cur = setup_conn.cursor()

    if args.simulate_unlocked:
        # Red simulation: replace trigger with unlocked version (no FOR UPDATE)
        setup_cur.execute("""
            create or replace function app_private.assert_settlement_allocation_valid()
            returns trigger language plpgsql as $$
            declare
              pay_doc record;
              settled_doc record;
              prior_allocated_pay numeric(20, 6);
              prior_allocated_settled numeric(20, 6);
            begin
              -- Unlocked select (simulating read-committed race defect)
              select * into pay_doc from public.commercial_documents
               where organisation_id = new.organisation_id and id = new.payment_document_id;
              select * into settled_doc from public.commercial_documents
               where organisation_id = new.organisation_id and id = new.settled_document_id;

              select coalesce(sum(allocated_amount), 0) into prior_allocated_pay
                from public.settlement_allocations
               where organisation_id = new.organisation_id and payment_document_id = new.payment_document_id;

              if (prior_allocated_pay + new.allocated_amount) > pay_doc.gross_total then
                raise exception 'allocated amount % exceeds payment unallocated balance', new.allocated_amount;
              end if;
              return new;
            end;
            $$;
        """)
        setup_conn.commit()

    # Clean up test rows if present
    setup_cur.execute("delete from public.settlement_allocations where payment_document_id = %s or settled_document_id = %s", (pay_id, inv_id))
    setup_cur.execute("delete from public.commercial_documents where id in (%s, %s)", (pay_id, inv_id))
    setup_conn.commit()

    # Insert 100 MVR payment and 100 MVR invoice
    setup_cur.execute("""
        insert into public.commercial_documents
          (id, organisation_id, document_type, document_no, status, contact_id, currency, gross_total, issued_at, issued_by)
        values
          (%s, %s, 'payment', 'PAY-CONCUR-100', 'issued', %s, 'MVR', 100.000000, now(), %s),
          (%s, %s, 'sales_invoice', 'INV-CONCUR-100', 'issued', %s, 'MVR', 100.000000, now(), %s)
    """, (pay_id, org_id, cust_id, person_id, inv_id, org_id, cust_id, person_id))
    setup_conn.commit()
    setup_conn.close()

    barrier_start = threading.Barrier(2)
    results = {}
    errors = {}

    def worker(worker_id, alloc_id):
        conn = get_connection(args)
        cur = conn.cursor()
        try:
            cur.execute("BEGIN;")
            # Sync workers before insert
            barrier_start.wait()

            # Attempt to allocate 80 MVR
            cur.execute("""
                insert into public.settlement_allocations
                  (id, organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
                values
                  (%s, %s, %s, %s, 80.000000, 'MVR', %s)
            """, (alloc_id, org_id, pay_id, inv_id, person_id))

            # Artificial sleep while holding transaction to test locking serialization
            time.sleep(0.05)
            conn.commit()
            results[worker_id] = "COMMITTED"
        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            results[worker_id] = "FAILED"
            errors[worker_id] = str(e)
        finally:
            conn.close()

    t1 = threading.Thread(target=worker, args=("worker_1", alloc_1))
    t2 = threading.Thread(target=worker, args=("worker_2", alloc_2))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Verify final total in database
    verify_conn = get_connection(args)
    verify_cur = verify_conn.cursor()
    verify_cur.execute("select count(*), coalesce(sum(allocated_amount), 0) from public.settlement_allocations where payment_document_id = %s", (pay_id,))
    row_count, total_allocated = verify_cur.fetchone()
    verify_conn.close()

    print(f"Results: worker_1={results.get('worker_1')}, worker_2={results.get('worker_2')}")
    print(f"Database state: row_count={row_count}, total_allocated={total_allocated}")

    if args.simulate_unlocked:
        if row_count == 2 and total_allocated == 160.0:
            print("RED SIMULATION SUCCESS: Over-allocation defect reproduced (both workers committed MVR 80 totaling MVR 160).")
            sys.exit(1)
        else:
            print("RED SIMULATION FAILED: Defect was unexpectedly not reproduced.")
            sys.exit(0)

    # In production (locked) mode:
    # Exactly one worker must commit (80 MVR), and one must fail with over-allocation error.
    committed_count = sum(1 for status in results.values() if status == "COMMITTED")
    failed_count = sum(1 for status in results.values() if status == "FAILED")

    if committed_count == 1 and failed_count == 1 and total_allocated == 80.0:
        print("CONCURRENCY TEST PASS: Deterministic row locking serialized allocations. Total allocated is strictly MVR 80.")
        sys.exit(0)
    else:
        print(f"CONCURRENCY TEST FAIL: Expected 1 committed, 1 failed, 80 total. Got: committed={committed_count}, failed={failed_count}, total={total_allocated}", file=sys.stderr)
        for w_id, err in errors.items():
            print(f"  Error from {w_id}: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    run_concurrency_test(parse_args())
