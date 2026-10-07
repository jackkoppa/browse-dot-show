# 10: Follow-ups

Captured from session 1 and from the review of the PR stack (#162–#168). Each item is either deferred on purpose or out of scope for the overhaul.

**Order (decided 2026-10-06):** do the small items here first (suggested sequence in [HANDOFF.md](./HANDOFF.md)), then M4b (which includes §1), then M5 (which includes §3). §2 waits for #156.

## Before or alongside M4b (GitHub Actions deploys)

1. **`bds infra automation deploy` fails at `terraform plan`.** `terraform/automation/main.tf` (and `outputs.tf`) index `var.site_account_ids[site_id]` for every site in `.deployed-sites.json`. The gitignored `terraform/automation/terraform.tfvars` maps only 6 sites, so the 7-site file already fails on `lordsoflimited`, and the regenerated 23-site file would too. Nothing gets applied; live sites and the current automation user are unaffected.
   - **Recommended fix:** build the assume-role policy from the distinct site **account IDs** (all 23 sites share 2 accounts, so 2 role ARNs), e.g. have `generate-deployed-sites.ts` also write the account IDs from `.site-account-mappings.json`, or pass them as a variable. That drops the per-site tfvars map.
   - Or: add the 17 missing sites to `terraform.tfvars`.
   - Review the plan before applying: it changes the automation user's IAM policy. Terraform was out of scope for session 1, so this wasn't changed.
2. **Node version.** This stack names Node 22 (`.nvmrc`, `engines`, docs), matching the dev machine and tonight's tests. Draft #156 moves the Lambdas to Node 24 and touches `.nvmrc`, `package.json`, the deployment guide and `scripts/deploy/README.md`. When rebasing #156 onto the merged stack, bump `.nvmrc`, `engines.node` and the docs (`docs/local-development.md`, `AGENTS.md`, `CHANGELOG.md`) to 24.

## Before M5 (Mac automation)

3. **Signal handling for unattended runs.** Fixed in #167: the lambda kills its whisper process on SIGINT/SIGTERM; `bds` forwards shutdown to its lambda children. Still worth testing under launchd: SIGTERM from `launchctl bootout`. ffmpeg chunking children aren't killed explicitly (they're short-lived; they die when their pipes close).
4. **Indexing after out-of-band transcription.** Phase 4 only indexes sites where *this run* created files. After a manual `bds lambda run` (or the old multi-terminal runner), you need `--force-local-indexing`. Index any site whose transcripts are newer than its search index instead.
5. **Lockfile robustness.** `transcripts/.processing-lock.json` is read-modify-write JSON (not atomic) and lives in a folder that's synced to S3. Removals are now verified (#167), and `bds` gives workers disjoint files, but per-file lock files (created atomically) outside synced folders would be sturdier.

## Smaller

6. **search-entries re-upload.** Re-indexing rewrites every `search-entries/*.json`, so `aws s3 sync` re-uploads all of them (405 files for 11 new on haveaword). Harmless but slow at scale; skip unchanged files (content hash) or only rewrite new entries. (An existing TODO in the pipeline.)
7. **`bds validate sites`: 34 errors on `main`.** Every `site.config.json` is missing `appHeader.includeAIUseDisclosure`. Add the field, or make it optional in validation.
8. **Worktree config files.** `bds worktree create` doesn't copy or symlink gitignored config (`.env.*`, `.site-account-mappings.json`, `.local-files-config.json`, sites' `.env.aws-sso`). Session 1 symlinked them by hand.
9. **Pre-existing type error** in `packages/ingestion/process-audio-lambda/utils/ffmpeg-utils.ts:357` (`error` is `unknown`); the package has no `tsconfig.json`/typecheck script.
