#!/usr/bin/env python3
"""SERP-176: Document Numbering Real PostgreSQL Concurrency & Idempotency Probe.

Proves that:
1. 50 concurrent worker threads allocating document numbers produce strictly 50
   unique, gapless numbers with zero collisions or deadlocks.
2. Two concurrent requests presenting the SAME idempotency key consume strictly
   ONE sequence number, and both callers receive the identical document number.
3. Same key with altered payload triggers idempotency_key_conflict and consumes
   ZERO sequence numbers.
4. Red-first naive simulation reproduces duplicate numbers under concurrency.

Run:
  python tests/test_document_numbering_real_concurrency.py [--port PORT] [--simulate-naive]
"""

from __future__ import annotations

import argparse
import json
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
    parser = argparse.ArgumentParser(description="SERP-176 Document Numbering Real Concurrency Probe")
    parser.add_argument("--host", default="127.0.0.1", help="PostgreSQL host")
    parser.add_argument("--port", type=int, default=54333, help="PostgreSQL port")
    parser.add_argument("--user", default="postgres", help="PostgreSQL user")
    parser.add_argument("--password", default="synthetic-serp176-only", help="PostgreSQL password")
    parser.add_argument("--dbname", default="postgres", help="PostgreSQL dbname")
    parser.add_argument("--simulate-naive", action="store_true", help="Simulate naive unlocked sequence (red proof)")
    return parser.parse_args()


def get_connection(args):
    return psycopg2.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        dbname=args.dbname,
    )


def setup_fixtures(args):
    conn = get_connection(args)
    conn.autocommit = True
    cur = conn.cursor()

    org_a = "00000000-0000-4000-8000-000000000001"

    if args.simulate_naive:
        # RED-FIRST SIMULATION: Naive select-then-update without row-locking
        cur.execute("""
            create or replace function app_private.allocate_document_no(target_org uuid, target_type text)
            returns text language plpgsql security definer
            set search_path = public, pg_temp as $$
            declare
              current_value bigint;
              current_prefix text;
              current_padding integer;
            begin
              -- Naive race: SELECT without FOR UPDATE, small sleep, then UPDATE
              select next_value, prefix, padding
                into current_value, current_prefix, current_padding
                from public.document_sequences
               where organisation_id = target_org and sequence_type = target_type;

              if not found then
                raise exception 'unknown document sequence % for organisation %', target_type, target_org;
              end if;

              -- artificial context switch window
              perform pg_sleep(0.005);

              update public.document_sequences
                 set next_value = current_value + 1
               where organisation_id = target_org and sequence_type = target_type;

              return current_prefix || lpad(current_value::text, current_padding, '0');
            end
            $$;
        """)

    # Initialize sequence for 50 concurrent allocations test
    cur.execute("""
        insert into public.document_sequences (organisation_id, sequence_type, prefix, padding, next_value)
        values (%s, 'concurrent_job', 'CI-JOB-', 4, 1)
        on conflict (organisation_id, sequence_type) do update
          set next_value = 1, prefix = 'CI-JOB-', padding = 4;
    """, (org_a,))

    # Initialize sequence for idempotency test
    cur.execute("""
        insert into public.document_sequences (organisation_id, sequence_type, prefix, padding, next_value)
        values (%s, 'garage_job', 'CI-JOB-', 4, 100)
        on conflict (organisation_id, sequence_type) do update
          set next_value = 100, prefix = 'CI-JOB-', padding = 4;
    """, (org_a,))

    # Ensure counter seat is granted to person for Tenant A
    cur.execute("""
        insert into public.membership_seats (membership_id, seat_code)
        values ('00000000-0000-4000-8000-000000000201', 'counter')
        on conflict (membership_id, seat_code) do nothing;
    """)

    cur.close()
    conn.close()


