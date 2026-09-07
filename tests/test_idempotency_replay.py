#!/usr/bin/env python3
"""SERP-182 real-path concurrency and canonical JSONB digest probe."""

from __future__ import annotations

import argparse
import json
import sys
import threading

try:
    import psycopg2
except ImportError:
    try:
        import psycopg as psycopg2
    except ImportError:
        print("ERROR: psycopg2 or psycopg is required", file=sys.stderr)
        sys.exit(1)


ORG_ID = "00000000-0000-4000-8000-000000000001"
PERSON_ID = "00000000-0000-4000-8000-000000000101"
MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000201"
CONCURRENT_KEY = "00000000-0000-4000-8000-000000008001"
CANONICAL_KEY = "00000000-0000-4000-8000-000000008002"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=54333)
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--password", default="synthetic-serp182-only")
    parser.add_argument("--dbname", default="postgres")
    return parser.parse_args()


def connect(args):
    return psycopg2.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        dbname=args.dbname,
    )


def call_command(conn, key: str, raw_command: str, request_id: str):
    with conn.cursor() as cur:
        cur.execute(
            "select public.api_garage_command(%s,%s,'counter',%s,%s::jsonb,%s)",
            (ORG_ID, PERSON_ID, key, raw_command, request_id),
        )
        return cur.fetchone()[0]


def prepare(args):
    conn = connect(args)
    with conn, conn.cursor() as cur:
        cur.execute(
            "insert into public.membership_seats(membership_id,seat_code) "
            "values (%s,'counter') on conflict do nothing",
            (MEMBERSHIP_ID,),
        )
        cur.execute(
            "insert into public.document_sequences(organisation_id,sequence_type,prefix) "
            "values (%s,'garage_job','SERP182-') on conflict do nothing",
            (ORG_ID,),
        )
        cur.execute(
            """
            create or replace function app_private.serp182_pause_first_insert()
            returns trigger language plpgsql as $$
            begin
              if new.key = '00000000-0000-4000-8000-000000008001'::uuid then
                perform pg_sleep(1);
              end if;
              return new;
            end;
            $$
            """
        )
        cur.execute("drop trigger if exists serp182_pause_insert on public.idempotency_keys")
        cur.execute(
            "create trigger serp182_pause_insert before insert on public.idempotency_keys "
            "for each row execute function app_private.serp182_pause_first_insert()"
        )
    conn.close()


