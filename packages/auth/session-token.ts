import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';

/**
 * Subscriber session tokens: compact JWTs signed with Ed25519 (`alg: EdDSA`).
 *
 * The shared auth lambda signs them with the private key (kept in SSM). Each site's subscriber
 * lambda verifies them with the public key (an env var), so verifying needs no network call.
 */

export const SESSION_TOKEN_ISSUER = 'browse.show-auth';

export type SessionScope = 'subscriber';

export interface SessionClaims {
  /** Always SESSION_TOKEN_ISSUER */
  iss: string;
  /** Site ID the token is valid for, e.g. `listenfairplay` */
  aud: string;
  /** `<provider>:<provider user ID>`, e.g. `supporting-cast:123` or `dev-code:jack` */
  sub: string;
  scope: SessionScope;
  /** Issued at, in seconds since the epoch */
  iat: number;
  /** Expires at, in seconds since the epoch */
  exp: number;
}

export type VerifyResult =
  | { valid: true; claims: SessionClaims }
  | { valid: false; reason: 'malformed' | 'bad-signature' | 'wrong-issuer' | 'wrong-audience' | 'expired' | 'not-yet-valid' };

const HEADER = { alg: 'EdDSA', typ: 'JWT' };
/** Tolerance for clock differences between the auth lambda and a site lambda */
const CLOCK_SKEW_SECONDS = 60;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function toPrivateKey(key: string | KeyObject): KeyObject {
  return typeof key === 'string' ? createPrivateKey(key) : key;
}

function toPublicKey(key: string | KeyObject): KeyObject {
  return typeof key === 'string' ? createPublicKey(key) : key;
}

/** A new Ed25519 key pair, as PEM strings (for `bds` setup; the private key goes in SSM) */
export function generateSigningKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export interface SignSessionTokenOptions {
  siteId: string;
  subject: string;
  scope?: SessionScope;
  /** Lifetime in seconds */
  ttlSeconds: number;
  /** Seconds since the epoch; defaults to now */
  now?: number;
}

export function signSessionToken(options: SignSessionTokenOptions, privateKey: string | KeyObject): { token: string; claims: SessionClaims } {
  const iat = options.now ?? Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    iss: SESSION_TOKEN_ISSUER,
    aud: options.siteId,
    sub: options.subject,
    scope: options.scope ?? 'subscriber',
    iat,
    exp: iat + options.ttlSeconds,
  };
  const signingInput = `${base64url(JSON.stringify(HEADER))}.${base64url(JSON.stringify(claims))}`;
  const signature = sign(null, Buffer.from(signingInput), toPrivateKey(privateKey));
  return { token: `${signingInput}.${base64url(signature)}`, claims };
}

export interface VerifySessionTokenOptions {
  /** The site the request is for: the token's `aud` must match */
  siteId: string;
  /** Seconds since the epoch; defaults to now */
  now?: number;
}

export function verifySessionToken(token: string, publicKey: string | KeyObject, options: VerifySessionTokenOptions): VerifyResult {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [encodedHeader, encodedClaims, encodedSignature] = parts;

  let header: { alg?: unknown };
  let claims: SessionClaims;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf-8'));
    claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf-8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  // Only EdDSA: never let the token choose a weaker algorithm (or `none`)
  if (header?.alg !== 'EdDSA' || typeof claims !== 'object' || claims === null) {
    return { valid: false, reason: 'malformed' };
  }

  const signatureValid = verify(
    null,
    Buffer.from(`${encodedHeader}.${encodedClaims}`),
    toPublicKey(publicKey),
    Buffer.from(encodedSignature, 'base64url'),
  );
  if (!signatureValid) return { valid: false, reason: 'bad-signature' };

  if (claims.iss !== SESSION_TOKEN_ISSUER) return { valid: false, reason: 'wrong-issuer' };
  if (claims.aud !== options.siteId) return { valid: false, reason: 'wrong-audience' };
  if (typeof claims.exp !== 'number' || typeof claims.iat !== 'number') return { valid: false, reason: 'malformed' };

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (claims.exp + CLOCK_SKEW_SECONDS <= now) return { valid: false, reason: 'expired' };
  if (claims.iat - CLOCK_SKEW_SECONDS > now) return { valid: false, reason: 'not-yet-valid' };

  return { valid: true, claims };
}

/** The token from an `Authorization: Bearer <token>` header (any casing of the header name), or null */
export function getBearerToken(headers: Record<string, string | undefined> | undefined): string | null {
  if (!headers) return null;
  const value = Object.entries(headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1];
  const match = value?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}
