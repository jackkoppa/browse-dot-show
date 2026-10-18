# Subscriber access: plan

**Goal:** on a few sites (first: listenfairplay, Football Clichés on Supporting Cast), a listener who pays for the podcast can log in with that subscription and then:

1. search the subscriber-only episodes too (with no duplicates when an episode is in both feeds),
2. open and listen to them,
3. listen without the 5-minute cap.

Later: Libero (also Supporting Cast), Patreon sites, and subscriber-only features (e.g. search filters) with "subscribe to do this" prompts.

**Constraints**

- **Cheap.** All 23 sites cost $10–15/month and the total should stay under $20. Use only resources that are free indefinitely or cost per use: Lambda, API Gateway HTTP APIs, SSM Parameter Store (standard), S3, and one on-demand DynamoDB table (for the auth lambda's rate limits and the Supporting Cast mirror: cents a year at this traffic). No provisioned databases, NAT gateways, Secrets Manager or always-on servers.
- **Keep the search model.** Lambdas load an Orama index from S3 at cold start and are kept warm. Warm searches take milliseconds.
- **Other sites don't change.** Everything is off unless a site opts in. A site without `subscriberAccess` builds and deploys the same as today.
- **No staging.** Test on prod behind a query-param feature flag (`?subscriberPreview=1`). Real users don't see the feature until it's turned on for a site.
- **The repo is public.** Subscriber feed URLs (which carry the developer's personal feed token), provider API tokens and the signing key never go in the repo, logs or PR comments.

## Architecture

```
                         ┌─────────────────────────────── account 297202224084 (shared) ─┐
 browser                 │  auth lambda (HTTP API)            SSM Parameter Store          │
 ───────                 │  POST /login     ──────────────▶   /browse-dot-show/auth/...    │
 1. email ──────────────▶│  POST /complete  ◀── provider ──▶  (signing key, provider keys) │
 3. callback params ────▶│  POST /refresh        API          (provider API tokens)        │
 ◀── session token ──────│  (Supporting Cast, mock; later Patreon)                         │
                         └─────────────────────────────────────────────────────────────────┘
                                         signs tokens (Ed25519); sites verify with the public key
                         ┌──────────────────────────────── site account (per site) ────────┐
 search (anonymous) ────▶│ API Gateway $default ─▶ search-api-<site>          (unchanged)  │
                         │                          loads search-index/orama_index.msp      │
 search (subscriber) ───▶│ API Gateway /subscriber ─▶ subscriber-api-<site>  (new, opt-in) │
   Authorization: Bearer │   verifies the token; actions: search, manifest, episode        │
                         │   loads subscriber/search-index/orama_index.msp                 │
                         │   returns presigned S3 URLs for subscriber audio + transcripts  │
                         │ S3: subscriber/** (CloudFront denied by bucket policy)          │
                         └─────────────────────────────────────────────────────────────────┘
```

### 1. Content layout: a `subscriber/` prefix in the site bucket

Subscriber files mirror the public layout under `subscriber/`: `subscriber/audio/`, `subscriber/transcripts/`, `subscriber/search-entries/`, `subscriber/episode-manifest/`, `subscriber/rss/`, `subscriber/search-index/`. Locally they go under `<localFilesPath>/s3/sites/<site>/subscriber/…`.

- **CloudFront can't read them.** The bucket policy lets CloudFront read `*`, so for opted-in sites we add an explicit `Deny` on `subscriber/*` for the CloudFront principal. A request there returns the SPA fallback (403 → index.html), as for any missing file. **This has to be applied before any subscriber file is uploaded.** The upload step refuses to sync `subscriber/` unless the site has `enable_subscriber_access` in its tfvars.
- **Same key code.** The `@browse-dot-show/constants` prefix functions take a content scope (`CONTENT_SCOPE=subscriber` env var, default `public`). The RSS, transcription and indexing steps run unchanged with the scope set. Public keys don't change.

### 2. Episode identity: a separate ID space, `s<n>`

Public sequential IDs are reassigned by publish date on every RSS run, and the episode URLs (`/episode/123`) and every search entry (`sequentialEpisodeIdAsString`, entry `id`) depend on them. Mixing subscriber episodes into the public manifest would shift public IDs and leak subscriber titles. So:

- **Separate manifest.** Subscriber episodes go in `subscriber/episode-manifest/full-episode-manifest.json`, which has its own sequential IDs.
- **Prefixed IDs.** Their search entries use `sequentialEpisodeIdAsString: "s<n>"` and `id: "s<n>_<startMs>"`, and the client routes them at `/episode/s<n>`. The Orama schema is unchanged (the field is already a string), so public indexes don't need rebuilding.
- **Never sent to clients:** `originalAudioURL` in the subscriber manifest is the developer's private feed URL. Subscriber audio is always our S3 copy, so the "RSS feed URL" audio source isn't offered for `s` episodes.

### 3. Duplicates: build one combined subscriber index at ingestion

Some subscriber feeds have the same episodes as the public feed (often ad-free), plus bonus episodes. Ingestion matches each subscriber episode to a public one (normalized title plus publish date within a few days; GUID first if the feeds share them). Matched episodes are **counterparts**.

The subscriber search index is built at ingestion as one index: **every public episode (its existing search entries, unchanged) + subscriber-only episodes**. Dedup, relevance ranking and pagination stay exact because it's a single Orama index. There's no fan-out, no merging of BM25 scores from different indexes, and no orchestrator lambda.

- Cost: a second index about the size of the public one (listenfairplay's is 63 MB compressed, so it fits the default 3008 MB easily). Both indexes are built locally by `bds ingest`.
- Very large sites would hit the same memory ceiling as the public index. That's the existing problem and isn't made worse; shard both together later if needed.

**Checked against the real feeds (2026-10-14):** the Football Clichés subscriber feed has 344 items.

- 313 match public episodes: 310 by exact title, 2 by similar title, and 1 by a shared title part (Dreamland Episode 27, released publicly 9 days later as "Free Dreamland episode: …").
- The other 31 are the subscriber-only "Dreamland" series.
- Every public episode matched exactly one subscriber item.

Matching happens twice. RSS retrieval skips counterparts, so they're never downloaded or transcribed. Indexing re-checks, and leaves out a subscriber episode whose public version appeared later (e.g. subscribers got it a week early). The rules, in `episode-matching.ts` in `@browse-dot-show/constants`:

- the same title within 14 days
- a near-identical title within 2 days
- a distinctive part of one title (4+ words, split at ":" or " - ") found in the other, within 14 days

**Phase 1 (decided): bonus episodes only.** Counterparts are skipped. Subscribers get the public (ad-supported) version of shared episodes and the subscriber-only episodes on top. That's no extra transcription and no ambiguity.
**Phase 2 (optional): ad-free versions.** Transcribe counterparts too, and replace the public episode with the `s` version in the combined index. Timestamps differ from the ad version, so it needs its own transcript. That's a one-time backlog of transcription on the runner.

### 4. Auth: one shared, stateless auth lambda

- **Where it runs:** `terraform/auth/` in account 297202224084 (next to the homepage). The state is in the homepage's state bucket under `subscriber-auth/`. One Lambda behind an **HTTP API**, with CORS for the opted-in sites' origins (read from their site configs) and throttling (5 req/s, burst 10) to bound cost and abuse.
  - Why not a function URL: public function URLs now need an `InvokeFunction` permission with a function-URL condition, which the pinned AWS provider (5.31) can't create.
  - Why not reserved concurrency: it fails on accounts with a low concurrency limit.
  - The API costs $1/million requests.
- **Deploying it:** applied locally, like `terraform/automation` (CI notes changes but doesn't apply them). Setup steps are in [terraform/auth/README.md](../../terraform/auth/README.md).
- **Secrets:** SSM Parameter Store SecureStrings: the Ed25519 signing key, the email hash key, and each site's provider settings (e.g. the Supporting Cast API token and network ID). They're re-read every 5 minutes, so a changed setting (e.g. pausing logins) applies quickly.
- **State:** one on-demand DynamoDB table for rate-limit counters, used login links and the Supporting Cast mirrors (see 4a). Sessions stay stateless.
- **Providers** implement one interface (`packages/auth/providers/types.ts`), so a new platform is one more provider:
  - `startLogin(...)` returns `{ kind: 'email-sent' }` (Supporting Cast's emailed link), `{ kind: 'redirect', url }` (OAuth, e.g. Patreon) or `{ kind: 'enter-code' }` (`dev-code`).
  - `completeLogin(params)` checks what a code form sends (`dev-code`). Emailed links and OAuth logins end with our own login link, which the auth lambda checks itself.
  - `completeOAuth({ code, redirectUri })` (OAuth providers) exchanges the code and checks the membership.
  - `refresh(userId)` (optional) re-checks access without the listener. Supporting Cast has it (the mirror). OAuth providers don't, since we keep none of their tokens.
- **OAuth flow** (any OAuth provider; one registered redirect URI for every site):
  1. `POST /login` returns the provider's authorize URL. Its `state` is a signed token (15 minutes, single-use) holding the site and origin; the redirect URI is the auth API's `/oauth/callback`.
  2. The provider sends the browser to `GET /oauth/callback?code&state`. The auth lambda checks the state, exchanges the code and checks the membership, then redirects to `https://<site>/auth/callback?provider=<id>&link=<login link>`, or `&error=<code>` (`not-a-subscriber`, `cancelled`, …).
  3. The site posts the login link to `/complete` as usual and gets its session.
- **Errors:**
  - 400: requests no site allows
  - 401: access not granted
  - 429: past rate limits
  - 503 `provider-not-configured`: the provider's keys aren't in SSM yet. Sites can be deployed with a provider before its keys exist; the login dialog then says it isn't set up yet.
  - 503 `provider-unavailable`: the provider is down, rate-limited or paused
  - 500: anything else
- **Supporting Cast flow** (one API call per login; see 4a):
  1. `POST /login {site, email}`: look the email's hash up in our mirror of subscribers. Only for a subscriber with access, call `POST /users/{id}/send_login_email` with a `redirect_url` of `https://<site>/auth/callback?provider=supporting-cast&link=<login link>`. The login link is our own signed, single-use token (1 hour). The response is always "if you're a subscriber, check your email" (no account enumeration).
  2. Supporting Cast emails the link to the address it has on file. It ends at `/auth/callback`, and the client posts the query params to `POST /complete`. The auth lambda checks the login link itself (signature, expiry, not used before) and re-checks access in the mirror: no call to Supporting Cast.
  3. The auth lambda returns a **session token**.
- **Session token:** a compact JWT signed with Ed25519 (`node:crypto`, no dependency). Claims: `iss`, `aud` (site ID), `sub` (`<provider>:<user id>`), `scope: "subscriber"`, `auth_time` (when the provider last confirmed access), `iat`, `exp` (30 days after `auth_time`). The client stores it in `localStorage` and calls `POST /refresh` once a day.
  - Providers with `refresh` (Supporting Cast, from the mirror; no API call) restart the 30 days. A listener who visits at least monthly stays logged in, and a lapsed subscription loses access at the next refresh.
  - Other providers (OAuth) keep the session as it is: it ends 30 days after login, and the listener logs in again. That's one click when they're still logged in at the provider.
  - Login links (`scope: "login-link"`) and OAuth states (`scope: "oauth-state"`) use the same signing. No API accepts them as sessions.
- **Verification** happens in the site's subscriber lambda, with the public key (an env var; public keys are committed). It costs microseconds with no network call.
- **Mock / dev provider (`dev-code`):** for testing on prod before any provider credentials exist. `/complete {siteId, provider: "dev-code", params: {code}}` checks the code against SSM `/browse-dot-show/auth/dev-code` and issues a token with `sub: "dev-code:<label>"`. It's enabled per site (`providers` in config).
- **Preview only:** `launchStatus` can only be `preview` for now, so every subscriber feature on every site needs `?subscriberPreview=1`. The flag is remembered in the browser, so links back to the site work; `?subscriberPreview=0` turns it off. Launching a site to everyone will mean adding a `live` status, a deliberate code change.
- **Supporting Cast access check:** a subscription on one of the site's `planIds` (any plan, without them) that's `Active`/`Alert`, or `Cancelled` but paid up until `ends_at`.

### 4a. Supporting Cast's rate limit

Supporting Cast rate-limits its API, and the network's other uses (e.g. the Football Clichés games page login) share the allowance. So the auth lambda calls it as little as possible, with hard caps:

- **A mirror of who subscribes**, synced every 2 hours (`GET /subscriptions` and `GET /users` with `updated_since`: usually one call each per run). It holds Supporting Cast user IDs, HMAC-SHA256 hashes of their emails (the key is in SSM), and each subscription's plan, status and end date. It never holds emails, names or anything else. The first sync pages through everything, 100 per call. It fetches at most 20 pages per run (`syncPagesPerRun`), so a few thousand subscribers take a few runs.
- **Logins:** an email that isn't a subscriber's makes no calls. A subscriber's makes one (`send_login_email`). Completing the login and refreshing sessions use the mirror (no calls).
- **Caps:**
  - at most 100 login emails a day per site (`loginEmailsPerDay`); past that, every login gets "try again later", so the cap reveals nothing about who subscribes
  - 3 login requests per email per day
  - 10 login requests per IP per hour
  - the HTTP API's throttling (5 requests/second)
- **Kill switch:** `"enabled": false` in the site's SSM settings pauses logins and syncs within 5 minutes. Listeners who are logged in stay logged in. Removing `supporting-cast` from the site's providers turns it off entirely.
- **Trade-off:** someone who just subscribed can log in after the next sync (up to 2 hours). The dialog says so.

Estimated calls a day for listenfairplay. GoatCounter shows about 1,500 visits a month to `/` (about 50 a day). The 100 and 300 columns are the planning ceilings. The estimates assume about 10% of visitors are Dreamland subscribers; each logs in once per device, then stays logged in while they visit monthly.

| | Today (~50 visits/day) | 100 visits/day | 300 visits/day (busy) |
| --- | --- | --- | --- |
| Sync (`GET /subscriptions` + `GET /users`, 12 runs) | 24 | 24 | 24 |
| Login emails, launch month | 2–5 | 5–10 | 15–30 |
| Login emails, after that | ~1 | ~2 | ~5 |
| **Total per day** | **~25–30** | **~26–35** | **~30–55** |
| Hard ceiling (any traffic, including abuse) | 124 | 124 | 124 |

The first sync is extra: about (users + subscriptions) / 100 calls, once (e.g. 80 calls for 5,000 users and 3,000 subscriptions), at most 20 per run. The sync is most of the steady-state total. A 6-hour schedule (`supporting_cast_sync_schedule`) would make it 8 a day, with a longer wait for new subscribers. For comparison, the first version of the stack made 5 calls per login, 1–2 per unknown email (unbounded under abuse), and 1 per active subscriber every 5 days.

### 4b. Patreon

- **One OAuth client for every site, registered by browse.show's own Patreon account.** With the `identity.memberships` scope, a login sees the listener's memberships to every campaign, not just the client owner's. So a site needs no API keys from its creators, only the campaign ID and which tiers count. Both are public: Double Pivot is campaign `1631945`, with tiers Subscriber (`2479339`, $3), Mousa Dembele (`2479345`, $10), Expecting Goals (`22041304`, $10) and Double Double (`22041320`, $17). The hosts should still agree, and say which tiers include the premium episodes. A site can use a client the creator registers instead (`client` in its settings).
- **Login:** OAuth (4, OAuth flow), with 2 calls to Patreon: the token exchange and `GET /api/oauth2/v2/identity?include=memberships.campaign,memberships.currently_entitled_tiers`. Access: `patron_status: active_patron` on the site's campaign, on one of its `tierIds` (any tier, without them).
- **Sessions:** we keep none of Patreon's tokens, so nothing to store, and sessions end 30 days after login (then one click to log in again). A cancelled patron keeps access until then, at most.
- **Webhooks:** not used. They'd need a client registered by the creator, and they would only re-check access between logins, which 30-day sessions don't need.
- **Rate limits:** 100 requests every 2 seconds per client, and 100 a minute per listener token. At 10–500 visitors a day, that's far away.
- **Testing:** Patreon has no sandbox; its docs suggest dummy accounts. That gives three checks:
  - Locally: the fake Patreon in `bds dev client --subscriber-demo` (no Patreon at all).
  - Before deploying: `pnpm --filter @browse-dot-show/auth-lambda patreon-check` with the client's Creator's Access Token shows what your account's memberships look like.
  - On prod: log in with your own account. A paying membership to the site's campaign works; so does a free test campaign (a second account's creator page with a free tier), with its ID as the site's `campaignId`, `"allowFreeMembers": true` and no `tierIds`. With a test campaign, put the real settings back afterwards.

### 5. Subscriber API: one opt-in Lambda per site

`subscriber-api-<site>`: the search lambda package started in subscriber mode (env `CONTENT_SCOPE=subscriber`, plus `SUBSCRIBER_TOKEN_PUBLIC_KEY`). It's routed from the site's existing API Gateway at `POST /subscriber`, so CORS and the domain stay the same. Every request needs a valid token for that site. Actions:

| Action | Returns |
|---|---|
| `search` | Same request/response as the public search, against the combined index |
| `manifest` | The subscriber manifest's episodes, without `originalAudioURL` |
| `episode {id: "s<n>"}` | Presigned S3 URLs (a few hours) for the audio and the search-entries JSON |
| health check | Loads the index (warming on the same schedule as public; direct invocations need no token) |

- **Presigned URLs, not CloudFront signed cookies:** no key group or extra CloudFront config. Audio egress comes straight from S3 (100 GB/month is free, and usage is tiny).
- **Separate from the public lambda,** so a subscriber bug or OOM can't take down public search.
- **Cost:** idle memory is free, warming is about 8.6k invocations/month (in the free tier), and the index storage is cents.

### 6. Client

- **Build-time opt-in:** a `VITE_SUBSCRIBER_ACCESS` JSON (launch status, providers, labels, auth URL) is set only for sites with `subscriberAccess`. Other sites' bundles include the code, but it stays inert. The auth URL is `SUBSCRIBER_AUTH_API_URL` in `@browse-dot-show/constants`, which stays empty until `terraform/auth` is deployed, and the feature stays hidden without it. `VITE_SUBSCRIBER_AUTH_API_URL` overrides it locally.
- **Runtime flag:** `?subscriberPreview=1` sets it in `localStorage` and `?subscriberPreview=0` clears it. Without the flag (until a site is launched), nothing changes.
- **UI:**
  - A "Subscriber login" entry in the header opens a dialog (email for Supporting Cast; a dev code for `dev-code`).
  - An `/auth/callback` route.
  - A logged-in state with log out.
- **When logged in:**
  - Search goes to `/subscriber` with the token.
  - `s<n>` results and `/episode/s<n>` use the subscriber manifest and presigned URLs.
  - The play-time limit is skipped. It's client-side today, so this is a UI change.
  - An expired or invalid token falls back to anonymous search with a notice.

### 7. Ingestion

- **Site config** (`site.config.json`, committed, no secrets):

  ```json
  "subscriberAccess": {
    "launchStatus": "preview",
    "providers": ["supporting-cast", "dev-code"],
    "subscriptionName": "Football Clichés",
    "subscribeUrl": "https://…",
    "subscriberFeeds": [
      { "podcastId": "football-cliches", "feedUrlEnvVar": "SUBSCRIBER_FEED_URL_LISTENFAIRPLAY_FOOTBALL_CLICHES", "rssFeedFile": "football-cliches-subscriber.xml" }
    ]
  }
  ```

- **Feed URLs** come from `.env.local` on the machine that ingests (dev Mac, runner Mac). Missing means skipped with a warning, never failed.
- **`bds ingest`** runs a subscriber pass for opted-in sites alongside each phase:
  1. pre-sync `subscriber/`
  2. RSS (scope `subscriber`, counterparts skipped)
  3. transcription (separate worker batches with `CONTENT_SCOPE=subscriber`)
  4. indexing (the combined index, rebuilt after the public one or when subscriber transcripts change)
  5. upload `subscriber/`, only once the site's committed `prod.tfvars` has `enable_subscriber_access = true`
  6. refresh `subscriber-api-<site>`

  `--dry-run` shows the pass.
- **Validation:** `bds validate sites` checks the new config.

## PR stack

Each PR keeps every existing site working and leaves the feature dark.

- **Deploy impact:**
  - PRs that add packages change `pnpm-lock.yaml`, so CI plans every site and re-uploads every client. No changes are expected.
  - PRs that change shared lambda code change every site's lambda zips: 23 sites with lambda updates and no behavior change, which needs approval.
- **Verified locally** (no AWS), with a fake subscriber feed built from the public Football Clichés feed:
  - Ad-free copies were matched and left out.
  - Bonus episodes went to `subscriber/` with `s<n>` IDs.
  - The combined index returned public and subscriber hits.
  - The subscriber API returned 401 without a token.
  - Feed tokens never appeared in logs.

| # | Branch | What | AWS / approval |
|---|---|---|---|
| 1 | `feat/subscriber-access-plan` | This plan + AGENTS.md pointer | – |
| 2 | `feat/subscriber-auth-tokens` | `packages/auth`: Ed25519 session tokens | Lockfile: full plan, no changes expected |
| 3 | `feat/subscriber-auth-providers` | Providers (Supporting Cast, dev-code) + `packages/auth-lambda` | Lockfile: full plan, no changes expected |
| 4 | `feat/subscriber-content-scope` | `subscriberAccess` site config + validation; `CONTENT_SCOPE` key prefixes; `s<n>` IDs | Lambda zips change |
| 5 | `feat/subscriber-rss-retrieval` | Subscriber feeds → `subscriber/`, counterpart matching, URL redaction in logs | Lambda zips change |
| 6 | `feat/subscriber-search-index` | Combined subscriber index | Lambda zips change |
| 7 | `feat/subscriber-api` | Subscriber API mode in the search lambda | Lambda zips change |
| 8 | `feat/subscriber-ingest-pass` | `bds ingest` subscriber pass | Lambda zips change (process-audio) |
| 9 | `feat/subscriber-terraform` | `enable_subscriber_access` (sites) + `terraform/auth` | Full plan, no changes expected for sites; auth stack applied by the developer |
| 10 | `feat/subscriber-client` | Login, callback, subscriber search/episodes, no play cap | Clients re-uploaded (inert) |
| 11 | `feat/subscriber-auth-rate-limits` | Supporting Cast mirror + sync, login links, 30-day sessions, rate limits (4a) | Lockfile: full plan, no changes expected; auth stack gains a DynamoDB table and schedule |

**Next, once merged (needs the developer):**

1. Deploy `terraform/auth`: create the SSM signing key, email hash key and dev code, apply, commit `SUBSCRIBER_AUTH_API_URL`.
2. Enable listenfairplay in one PR:
   - `subscriberAccess` (preview, `dev-code`)
   - `enable_subscriber_access = true` + `subscriber_token_public_key` in `prod.tfvars`
   - re-apply `terraform/auth` (new site origin)
3. Put the subscriber feed URL in `.env.local` (dev and runner Macs), then run `bds ingest --sites=listenfairplay` and check the matching report in the log.
4. Test on prod with `?subscriberPreview=1` and the dev code.
5. Supporting Cast for real: the hosts' API token, network ID and feed ID in SSM; add `supporting-cast` to providers; confirm the callback parameter.
6. Launch: `launchStatus: "live"`, drop `dev-code`.

## Decisions (2026-10-14)

- **Phase 1, bonus episodes only:** ad-free counterparts are left out.
- **Merging:** review the whole stack, then merge it in order in one sitting.
- **Auth stack:** deployed together, step by step (the developer runs the commands).
- **Feed URL:** in `.env.local` on the dev Mac; the runner Mac needs it too before its nightly runs ingest subscriber episodes.

## Open questions

1. **Supporting Cast (ask the hosts / help@supportingcast.fm):**
   - Is the rate limit per API token or for the whole network, and what is it (per minute, per day)? Can it be raised for a separate token?
   - Does `send_login_email` keep `redirect_url`'s query string (our login link)? Must the redirect domain be allowlisted?
   - Which subscription plan ID(s) grant Dreamland access? Do gifted and invited listeners get a subscription record (the mirror only sees subscriptions)?
   - Does the network have webhooks (its security events mention "webhook subscriptions")? They could replace the polling sync.
2. **Session length:** 30 days, refreshed daily (implemented).
3. **Abuse of `/login`:** per-IP, per-email and daily caps (implemented). If bots show up anyway, Cloudflare Turnstile (free) could go in front of the email form.
