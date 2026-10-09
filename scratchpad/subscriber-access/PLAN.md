# Subscriber access: plan

**Goal:** on a few sites (first: listenfairplay, Football Clichés on Supporting Cast), a listener who pays for the podcast can log in with that subscription and then:

1. search the subscriber-only episodes too (with no duplicates when an episode is in both feeds),
2. open and listen to them,
3. listen without the 5-minute cap.

Later: Libero (also Supporting Cast), Patreon sites, and subscriber-only features (e.g. search filters) with "subscribe to do this" prompts.

**Constraints**

- **Cheap.** All 23 sites cost $10–15/month and the total should stay under $20. Use only resources that are free indefinitely or cost per use: Lambda, Lambda function URLs, SSM Parameter Store (standard), S3. No databases, NAT gateways, Secrets Manager or always-on servers.
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

Matching happens twice. RSS retrieval skips counterparts, so they're never downloaded or transcribed. Indexing re-checks, and leaves out a subscriber episode whose public version appeared later (e.g. subscribers got it a week early). Same title within 14 days, or a near-identical title within 2 days; `episode-matching.ts` in `@browse-dot-show/constants`. Tune it against the real feeds.

**Phase 1 (recommended): bonus episodes only.** Counterparts are skipped. Subscribers get the public (ad-supported) version of shared episodes and the subscriber-only episodes on top. That's no extra transcription and no ambiguity.
**Phase 2 (optional): ad-free versions.** Transcribe counterparts too, and replace the public episode with the `s` version in the combined index. Timestamps differ from the ad version, so it needs its own transcript. That's a one-time backlog of transcription on the runner.

### 4. Auth: one shared, stateless auth lambda

- **Where it runs:** `terraform/auth/` in account 297202224084 (next to the homepage). The state is in the homepage's state bucket under `subscriber-auth/`. One Lambda behind an **HTTP API**, with CORS for the opted-in sites' origins (read from their site configs) and throttling (5 req/s, burst 10) to bound cost and abuse.
  - Why not a function URL: public function URLs now need an `InvokeFunction` permission with a function-URL condition, which the pinned AWS provider (5.31) can't create.
  - Why not reserved concurrency: it fails on accounts with a low concurrency limit.
  - The API costs $1/million requests.
- **Deploying it:** applied locally, like `terraform/automation` (CI notes changes but doesn't apply them). Setup steps are in [terraform/auth/README.md](../../terraform/auth/README.md).
- **Secrets:** SSM Parameter Store SecureStrings: the Ed25519 signing key, and each site's provider settings (e.g. the Supporting Cast API token and network ID). They're read once per cold start.
- **Providers** implement one interface, so Patreon fits later without changing the flow:
  - `startLogin({ email | nothing, returnUrl })` returns `{ kind: 'email-sent' }` (Supporting Cast magic link) or `{ kind: 'redirect', url }` (Patreon OAuth).
  - `completeLogin(callbackParams)` returns the verified subscriber or null.
  - `refresh(subscriberRef)` re-checks that the subscription is still active.
- **Supporting Cast flow:**
  1. `POST /login {site, email}`: look up the user (`POST /users/search {email}`), and if they have an active subscription on an allowed plan, call `POST /users/{id}/send_login_email {redirect_url: https://<site>/auth/callback}`. The response is always "if you're a subscriber, check your email" (no account enumeration).
  2. The magic link sends the user back to `/auth/callback?...`. The client posts the query params to `POST /complete`, and the provider checks them (expected: `POST /users/search {login_token}`, then `GET /users/{id}/subscriptions`).
  3. The auth lambda returns a **session token**.
- **Session token:** a compact JWT signed with Ed25519 (`node:crypto`, no dependency). Claims: `iss`, `aud` (site ID), `sub` (`<provider>:<user id>`), `scope: "subscriber"`, `iat`, `exp` (7 days). The client stores it in `localStorage` and calls `POST /refresh` when it has under 2 days left; refresh re-checks the provider. A cancelled subscription keeps access for at most 7 days. No database.
- **Verification** happens in the site's subscriber lambda, with the public key (an env var; public keys are committed). It costs microseconds with no network call.
- **Mock / dev provider (`dev-code`):** for testing on prod before any provider credentials exist. `/complete {siteId, provider: "dev-code", params: {code}}` checks the code against SSM `/browse-dot-show/auth/dev-code` and issues a token with `sub: "dev-code:<label>"`. It's enabled per site (`providers` in config), and the UI offers it only while the site is in `preview`.
- **Supporting Cast access check:** if `feedIds` is set in the site's SSM settings, the listener needs access to one of those feeds (`GET /users/{id}/feeds`, which covers gifts and invites). Otherwise any `Active`/`Alert` subscription counts, or a `Cancelled` one that's paid up until `ends_at`.

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

**Next, once merged (needs the developer):**

1. Deploy `terraform/auth`: create the SSM signing key and dev code, apply, commit `SUBSCRIBER_AUTH_API_URL`.
2. Enable listenfairplay in one PR:
   - `subscriberAccess` (preview, `dev-code`)
   - `enable_subscriber_access = true` + `subscriber_token_public_key` in `prod.tfvars`
   - re-apply `terraform/auth` (new site origin)
3. Put the subscriber feed URL in `.env.local` (dev and runner Macs), then run `bds ingest --sites=listenfairplay` and check the matching report in the log.
4. Test on prod with `?subscriberPreview=1` and the dev code.
5. Supporting Cast for real: the hosts' API token, network ID and feed ID in SSM; add `supporting-cast` to providers; confirm the callback parameter.
6. Launch: `launchStatus: "live"`, drop `dev-code`.

## Open questions

1. **Ad-free counterparts:** Phase 1 bonus-only (recommended) or ad-free replacements from the start?
2. **The subscriber feed URL** for Football Clichés goes in `.env.local` (`SUBSCRIBER_FEED_URL_LISTENFAIRPLAY_FOOTBALL_CLICHES`) on the dev and runner Macs. It's needed to tune matching against real titles and dates.
3. **Supporting Cast (ask the hosts / help@supportingcast.fm):**
   - What does the `send_login_email` magic link append to `redirect_url`? `login_token` is assumed; `callbackTokenParams` handles others.
   - Must the redirect domain be allowlisted?
   - Rate limits?
   - Which feed ID(s) should grant access?
4. **Session length:** 7 days with refresh (implemented).
5. **Abuse of `/login`:** the HTTP API's throttling caps it. Per-email throttling would need state (DynamoDB's always-free tier) and is deferred unless needed.