def test_concurrent_allocations(args):
    print("\n--- Test 1: 50 Concurrent Document Number Allocations ---")
    org_a = "00000000-0000-4000-8000-000000000001"
    num_threads = 50
    allocated_numbers = []
    errors = []
    lock = threading.Lock()

    start_barrier = threading.Barrier(num_threads)

    def worker(worker_id):
        conn = None
        try:
            conn = get_connection(args)
            cur = conn.cursor()
            start_barrier.wait()  # synchronize thread start

            cur.execute("select app_private.allocate_document_no(%s, 'concurrent_job')", (org_a,))
            doc_no = cur.fetchone()[0]
            conn.commit()

            with lock:
                allocated_numbers.append(doc_no)
        except Exception as e:
            with lock:
                errors.append((worker_id, str(e)))
        finally:
            if conn:
                conn.close()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(num_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    if errors:
        print(f"FAILED: {len(errors)} worker threads threw errors: {errors[:3]}")
        return False

    unique_numbers = set(allocated_numbers)
    print(f"Total allocated: {len(allocated_numbers)}, Unique count: {len(unique_numbers)}")

    if len(allocated_numbers) != num_threads:
        print(f"FAILED: Expected {num_threads} allocations, got {len(allocated_numbers)}")
        return False

    if len(unique_numbers) != num_threads:
        duplicates = [num for num in unique_numbers if allocated_numbers.count(num) > 1]
        print(f"FAILED: Found {len(allocated_numbers) - len(unique_numbers)} duplicate allocations: {duplicates[:5]}")
        return False

    expected_set = {f"CI-JOB-{i:04d}" for i in range(1, num_threads + 1)}
    if unique_numbers != expected_set:
        print(f"FAILED: Set of allocated numbers did not match expected 1..{num_threads}")
        return False

    # Check database next_value
    conn = get_connection(args)
    cur = conn.cursor()
    cur.execute("select next_value from public.document_sequences where organisation_id = %s and sequence_type = 'concurrent_job'", (org_a,))
    next_val = cur.fetchone()[0]
    cur.close()
    conn.close()

    if next_val != num_threads + 1:
        print(f"FAILED: Database next_value is {next_val}, expected {num_threads + 1}")
        return False

    print("PASS: Exactly 50 unique gapless document numbers allocated under concurrency.")
    return True


def test_same_key_concurrent_idempotency(args):
    print("\n--- Test 2: Two Concurrent Same-Key CALL Idempotency Replays ---")
    org_a = "00000000-0000-4000-8000-000000000001"
    person_id = "00000000-0000-4000-8000-000000000101"
    key_id = "00000000-0000-4000-8000-000000009901"
    req_id = "00000000-0000-4000-8000-000000009902"
    payload = json.dumps({
        "type": "CALL",
        "customer_name": "Ali Test",
        "vehicle_reg": "AB1A-P01",
        "consent": True
    })

    results = []
    errors = []
    lock = threading.Lock()
    barrier = threading.Barrier(2)

    def worker(worker_id):
        conn = None
        try:
            conn = get_connection(args)
            cur = conn.cursor()
            barrier.wait()

            cur.execute("""
                select public.api_garage_command(
                    %s::uuid,
                    %s::uuid,
                    'counter'::text,
                    %s::uuid,
                    %s::jsonb,
                    %s::uuid
                )
            """, (org_a, person_id, key_id, payload, req_id))
            res = cur.fetchone()[0]
            conn.commit()

            with lock:
                results.append((worker_id, res))
        except Exception as e:
            with lock:
                errors.append((worker_id, str(e)))
        finally:
            if conn:
                conn.close()

    t1 = threading.Thread(target=worker, args=(1,))
    t2 = threading.Thread(target=worker, args=(2,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    if errors:
        print(f"FAILED: Errors during same-key concurrency: {errors}")
        return False

    if len(results) != 2:
        print(f"FAILED: Expected 2 results, got {len(results)}")
        return False

    res1 = results[0][1]
    res2 = results[1][1]

    if res1 != res2:
        print(f"FAILED: Responses did not match across concurrent callers: {res1} vs {res2}")
        return False

    job_no = None
    if isinstance(res1, dict):
        job_no = res1.get("job_no") or (res1.get("event", {}).get("job_no") if isinstance(res1.get("event"), dict) else None)
    print(f"Both callers received response with job_no: {job_no}")

    # Verify rows in DB: exactly 1 garage_jobs row and next_value incremented strictly once
    conn = get_connection(args)
    cur = conn.cursor()
    cur.execute("select count(*) from public.garage_jobs where organisation_id = %s and job_no = %s", (org_a, job_no))
    job_count = cur.fetchone()[0]

    cur.execute("select next_value from public.document_sequences where organisation_id = %s and sequence_type = 'garage_job'", (org_a,))
    seq_val = cur.fetchone()[0]
    cur.close()
    conn.close()

    if job_count != 1:
        print(f"FAILED: Expected 1 garage_jobs row, found {job_count}")
        return False

    if seq_val != 101:
        print(f"FAILED: Expected sequence next_value to be 101 (consumed exactly 1), got {seq_val}")
        return False

    print("PASS: Same-key concurrent retry consumed exactly 1 number and both callers received matching response.")
    return True


def test_idempotency_conflict_burns_zero_numbers(args):
    print("\n--- Test 3: Idempotency Key Conflict Burns Zero Numbers ---")
    org_a = "00000000-0000-4000-8000-000000000001"
    person_id = "00000000-0000-4000-8000-000000000101"
    key_id = "00000000-0000-4000-8000-000000009901"
    req_id = "00000000-0000-4000-8000-000000009903"
    altered_payload = json.dumps({
        "type": "CALL",
        "customer_name": "Different Tampered Name",
        "vehicle_reg": "AB1A-P99",
        "consent": True
    })

    conn = get_connection(args)
    cur = conn.cursor()

    cur.execute("select next_value from public.document_sequences where organisation_id = %s and sequence_type = 'garage_job'", (org_a,))
    initial_seq = cur.fetchone()[0]

    caught = False
    try:
        cur.execute("""
            select public.api_garage_command(
                %s::uuid,
                %s::uuid,
                'counter'::text,
                %s::uuid,
                %s::jsonb,
                %s::uuid
            )
        """, (org_a, person_id, key_id, altered_payload, req_id))
        conn.commit()
    except Exception as e:
        if "idempotency_key_conflict" in str(e):
            caught = True
        else:
            print(f"Unexpected exception: {e}")

    conn.rollback()

    cur.execute("select next_value from public.document_sequences where organisation_id = %s and sequence_type = 'garage_job'", (org_a,))
    final_seq = cur.fetchone()[0]
    cur.close()
    conn.close()

    if not caught:
        print("FAILED: Idempotency key tampering did not raise idempotency_key_conflict")
        return False

    if initial_seq != final_seq:
        print(f"FAILED: Sequence was advanced during conflict: {initial_seq} -> {final_seq}")
        return False

    print("PASS: Idempotency key conflict was rejected and burned 0 sequence numbers.")
    return True


def main():
    args = parse_args()
    setup_fixtures(args)

    pass1 = test_concurrent_allocations(args)
    if args.simulate_naive:
        if not pass1:
            print("\nRED PROOF PASS: Naive unlocked sequence allocation correctly reproduced duplicate numbers under concurrency.")
            sys.exit(0)
        else:
            print("\nRED PROOF FAILED: Naive simulation unexpectedly passed.")
            sys.exit(1)

    pass2 = test_same_key_concurrent_idempotency(args)
    pass3 = test_idempotency_conflict_burns_zero_numbers(args)

    if pass1 and pass2 and pass3:
        print("\nALL SERP-176 DOCUMENT NUMBERING CONCURRENCY & RETRY PROBES PASSED!")
        sys.exit(0)
    else:
        print("\nONE OR MORE PROBES FAILED!")
        sys.exit(1)


if __name__ == "__main__":
    main()
