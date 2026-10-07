# 05: Deployed-Sites Invariants (Don't Break These)

Everything developer-facing can change. The things below are what the **live sites** and their update path depend on. Changing them means a coordinated infrastructure change; ask the developer first.

## Live sites (from `sites/origin-sites/*/site.config.json`)

celebritymemoirbookclub, claretandblue, doublepivot, drivetowork, eggplant, fromtherookeryend, hardfork, haveaword, hiddenbrain, iwltrubbish (`iwantlistenthisrubbish.com`), libero, limitedresources, listenfairplay (`listenfairplay.com`), lordsoflimited, luckypaper, myfavoritemurder, naddpod, officeladies, pickleballstudio, screenrot, searchengine, spoutlore, wattsoccurring. All the others are served at `<id>.browse.show`. There's also the homepage at `browse.show`.

## Invariants

**AWS resource names and contracts used by scripts**

- Cross-account role `arn:aws:iam::<siteAccountId>:role/browse-dot-show-automation-role`, assumed by the pipeline using the automation IAM user's keys from `.env.automation`. Both are defined in `terraform/automation/`.
- Lambda names:
  - `rss-retrieval-<siteId>`
  - `whisper-transcription-<siteId>`
  - `srt-indexing-<siteId>`
  - `search-api-<siteId>`

  The pipeline invokes `search-api-<siteId>` with `{"forceFreshDBFileDownload": true}` after uploading a new index.
- The S3 bucket per site, and the **key layout** inside it: `audio/`, `transcripts/`, `episode-manifest/`, `rss/`, `search-entries/`, `search-index/`. The client and the search lambda read these paths, so any change to sync code must produce identical keys. The local mirror lives under `<local-files>/s3/sites/<siteId>/…` (`packages/config` → `getLocalS3SitePath`).
- CloudFront invalidation after uploads (`invalidateCloudFrontWithCredentials` in `scripts/utils/client-deployment.ts`).

**Config files (gitignored; formats can change only if you migrate them for the developer)**

- `.env.automation`: automation user credentials plus `SCHEDULED_RUN_MAIN_AWS_PROFILE`.
- `.site-account-mappings.json`: site → AWS account ID / bucket / CloudFront / search API URL. Committed since M4b. **Read by `terraform/automation/locals.tf`** (the automation user's assume-role policy covers each site account) and by GitHub Actions deploys. `.deployed-sites.json` is gone.
- `sites/origin-sites/<id>/.env.aws-sso`: per-site SSO profile, used for interactive deploys.
- `.local-files-config.json`: where local audio, transcripts and indexes live (potentially hundreds of GB; never delete or move it automatically).

**Build / deploy path**

- The `__prepare-for-aws` command in each lambda package (`rss-retrieval`, `process-audio`, `srt-indexing`, `search-lambda`) calls `scripts/pnpm-deploy-with-versions-fix.ts`. Moving that script means updating all four `package.json` files.
- `scripts/deploy/*`: site deploy/destroy, client upload, homepage, automation infra, Terraform state bootstrap. Restructure the CLI around these freely, but keep the Terraform invocation (backend config, `tfvars` paths, state buckets) behaving the same.
- `terraform/sites/**`, `terraform/homepage/**`, `terraform/automation/**`: out of scope for this work. In particular, keep the `eventbridge` module and `enable_search_lambda_warming` (enabled for every site). `enable_rss_processing_schedule` is optional and off; leave it alone.
- `packages/client` `_serve-s3-assets` → `scripts/serve-site-assets.ts` (dev only, but referenced by package scripts).

**Ingestion semantics**

- Spelling corrections and the Whisper prompt come from site config. The local transcription output (`.srt` next to the matching `audio/` path under `transcripts/`) is what indexing and the client expect.
- Pre-sync S3→local before processing, so a machine that's been offline doesn't re-download or re-transcribe everything, and doesn't upload stale state.

## Smoke-test checklist (run before merging each milestone)

Commands are shown with today's names; update them as the CLI changes.

1. `tsc --noEmit -p scripts/tsconfig.json` and `pnpm all:lint`.
2. `pnpm all:test`.
3. Pipeline dry run for all sites: `--dry-run` (no AWS writes). Check that every site resolves an account, bucket and role.
4. Real pipeline run for **one** low-traffic site, with the developer's OK. Confirm new episodes appear on the live site and search returns them.
5. If deploy code changed: `site deploy` for one site shows a Terraform plan with **no changes**.
6. If client upload code changed: upload one site's client and load the site.
7. If lambda packaging changed: build each lambda package and compare the zip contents to `main`.
