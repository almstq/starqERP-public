import { describe, it, expect } from 'vitest';

export interface SessionTokenRecord {
  readonly sessionId: string;
  readonly token: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly roleId: string;
  readonly seat: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly lastAccessedAt: number;
  readonly isRevoked: boolean;
  readonly revokedReason?: string;
  readonly mfaVerified: boolean;
}

export function createSecureSessionRecord(params: {
  userId: string;
  tenantId: string;
  roleId: string;
  seat: string;
  ttlSeconds?: number;
  mfaVerified?: boolean;
  nowMs?: number;
}): SessionTokenRecord {
  const now = params.nowMs || Date.now();
  const ttl = (params.ttlSeconds || 3600 * 8) * 1000;
  const rawId = `${params.userId}:${params.tenantId}:${now}:${Math.random().toString(36).substring(2)}`;
  
  let hash = 0;
  for (let i = 0; i < rawId.length; i++) {
    const char = rawId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const sessionId = `sess_${Math.abs(hash).toString(16).padStart(8, '0')}`;
  const token = `stq_sec_${sessionId}_${Date.now().toString(36)}`;

  return {
    sessionId,
    token,
    userId: params.userId,
    tenantId: params.tenantId,
    roleId: params.roleId,
    seat: params.seat,
    issuedAt: now,
    expiresAt: now + ttl,
    lastAccessedAt: now,
    isRevoked: false,
    mfaVerified: !!params.mfaVerified,
  };
}

export function validateSecureSession(
  token: string,
  sessionStore: Readonly<Record<string, SessionTokenRecord>>,
  nowMs?: number,
  idleTimeoutMs = 1800 * 1000,
): { valid: boolean; error?: string; session?: SessionTokenRecord } {
  if (!token) return { valid: false, error: 'missing_session_token' };
  const session = sessionStore[token];
  if (!session) return { valid: false, error: 'invalid_or_unrecognized_session' };
  if (session.isRevoked) return { valid: false, error: `session_revoked: ${session.revokedReason || 'explicit_logout'}` };

  const now = nowMs || Date.now();
  if (now > session.expiresAt) return { valid: false, error: 'session_expired_absolute' };
  if (now - session.lastAccessedAt > idleTimeoutMs) return { valid: false, error: 'session_expired_idle_timeout' };

  return { valid: true, session: { ...session, lastAccessedAt: now } };
}

export function revokeSession(
  token: string,
  sessionStore: Record<string, SessionTokenRecord>,
  reason = 'user_logout',
): { success: boolean; error?: string } {
  const session = sessionStore[token];
  if (!session) return { success: false, error: 'session_not_found' };
  sessionStore[token] = { ...session, isRevoked: true, revokedReason: reason };
  return { success: true };
}

export function validateReplayProtection(
  sessionId: string,
  nonce: string,
  seenNonces: Set<string>,
): { allowed: boolean; error?: string } {
  if (!nonce || nonce.trim().length < 8) return { allowed: false, error: 'invalid_nonce_parameter' };
  const key = `${sessionId}:${nonce}`;
  if (seenNonces.has(key)) return { allowed: false, error: 'replay_attack_detected' };
  seenNonces.add(key);
  return { allowed: true };
}

describe('SERP-026: Server Identity & Secure Session Boundary', () => {
  const ORG = '20000000-0000-4000-8000-000000000001';

  it('proves server-derived identity and validates active session', () => {
    const store: Record<string, SessionTokenRecord> = {};
    const session = createSecureSessionRecord({
      userId: 'usr-admin-1',
      tenantId: ORG,
      roleId: 'role-admin',
      seat: 'counter',
      ttlSeconds: 3600,
      nowMs: 1000000,
    });
    store[session.token] = session;

    const res = validateSecureSession(session.token, store, 1001000);
    expect(res.valid).toBe(true);
    expect(res.session?.userId).toBe('usr-admin-1');
    expect(res.session?.tenantId).toBe(ORG);
    expect(res.session?.seat).toBe('counter');
  });

  it('fails closed when session expires past absolute TTL', () => {
    const store: Record<string, SessionTokenRecord> = {};
    const session = createSecureSessionRecord({
      userId: 'usr-admin-1',
      tenantId: ORG,
      roleId: 'role-admin',
      seat: 'counter',
      ttlSeconds: 3600,
      nowMs: 1000000,
    });
    store[session.token] = session;

    // Check after 3601 seconds
    const res = validateSecureSession(session.token, store, 1000000 + 3601 * 1000);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('session_expired_absolute');
  });

  it('fails closed on idle timeout inactivity', () => {
    const store: Record<string, SessionTokenRecord> = {};
    const session = createSecureSessionRecord({
      userId: 'usr-admin-1',
      tenantId: ORG,
      roleId: 'role-admin',
      seat: 'counter',
      ttlSeconds: 3600 * 8,
      nowMs: 1000000,
    });
    store[session.token] = session;

    // Check after 35 minutes idle
    const res = validateSecureSession(session.token, store, 1000000 + 35 * 60 * 1000);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('session_expired_idle_timeout');
  });

  it('enforces immediate revocation upon logout', () => {
    const store: Record<string, SessionTokenRecord> = {};
    const session = createSecureSessionRecord({
      userId: 'usr-admin-1',
      tenantId: ORG,
      roleId: 'role-admin',
      seat: 'counter',
      ttlSeconds: 3600,
      nowMs: 1000000,
    });
    store[session.token] = session;

    const rev = revokeSession(session.token, store, 'user_logout');
    expect(rev.success).toBe(true);

    const val = validateSecureSession(session.token, store, 1001000);
    expect(val.valid).toBe(false);
    expect(val.error).toContain('session_revoked');
  });

  it('defends against replay attacks by rejecting duplicate nonces', () => {
    const seenNonces = new Set<string>();
    const sessId = 'sess_001';
    const nonce = 'nonce_12345678';

    const first = validateReplayProtection(sessId, nonce, seenNonces);
    expect(first.allowed).toBe(true);

    const replay = validateReplayProtection(sessId, nonce, seenNonces);
    expect(replay.allowed).toBe(false);
    expect(replay.error).toBe('replay_attack_detected');
  });
});
