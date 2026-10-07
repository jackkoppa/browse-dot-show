# 01: Scripts Inventory

> **Status after session 1 (2026-10-06):** every item below is resolved. Delete/merge items are gone; kept behavior now lives in `scripts/cli/` (commands), `scripts/ingestion/` (pipeline + parallel transcription) and `scripts/lib/` (shared modules). `scripts/utils/` no longer exists. Decisions on the "Ask" items: [06](./06-session-1-decisions.md). This table is kept as a record of the starting point.

Every script and runnable entry point as of October 2026, with a recommendation:

- **Delete:** no live references, or superseded.
- **Merge:** fold into a shared module or CLI command.
- **Keep:** keep the behavior, though it may be moved or renamed.
- **Ask:** confirm with the developer first.

"Used by" comes from `git grep` across `package.json` files, scripts, docs and Terraform. ⚠️ marks items that are part of keeping deployed sites working; see [05](./05-deployed-sites-invariants.md).

## 1. Top-level `scripts/*.ts`

| Script | What it does | Used by | Recommendation |
| --- | --- | --- | --- |
| `run-ingestion-pipeline.ts` (~2,000 lines) | Full pipeline: S3→local pre-sync, RSS, transcription, local indexing, local→S3 sync, CloudFront invalidation. Uses `.env.automation` credentials and assumes a role in each site's account. | `ingestion:run-pipeline:*`, `automation-management.ts` | ⚠️ **Keep + split** into `scripts/ingestion/` modules (its own header TODO suggests this). Implement its open `--local-run-only` TODO, or drop it. |
| `run-local-transcriptions-multi-terminal.ts` | Parallel local transcription across Terminal.app windows; single site or all sites. | `ingestion:run-local-transcriptions:multi-terminal` | **Merge** into the pipeline's transcription phase (see [04](./04-parallel-transcription.md)). |
| `trigger-individual-ingestion-lambda.ts` | Run one ingestion lambda (rss / process-audio / srt-indexing) locally or in prod, for chosen sites. | `ingestion:trigger-individual-lambda:interactive`, site creator, multi-terminal runner | **Keep** as a CLI subcommand (`lambda run`), built on the shared "run lambda locally" module. |
| `run-lambda-for-site.ts` | Another "run a lambda for a site" runner. | Only `process-audio-lambda`'s `run:spelling-corrections:site` | **Merge** into the shared runner; then delete. |
| `build-lambda-for-site.ts` | Build a lambda with a site's env. | Nothing. Also fails typecheck (missing `.js` import extensions). | **Delete** (Ask if unsure). |
| `automation-management.ts` (756 lines) | LaunchAgent-based "run on login, at most once per 24h" automation; needs `sudo`. Never worked reliably. | `ingestion:automation:manage`, deployment guide | **Delete.** Replaced by M5 (see [03](./03-mac-automation.md)). Reuse ideas such as the last-run timestamp and battery check if useful. |
| `run-combined-retrieve-and-process-all-sites.ts` | Older all-sites RSS + transcribe + index loop. | Nothing | **Delete.** Superseded by the pipeline. |
| `s3-sync.ts` | Standalone S3 sync. | Nothing; its logic was copied into the pipeline. | **Delete**, after moving the sync code into a shared module (M2). |
| `upload-all-client-sites.ts` | Near-duplicate of `deploy/upload-all-client-sites.ts`. | Nothing (`package.json` uses the `deploy/` copy) | **Delete.** |
| `migrate-aws-resource-names.ts` | One-off AWS resource rename migration. | Nothing | **Delete.** |
| `update-terraform-resource-names.ts` | One-off Terraform rename migration. | Nothing | **Delete.** |
| `test-cross-account-access.ts` | One-off check that the automation account can assume site roles. | Nothing | **Merge** the useful part into a `doctor` / `schedule status` check ("can automation reach every site?"), then delete. |
| `site-setup-directories.ts` | Creates local directories for a site. Has its own `CURSOR-TODO - Delete/rework`. | `site:setup-directories` | **Ask.** Probably fold into site creation or delete. |
| `create-site.ts` (10 lines) | Entry point for `site-creator/`. | `site:create` | **Keep** as CLI `site create`. |
| `client-dev.ts` | Starts client dev server for a chosen site and opens the browser. | `client:dev` | **Keep** as CLI `dev client`. |
| `run-with-site-selection.ts` | Wrapper that prompts for a site, loads env, then runs a quoted command string. | `site:deploy`, `site:destroy`, `validate:*`, `search-lambda:dev:health-check` | **Merge.** Replace with a shared `--site` flag + prompt helper used by every command, then delete. |
| `serve-site-assets.ts` | Serves local S3 assets for client dev. | `packages/client` `_serve-s3-assets` | **Keep** (dev only, but used by the client package). |
| `pnpm-deploy-with-versions-fix.ts` | Workaround for a pnpm deploy bug when packaging lambdas. | ⚠️ `__prepare-for-aws` in every lambda `package.json` | **Keep** (can move, but update all four lambda `package.json` files). Also fails typecheck today. |
| `worktree.ts` | Git worktree helper. | `worktree` | **Keep** (or Ask if still used). |
| `prereqs.sh` | Prerequisite checks (Hermit-centric). | `docs/GETTING_STARTED.md` | **Merge** into `setup machine` / `doctor`, then delete. |

