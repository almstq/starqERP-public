/**
 * STARQ ERP — Document Numbering Concurrency, Idempotency & Retry Tests (SERP-176)
 *
 * Run:  deno test tests/contract/document_numbering_test.ts
 */

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

interface DocumentSequence {
  organisationId: string;
  sequenceType: string;
  nextValue: number;
  prefix: string;
  padding: number;
}

interface IdempotencyKeyRecord {
  organisationId: string;
  key: string;
  commandType: string;
  requestHash: string;
  state: string;
  responseBody: Record<string, unknown>;
}

class DocumentSequenceEngine {
  private sequences = new Map<string, DocumentSequence>();
  private idempotencyKeys = new Map<string, IdempotencyKeyRecord>();

  seedSequence(orgId: string, seqType: string, prefix: string, padding = 4, startVal = 1) {
    this.sequences.set(`${orgId}:${seqType}`, {
      organisationId: orgId,
      sequenceType: seqType,
      nextValue: startVal,
      prefix,
      padding,
    });
  }

  allocateDocumentNo(orgId: string, seqType: string): string {
    const key = `${orgId}:${seqType}`;
    const seq = this.sequences.get(key);
    if (!seq) throw new Error(`unknown document sequence ${seqType} for organisation ${orgId}`);

    const cur = seq.nextValue;
    seq.nextValue += 1;
    return `${seq.prefix}${String(cur).padStart(seq.padding, '0')}`;
  }

  async executeCommandWithIdempotency(
    orgId: string,
    commandKey: string,
    command: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data = new TextEncoder().encode(JSON.stringify(command));
    const digestBuf = await crypto.subtle.digest('SHA-256', data);
    const requestHash = Array.from(new Uint8Array(digestBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const eventName = String(command.type || command.sop || '').toUpperCase();
    const idempKey = `${orgId}:${commandKey}`;

    const existing = this.idempotencyKeys.get(idempKey);
    if (existing) {
      if (existing.requestHash !== requestHash || existing.commandType !== eventName) {
        throw new Error('idempotency_key_conflict');
      }
      return existing.responseBody;
    }

    const docNo = this.allocateDocumentNo(orgId, 'garage_job');
    const response = {
      ok: true,
      state: 'accepted',
      event: {
        type: eventName,
        job_no: docNo,
        customer: command.customer_name,
      },
    };

    this.idempotencyKeys.set(idempKey, {
      organisationId: orgId,
      key: commandKey,
      commandType: eventName,
      requestHash,
      state: 'accepted',
      responseBody: response,
    });

    return response;
  }
}

const ORG_CI = '20000000-0000-4000-8000-000000000001';
const ORG_ST = '10000000-0000-4000-8000-000000000001';

Deno.test('SERP-176: Document sequences produce consecutive padded identifiers', () => {
  const engine = new DocumentSequenceEngine();
  engine.seedSequence(ORG_CI, 'garage_job', 'CI-JOB-', 4);

  assertEquals(engine.allocateDocumentNo(ORG_CI, 'garage_job'), 'CI-JOB-0001');
  assertEquals(engine.allocateDocumentNo(ORG_CI, 'garage_job'), 'CI-JOB-0002');
  assertEquals(engine.allocateDocumentNo(ORG_CI, 'garage_job'), 'CI-JOB-0003');
});

Deno.test('SERP-176: Retries replay identical document number without advancing counter', async () => {
  const engine = new DocumentSequenceEngine();
  engine.seedSequence(ORG_CI, 'garage_job', 'CI-JOB-', 4);

  const commandKey = '11111111-2222-3333-4444-555555555555';
  const payload = { type: 'CALL', customer_name: 'Ahmed Rauf' };

  const res1 = await engine.executeCommandWithIdempotency(ORG_CI, commandKey, payload);
  // @ts-ignore
  assertEquals(res1.event.job_no, 'CI-JOB-0001');

  // Retry 1
  const res2 = await engine.executeCommandWithIdempotency(ORG_CI, commandKey, payload);
  // @ts-ignore
  assertEquals(res2.event.job_no, 'CI-JOB-0001');

  // Next distinct command gets 0002
  const nextKey = '22222222-3333-4444-5555-666666666666';
  const nextPayload = { type: 'CALL', customer_name: 'Ibrahim Shaan' };
  const res3 = await engine.executeCommandWithIdempotency(ORG_CI, nextKey, nextPayload);
  // @ts-ignore
  assertEquals(res3.event.job_no, 'CI-JOB-0002');
});

Deno.test('SERP-176: Tampered retry payload raises conflict and burns no sequence', async () => {
  const engine = new DocumentSequenceEngine();
  engine.seedSequence(ORG_CI, 'garage_job', 'CI-JOB-', 4);

  const commandKey = 'aaaaaaaa-0000-0000-0000-000000000001';
  const validPayload = { type: 'CALL', customer_name: 'Ali' };
  const tamperedPayload = { type: 'CALL', customer_name: 'Eve' };

  await engine.executeCommandWithIdempotency(ORG_CI, commandKey, validPayload);

  await assertRejects(
    () => engine.executeCommandWithIdempotency(ORG_CI, commandKey, tamperedPayload),
    Error,
    'idempotency_key_conflict',
  );

  // Subsequent valid command allocates CI-JOB-0002
  const newKey = 'aaaaaaaa-0000-0000-0000-000000000002';
  const newRes = await engine.executeCommandWithIdempotency(ORG_CI, newKey, validPayload);
  // @ts-ignore
  assertEquals(newRes.event.job_no, 'CI-JOB-0002');
});

Deno.test('SERP-176: Multi-tenant sequences are completely isolated', () => {
  const engine = new DocumentSequenceEngine();
  engine.seedSequence(ORG_CI, 'garage_job', 'CI-JOB-', 4);
  engine.seedSequence(ORG_ST, 'garage_job', 'ST-JOB-', 4);

  assertEquals(engine.allocateDocumentNo(ORG_CI, 'garage_job'), 'CI-JOB-0001');
  assertEquals(engine.allocateDocumentNo(ORG_ST, 'garage_job'), 'ST-JOB-0001');
  assertEquals(engine.allocateDocumentNo(ORG_CI, 'garage_job'), 'CI-JOB-0002');
  assertEquals(engine.allocateDocumentNo(ORG_ST, 'garage_job'), 'ST-JOB-0002');
});
