/**
 * isRefreshTokenError — unit tests
 * Tests the logic inline so no native modules are needed.
 * Run: npx jest src/__tests__/auth.test.js
 */

// Inline the same logic as supabase.js so we can test it without native deps
const isRefreshTokenError = (e) => {
  if (!e) return false;
  const msg = (e?.message ?? '').toLowerCase();
  return (
    e?.name === 'AuthApiError' ||
    msg.includes('refresh token not found') ||
    msg.includes('invalid refresh token') ||
    msg.includes('token has expired') ||
    msg.includes('token is expired') ||
    e?.status === 400 ||
    e?.__isAuthError === true
  );
};

describe('isRefreshTokenError', () => {
  it('returns true for AuthApiError name', () => {
    const err = new Error('some message');
    err.name = 'AuthApiError';
    expect(isRefreshTokenError(err)).toBe(true);
  });

  it('returns true for "Refresh Token Not Found" message', () => {
    expect(isRefreshTokenError(new Error('Refresh Token Not Found'))).toBe(true);
  });

  it('returns true for "invalid refresh token" (case-insensitive)', () => {
    expect(isRefreshTokenError(new Error('Invalid Refresh Token'))).toBe(true);
  });

  it('returns true for "token has expired" message', () => {
    expect(isRefreshTokenError(new Error('token has expired'))).toBe(true);
  });

  it('returns true for status 400', () => {
    const err = new Error('bad request');
    err.status = 400;
    expect(isRefreshTokenError(err)).toBe(true);
  });

  it('returns true for __isAuthError flag', () => {
    const err = new Error('auth error');
    err.__isAuthError = true;
    expect(isRefreshTokenError(err)).toBe(true);
  });

  it('returns false for a normal network error', () => {
    expect(isRefreshTokenError(new Error('Network request failed'))).toBe(false);
  });

  it('returns false for a 500 server error', () => {
    const err = new Error('Internal Server Error');
    err.status = 500;
    expect(isRefreshTokenError(err)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRefreshTokenError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRefreshTokenError(undefined)).toBe(false);
  });
});
