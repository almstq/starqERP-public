\set ON_ERROR_STOP on

-- =============================================================================
-- SERP-181: Settlement Allocation Behavioral Probe (Hardened)
-- Proves all acceptance criteria, refunds, credit notes, and negative constraints.
-- =============================================================================

begin;

-- Create temporary schema/fixtures for testing
do $$
declare
  org_a uuid := '00000000-0000-4000-8000-000000000001';
  org_b uuid := '00000000-0000-4000-8000-000000000002';
  person_id uuid := '00000000-0000-4000-8000-000000000101';
  cust_a uuid := '00000000-0000-4000-8000-000000000601';
  cust_b uuid := '00000000-0000-4000-8000-000000000602';

  inv1 uuid := '00000000-0000-4000-8000-000000003001';
  inv2 uuid := '00000000-0000-4000-8000-000000003002';
  inv3 uuid := '00000000-0000-4000-8000-000000003003';
  inv_usd uuid := '00000000-0000-4000-8000-000000003004';
  inv_draft uuid := '00000000-0000-4000-8000-000000003005';
  inv_b uuid := '00000000-0000-4000-8000-000000003006';

  pay1 uuid := '00000000-0000-4000-8000-000000004001';
  pay2 uuid := '00000000-0000-4000-8000-000000004002';
  pay3_unapplied uuid := '00000000-0000-4000-8000-000000004003';
  pay4_rev uuid := '00000000-0000-4000-8000-000000004004';
  pay_usd uuid := '00000000-0000-4000-8000-000000004005';

  exp_direct uuid := '00000000-0000-4000-8000-000000005001';
  exp_petty uuid := '00000000-0000-4000-8000-000000005002';
  exp_bank uuid := '00000000-0000-4000-8000-000000005003';
  pay_exp uuid := '00000000-0000-4000-8000-000000005004';

  cn1 uuid := '00000000-0000-4000-8000-000000005101';
  ref1 uuid := '00000000-0000-4000-8000-000000005102';

  alloc1 uuid := '00000000-0000-4000-8000-000000006001';
  alloc2 uuid := '00000000-0000-4000-8000-000000006002';
  alloc3 uuid := '00000000-0000-4000-8000-000000006003';
  alloc4 uuid := '00000000-0000-4000-8000-000000006004';
  alloc4_reversal uuid := '00000000-0000-4000-8000-000000006005';
  alloc_cn_inv uuid := '00000000-0000-4000-8000-000000006006';
  alloc_ref_cn uuid := '00000000-0000-4000-8000-000000006007';

  summary record;
  caught boolean;
