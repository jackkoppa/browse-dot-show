# Changelog

Notable changes to how you run, develop and deploy `browse-dot-show`. Versions are [git tags](https://github.com/jackkoppa/browse-dot-show/tags).

> [!IMPORTANT]
> **Using this repo from before October 6, 2026?** Scripts, commands and some docs changed a lot after [`v0.0.1`](https://github.com/jackkoppa/browse-dot-show/tree/v0.0.1). If your local scripts and deployments already work, you may want to keep working from `v0.0.1` (`999e345`) for now:
>
> ```bash
> git checkout v0.0.1
> ```
>
> Deployed sites, AWS resource names, the S3 layout and your gitignored config files (`.env.local`, `.env.automation`, `.site-account-mappings.json`, `.local-files-config.json`, sites' `.env.aws-sso`) are unchanged.

## Unreleased (on the way to v1.0.0)

v1.0.0 will be tagged once deployments run from GitHub Actions and scheduled, unattended ingestion on a Mac works.

### Changed

- **One CLI: `pnpm bds`.** It replaces almost all root `package.json` scripts. Run `pnpm bds` for an interactive menu, or `pnpm bds help` for the list. Every command also runs non-interactively with flags.

  | Before (v0.0.1) | Now |
  | --- | --- |
  | `pnpm ingestion:run-pipeline:interactive` / `:triggered-by-schedule` | `pnpm bds ingest` (`--sites=a,b` or `--all-sites`) |
  | `pnpm ingestion:run-local-transcriptions:multi-terminal` | `pnpm bds ingest --parallel=N` (transcription for all sites with N workers, in one terminal) |
  | `pnpm ingestion:trigger-individual-lambda:interactive` | `pnpm bds lambda run` |
  | `pnpm site:create` | `pnpm bds site create` |
  | `pnpm site:deploy` | `pnpm bds site deploy --site=<id>` |
  | `pnpm site:destroy` | `pnpm bds site destroy --site=<id>` |
  | `pnpm client:upload-all-sites` | `pnpm bds site upload-client --all-sites` |
  | `pnpm client:dev` | `pnpm bds dev client --site=<id>` |
  | `pnpm homepage:dev` / `homepage:deploy` / `homepage:bootstrap-state` | `pnpm bds dev homepage` / `pnpm bds infra homepage deploy` / `… bootstrap-state` |
  | `pnpm automation:deploy` / `automation:bootstrap-state` | `pnpm bds infra automation deploy` / `… bootstrap-state` |
  | `pnpm validate:local` / `validate:prod` / `validate:consistency` | `pnpm bds validate local` / `prod` / `consistency` |
  | `pnpm search-lambda:dev:health-check` | `pnpm bds dev search-health --site=<id>` |
  | `pnpm worktree …` | `pnpm bds worktree …` |
  | `./scripts/prereqs.sh` | `pnpm bds doctor` |

- **Pipeline flags:** `--skip=<phase,...>` replaces the `--skip-*` flags. Phases: `pre-sync`, `rss`, `transcribe`, `index`, `s3-sync`, `cloudfront`.
- **Tools:** Hermit is gone. Use Node.js 22 (`.nvmrc`) and pnpm via Corepack (`corepack enable`).
- **Scripts layout:** `scripts/cli/` (commands), `scripts/ingestion/` (pipeline), `scripts/lib/` (shared modules). `scripts/utils/` is gone.

### Added (scheduled ingestion)

- **Nightly ingestion on a Mac with nobody logged in** ([docs](docs/scheduled-ingestion.md)): `bds schedule install` sets up a LaunchDaemon, a wake schedule and a runner checkout that follows `origin/main`; `bds schedule status | run-now | uninstall | test-notifications`; `bds schedule run` is what launchd runs (checks, runner update, `ingest --all-sites`, run records, Slack and healthchecks.io notifications).
- **Setting up a Mac:** `Brewfile` + `./scripts/bootstrap.sh`, `bds setup machine` (local files, whisper.cpp + model, env files, Mac settings, doctor) and `bds setup benchmark` (picks `transcriptionWorkers`). Homebrew's `whisper-cli` is supported through a checkout-like folder, so the transcription lambda is unchanged.
- **One ingestion run at a time:** `bds ingest` holds `<localFilesPath>/locks/ingestion-run.lock`; a second run exits with code 75.
- `bds ingest --summary-json=<path>`: a machine-readable run summary.

### Changed (scheduled ingestion)

- Run history and transcription worker logs moved from `scripts/automation-logs/` to `~/Library/Logs/browse-dot-show/` (the old run history is copied over on the first run).

- **A missing local files folder stops the run.** When the configured `localFilesPath` doesn't exist (e.g. the SSD isn't mounted), `bds ingest` (not `--dry-run`) exits, a scheduled run is skipped, and `bds doctor` / `schedule status` say so, instead of falling back to the repo's `aws-local-dev` (where a run would download every site from S3).

### Changed (deploys)

- **GitHub Actions deploys** (`.github/workflows/terraform-plan.yml`, `deploy.yml`; [docs](docs/github-actions-deploys.md)): read-only plans on PRs (one job per AWS account) with a PR comment, an approval for every plan with changes, and deploys of what changed on merge (Terraform applies, then client uploads). On since 2026-10-08.
- `terraform/github-actions/` + `bds infra github-actions deploy`: GitHub's OIDC provider and two roles per AWS account (`browse-dot-show-gha-plan`, read-only, for PRs; `browse-dot-show-gha-deploy`, for `main`).
- `bds ci affected` / `ci terraform` / `ci terraform-group` / `ci plan-comment` / `ci upload-homepage`: building blocks for GitHub Actions deploys (what changed, plan summaries, plan/approve/apply). CI downloads each site's deployed lambda layer zips, since they aren't in git; change a layer with a local deploy.
- The 18 leftover cloud RSS schedules (`daily-rss-processing-<site>`, off by default since Sep 2025) were removed; ingestion runs locally.
- `bds site deploy` passes the OpenAI key to Terraform as `TF_VAR_openai_api_key` instead of a `-var` argument, so it no longer appears in logs or in the saved plan file.
- `.site-account-mappings.json` is now committed (GitHub Actions deploys read it). `bds site deploy` still updates it after an apply; commit the change.

### Removed

- The LaunchAgent-based "run on login" automation (`ingestion:automation:manage`), replaced by `bds schedule` (a LaunchDaemon: no login needed).
- The Terminal.app multi-terminal transcription runner, replaced by `bds ingest --parallel=N`.
- One-off migration scripts and other unused scripts.

### Fixed

- `automation:deploy` (now `bds infra automation deploy`) looked for `.site-account-mappings.json` relative to the Terraform directory.
- `bds infra automation deploy` failed at `terraform plan` (its per-site `site_account_ids` tfvars map covered 6 of 23 sites). The automation user's assume-role policy is now built from the distinct account IDs in `.site-account-mappings.json`, and `.deployed-sites.json` is no longer used. Remove `deployed_sites` and `site_account_ids` from your `terraform/automation/terraform.tfvars`.
- Reapplying spelling corrections processed every transcript twice.
- `bds ingest` now re-indexes sites whose transcripts are newer than their search index, so episodes transcribed outside the pipeline (e.g. `bds lambda run`) get indexed without `--force-local-indexing`.
- `bds worktree create` symlinks the main checkout's gitignored config (`.env.*`, sites' `.env.aws-sso`, `.local-files-config.json`, …) into the new worktree. `bds worktree link-config <path>` does the same for an existing worktree.
- Local indexing rewrote every `search-entries/*.json` on each run (local `listFiles` isn't recursive, so existing files were never found), so every run re-uploaded all of them to S3. It now rewrites only missing files and files whose transcript changed.
- Local transcription locks are now one file per episode, created atomically, in `{localFilesPath}/locks/transcription/<site>/`, instead of a read-modify-write `transcripts/.processing-lock.json` in a folder that's synced to S3. Locks whose process has exited are taken over. (Runs in AWS still use the JSON lockfile.)
- `bds site upload-client --site=<id>` read the bucket and CloudFront ID from `terraform output`, i.e. from whichever site `terraform/sites` was last initialized for, so it could upload to another site's bucket. It now reads them from `.site-account-mappings.json`, and uses environment credentials when `AWS_PROFILE` isn't set.
- Lambda `aws-dist/package.json` lists dependencies in a stable order, so unchanged code builds an identical zip.
- The search-lambda refresh wrote to a fixed `/tmp/lambda-invoke-output.json`, which failed ("Permission denied") when another user had created it; it now uses a per-run temp folder.

## v0.0.1 (2026-10-06)

The state of the repo before the scripts overhaul: [`999e345`](https://github.com/jackkoppa/browse-dot-show/tree/v0.0.1).
