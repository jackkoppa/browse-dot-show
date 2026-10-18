# Subscriber auth (shared)

One auth API for every site with subscriber access (see [the plan](../../scratchpad/subscriber-access/PLAN.md)). It's in account `297202224084` (with the homepage), and its state is in the homepage's state bucket under `subscriber-auth/`.

- **Lambda `browse-dot-show-subscriber-auth`** ([packages/auth-lambda](../../packages/auth-lambda)): checks a listener's subscription with the site's provider and issues session tokens (`/login`, `/complete`, `/refresh`).
- **HTTP API** in front of it, with CORS for the subscriber sites' origins and throttling (5 requests/second, burst 10).
- **DynamoDB table `browse-dot-show-subscriber-auth`** (on-demand): rate-limit counters, used login links, and each Supporting Cast site's mirror of who subscribes (user IDs, email hashes, subscription status). See [dynamo.ts](../../packages/auth-lambda/dynamo.ts).
- **Schedule** (only while a site uses Supporting Cast): syncs the mirrors every 2 hours (`supporting_cast_sync_schedule`), usually 2 API calls per site.
- **Sites** come from `sites/origin-sites/*/site.config.json` files that have `subscriberAccess`. After adding or changing one, apply this stack again.
- **Secrets** are SSM SecureStrings, created by hand so they never enter Terraform state:

  | Parameter | Value |
  | --- | --- |
  | `/browse-dot-show/auth/signing-private-key` | Ed25519 private key (PEM) |
  | `/browse-dot-show/auth/email-hash-key` | Random key for hashing emails (the table never holds emails) |
  | `/browse-dot-show/auth/dev-code` | Code for the `dev-code` provider (testing; at least 16 characters) |
  | `/browse-dot-show/auth/sites/<siteId>/supporting-cast` | JSON settings (below) |
  | `/browse-dot-show/auth/patreon-client` | JSON: browse.show's Patreon OAuth client (below) |
  | `/browse-dot-show/auth/sites/<siteId>/patreon` | JSON: the site's Patreon campaign and tiers (below) |

Until a site's provider settings exist, logins with that provider answer 503 `provider-not-configured`, and the login dialog says it isn't set up yet. So sites can be deployed with a provider before its keys exist.

It isn't deployed by GitHub Actions: apply it locally. A PR that changes it gets a note in its plan comment.

## Setup

Run these with the account's admin profile (`AWS_PROFILE=browse.show-0_admin-permissions-297202224084`, after `aws sso login`).

1. **Signing key.** Generate it, put the private key in SSM, then delete the file:

   ```bash
   pnpm --filter @browse-dot-show/auth-lambda generate-signing-key
   aws ssm put-parameter --name /browse-dot-show/auth/signing-private-key --type SecureString --value "file://<printed path>"
   rm <printed path>
   ```

   Keep the printed **public** key: it goes in each subscriber site's `prod.tfvars` as `subscriber_token_public_key`.

2. **Email hash key and dev code:**

   ```bash
   aws ssm put-parameter --name /browse-dot-show/auth/email-hash-key --type SecureString --value "$(openssl rand -base64 32)"
   aws ssm put-parameter --name /browse-dot-show/auth/dev-code --type SecureString --value "$(openssl rand -base64 24)"
   ```

3. **Deploy:**

   ```bash
   pnpm --filter @browse-dot-show/auth-lambda build:prod
   cd terraform/auth
   terraform init -backend-config=terraform.tfbackend
   terraform plan -var-file=auth-prod.tfvars -out=tfplan
   terraform apply tfplan
   terraform output auth_api_url
   ```

4. **Supporting Cast** (when a site's hosts provide an API token):

   ```bash
   aws ssm put-parameter --name /browse-dot-show/auth/sites/<siteId>/supporting-cast --type SecureString \
     --value '{"apiToken":"…","networkId":"…","planIds":[123]}'
   ```

   | Setting | Default | |
   | --- | --- | --- |
   | `apiToken`, `networkId` | | From Supporting Cast |
   | `planIds` | any plan | Subscription plans that grant access |
   | `loginEmailsPerDay` | 100 | Past it, logins pause for everyone until midnight UTC |
   | `syncPagesPerRun` | 20 | Most API calls one sync run makes (100 records each); spreads the first full sync over runs |
   | `enabled` | true | `false` pauses logins and syncs (logged-in listeners stay logged in) |

   Then add `supporting-cast` to the site's `subscriberAccess.providers` and apply this stack again: that also creates the sync schedule. The first sync runs within 2 hours; to run it now:

   ```bash
   aws lambda invoke --function-name browse-dot-show-subscriber-auth --cli-binary-format raw-in-base64-out \
     --payload '{"action":"sync-supporting-cast"}' /dev/stdout
   ```

   It prints e.g. `{"listenfairplay":{"pages":20,"users":1400,"subscriptions":600,"caughtUp":false}}`; run it again until `caughtUp` is true. The lambda re-reads secrets every 5 minutes, so changed settings apply within 5 minutes.

5. **Patreon** (one OAuth client for every site):

   1. On https://www.patreon.com/portal/registration/register-clients (Patreon needs a creator page for this; an empty one is fine), create a client: API version 2, redirect URIs `<auth_api_url>/oauth/callback` and `http://localhost:3002/oauth/callback` (for testing locally against real Patreon).
   2. Check what it sees, with the client's **Creator's Access Token** (only your own account's data):

      ```bash
      PATREON_ACCESS_TOKEN='…' pnpm --filter @browse-dot-show/auth-lambda patreon-check
      ```

      It lists your memberships: campaign IDs, patron status and tier IDs. A membership to another creator's campaign (e.g. Double Pivot, `1631945`) confirms the `identity.memberships` scope works for this.
   3. Store the client, then each site's campaign and tiers:

      ```bash
      aws ssm put-parameter --name /browse-dot-show/auth/patreon-client --type SecureString \
        --value '{"clientId":"…","clientSecret":"…"}'
      aws ssm put-parameter --name /browse-dot-show/auth/sites/<siteId>/patreon --type SecureString \
        --value '{"campaignId":"1631945","tierIds":["2479339"]}'
      ```

   | `sites/<siteId>/patreon` setting | Default | |
   | --- | --- | --- |
   | `campaignId` | | The creator's campaign |
   | `tierIds` | any paying membership | Tiers that grant access |
   | `enabled` | true | `false` pauses logins |
   | `allowFreeMembers` | false | Free members count too: only for a free test campaign |
   | `client` | the shared client | `{"clientId","clientSecret"}` registered by the creator, if they'd rather |

   A login makes 2 calls to Patreon (the token exchange and the listener's identity); refreshes make none. Patreon allows 100 requests every 2 seconds per client.

## How it limits calls to Supporting Cast

Supporting Cast's API allowance is shared with the network's other uses, so a login makes one call at most (the login email), and only for a subscriber. Completing a login and refreshing sessions use the mirror. The details, with estimates, are in [the plan](../../scratchpad/subscriber-access/PLAN.md#4a-supporting-casts-rate-limit).

## Rotating the signing key

Repeat step 1 with `--overwrite`, update `subscriber_token_public_key` in the subscriber sites' tfvars, and deploy them. Existing sessions stop working, and listeners log in again.
