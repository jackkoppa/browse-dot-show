# 07: Smoke-Test Checklist

Run this before finishing each milestone. It's derived from [05](./05-deployed-sites-invariants.md). Commands use the **current** names; update them as the CLI changes (M3).

Items 4–7 touch real AWS. Get the developer's go-ahead each time.

## Every milestone (local only, no AWS)

1. **Typecheck:** `pnpm --filter @browse-dot-show/scripts typecheck` passes. It also runs in the pre-commit hook (lint-staged) whenever `scripts/**/*.ts` changes.
2. **Lint:** `pnpm all:lint` shows 0 errors. The baseline had 64 warnings; the count shouldn't grow.
3. **Tests:** `pnpm all:test` passes. Baseline: spelling 10, client 33, s3 22, validation 24, rss-retrieval 28, scripts 26, process-audio 10.
4. **Pipeline dry run, all sites:**
   `NODE_OPTIONS=--max-old-space-size=9728 pnpm tsx scripts/run-ingestion-pipeline.ts --dry-run`
   Exit code 0, all 23 sites listed, every phase prints "DRY RUN: Would …".
   - ⚠️ At baseline, the dry run makes **no** AWS calls and **doesn't** resolve accounts, buckets or roles. It does append to `scripts/automation-logs/ingestion-pipeline-runs.md`. Once `bds doctor` / `bds ingest --dry-run` can resolve each site's account ID, bucket and role ARN from `.site-account-mappings.json` (and optionally run a read-only `sts:AssumeRole` per site), add that check here.

## When the relevant code changed (AWS: ask first)

5. **Real pipeline run, one site:** `haveaword`. Afterwards, confirm new episodes appear on haveaword.browse.show and search finds them. If anything breaks, the site must be back up within a few hours.
6. **Deploy code changed:** `site deploy` for one site shows a Terraform plan with **no changes**.
7. **Client upload code changed:** upload one site's client and load the site.
8. **Lambda packaging changed** (`pnpm-deploy-with-versions-fix.ts` or any `__prepare-for-aws`): build each lambda package and compare the zip contents to `main`.

## Invariants to grep for before deleting or moving anything

- `browse-dot-show-automation-role`, the lambda name prefixes (`rss-retrieval-`, `whisper-transcription-`, `srt-indexing-`, `search-api-`)
- S3 key prefixes: `audio/`, `transcripts/`, `episode-manifest/`, `rss/`, `search-entries/`, `search-index/`
- `.deployed-sites.json` (read by `terraform/automation/locals.tf`), `.site-account-mappings.json`, `.env.automation`, `.env.aws-sso`, `.local-files-config.json`
- `pnpm-deploy-with-versions-fix.ts` (all four lambda `package.json` files)
- `serve-site-assets.ts` (`packages/client` `_serve-s3-assets`)
