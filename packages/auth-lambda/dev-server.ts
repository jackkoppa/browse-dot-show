import * as http from 'http';
import { generateSigningKeyPair } from '@browse-dot-show/auth';
import { handleAuthRequest } from './app.js';
import { createDependencies, parseSitesConfig, SECRET_NAMES } from './dependencies.js';

/**
 * Local auth server for client development: `pnpm --filter @browse-dot-show/auth-lambda dev:local`
 *
 * Uses a throwaway signing key (printed, so a local subscriber lambda can verify its tokens) and
 * the `dev-code` provider with AUTH_DEV_CODE (default below). Real providers need their settings
 * as env vars, e.g. AUTH_SECRET_sites_listenfairplay_supporting_cast='{"apiToken":…}'.
 */

const PORT = Number(process.env.AUTH_DEV_SERVER_PORT ?? 3002);
const DEV_CODE = process.env.AUTH_DEV_CODE ?? 'local-dev-code-0123456789';
const keys = generateSigningKeyPair();

const sites = parseSitesConfig(
  process.env.AUTH_SITES ??
    JSON.stringify({ listenfairplay: { origins: ['http://localhost:5137', 'http://127.0.0.1:5137'], providers: ['dev-code'] } }),
);

const dependencies = createDependencies(sites, async name => {
  if (name === SECRET_NAMES.signingPrivateKey) return keys.privateKeyPem;
  if (name === SECRET_NAMES.devCode) return DEV_CODE;
  const value = process.env[`AUTH_SECRET_${name.replace(/[^a-z0-9]/gi, '_')}`];
  if (!value) throw new Error(`No local value for secret ${name}`);
  return value;
});

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  let body: unknown = {};
  try {
    body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {};
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'invalid-json' }));
    return;
  }

  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const response = await handleAuthRequest({ method: req.method ?? 'GET', path, headers: req.headers as Record<string, string>, body }, dependencies);
  res.writeHead(response.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(response.body));
});

server.listen(PORT, () => {
  console.log(`Auth dev server: http://localhost:${PORT}`);
  console.log(`Sites: ${Object.keys(sites).join(', ')} · dev code: ${DEV_CODE}`);
  console.log(`Public key for verifying tokens (SUBSCRIBER_TOKEN_PUBLIC_KEY):\n${keys.publicKeyPem}`);
});
