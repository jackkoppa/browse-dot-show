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

### Removed

- The LaunchAgent-based "run on login" automation (`ingestion:automation:manage`). Scheduled runs are planned as `bds schedule`.
- The Terminal.app multi-terminal transcription runner, replaced by `bds ingest --parallel=N`.
- One-off migration scripts and other unused scripts.

### Fixed

- `automation:deploy` (now `bds infra automation deploy`) looked for `.site-account-mappings.json` relative to the Terraform directory. (The automation deploy still needs a Terraform fix before it can plan: its `site_account_ids` tfvars map is incomplete.)
- Reapplying spelling corrections processed every transcript twice.
- `bds ingest` now re-indexes sites whose transcripts are newer than their search index, so episodes transcribed outside the pipeline (e.g. `bds lambda run`) get indexed without `--force-local-indexing`.
- `bds worktree create` symlinks the main checkout's gitignored config (`.env.*`, sites' `.env.aws-sso`, `.site-account-mappings.json`, `.local-files-config.json`, …) into the new worktree. `bds worktree link-config <path>` does the same for an existing worktree.
- Local indexing rewrote every `search-entries/*.json` on each run (local `listFiles` isn't recursive, so existing files were never found), so every run re-uploaded all of them to S3. It now rewrites only missing files and files whose transcript changed.
- Local transcription locks are now one file per episode, created atomically, in `{localFilesPath}/locks/transcription/<site>/`, instead of a read-modify-write `transcripts/.processing-lock.json` in a folder that's synced to S3. Locks whose process has exited are taken over. (Runs in AWS still use the JSON lockfile.)

## v0.0.1 (2026-10-06)

The state of the repo before the scripts overhaul: [`999e345`](https://github.com/jackkoppa/browse-dot-show/tree/v0.0.1).
