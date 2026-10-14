import { describe, expect, it } from 'vitest';
import { generateSigningKeyPair, getBearerToken, signSessionToken, verifySessionToken } from './session-token.js';

const keys = generateSigningKeyPair();
const NOW = 1_800_000_000;

function tokenFor(overrides: Partial<Parameters<typeof signSessionToken>[0]> = {}, privateKeyPem = keys.privateKeyPem) {
  return signSessionToken({ siteId: 'listenfairplay', subject: 'dev-code:test', ttlSeconds: 3600, now: NOW, ...overrides }, privateKeyPem).token;
}

describe('session tokens', () => {
  it('verifies a token it signed, with the expected claims', () => {
    const result = verifySessionToken(tokenFor(), keys.publicKeyPem, { siteId: 'listenfairplay', now: NOW + 10 });
    expect(result).toEqual({
      valid: true,
      claims: { iss: 'browse.show-auth', aud: 'listenfairplay', sub: 'dev-code:test', scope: 'subscriber', iat: NOW, exp: NOW + 3600 },
    });
  });

  it('rejects a token for another site', () => {
    expect(verifySessionToken(tokenFor(), keys.publicKeyPem, { siteId: 'libero', now: NOW })).toEqual({ valid: false, reason: 'wrong-audience' });
  });

  it('rejects an expired token (after the clock-skew allowance)', () => {
    const token = tokenFor();
    expect(verifySessionToken(token, keys.publicKeyPem, { siteId: 'listenfairplay', now: NOW + 3600 + 30 }).valid).toBe(true);
    expect(verifySessionToken(token, keys.publicKeyPem, { siteId: 'listenfairplay', now: NOW + 3600 + 61 })).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects a token issued in the future', () => {
    expect(verifySessionToken(tokenFor(), keys.publicKeyPem, { siteId: 'listenfairplay', now: NOW - 120 })).toEqual({ valid: false, reason: 'not-yet-valid' });
  });

  it('rejects a token signed with another key', () => {
    const other = generateSigningKeyPair();
    expect(verifySessionToken(tokenFor({}, other.privateKeyPem), keys.publicKeyPem, { siteId: 'listenfairplay', now: NOW })).toEqual({ valid: false, reason: 'bad-signature' });
  });

  it('rejects edited claims', () => {
    const [header, claims, signature] = tokenFor().split('.');
    const edited = JSON.parse(Buffer.from(claims, 'base64url').toString());
    edited.exp += 1_000_000;
    const tampered = [header, Buffer.from(JSON.stringify(edited)).toString('base64url'), signature].join('.');
    expect(verifySessionToken(tampered, keys.publicKeyPem, { siteId: 'listenfairplay', now: NOW })).toEqual({ valid: false, reason: 'bad-signature' });
  });

  it('rejects other algorithms, including `none`', () => {
    const [, claims] = tokenFor().split('.');
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifySessionToken(`${noneHeader}.${claims}.`, keys.publicKeyPem, { siteId: 'listenfairplay', now: NOW })).toEqual({ valid: false, reason: 'malformed' });
  });

  it('rejects malformed input', () => {
    for (const token of ['', 'abc', 'a.b', 'a.b.c', '%%%.%%%.%%%']) {
      expect(verifySessionToken(token, keys.publicKeyPem, { siteId: 'listenfairplay', now: NOW }).valid).toBe(false);
    }
  });
});

describe('getBearerToken', () => {
  it('reads the Authorization header, case-insensitively', () => {
    expect(getBearerToken({ authorization: 'Bearer abc.def.ghi' })).toBe('abc.def.ghi');
    expect(getBearerToken({ Authorization: 'bearer abc.def.ghi' })).toBe('abc.def.ghi');
  });

  it('returns null without a bearer token', () => {
    expect(getBearerToken(undefined)).toBeNull();
    expect(getBearerToken({})).toBeNull();
    expect(getBearerToken({ authorization: 'Basic xyz' })).toBeNull();
  });
});
