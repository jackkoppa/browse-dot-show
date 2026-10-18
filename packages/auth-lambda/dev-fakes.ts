import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Local stand-ins for Supporting Cast and Patreon, for `bds dev client --subscriber-demo`
 * (AUTH_DEV_FAKES=1 in the dev server). Nothing leaves this machine.
 *
 * - Supporting Cast: `subscriber@example.com` subscribes, `lapsed@example.com` used to. Its
 *   "login email" prints to the console and shows at http://localhost:3002/fake-inbox
 * - Patreon: its authorize page offers buttons for each outcome (active patron, another tier, not
 *   a patron, cancel)
 */

export const FAKE_SUPPORTING_CAST = {
  settings: { apiToken: 'fake-token', networkId: 'fake-network', planIds: [1] },
  users: [
    { id: 101, email: 'subscriber@example.com' },
    { id: 102, email: 'lapsed@example.com' },
  ],
  subscriptions: [
    { id: 1, user_id: 101, subscription_plan_id: 1, status: 'Active' },
    { id: 2, user_id: 102, subscription_plan_id: 1, status: 'Cancelled', ends_at: '2025-01-01T00:00:00Z' },
  ],
};

export const FAKE_PATREON = {
  client: { clientId: 'fake-client', clientSecret: 'fake-secret' },
  site: { campaignId: 'demo-campaign', tierIds: ['demo-premium-tier'] },
};

/** Patreon identities by fake code: what each authorize-page button logs in as */
const PATREON_IDENTITIES: Record<string, { label: string; userId: string; memberships: { status: string | null; tierId: string }[] }> = {
  'active-patron': { label: 'Active patron, on the premium tier (gets access)', userId: 'p-201', memberships: [{ status: 'active_patron', tierId: 'demo-premium-tier' }] },
  'other-tier': { label: 'Active patron, on a tier without the premium episodes', userId: 'p-202', memberships: [{ status: 'active_patron', tierId: 'demo-helper-tier' }] },
  'former-patron': { label: 'Former patron', userId: 'p-203', memberships: [{ status: 'former_patron', tierId: 'demo-premium-tier' }] },
  'not-a-patron': { label: 'Not a member of this campaign', userId: 'p-204', memberships: [] },
};

/** Login links the fake Supporting Cast "emailed", newest first */
const inbox: { to: string; link: string; at: string }[] = [];

/** A fetch for the Supporting Cast provider and sync */
export const fakeSupportingCastFetch = (async (url: string, init: RequestInit = {}) => {
  const { pathname } = new URL(url);
  const path = pathname.replace(/^\/v2\/[^/]+/, '');
  if (path === '/subscriptions') return Response.json({ subscriptions: FAKE_SUPPORTING_CAST.subscriptions, meta: { next_cursor: null } });
  if (path === '/users') return Response.json({ users: FAKE_SUPPORTING_CAST.users, meta: { next_cursor: null } });
  const match = path.match(/^\/users\/(\d+)\/send_login_email$/);
  if (match && init.method === 'POST') {
    const to = FAKE_SUPPORTING_CAST.users.find(user => String(user.id) === match[1])?.email ?? '?';
    const link = (JSON.parse(String(init.body)) as { redirect_url: string }).redirect_url;
    inbox.unshift({ to, link, at: new Date().toISOString() });
    console.log(`\n📧 [fake Supporting Cast] Login email to ${to}:\n   ${link}\n   (or open http://localhost:3002/fake-inbox)\n`);
    return new Response(null, { status: 204 });
  }
  return new Response('', { status: 404 });
}) as typeof fetch;

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>` +
  '<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5}' +
  'a.button{display:block;margin:.5rem 0;padding:.75rem 1rem;border:1px solid #888;border-radius:6px;text-decoration:none;color:inherit}' +
  'code{word-break:break-all}</style></head>' +
  `<body>${body}</body></html>`;

const escape = (text: string) => text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

/** Serves `/fake-inbox` and the fake Patreon (`/fake-patreon/...`); false for other paths */
export async function handleFakeRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname === '/fake-inbox') {
    const items = inbox.map(email => `<li>${escape(email.at)}, to <strong>${escape(email.to)}</strong>: <a href="${escape(email.link)}">open the login link</a></li>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(page('Fake inbox', `<h1>Fake Supporting Cast inbox</h1><p>Login emails, newest first. Open a link in the browser you're testing in.</p><ul>${items || '<li>None yet: log in with subscriber@example.com</li>'}</ul>`));
    return true;
  }

  if (url.pathname === '/fake-patreon/oauth2/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const back = (params: Record<string, string>) => `${redirectUri}?${new URLSearchParams({ ...params, state })}`;
    const buttons = Object.entries(PATREON_IDENTITIES).map(([code, identity]) => `<a class="button" href="${escape(back({ code }))}">${escape(identity.label)}</a>`).join('') +
      `<a class="button" href="${escape(back({ error: 'access_denied' }))}">Deny access (cancel)</a>`;
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(page('Fake Patreon', `<h1>Fake Patreon</h1><p>Log in to the demo site as:</p>${buttons}<p><small>Scopes asked for: <code>${escape(url.searchParams.get('scope') ?? '')}</code></small></p>`));
    return true;
  }

  if (url.pathname === '/fake-patreon/api/oauth2/token' && req.method === 'POST') {
    const code = new URLSearchParams(await readBody(req)).get('code') ?? '';
    if (!PATREON_IDENTITIES[code]) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'invalid_grant' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ access_token: `fake-access-${code}`, expires_in: 2678400 }));
    }
    return true;
  }

  if (url.pathname === '/fake-patreon/api/oauth2/v2/identity') {
    const code = (req.headers.authorization ?? '').replace('Bearer fake-access-', '');
    const identity = PATREON_IDENTITIES[code];
    if (!identity) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end('{}');
      return true;
    }
    const included = identity.memberships.flatMap((membership, index) => [
      {
        id: `member-${index}`,
        type: 'member',
        attributes: { patron_status: membership.status },
        relationships: {
          campaign: { data: { id: FAKE_PATREON.site.campaignId, type: 'campaign' } },
          currently_entitled_tiers: { data: [{ id: membership.tierId, type: 'tier' }] },
        },
      },
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: { id: identity.userId, type: 'user' }, included }));
    return true;
  }

  return false;
}
