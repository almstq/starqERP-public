import { describe, it, expect } from 'vitest';
import {
  formatSessionCookie,
  parseSessionCookie,
  validateSessionCookieLifecycle,
} from '../../../contracts/commands';

describe('SERP-027: Native Secure-Session Persistence Verification', () => {
  it('formats sb_ops cookie with HttpOnly, Secure, and SameSite=None', () => {
    const token = 'payload.signed_hmac_hash_123';
    const cookie = formatSessionCookie(token, { maxAge: 28800 });

    expect(cookie).toContain('sb_ops=payload.signed_hmac_hash_123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Max-Age=28800');
  });

  it('correctly extracts sb_ops token from multi-cookie header', () => {
    const header = 'theme=dark; sb_ops=target_session_token_xyz; analytics=0';
    const extracted = parseSessionCookie(header);
    expect(extracted).toBe('target_session_token_xyz');

    expect(parseSessionCookie('theme=dark;')).toBeNull();
  });

  it('evicts sb_ops cookie on unauthenticated 401 responses (Max-Age=0)', () => {
    const lifecycle = validateSessionCookieLifecycle({ action: 'unauthenticated_401' });
    expect(lifecycle.ok).toBe(true);
    expect(lifecycle.setCookieHeader).toContain('Max-Age=0');
    expect(lifecycle.setCookieHeader).toContain('sb_ops=');
  });

  it('evicts sb_ops cookie on valid logout with CSRF verification', () => {
    const failedLogout = validateSessionCookieLifecycle({
      action: 'logout',
      csrfToken: 'tampered',
      sessionCsrf: 'legitimate',
    });
    expect(failedLogout.ok).toBe(false);
    expect(failedLogout.error).toBe('csrf_mismatch');

    const successfulLogout = validateSessionCookieLifecycle({
      action: 'logout',
      csrfToken: 'legitimate',
      sessionCsrf: 'legitimate',
    });
    expect(successfulLogout.ok).toBe(true);
    expect(successfulLogout.setCookieHeader).toContain('Max-Age=0');
  });
});