## 2. `scripts/utils/`

| File | Notes | Recommendation |
| --- | --- | --- |
| `multi-terminal-runner.ts` | Base class plus a leftover proof-of-concept `main()` and mock script generator. | **Keep** base class (or replace per [04](./04-parallel-transcription.md)); delete the POC parts. |
| `site-selector.ts` | `discoverSites`, `loadSiteEnvVars` (hand-rolled `.env` parsing), site prompts. Logs "Found N sites" on every call. | **Merge** into one `lib/sites.ts`. |
| `env-validation.ts` | `loadEnvFile` + validations. | **Merge** with the above into `lib/env.ts`. |
| `automation-credentials.ts` | Loads `.env.automation`. | ⚠️ **Keep** behavior (needed by the scheduled pipeline). |
| `site-account-mappings.ts` | Reads gitignored `.site-account-mappings.json`. | ⚠️ **Keep.** |
| `generate-deployed-sites.ts` | Writes `.deployed-sites.json`, which `terraform/automation/locals.tf` reads. | ⚠️ **Keep.** |
| `aws-utils.ts`, `terraform-utils.ts`, `shell-exec.ts`, `file-operations.ts`, `logging.ts` | General helpers. | **Keep**, deduplicate. |
| `client-deployment.ts` | Client build + upload + invalidation. | ⚠️ **Keep.** |
| `pipeline-result-logger.ts` | Writes run summaries. | **Keep** (useful for `schedule status`). |
| `sync-consistency-checker.ts` | Local vs S3 diff, used by the pipeline. | **Keep.** |
| `lambda-utils.ts` | Only used by `build-lambda-for-site` / `run-lambda-for-site`. | Delete with them, or merge. |
| `reapply-spelling-corrections-to-all-transcripts.ts` | A runnable script living in `utils/`; also reachable via `pipeline --reapply-spelling-corrections`. | **Merge.** Keep one entry point (a CLI subcommand). |

## 3. `scripts/deploy/`

| File | Used by | Recommendation |
| --- | --- | --- |
| `site-deploy.ts` | `site:deploy`, site creator | ⚠️ **Keep** (CLI `site deploy`). |
| `site-destroy.ts` | `site:destroy` | **Keep** (CLI `site destroy`, with a strong confirmation). |
| `upload-client.ts` | `site-deploy.ts` | ⚠️ **Keep.** |
| `upload-all-client-sites.ts` | `client:upload-all-sites` | ⚠️ **Keep** (CLI `deploy clients --all`). |
| `deploy-homepage.ts`, `bootstrap-homepage-state.ts` | `homepage:*` | ⚠️ **Keep.** |
| `deploy-automation.ts`, `bootstrap-automation-state.ts` | `automation:*` | ⚠️ **Keep.** This deploys the automation IAM user and cross-account roles that the scheduled pipeline depends on. |
| `bootstrap-site-state.ts`, `check-prerequisites.ts` | `site-deploy`, `site-destroy`, site creator | ⚠️ **Keep.** |
| `manage-tfstate.ts` | Nothing found | **Ask** (header says it's "sourced by another script"; looks dead). |

## 4. `scripts/site-creator/`

Interactive new-site wizard. **Keep**, but switch it to the shared modules: it shells out to `trigger-individual-ingestion-lambda.ts` in several places. `platform-support.ts` and `packages/config/platform-support.json` (which includes a `episode-transcription-multi-terminal` feature row) should be updated if the multi-terminal command goes away.

## 5. Other

- `scripts/automation-logs/`: the logs are gitignored, the README is tracked. Logs from the old LaunchAgent and power-management attempts can be deleted. Decide where run logs live for M5 (e.g. `~/Library/Logs/browse-dot-show/`).
- `scratchpad/`: `migrate-terraform-state-buckets.ts` is a one-off (**Delete**). `UPDATING_DOCS_AND_LAMBDA_DEPLOYMENTS_FOR_LOCAL-FOCUSED_AUDIO_PROCESSING.md` describes the old LaunchAgent automation (**Delete**). `homepage-2025-08-04/` is **Ask**. Delete this `scripts-overhaul/` folder once the work is done.
- `.automation-config` (gitignored) is used by `automation-management.ts`. Delete it along with that script.

## 6. `package.json` commands (root)

The current commands are inconsistently named (`ingestion:run-pipeline:triggered-by-schedule`, `ingestion:trigger-individual-lambda:interactive`, `ingestion:run-local-transcriptions:multi-terminal`, …). Target: one entry point plus a few direct shortcuts. See [02](./02-unified-cli.md). Keep the workspace-level ones (`all:build`, `all:test`, `all:lint`, `prepare`) as they are.

## 7. Cross-cutting cleanups

- Every script hand-rolls argument parsing (`arg.startsWith('--sites=')`). Use `node:util` `parseArgs`.
- `// @ts-ignore - prompts types not resolving` appears in several deploy scripts. Fix the typing once.
- Make `tsc --noEmit -p scripts/tsconfig.json` pass and add it to lint-staged or CI.
- `trigger-individual-ingestion-lambda.ts` re-spreads `PROCESS_ID` / `LOG_FILE` / `TERMINAL_TOTAL_MINUTES` after already spreading `process.env`, which is redundant.
- Keep `NODE_OPTIONS=--max-old-space-size=9728` in one place (the CLI launcher) rather than in every `package.json` command.
