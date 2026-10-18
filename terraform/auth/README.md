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

## How it limits calls to Supporting Cast

Supporting Cast's API allowance is shared with the network's other uses, so a login makes one call at most (the login email), and only for a subscriber. Completing a login and refreshing sessions use the mirror. The details, with estimates, are in [the plan](../../scratchpad/subscriber-access/PLAN.md#4a-supporting-casts-rate-limit).

## Rotating the signing key

Repeat step 1 with `--overwrite`, update `subscriber_token_public_key` in the subscriber sites' tfvars, and deploy them. Existing sessions stop working, and listeners log in again.
