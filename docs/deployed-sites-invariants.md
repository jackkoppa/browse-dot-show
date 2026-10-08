# Deployed-Sites Invariants and Smoke Tests

Developer tooling (scripts, commands, docs, local config formats) can change freely. The things below are what the **live sites** and their update path depend on. Changing them means a coordinated infrastructure change; ask the developer first.

## Live sites

23 sites (`sites/origin-sites/*/site.config.json`, deployable ones in `.site-account-mappings.json`): celebritymemoirbookclub, claretandblue, doublepivot, drivetowork, eggplant, fromtherookeryend, hardfork, haveaword, hiddenbrain, iwltrubbish (`iwantlistenthisrubbish.com`), libero, limitedresources, listenfairplay (`listenfairplay.com`), lordsoflimited, luckypaper, myfavoritemurder, naddpod, officeladies, pickleballstudio, screenrot, searchengine, spoutlore, wattsoccurring. The others are served at `<id>.browse.show`. Plus the homepage at `browse.show`.

3 AWS accounts: `297202224084` (homepage, automation IAM user, Terraform state for shared stacks), `152849157974` (11 sites), `927984855345` (12 sites).

## Invariants

**AWS names and contracts**

- Cross-account role `arn:aws:iam::<siteAccountId>:role/browse-dot-show-automation-role`, assumed by `bds ingest` with the automation IAM user's keys from `.env.automation`. Both defined in `terraform/automation/` (its assume-role policy covers the account IDs in `.site-account-mappings.json`).
- GitHub Actions roles `browse-dot-show-gha-plan` / `browse-dot-show-gha-deploy` in each account (`terraform/github-actions/`); workflows derive the ARNs from account IDs. See [GitHub Actions deploys](./github-actions-deploys.md).
- Lambda names: `rss-retrieval-<siteId>`, `whisper-transcription-<siteId>`, `srt-indexing-<siteId>`, `search-api-<siteId>`. After uploading a new index, `bds ingest` invokes `search-api-<siteId>` with `{"forceFreshDBFileDownload": true}`.
- Lambda layers `ffmpeg-<siteId>` and `compress-encode-<siteId>`; CI downloads their deployed zips (see the GitHub Actions doc), so change them only with a local deploy.
- Each site's S3 bucket and its **key layout**: `audio/`, `transcripts/`, `episode-manifest/`, `rss/`, `search-entries/`, `search-index/`. The client and the search lambda read these paths, so sync code must produce identical keys. Local mirror: `<localFilesPath>/s3/sites/<siteId>/…` (`getLocalS3SitePath` in `packages/config`). File names are NFC (#184).
- CloudFront invalidation after uploads.
- AWS-side schedules: `search-lambda-warming-<siteId>` (EventBridge Scheduler, every 5 min, enabled for every site; keep it). `enable_rss_processing_schedule` is off by default and no site uses it (the 18 old schedules were removed in Oct 2026); ingestion runs locally.

**Config files**

- `.site-account-mappings.json` (**committed**): site → account ID, bucket, CloudFront ID/domain, search API URL. Read by `bds` commands, `terraform/automation/locals.tf` and GitHub Actions. `bds site deploy` updates it after an apply; commit the change.
- Gitignored (formats can change only if you migrate them for the developer):
  - `.env.automation`: automation user's keys (`chmod 600`).
  - `.env.local`: `OPENAI_API_KEY` (the process-audio lambda's environment, via Terraform) and other local settings.
  - `sites/origin-sites/<id>/.env.aws-sso`: the site's SSO profile, for interactive deploys.
  - `.local-files-config.json`: where audio, transcripts and indexes live (hundreds of GB on an external SSD; never delete or move it automatically), plus `transcriptionWorkers`.
  - `terraform/sites/lambda-layers/*.zip`: the layer zips (see that folder's README).
  - `terraform/automation/terraform.tfvars` (the account-0 admin profile). `terraform/github-actions/github-actions.tfvars` is committed.

**Build and deploy path**

- Each lambda package's `__prepare-for-aws` script calls `scripts/pnpm-deploy-with-versions-fix.ts` (which also sorts `aws-dist/package.json` keys so zips are reproducible). Moving it means updating all four lambda `package.json` files.
- `terraform/sites` lambdas zip `../../packages/<pkg>/aws-dist` (relative to where Terraform runs; `bds ci terraform-group` runs copies at `terraform/.ci-<slug>/`, the same depth).
- `scripts/lib/site-terraform.ts` holds the site Terraform invocation (backend config, tfvars, variables) shared by `bds site deploy` and `bds ci terraform`. Keep backends, tfvars paths and state buckets behaving the same.
- `packages/client` `_serve-s3-assets` → `scripts/serve-site-assets.ts` (dev only, referenced by package scripts).

**Ingestion semantics**

- Spelling corrections and the Whisper prompt come from site config. The `.srt` next to the matching `audio/` path under `transcripts/` is what indexing and the client expect.
- Pre-sync S3→local runs first, so a machine that's been offline doesn't re-download, re-transcribe or upload stale state. Transcription locks live outside synced folders (`<localFilesPath>/locks/`) and `*.processing-lock.json` is never synced.

## Smoke tests

Run before finishing a change. Items 5–8 touch real AWS: get the developer's go-ahead each time (they often prefer to run AWS commands themselves).

**Every change (local, no AWS)**

1. **Typecheck:** `pnpm --filter @browse-dot-show/scripts typecheck` (in a fresh worktree, first `pnpm --filter "@browse-dot-show/scripts^..." build`), and `pnpm --filter @browse-dot-show/process-audio-lambda typecheck` if you touched it. Both run on commit.
2. **Lint:** `pnpm all:lint`: 0 errors; the warning count shouldn't grow (42 in Oct 2026).
3. **Tests:** `pnpm all:test`.
4. **Dry run:** `pnpm bds ingest --all-sites --dry-run` exits 0 with all 23 sites; `pnpm bds doctor` shows 0 failures. `pnpm bds validate sites` passes.

**When the relevant code changed (AWS: ask first)**

5. **Ingestion:** `pnpm bds ingest --sites=haveaword`, then check new episodes appear on haveaword.browse.show and search finds them.
6. **Deploy code / Terraform:** a read-only plan for one site shows only what you expect: `pnpm bds ci terraform --target=site:haveaword --mode=plan` (or let the PR's plan comment show it for every site).
7. **Client upload:** `pnpm bds site upload-client --site=<id>`, then load the site.
8. **Lambda packaging** (`pnpm-deploy-with-versions-fix.ts` or any `__prepare-for-aws`): build each lambda package and compare the zip contents with `main`.

**Grep before deleting or moving anything:** `browse-dot-show-automation-role`, `browse-dot-show-gha-`, the lambda name prefixes, the S3 key prefixes, `.site-account-mappings.json`, `.env.automation`, `.env.aws-sso`, `.local-files-config.json`, `pnpm-deploy-with-versions-fix.ts`, `serve-site-assets.ts`.