def concurrency_probe(args):
    raw_command = json.dumps(
        {
            "type": "CALL",
            "customer_name": "Synthetic Concurrent Customer",
            "vehicle_reg": "SYN-182",
            "consent": True,
        },
        separators=(",", ":"),
    )
    barrier = threading.Barrier(2)
    responses: dict[str, object] = {}
    errors: dict[str, str] = {}

    def worker(name: str, request_id: str):
        conn = connect(args)
        try:
            barrier.wait()
            responses[name] = call_command(conn, CONCURRENT_KEY, raw_command, request_id)
            conn.commit()
        except Exception as exc:  # the baseline is expected to reach this path
            conn.rollback()
            errors[name] = str(exc)
        finally:
            conn.close()

    threads = [
        threading.Thread(
            target=worker,
            args=("worker_1", "00000000-0000-4000-8000-000000008101"),
        ),
        threading.Thread(
            target=worker,
            args=("worker_2", "00000000-0000-4000-8000-000000008102"),
        ),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
    if any(thread.is_alive() for thread in threads):
        raise RuntimeError("concurrent replay probe timed out")

    conn = connect(args)
    with conn, conn.cursor() as cur:
        cur.execute(
            "select count(*), count(distinct response_body::text) "
            "from public.idempotency_keys where organisation_id=%s and key=%s",
            (ORG_ID, CONCURRENT_KEY),
        )
        key_rows, distinct_responses = cur.fetchone()
        cur.execute(
            "select count(*) from public.job_events where organisation_id=%s and idempotency_key=%s",
            (ORG_ID, CONCURRENT_KEY),
        )
        event_rows = cur.fetchone()[0]
        cur.execute(
            "select count(*) from public.audit_events "
            "where organisation_id=%s and metadata->>'idempotency_key'=%s",
            (ORG_ID, CONCURRENT_KEY),
        )
        audit_rows = cur.fetchone()[0]
    conn.close()

    print(f"Concurrent responses={len(responses)} errors={len(errors)}")
    for name, error in errors.items():
        print(f"{name} error: {error}")
    print(
        f"Database state: idempotency_rows={key_rows}, distinct_responses={distinct_responses}, "
        f"job_events={event_rows}, audit_events={audit_rows}"
    )

    if errors:
        raise AssertionError("a concurrent retry surfaced an exception")
    if len(responses) != 2 or responses["worker_1"] != responses["worker_2"]:
        raise AssertionError("concurrent callers did not receive the same response")
    if (key_rows, distinct_responses, event_rows, audit_rows) != (1, 1, 1, 1):
        raise AssertionError("concurrent retry produced more than one durable mutation")


def canonical_order_probe(args):
    left = '{"type":"CALL","customer_name":"Synthetic Canonical Customer","vehicle_reg":"SYN-CANON","consent":true}'
    right = '{"consent":true,"vehicle_reg":"SYN-CANON","customer_name":"Synthetic Canonical Customer","type":"CALL"}'

    first_conn = connect(args)
    first = call_command(
        first_conn,
        CANONICAL_KEY,
        left,
        "00000000-0000-4000-8000-000000008201",
    )
    first_conn.commit()
    first_conn.close()

    second_conn = connect(args)
    second = call_command(
        second_conn,
        CANONICAL_KEY,
        right,
        "00000000-0000-4000-8000-000000008202",
    )
    second_conn.commit()
    second_conn.close()

    conflict = right.replace("SYN-CANON", "SYN-DIFFERENT")
    conflict_conn = connect(args)
    conflict_error = ""
    try:
        call_command(
            conflict_conn,
            CANONICAL_KEY,
            conflict,
            "00000000-0000-4000-8000-000000008203",
        )
        conflict_conn.commit()
    except Exception as exc:
        conflict_conn.rollback()
        conflict_error = str(exc)
    finally:
        conflict_conn.close()

    conn = connect(args)
    with conn, conn.cursor() as cur:
        cur.execute(
            "select %s::jsonb::text=%s::jsonb::text, "
            "encode(digest(%s::jsonb::text,'sha256'),'hex')="
            "encode(digest(%s::jsonb::text,'sha256'),'hex')",
            (left, right, left, right),
        )
        same_jsonb_text, same_digest = cur.fetchone()
    conn.close()

    print(
        f"Canonical JSONB order: same_text={same_jsonb_text}, "
        f"same_digest={same_digest}, same_response={first == second}"
    )
    if not (same_jsonb_text and same_digest and first == second):
        raise AssertionError("semantic JSON object key ordering changed the replay digest")
    if "idempotency_key_conflict" not in conflict_error:
        raise AssertionError("different payload under the same key was not rejected as a conflict")
    if "duplicate key" in conflict_error.lower():
        raise AssertionError("payload conflict leaked a raw primary-key violation")


def cleanup(args):
    conn = connect(args)
    with conn, conn.cursor() as cur:
        cur.execute("drop trigger if exists serp182_pause_insert on public.idempotency_keys")
        cur.execute("drop function if exists app_private.serp182_pause_first_insert()")
    conn.close()


def main():
    args = parse_args()
    prepare(args)
    try:
        canonical_order_probe(args)
        concurrency_probe(args)
    finally:
        cleanup(args)
    print("SERP-182 IDEMPOTENCY REPLAY PROBE: PASS")


if __name__ == "__main__":
    main()
