# listenfairplay: Football Clichés' Dreamland (Supporting Cast)

To-dos for turning on subscriber access for listenfairplay.com, as simple steps. The design is in [PLAN.md](PLAN.md); the shared setup (the auth stack) is in [PLAN.md, "Next, once merged"](PLAN.md#pr-stack).

**Status:** the code is merged-ready (PR stack #211–#246). The site has `subscriberAccess` in preview, with `supporting-cast` and the preview code. Logins with Supporting Cast answer "not set up yet" until the hosts send an API token.

## Questions for the hosts (Colin)

1. Can we have our own Supporting Cast API token? Is the rate limit per token or for the whole network, and how large is it (per minute, per day)?
2. The network ID, and which subscription plan ID(s) give Dreamland access?
3. Do gifted or invited listeners get a subscription record? (Our copy of the subscriber list only sees subscriptions.)
4. Does Supporting Cast have webhooks? They could replace checking for changes every 2 hours.
5. Supporting Cast's login email returns to a URL we give it, with a query string: does it keep the query string, and does the domain (listenfairplay.com) need allowlisting?
6. Are they happy for logged-in Dreamland subscribers to search and play Dreamland episodes on the site (nobody else sees them)?

What we'd tell them: at most one API call per login, none for emails that aren't subscribers; about 25–55 calls a day, never more than ~125; a kill switch that works in 5 minutes. Details: [PLAN.md, 4a](PLAN.md#4a-supporting-casts-rate-limit).

## Steps

### Before the hosts answer

1. [ ] **Try it locally:** `pnpm bds dev client --site=listenfairplay --subscriber-demo`, then http://localhost:5137/?subscriberPreview=1 (fake Supporting Cast: log in as `subscriber@example.com`; the link is in the terminal).
2. [ ] **Shared setup, once:** merge the stack and deploy `terraform/auth` ([PLAN.md](PLAN.md#pr-stack), step 1).
3. [ ] **Runner Mac:** add your Dreamland feed URL to its `.env.local` (the dev Mac has it already):
   ```
   SUBSCRIBER_FEED_URL_LISTENFAIRPLAY_FOOTBALL_CLICHES=<the feed URL>
   ```
4. [ ] **Turn on the site's infrastructure:** one PR adding these to `sites/origin-sites/listenfairplay/terraform/prod.tfvars`:
   ```hcl
   enable_subscriber_access    = true
   subscriber_token_public_key = "<the public key from the auth setup>"
   ```
   Its plan should only add: the `subscriber-api-listenfairplay` lambda, its log group, the `POST /subscriber` route and integration, a permission, and the bucket policy's `DenyCloudFrontSubscriberFiles` statement. Approve and merge.
5. [ ] **Ingest:** the next nightly run (or `pnpm bds ingest --sites=listenfairplay` on the runner Mac) downloads and transcribes the 31 Dreamland episodes, then uploads them to `subscriber/`. The log reports "🔗 313 of 344 episodes are versions of public episodes".
6. [ ] **Check that CloudFront can't read them:** this should print the start of the site's page (`<!doctype html>`; CloudFront answers its 403 with `index.html`), not the manifest's JSON (`{"lastUpdated"…`):
   ```bash
   curl -s https://listenfairplay.com/subscriber/episode-manifest/full-episode-manifest.json | head -c 60
   ```
7. [ ] **Test on prod:** https://listenfairplay.com/?subscriberPreview=1 → the lock icon → the preview code → search for "Dreamland". Results include subscriber-only episodes, which play without the time limit. Supporting Cast logins say "not set up yet".

### Once the hosts send the API token

8. [ ] **Store the settings** (AWS account 297202224084):
   ```bash
   aws ssm put-parameter --name /browse-dot-show/auth/sites/listenfairplay/supporting-cast --type SecureString \
     --value '{"apiToken":"…","networkId":"…","planIds":[…]}'
   ```
9. [ ] **Re-apply `terraform/auth`** (`terraform plan`, then `apply`). This creates the sync schedule.
10. [ ] **Fill the subscriber list now** (otherwise it fills within 2 hours). Repeat until `caughtUp` is true:
    ```bash
    aws lambda invoke --function-name browse-dot-show-subscriber-auth --cli-binary-format raw-in-base64-out \
      --payload '{"action":"sync-supporting-cast"}' /dev/stdout
    ```
11. [ ] **Test on prod:** https://listenfairplay.com/?subscriberPreview=1 → the lock icon → your Dreamland email → open the email's link in the same browser → logged in. (With an email that doesn't subscribe, you get the same message and no email.)

### Later

12. [ ] **Launch** to everyone: a deliberate change (add a `live` launch status, drop `dev-code`). Not part of this stack.

**To pause:** add `"enabled": false` to the SSM settings (logins and syncs stop within 5 minutes). **To turn off:** see [PLAN.md, "Removing subscriber access"](PLAN.md#removing-subscriber-access).
