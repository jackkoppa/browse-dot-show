import * as http from 'http';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { generateSigningKeyPair } from '@browse-dot-show/auth';
import { handleAuthRequest } from './app.js';
import { createDependencies, parseSitesConfig, SecretNotFoundError, SECRET_NAMES } from './dependencies.js';
import { FAKE_PATREON, FAKE_SUPPORTING_CAST, fakeSupportingCastFetch, handleFakeRoute } from './dev-fakes.js';

/**
 * Local auth server for client development: `pnpm --filter @browse-dot-show/auth-lambda dev:local`,
 * or all of it together with `pnpm bds dev client --site=<id> --subscriber-demo`.
 *
 * - Signing key: AUTH_DEV_SIGNING_KEY (PEM), or a throwaway one (its public key is printed, for a
 *   local subscriber search lambda's SUBSCRIBER_TOKEN_PUBLIC_KEY)
 * - Storage: in memory (restarting logs everyone out, and empties the Supporting Cast mirror)
 * - `dev-code`: AUTH_DEV_CODE (default below)
 * - AUTH_DEV_FAKES=1: fake Supporting Cast and Patreon for every site (see dev-fakes.ts)
 * - Otherwise, real providers need their settings as env vars, e.g.
 *   AUTH_SECRET_sites_listenfairplay_supporting_cast='{"apiToken":…}'
 */

const PORT = Number(process.env.AUTH_DEV_SERVER_PORT ?? 3002);
const PUBLIC_URL = `http://localhost:${PORT}`;
const DEV_CODE = process.env.AUTH_DEV_CODE ?? 'local-dev-code-0123456789';
const FAKES = process.env.AUTH_DEV_FAKES === '1';

const privateKeyPem = process.env.AUTH_DEV_SIGNING_KEY?.replace(/\\n/g, '\n') ?? generateSigningKeyPair().privateKeyPem;
const publicKeyPem = createPublicKey(createPrivateKey(privateKeyPem)).export({ type: 'spki', format: 'pem' }).toString();

const sites = parseSitesConfig(
  process.env.AUTH_SITES ??
    JSON.stringify({ listenfairplay: { origins: ['http://localhost:5137', 'http://127.0.0.1:5137'], providers: ['dev-code'] } }),
);

function fakeSecret(name: string): string | undefined {
  if (!FAKES) return undefined;
  if (name === SECRET_NAMES.patreonClient) return JSON.stringify(FAKE_PATREON.client);
  if (/^sites\/[^/]+\/patreon$/.test(name)) return JSON.stringify(FAKE_PATREON.site);
  if (/^sites\/[^/]+\/supporting-cast$/.test(name)) return JSON.stringify(FAKE_SUPPORTING_CAST.settings);
  return undefined;
}

const dependencies = createDependencies(
  sites,
  async name => {
    if (name === SECRET_NAMES.signingPrivateKey) return privateKeyPem;
    if (name === SECRET_NAMES.devCode) return DEV_CODE;
    if (name === SECRET_NAMES.emailHashKey) return 'local-email-hash-key';
    const value = process.env[`AUTH_SECRET_${name.replace(/[^a-z0-9]/gi, '_')}`] ?? fakeSecret(name);
    if (!value) throw new SecretNotFoundError(name);
    return value;
  },
  {
    publicUrl: PUBLIC_URL,
    ...(FAKES ? { patreonBaseUrl: `${PUBLIC_URL}/fake-patreon`, supportingCastApi: { fetch: fakeSupportingCastFetch } } : {}),
  },
);

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? '/', PUBLIC_URL);
  if (FAKES && (await handleFakeRoute(req, res, url))) return;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  let body: unknown = {};
  try {
    body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {};
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'invalid-json' }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(await dependencies.syncSupportingCast()));
    return;
  }
  const response = await handleAuthRequest(
    { method: req.method ?? 'GET', path: url.pathname, headers: req.headers as Record<string, string>, body, query: Object.fromEntries(url.searchParams), sourceIp: req.socket.remoteAddress },
    dependencies,
  );
  if (response.redirect) {
    res.writeHead(302, { Location: response.redirect }).end();
    return;
  }
  res.writeHead(response.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(response.body));
});

server.listen(PORT, async () => {
  console.log(`Auth dev server: ${PUBLIC_URL}`);
  console.log(`Sites: ${Object.keys(sites).join(', ')} · dev code: ${DEV_CODE}`);
  if (FAKES) {
    // Fill the fake Supporting Cast mirror now, as the scheduled sync would
    console.log(`Fake Supporting Cast sync: ${JSON.stringify(await dependencies.syncSupportingCast())}`);
    console.log('Fake logins: Supporting Cast with subscriber@example.com (or lapsed@example.com); Patreon offers a choice of accounts');
  }
  if (!process.env.AUTH_DEV_SIGNING_KEY) console.log(`Public key for verifying tokens (SUBSCRIBER_TOKEN_PUBLIC_KEY):\n${publicKeyPem}`);
});
