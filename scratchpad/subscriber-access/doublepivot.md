# doublepivot: Double Pivot's Patreon

To-dos for turning on subscriber access for doublepivot.browse.show, as simple steps. The design is in [PLAN.md, 4b](PLAN.md#4b-patreon); the shared setup (the auth stack) is in [PLAN.md, "Next, once merged"](PLAN.md#pr-stack).

**Status:** the code is merged-ready (PR stack #211–#246). The site has `subscriberAccess` in preview, with `patreon` and the preview code. Patreon logins answer "not set up yet" until its settings are in SSM.

Patreon needs no API keys from the hosts. browse.show's own Patreon client can see whether someone is a Double Pivot patron, and the campaign (`1631945`) and tier IDs are public. So this can be set up and tested with your own membership before the hosts answer. They should still agree before it launches.

**Access (decided 2026-10-18):**
- **Mousa Dembele** (`2479345`) and **Double Double** (`22041320`) get the subscriber episodes: one subscriber feed, your Mousa-level Patreon feed (collection `872186`, "Double Pivot (Special for you)").
- **Subscriber** (`2479339`, $3) gets nothing yet. Patrons on it (or any other tier) who log in see "Your membership's tier doesn't include the subscriber episodes here yet", with a "Contact us" link. GoatCounter counts it as "Subscriber Tier Not Included", to gauge demand for subscription levels (see PLAN.md, "Later").

**The feed** (checked 2026-10-18): 1,206 episodes since March 2018.
- 387 are public episodes (375 by title, 12 by a similar title, all checked by hand) and are left out.
- 819 are Patreon-only.
- The public feed also has 31 teasers of Patreon episodes. Those stay as they are: logged-in patrons see the teaser and the full episode.
- Checking this feed found two matching bugs, both fixed in #215: different parts of a series ("Part I"/"Part II", "World Cup Semifinals Preview: England-Argentina"/"…: France-Spain") matched each other, and full episodes matched their public teasers.

## Questions for the hosts

1. Are they happy for logged-in patrons to search and play the premium episodes on doublepivot.browse.show (nobody else sees them)?
2. Is it right that Mousa Dembele and Double Double include everything in the Mousa-level feed, and the Subscriber tier only its own premium episodes? (For now, Subscriber-tier patrons see a "contact us" message; a later version could give each tier its own feeds.) Does Expecting Goals (`22041304`, $10) include any podcast?
3. Would they rather register the Patreon client themselves? Optional; it isn't needed.

## Steps

### Now, without the hosts

1. [ ] **Try it locally:** `pnpm bds dev client --site=doublepivot --subscriber-demo`, then http://localhost:5137/?subscriberPreview=1 → "Log in with Patreon" (a fake Patreon page lets you choose who you are).
2. [ ] **The feed URL:** put your Mousa-level Double Pivot Patreon feed (`https://www.patreon.com/rss/doublepivot?auth=…&show=872186`) in `.env.local` on the dev Mac and the runner Mac:
   ```
   SUBSCRIBER_FEED_URL_DOUBLEPIVOT=<the feed URL>
   ```
3. [ ] **Shared setup, once:** merge the stack and deploy `terraform/auth` ([PLAN.md](PLAN.md#pr-stack), step 1). Note the `auth_api_url` it prints.
4. [ ] **Register the Patreon client:**
   1. Open https://www.patreon.com/portal/registration/register-clients. Patreon needs a creator page for this; if your account has none, create one (it can stay empty and unlaunched).
   2. Create a client named "browse.show", API version 2, with redirect URIs `<auth_api_url>/oauth/callback` and `http://localhost:3002/oauth/callback`.
5. [ ] **Check what the client sees,** using its Creator's Access Token (on the same page):
   ```bash
   PATREON_ACCESS_TOKEN='…' pnpm --filter @browse-dot-show/auth-lambda patreon-check
   ```
   Expect a line like `campaign 1631945 (doublepivot): active_patron; tiers: 2479339 (Subscriber)`. If no campaign IDs come back, tell me: the client may need another scope.
6. [ ] **Store the settings** (AWS account 297202224084), with the Mousa Dembele and Double Double tiers:
   ```bash
   aws ssm put-parameter --name /browse-dot-show/auth/patreon-client --type SecureString \
     --value '{"clientId":"…","clientSecret":"…"}'
   aws ssm put-parameter --name /browse-dot-show/auth/sites/doublepivot/patreon --type SecureString \
     --value '{"campaignId":"1631945","tierIds":["2479345","22041320"]}'
   ```
7. [ ] **Turn on the site's infrastructure:** one PR adding these to `sites/origin-sites/doublepivot/terraform/prod.tfvars`:
   ```hcl
   enable_subscriber_access    = true
   subscriber_token_public_key = "<the public key from the auth setup>"
   ```
   Its plan should only add: the `subscriber-api-doublepivot` lambda, its log group, the `POST /subscriber` route and integration, a permission, and the bucket policy's `DenyCloudFrontSubscriberFiles` statement. Approve and merge.
8. [ ] **Ingest:** the next nightly run (or `pnpm bds ingest --sites=doublepivot` on the runner Mac) downloads and transcribes the 819 Patreon-only episodes, then uploads them to `subscriber/`. The log should say "🔗 387 of 1206 episodes are versions of public episodes". The first run is big: 8 years of episodes, likely several nights of transcription. Search shows them as they're indexed. Expect about 30 GB of audio in S3 (about $0.70 a month).
9. [ ] **Check that CloudFront can't read them:** this should print the start of the site's page (`<!doctype html>`; CloudFront answers its 403 with `index.html`), not the manifest's JSON (`{"lastUpdated"…`):
   ```bash
   curl -s https://doublepivot.browse.show/subscriber/episode-manifest/full-episode-manifest.json | head -c 60
   ```
10. [ ] **Test on prod:** https://doublepivot.browse.show/?subscriberPreview=1 → the lock icon → "Log in with Patreon" → allow → back on the site, logged in. Search results include premium episodes, which play without the time limit.

### Once the hosts answer

11. [ ] **If the hosts name other tiers,** `--overwrite` the `sites/doublepivot/patreon` parameter from step 6. It applies within 5 minutes.
12. [ ] **Launch** to everyone, later: a deliberate change (add a `live` launch status, drop `dev-code`). Not part of this stack.

**To pause:** add `"enabled": false` to `sites/doublepivot/patreon` (applies within 5 minutes). **To turn off:** see [PLAN.md, "Removing subscriber access"](PLAN.md#removing-subscriber-access).
