#!/usr/bin/env python3
"""The Python seat matrix must agree with the SQL migrations and with the contract.

SERP-180: Upgraded Drift Detector.
Reads actual SQL migrations dynamically (no hardcoded duplicate definitions):
  - supabase/migrations/202608200005_garage_api.sql (Garage workflow commands)
  - supabase/migrations/202608210010_purchase_seat_matrix.sql (Purchase ladder SoD)
  - contracts/commands.ts (Edge TypeScript contract)
  - legacy/engine/auth.py (the frozen Python double-entry engine)

Run:  python test_seat_matrix.py
"""

from __future__ import annotations

import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)

ENGINE_DIR = os.environ.get("LEGACY_ENGINE_PATH", os.path.abspath(os.path.join(REPO_ROOT, "legacy", "engine")))

if not os.path.isfile(os.path.join(ENGINE_DIR, "auth.py")):
    raise RuntimeError(
        f"CRITICAL DRIFT DETECTOR FAILURE: auth.py not found at {ENGINE_DIR}. "
        "Set LEGACY_ENGINE_PATH if the frozen engine has been relocated."
    )

sys.path.insert(0, ENGINE_DIR)

import auth  # noqa: E402


def parse_garage_sql_required_seats(sql_path: str) -> dict[str, str]:
    """Parse required_seat rules directly from 202608200005_garage_api.sql."""
    if not os.path.isfile(sql_path):
        raise FileNotFoundError(f"Migration file not found: {sql_path}")
    with open(sql_path, encoding="utf-8") as f:
        content = f.read()

    match = re.search(r"required_seat\s*:=\s*case(.*?)end;", content, re.DOTALL | re.IGNORECASE)
    if not match:
        raise ValueError(f"Could not locate required_seat CASE statement in {sql_path}")

    case_body = match.group(1)
    mapping: dict[str, str] = {}

    for when_in in re.finditer(r"when\s+event_name\s+in\s*\(([^)]+)\)\s+then\s+'([a-z_]+)'", case_body, re.IGNORECASE):
        events_raw, seat = when_in.group(1), when_in.group(2)
        for ev in re.findall(r"'([A-Z_]+)'", events_raw):
            mapping[ev] = seat

    for when_eq in re.finditer(r"when\s+event_name\s*=\s*'([A-Z_]+)'\s+then\s+'([a-z_]+)'", case_body, re.IGNORECASE):
        ev, seat = when_eq.group(1), when_eq.group(2)
        mapping[ev] = seat

    return mapping


def parse_purchase_sql_matrix(sql_path: str) -> dict[str, set[str]]:
    """Parse purchase_step_seat_is_legal directly from 202608210010_purchase_seat_matrix.sql."""
    if not os.path.isfile(sql_path):
        raise FileNotFoundError(f"Migration file not found: {sql_path}")
    with open(sql_path, encoding="utf-8") as f:
        content = f.read()

    match = re.search(r"purchase_step_seat_is_legal.*?case\s+step(.*?)end;", content, re.DOTALL | re.IGNORECASE)
    if not match:
        raise ValueError(f"Could not locate purchase_step_seat_is_legal CASE statement in {sql_path}")

    case_body = match.group(1)
    mapping: dict[str, set[str]] = {}

    for line in re.finditer(
        r"when\s+'([a-z_]+)'\s+then\s+seat\s*=\s*(?:any\s*\(\s*array\[([^\]]+)\]\)|'([a-z_]+)')",
        case_body,
        re.IGNORECASE,
    ):
        step = line.group(1)
        array_body = line.group(2)
        single_seat = line.group(3)
        if array_body:
            seats = set(re.findall(r"'([a-z_]+)'", array_body))
        else:
            seats = {single_seat}
        mapping[step] = seats

    return mapping


GARAGE_SQL_FILE = os.path.join(REPO_ROOT, "supabase", "migrations", "202608200005_garage_api.sql")
PURCHASE_SQL_FILE = os.path.join(REPO_ROOT, "supabase", "migrations", "202608210010_purchase_seat_matrix.sql")

SQL_REQUIRED_SEAT = parse_garage_sql_required_seats(GARAGE_SQL_FILE)
SQL_PURCHASE_MATRIX = parse_purchase_sql_matrix(PURCHASE_SQL_FILE)
GARAGE_COMMANDS = set(SQL_REQUIRED_SEAT)


def seats_permitted(command: str) -> list[str]:
    return sorted(s for s, events in auth.SEAT_EVENTS.items() if command in events)