begin
  -- Set session claims for Tenant A to exercise helper functions
  perform set_config('app.person_id', person_id::text, true);
  perform set_config('app.organisation_id', org_a::text, true);

  -- ---------------------------------------------------------------------------
  -- Fixtures: Create commercial documents across Tenant A & Tenant B
  -- ---------------------------------------------------------------------------
  insert into public.commercial_documents
    (id, organisation_id, document_type, document_no, status, contact_id, currency, gross_total, issued_at, issued_by)
  values
    (inv1, org_a, 'sales_invoice', 'INV-001', 'issued', cust_a, 'MVR', 600.000000, now(), person_id),
    (inv2, org_a, 'sales_invoice', 'INV-002', 'issued', cust_a, 'MVR', 800.000000, now(), person_id),
    (inv3, org_a, 'sales_invoice', 'INV-003', 'issued', cust_a, 'MVR', 500.000000, now(), person_id),
    (inv_usd, org_a, 'sales_invoice', 'INV-USD', 'issued', cust_a, 'USD', 100.000000, now(), person_id),
    (inv_draft, org_a, 'sales_invoice', 'INV-DRAFT', 'draft', cust_a, 'MVR', 300.000000, null, null),
    (inv_b, org_b, 'sales_invoice', 'INV-B-001', 'issued', cust_b, 'MVR', 1000.000000, now(), person_id),

    (pay1, org_a, 'payment', 'PAY-001', 'issued', cust_a, 'MVR', 1000.000000, now(), person_id),
    (pay2, org_a, 'payment', 'PAY-002', 'issued', cust_a, 'MVR', 400.000000, now(), person_id),
    (pay3_unapplied, org_a, 'payment', 'PAY-003', 'issued', cust_a, 'MVR', 500.000000, now(), person_id),
    (pay4_rev, org_a, 'payment', 'PAY-004', 'issued', cust_a, 'MVR', 500.000000, now(), person_id),
    (pay_usd, org_a, 'payment', 'PAY-USD', 'issued', cust_a, 'USD', 100.000000, now(), person_id),

    (exp_direct, org_a, 'direct_expense', 'EXP-001', 'issued', cust_a, 'MVR', 250.000000, now(), person_id),
    (exp_petty, org_a, 'petty_cash_voucher', 'PCV-001', 'issued', cust_a, 'MVR', 150.000000, now(), person_id),
    (exp_bank, org_a, 'bank_charge', 'BNK-001', 'issued', null, 'MVR', 25.000000, now(), person_id),
    (pay_exp, org_a, 'payment', 'PAY-EXP', 'issued', null, 'MVR', 425.000000, now(), person_id),

    (cn1, org_a, 'credit_note', 'CN-001', 'issued', cust_a, 'MVR', 300.000000, now(), person_id),
    (ref1, org_a, 'refund', 'REF-001', 'issued', cust_a, 'MVR', 200.000000, now(), person_id);

  -- ---------------------------------------------------------------------------
  -- TEST 1: Many-to-many allocation (1 Payment settling 2 Invoices)
  -- ---------------------------------------------------------------------------
  -- PAY-001 (1000 MVR) -> INV-001 (600 MVR) and INV-002 (400 MVR of 800)
  insert into public.settlement_allocations
    (id, organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
  values
    (alloc1, org_a, pay1, inv1, 600.000000, 'MVR', person_id),
    (alloc2, org_a, pay1, inv2, 400.000000, 'MVR', person_id);

  select * into summary from app_private.get_document_settlement_summary(org_a, pay1);
  if summary.allocated_total <> 1000.000000 or summary.unallocated_balance <> 0.000000 or summary.settlement_status <> 'fully_settled' then
    raise exception 'TEST 1 FAILED: pay1 settlement summary incorrect: %', row_to_json(summary);
  end if;

  select * into summary from app_private.get_document_settlement_summary(org_a, inv1);
  if summary.allocated_total <> 600.000000 or summary.unallocated_balance <> 0.000000 or summary.settlement_status <> 'fully_settled' then
    raise exception 'TEST 1 FAILED: inv1 settlement summary incorrect: %', row_to_json(summary);
  end if;

  select * into summary from app_private.get_document_settlement_summary(org_a, inv2);
  if summary.allocated_total <> 400.000000 or summary.unallocated_balance <> 400.000000 or summary.settlement_status <> 'partially_allocated' then
    raise exception 'TEST 1 FAILED: inv2 settlement summary incorrect: %', row_to_json(summary);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 2: Many-to-many allocation (2nd Payment settling remainder of Invoice 2)
  -- ---------------------------------------------------------------------------
  -- PAY-002 (400 MVR) -> INV-002 (remaining 400 MVR)
  insert into public.settlement_allocations
    (id, organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
  values
    (alloc3, org_a, pay2, inv2, 400.000000, 'MVR', person_id);

  select * into summary from app_private.get_document_settlement_summary(org_a, inv2);
  if summary.allocated_total <> 800.000000 or summary.unallocated_balance <> 0.000000 or summary.settlement_status <> 'fully_settled' then
    raise exception 'TEST 2 FAILED: inv2 full settlement incorrect: %', row_to_json(summary);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 3: Unapplied payment sitting on account
  -- ---------------------------------------------------------------------------
  select * into summary from app_private.get_document_settlement_summary(org_a, pay3_unapplied);
  if summary.allocated_total <> 0.000000 or summary.unallocated_balance <> 500.000000 or summary.settlement_status <> 'unallocated' then
    raise exception 'TEST 3 FAILED: pay3_unapplied summary incorrect: %', row_to_json(summary);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 4: Direct Expenses, Petty Cash Voucher & Bank Charge settlement
  -- ---------------------------------------------------------------------------
  insert into public.settlement_allocations
    (organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
  values
    (org_a, pay_exp, exp_direct, 250.000000, 'MVR', person_id),
    (org_a, pay_exp, exp_petty, 150.000000, 'MVR', person_id),
    (org_a, pay_exp, exp_bank, 25.000000, 'MVR', person_id);

  select * into summary from app_private.get_document_settlement_summary(org_a, pay_exp);
  if summary.allocated_total <> 425.000000 or summary.unallocated_balance <> 0.000000 or summary.settlement_status <> 'fully_settled' then
    raise exception 'TEST 4 FAILED: pay_exp summary incorrect: %', row_to_json(summary);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Immutable Reversal records & balance restoration
  -- ---------------------------------------------------------------------------
  -- 1) Allocate PAY-004 to INV-003
  insert into public.settlement_allocations
    (id, organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
  values
    (alloc4, org_a, pay4_rev, inv3, 500.000000, 'MVR', person_id);

  select * into summary from app_private.get_document_settlement_summary(org_a, inv3);
  if summary.unallocated_balance <> 0.000000 or summary.settlement_status <> 'fully_settled' then
    raise exception 'TEST 5 FAILED: inv3 should be settled prior to reversal';
  end if;

  -- 2) Reverse allocation
  insert into public.settlement_allocations
    (id, organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by, reversal_of, reversal_reason)
  values
    (alloc4_reversal, org_a, pay4_rev, inv3, 500.000000, 'MVR', person_id, alloc4, 'Customer check bounced');

  select * into summary from app_private.get_document_settlement_summary(org_a, inv3);
  if summary.allocated_total <> 0.000000 or summary.unallocated_balance <> 500.000000 or summary.settlement_status <> 'unallocated' then
    raise exception 'TEST 5 FAILED: inv3 unallocated balance not restored after reversal: %', row_to_json(summary);
  end if;

  select * into summary from app_private.get_document_settlement_summary(org_a, pay4_rev);
  if summary.allocated_total <> 0.000000 or summary.unallocated_balance <> 500.000000 or summary.settlement_status <> 'unallocated' then
    raise exception 'TEST 5 FAILED: pay4 unallocated balance not restored after reversal: %', row_to_json(summary);
  end if;

  -- ---------------------------------------------------------------------------
  -- TEST 6: Credit Note & Outbound Refund settlement
  -- ---------------------------------------------------------------------------
  -- 1) Apply MVR 100 of CN-001 (credit note) to INV-003
  insert into public.settlement_allocations
    (id, organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
  values
    (alloc_cn_inv, org_a, cn1, inv3, 100.000000, 'MVR', person_id);

  select * into summary from app_private.get_document_settlement_summary(org_a, cn1);
  if summary.allocated_total <> 100.000000 or summary.unallocated_balance <> 200.000000 or summary.settlement_status <> 'partially_allocated' then
    raise exception 'TEST 6 FAILED: cn1 partial allocation incorrect: %', row_to_json(summary);
  end if;

  -- 2) Pay out remaining MVR 200 of CN-001 via outbound REF-001 (refund instrument)
  insert into public.settlement_allocations
    (id, organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
  values
    (alloc_ref_cn, org_a, ref1, cn1, 200.000000, 'MVR', person_id);

  select * into summary from app_private.get_document_settlement_summary(org_a, ref1);
  if summary.allocated_total <> 200.000000 or summary.unallocated_balance <> 0.000000 or summary.settlement_status <> 'fully_settled' then
    raise exception 'TEST 6 FAILED: ref1 refund instrument settlement incorrect: %', row_to_json(summary);
  end if;

  select * into summary from app_private.get_document_settlement_summary(org_a, cn1);
  if summary.allocated_total <> 300.000000 or summary.unallocated_balance <> 0.000000 or summary.settlement_status <> 'fully_settled' then
    raise exception 'TEST 6 FAILED: cn1 full settlement via refund incorrect: %', row_to_json(summary);
  end if;

  -- ---------------------------------------------------------------------------
  -- NEGATIVE BEHAVIORAL PROOFS
  -- ---------------------------------------------------------------------------

  -- Negative 1: Direct UPDATE rejection (Append-only enforcement)
  caught := false;
  begin
    update public.settlement_allocations set allocated_amount = 999 where id = alloc1;
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 1 FAILED: UPDATE on settlement_allocations was not rejected';
  end if;

  -- Negative 2: Direct DELETE rejection (Append-only enforcement)
  caught := false;
  begin
    delete from public.settlement_allocations where id = alloc1;
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 2 FAILED: DELETE on settlement_allocations was not rejected';
  end if;

  -- Negative 3: Currency mismatch rejection (USD payment to MVR invoice)
  caught := false;
  begin
    insert into public.settlement_allocations
      (organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
    values
      (org_a, pay_usd, inv1, 100.000000, 'USD', person_id);
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 3 FAILED: Currency mismatch was not rejected';
  end if;

  -- Negative 4: Self-allocation rejection (allocating document to itself)
  caught := false;
  begin
    insert into public.settlement_allocations
      (organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
    values
      (org_a, pay1, pay1, 100.000000, 'MVR', person_id);
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 4 FAILED: Self-allocation was not rejected';
  end if;

  -- Negative 5: Draft document allocation rejection
  caught := false;
  begin
    insert into public.settlement_allocations
      (organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
    values
      (org_a, pay3_unapplied, inv_draft, 100.000000, 'MVR', person_id);
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 5 FAILED: Allocation against draft document was not rejected';
  end if;

  -- Negative 6: Over-allocation rejection (Payment balance exceeded)
  caught := false;
  begin
    insert into public.settlement_allocations
      (organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
    values
      (org_a, pay1, inv3, 100.000000, 'MVR', person_id); -- pay1 is already 1000/1000 allocated
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 6 FAILED: Over-allocation on payment was not rejected';
  end if;

  -- Negative 7: Non-positive amount rejection
  caught := false;
  begin
    insert into public.settlement_allocations
      (organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
    values
      (org_a, pay3_unapplied, inv3, 0.000000, 'MVR', person_id);
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 7 FAILED: Zero allocated_amount was not rejected';
  end if;

  -- Negative 8: Cross-tenant foreign key rejection
  caught := false;
  begin
    insert into public.settlement_allocations
      (organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
    values
      (org_a, pay3_unapplied, inv_b, 100.000000, 'MVR', person_id);
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 8 FAILED: Cross-tenant document reference was not rejected by composite FK';
  end if;

  -- Negative 9: Invalid document role rejection (Refund settling an Invoice)
  caught := false;
  begin
    insert into public.settlement_allocations
      (organisation_id, payment_document_id, settled_document_id, allocated_amount, currency, allocated_by)
    values
      (org_a, ref1, inv3, 50.000000, 'MVR', person_id);
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 9 FAILED: Refund instrument settling an invoice was not rejected';
  end if;

  -- Negative 10: Security check — helper access denied without tenant membership
  perform set_config('app.organisation_id', '00000000-0000-4000-8000-000000000099', true);
  caught := false;
  begin
    perform * from app_private.get_document_settlement_summary('00000000-0000-4000-8000-000000000099', inv1);
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception 'NEGATIVE TEST 10 FAILED: Helper function allowed execution without tenant membership';
  end if;

end $$;

rollback;

select 'SETTLEMENT ALLOCATION BEHAVIORAL PROBE: ALL 16 SUITES PASSED (6 POSITIVE, 10 NEGATIVE)' as probe_result;
