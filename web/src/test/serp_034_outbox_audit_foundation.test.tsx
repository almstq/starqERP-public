import { describe, it, expect } from 'vitest';
import {
  validateOutboxEvent,
  executeTransactionalMutationWithOutbox,
  TransactionalOutboxRecord,
} from '../../../contracts/commands';

describe('SERP-034: Append-Only Audit & Transactional Outbox Foundation', () => {
  const ORG = '20000000-0000-4000-8000-000000000001';

  it('validates outbox event payload requires tenant, aggregate, and event type', () => {
    const valid = validateOutboxEvent({
      organisationId: ORG,
      eventType: 'INVOICE_POSTED',
      aggregateType: 'invoice',
      aggregateId: 'INV-2026-999',
      payload: { total: 450.00 },
      status: 'pending',
    });
    expect(valid.valid).toBe(true);

    const invalid = validateOutboxEvent({
      organisationId: '',
      eventType: 'INVOICE_POSTED',
      aggregateType: '',
      aggregateId: '',
      payload: {},
    });
    expect(invalid.valid).toBe(false);
  });

  it('atomically commits business mutation with outbox event', () => {
    const outboxStore: TransactionalOutboxRecord[] = [];
    let invoiceCount = 0;

    const res = executeTransactionalMutationWithOutbox({
      organisationId: ORG,
      businessMutation: () => {
        invoiceCount++;
        return { ok: true, result: { invoiceId: `INV-${invoiceCount}` } };
      },
      outboxEvent: {
        eventType: 'INVOICE_CREATED',
        aggregateType: 'invoice',
        aggregateId: 'INV-1',
        payload: { amount: 1200 },
        actingSeat: 'counter',
      },
      outboxStore,
    });

    expect(res.ok).toBe(true);
    expect(invoiceCount).toBe(1);
    expect(outboxStore.length).toBe(1);
    expect(outboxStore[0].eventType).toBe('INVOICE_CREATED');
    expect(outboxStore[0].status).toBe('pending');
  });

  it('fails closed and records no outbox event if business mutation errors', () => {
    const outboxStore: TransactionalOutboxRecord[] = [];

    const res = executeTransactionalMutationWithOutbox({
      organisationId: ORG,
      businessMutation: () => {
        return { ok: false, error: 'credit_limit_exceeded' };
      },
      outboxEvent: {
        eventType: 'INVOICE_CREATED',
        aggregateType: 'invoice',
        aggregateId: 'INV-ERR',
        payload: {},
      },
      outboxStore,
    });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('credit_limit_exceeded');
    expect(outboxStore.length).toBe(0); // Zero half-applied events
  });
});
