# Subscriber auth (shared)

One auth API for every site with subscriber access (see [the plan](../../scratchpad/subscriber-access/PLAN.md)). It's in account `297202224084` (with the homepage), and its state is in the homepage's state bucket under `subscriber-auth/`.

- **Lambda `browse-dot-show-subscriber-auth`** ([packages/auth-lambda](../../packages/auth-lambda)): checks a listener's subscription with the site's provider and issues session tokens (`/login`, `/complete`, `/refresh`).
- **HTTP API** in front of it, with CORS for the subscriber sites' origins and throttling (5 requests/second, burst 10).
- **Sites** come from `sites/origin-sites/*/site.config.json` files that have `subscriberAccess`. After adding or changing one, apply this stack again.
- **Secrets** are SSM SecureStrings, created by hand so they never enter Terraform state:

  | Parameter | Value |
  | --- | --- |
  | `/browse-dot-show/auth/signing-private-key` | Ed25519 private key (PEM) |
  | `/browse-dot-show/auth/dev-code` | Code for the `dev-code` provider (testing; at least 16 characters) |
  | `/browse-dot-show/auth/sites/<siteId>/supporting-cast` | JSON: `{"apiToken": "…", "networkId": "…", "feedIds": [123]}` |

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

2. **Dev code:**

   ```bash
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
     --value '{"apiToken":"…","networkId":"…","feedIds":[123]}'
   ```

   Then add `supporting-cast` to the site's `subscriberAccess.providers` and apply this stack again. The lambda reads secrets once per cold start, so a changed secret applies within minutes. To apply it at once, update the function (e.g. apply again after a code change).

## Rotating the signing key

Repeat step 1 with `--overwrite`, update `subscriber_token_public_key` in the subscriber sites' tfvars, and deploy them. Existing sessions stop working, and listeners log in again.
