import { PATREON_BASE_URL, PATREON_IDENTITY_PATH, patreonMemberships, type PatreonIdentity } from '@browse-dot-show/auth';

/**
 * Checks what browse.show's Patreon client can see, before deploying anything:
 *
 *   PATREON_ACCESS_TOKEN=<token> pnpm --filter @browse-dot-show/auth-lambda patreon-check
 *
 * Use the client's "Creator's Access Token" (https://www.patreon.com/portal/registration/register-clients):
 * it has every scope, and it's the token of the Patreon account that registered the client. It
 * prints that account's memberships, as a login would see them: each campaign's ID, the patron
 * status and the entitled tiers. Those give the `campaignId` and `tierIds` for a site's settings,
 * and show whether memberships to other creators' campaigns are visible (`identity.memberships`).
 */

async function main() {
  const token = process.env.PATREON_ACCESS_TOKEN;
  if (!token) {
    console.error('Set PATREON_ACCESS_TOKEN (the client\'s Creator\'s Access Token, from https://www.patreon.com/portal)');
    process.exit(2);
  }
  const response = await fetch(`${PATREON_BASE_URL}${PATREON_IDENTITY_PATH}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!response.ok) {
    console.error(`Patreon returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    process.exit(1);
  }
  const identity = (await response.json()) as PatreonIdentity;
  const names = new Map((identity.included ?? []).map(resource => [`${resource.type}:${resource.id}`, (resource.attributes?.vanity ?? resource.attributes?.title ?? '') as string]));
  const memberships = patreonMemberships(identity);
  console.log(`Patreon user ${identity.data.id}: ${memberships.length} membership(s)`);
  for (const membership of memberships) {
    const tiers = membership.tierIds.map(id => `${id} (${names.get(`tier:${id}`) || '?'})`).join(', ') || 'none';
    console.log(`- campaign ${membership.campaignId ?? '?'} (${names.get(`campaign:${membership.campaignId}`) || '?'}): ${membership.patronStatus ?? 'no status'}; tiers: ${tiers}`);
  }
  if (memberships.length > 0 && memberships.every(membership => membership.campaignId === null)) {
    console.log('\nNo campaign IDs came back: the client may need the `campaigns` scope too (scopes in the patreon-client settings).');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