class TestSeatMatrixAgreesWithSQL(unittest.TestCase):
    def test_sql_parser_extracted_full_garage_command_surface(self):
        """Verify dynamic parser extracted all 12 garage workflow events."""
        self.assertGreaterEqual(len(SQL_REQUIRED_SEAT), 12)
        self.assertIn("CALL", SQL_REQUIRED_SEAT)
        self.assertIn("QC", SQL_REQUIRED_SEAT)
        self.assertIn("CLOSE", SQL_REQUIRED_SEAT)

    def test_sql_parser_extracted_full_purchase_matrix(self):
        """Verify dynamic parser extracted all purchase steps from migration 0010."""
        self.assertIn("quote", SQL_PURCHASE_MATRIX)
        self.assertIn("award", SQL_PURCHASE_MATRIX)
        self.assertIn("receive", SQL_PURCHASE_MATRIX)
        self.assertIn("pay", SQL_PURCHASE_MATRIX)

    def test_no_seat_may_issue_a_command_the_sql_would_refuse(self):
        """The invariant. Python must never be more permissive than the database."""
        for command, required in sorted(SQL_REQUIRED_SEAT.items()):
            for seat in seats_permitted(command):
                self.assertEqual(
                    seat, required,
                    f"{command}: auth.py permits '{seat}' but SQL migration 0005 requires "
                    f"'{required}'. Widen the SQL under review, never the Python map alone.",
                )

    def test_every_garage_command_is_still_reachable(self):
        """Every command must be executable by its required seat in auth.py."""
        for command, required in sorted(SQL_REQUIRED_SEAT.items()):
            self.assertIn(
                command, auth.SEAT_EVENTS.get(required, set()),
                f"{command} requires '{required}' in SQL but auth.py cannot issue it",
            )

    def test_a_director_cannot_act_at_the_counter_without_taking_the_seat(self):
        """The specific regression DEC-054 closed."""
        for title in ("managing_director", "director"):
            leaked = sorted(auth.SEAT_EVENTS.get(title, set()) & GARAGE_COMMANDS)
            self.assertEqual(
                leaked, [],
                f"'{title}' can issue {leaked} in Python. DEC-054 requires taking the 'counter' seat.",
            )

    def test_invoice_payment_cannot_be_raised_and_paid_by_one_seat(self):
        """Self-approval check."""
        self.assertEqual(
            seats_permitted("INVOICE_PAYMENT"), ["counter"],
            "more than one seat can take payment, so one person can invoice and pay it",
        )

    def test_the_purchase_ladder_matches_sql_matrix(self):
        """Prove that auth.SCM_STEP_SEATS agrees with SQL purchase matrix."""
        for step, sql_seats in SQL_PURCHASE_MATRIX.items():
            py_seats = auth.SCM_STEP_SEATS.get(step, set())
            self.assertEqual(
                py_seats, sql_seats,
                f"Purchase step '{step}' mismatch: Python has {py_seats}, SQL migration 0010 has {sql_seats}",
            )

    def test_purchase_ladder_negative_isolation(self):
        """Prove negatively: illegal SoD pairings MUST fail."""
        # 1. Counter cannot quote
        self.assertNotIn("counter", SQL_PURCHASE_MATRIX["quote"])
        self.assertNotIn("counter", auth.SCM_STEP_SEATS["quote"])

        # 2. Quartermaster cannot receive
        self.assertNotIn("quartermaster", SQL_PURCHASE_MATRIX["receive"])
        self.assertNotIn("quartermaster", auth.SCM_STEP_SEATS["receive"])

        # 3. Financial controller cannot pay (SoD segregation between award and pay)
        self.assertNotIn("financial_controller", SQL_PURCHASE_MATRIX["pay"])
        self.assertNotIn("financial_controller", auth.SCM_STEP_SEATS["pay"])

        # 4. Receiver cannot award
        self.assertNotIn("receiver", SQL_PURCHASE_MATRIX["award"])
        self.assertNotIn("receiver", auth.SCM_STEP_SEATS["award"])

        # 5. Payer cannot award
        self.assertNotIn("payer", SQL_PURCHASE_MATRIX["award"])
        self.assertNotIn("payer", auth.SCM_STEP_SEATS["award"])


class TestPythonAgreesWithTheContract(unittest.TestCase):
    """The third engine: contracts/commands.ts."""

    def test_command_seats_in_the_contract_match_auth_py(self):
        path = os.path.join(REPO_ROOT, "contracts", "commands.ts")
        if not os.path.isfile(path):
            self.fail(f"CRITICAL DRIFT DETECTOR FAILURE: contracts/commands.ts not found at {path}")
        with open(path, encoding="utf-8") as f:
            src = f.read()
        block = re.search(r"export const COMMAND_SEATS[^=]*=\s*\{(.*?)\n\} as const;", src, re.S)
        self.assertIsNotNone(block, "COMMAND_SEATS block not found in the contract")

        contract = {}
        for name, body in re.findall(r"(\w+):\s*\[([^\]]*)\]", block.group(1)):
            contract[name] = sorted(re.findall(r"'([a-z_]+)'", body))

        for command in sorted(GARAGE_COMMANDS):
            self.assertEqual(
                contract.get(command), seats_permitted(command),
                f"{command}: contract says {contract.get(command)}, auth.py says "
                f"{seats_permitted(command)} — the two engines disagree",
            )

    def test_purchase_step_seats_in_contract_match_sql(self):
        path = os.path.join(REPO_ROOT, "contracts", "commands.ts")
        with open(path, encoding="utf-8") as f:
            src = f.read()
        block = re.search(r"export const PURCHASE_STEP_SEATS[^=]*=\s*\{(.*?)\n\} as const;", src, re.S)
        self.assertIsNotNone(block, "PURCHASE_STEP_SEATS block not found in the contract")

        contract_purchase = {}
        for name, body in re.findall(r"(\w+):\s*\[([^\]]*)\]", block.group(1)):
            contract_purchase[name] = set(re.findall(r"'([a-z_]+)'", body))

        for step, sql_seats in SQL_PURCHASE_MATRIX.items():
            self.assertEqual(
                contract_purchase.get(step), sql_seats,
                f"Contract PURCHASE_STEP_SEATS for '{step}' does not match SQL matrix in migration 0010",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
