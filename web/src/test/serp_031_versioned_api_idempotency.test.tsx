import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchCommand, apiGet, setCsrfToken, ApiError } from '../services/apiGateway';

describe('SERP-031: API Gateway — Command Dispatch & Query', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setCsrfToken('test-csrf-token');
  });

  it('dispatches command with correct headers and body shape', async () => {
    const mockResponse = { ok: true, data: { created: true } };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await dispatchCommand({
      command: 'CALL',
      payload: { customerPhone: '7770000' },
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/api\/ops\/event$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');

    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-csrf-token']).toBe('test-csrf-token');
    expect(headers['x-idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-client-version']).toBe('0.2.0');
    expect(headers['x-client-release-track']).toBe('beta');
    expect(headers['x-client-commit']).toBeDefined();

    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('CALL');
    expect(body.customerPhone).toBe('7770000');
    expect(result.ok).toBe(true);
  });

  it('includes scm_step when provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as Response);

    await dispatchCommand({
      command: 'PURCHASE',
      step: 'need',
      payload: { itemName: 'Test Item' },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.scm_step).toBe('need');
    expect(body.type).toBe('PURCHASE');
  });

  it('throws ApiError on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'seat_not_granted' }),
    } as Response);

    await expect(
      dispatchCommand({ command: 'INVOICE', payload: {} }),
    ).rejects.toThrow(ApiError);
  });

  it('apiGet sends GET with credentials', async () => {
    const mockData = { ok: true, customers: [] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as Response);

    const result = await apiGet('/api/ops/customers');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/api\/ops\/customers$/);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-client-version']).toBe('0.2.0');
    expect(headers['x-client-release-track']).toBe('beta');
    expect(headers['x-client-commit']).toBeDefined();
    expect(result).toEqual(mockData);
  });
});
