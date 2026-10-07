# 07: Smoke-Test Checklist

Run this before finishing each milestone. It's derived from [05](./05-deployed-sites-invariants.md). Commands use the `bds` CLI (since M3).

Items 4–7 touch real AWS. Get the developer's go-ahead each time.

## Every milestone (local only, no AWS)

1. **Typecheck:** `pnpm --filter @browse-dot-show/scripts typecheck` passes. In a fresh clone or worktree, first build the workspace packages it depends on: `pnpm --filter "@browse-dot-show/scripts^..." build`. It also runs in the pre-commit hook (lint-staged) whenever `scripts/**/*.ts` changes.
2. **Lint:** `pnpm all:lint` shows 0 errors. The baseline had 64 warnings (53 after M1); the count shouldn't grow.
3. **Tests:** `pnpm all:test` passes. Baseline: spelling 10, client 33, s3 22, validation 24, rss-retrieval 28, scripts 26, process-audio 10.
4. **Pipeline dry run, all sites:** `pnpm bds ingest --all-sites --dry-run`
   Exit code 0, all 23 sites listed, every phase prints "DRY RUN: Would …". Also `pnpm bds doctor` (0 failures).
   - The dry run makes **no** AWS calls. `bds doctor` checks every site has an account and bucket mapping; `bds doctor --aws` (read-only `sts:AssumeRole` per account) needs the developer's OK.

## When the relevant code changed (AWS: ask first)

5. **Real pipeline run, one site:** `pnpm bds ingest --sites=haveaword`. Afterwards, confirm new episodes appear on haveaword.browse.show and search finds them. If anything breaks, the site must be back up within a few hours.
6. **Deploy code changed:** `pnpm bds site deploy --site=<id> --interactive` for one site shows a Terraform plan with **no changes**.
7. **Client upload code changed:** `pnpm bds site upload-client --site=<id>`, then load the site.
8. **Lambda packaging changed** (`pnpm-deploy-with-versions-fix.ts` or any `__prepare-for-aws`): build each lambda package and compare the zip contents to `main`.

## Invariants to grep for before deleting or moving anything

- `browse-dot-show-automation-role`, the lambda name prefixes (`rss-retrieval-`, `whisper-transcription-`, `srt-indexing-`, `search-api-`)
- S3 key prefixes: `audio/`, `transcripts/`, `episode-manifest/`, `rss/`, `search-entries/`, `search-index/`
- `.deployed-sites.json` (read by `terraform/automation/locals.tf`), `.site-account-mappings.json`, `.env.automation`, `.env.aws-sso`, `.local-files-config.json`
- `pnpm-deploy-with-versions-fix.ts` (all four lambda `package.json` files)
- `serve-site-assets.ts` (`packages/client` `_serve-s3-assets`)
