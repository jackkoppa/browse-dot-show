# 06: Session 1 Decisions (2026-10-06)

Answers from the developer before starting session 1.

| Topic | Decision |
| --- | --- |
| CLI name | `bds` (`pnpm bds …`) |
| Menu tree | 02 as written. "Automation" and "Set up this machine" are stubs that say "coming in session 2". |
| `--windows` (Terminal.app view) | Drop. Single-terminal progress on a TTY, plain log lines when headless. |
| Hermit | Drop in session 1: `.nvmrc` + `engines` set to Node 22, pnpm through Corepack, docs updated. |
| `site-setup-directories.ts` | Delete outright (and the `site:setup-directories` command). |
| `deploy/manage-tfstate.ts` | Delete. |
| `build-lambda-for-site.ts` | Delete, **after confirming** that the deploy path already covers building a lambda with a site's env. |
| `worktree.ts` | Keep, as `bds worktree`. |
| `scratchpad/homepage-2025-08-04/` | Delete. |
| Pipeline `--local-run-only` TODO | Drop; `--skip=<phase>` covers it. |
| Delivery | Stacked **local** branches, one per milestone. Don't push; the developer reviews tonight, adjusts commit timestamps and pushes. |
| Benchmark for default `--parallel=N` | Approved: this machine (M4 Pro, 64 GB), copies of real mp3s in a temp folder, nothing written to the local-files folder. |
| Smoke-test site (real pipeline run) | `haveaword`. Low traffic, but has real usage, so any breakage must be fixed within a few hours. Still ask for a go-ahead before touching AWS. |
| Old LaunchAgents | Write the `launchctl bootout` + `sudo rm` commands for all three (`daily-pipeline`, `ingestion-automation`, `power-management`) into the M1 notes; the developer runs them. |

## Observations for session 2

- Node and pnpm currently come from nvm (`~/.nvm/versions/node/v22.14.0`), not Hermit.
- `localFilesPath` is on an external volume (`/Volumes/4TB_SSD_…`). Background jobs need Full Disk Access to read removable volumes (03 §9).
- Three root-owned plists in `~/Library/LaunchAgents/`; `power-management` was still firing (and failing) as of 2026-10-05.

## Live transcription run (2026-10-06)

- A multi-terminal transcription run was in progress in the main checkout when session 1 started (expected to finish around 7:15 PM). Each terminal starts a new `tsx trigger-individual-ingestion-lambda.ts` per site, which reads the scripts from that checkout.
- So all overhaul work happens in the worktree `~/Workrees_Personal_Development/browse-dot-show--worktrees/scripts-overhaul`, with the gitignored config files (`.env.*`, `.site-account-mappings.json`, `.deployed-sites.json`, `.local-files-config.json`, each site's `.env.aws-sso`) symlinked from the main checkout. The main checkout stays on `jackkoppa/scripts-overhaul-m0-baseline`, untouched.
- The **local-files location and layout must not change** in session 1. It could change later if really needed.
- The whisper benchmark for the default `--parallel=N` waits until that run finishes, since it would compete for the GPU.

## Developer actions from M1 (run these yourself)

The three old LaunchAgents (`daily-pipeline`, `ingestion-automation`, `power-management`) are still loaded, and `power-management` still fires and fails. Unload and delete them; the plists are root-owned, so deleting needs `sudo`:

```bash
for n in daily-pipeline ingestion-automation power-management; do
  launchctl bootout gui/$(id -u)/com.browse-dot-show.$n || sudo launchctl bootout gui/$(id -u)/com.browse-dot-show.$n
  sudo rm -f ~/Library/LaunchAgents/com.browse-dot-show.$n.plist
done
launchctl list | grep browse-dot-show   # should print nothing
```

Then, in the main checkout, delete the old (gitignored) logs. Keep `ingestion-pipeline-runs.md`:

```bash
cd ~/Personal_Development/browse-dot-show/scripts/automation-logs
rm -f automation.log automation-error.log daily-pipeline.log daily-pipeline-error.log power-management.log power-management-error.log
```

`.automation-config` didn't exist in the main checkout, so there's nothing to delete.

## Findings from M2 (for review)

- **`automation:deploy` was likely broken.** It ran `generate-deployed-sites.ts` from inside `terraform/automation/`, while the generator read `.site-account-mappings.json` from the current directory. It now resolves paths from the repo root (`scripts/lib/paths.ts`) and writes `.deployed-sites.json` there, where `terraform/automation/locals.tf` reads it.
- **`.deployed-sites.json` is stale.** It lists 7 sites; 23 have account mappings. It feeds the automation user's `sts:AssumeRole` policy (one role ARN per site account). Sites share accounts, so those 7 probably already cover every account, which fits the pipeline working for all 23 sites. The next `automation:deploy` will regenerate the list with all 23 sites, so expect a Terraform diff in `aws_iam_user_policy.assume_site_roles`. Review that plan before applying.
- **Spelling-correction reapplication processed every transcript twice** (the recursive listing re-listed each subfolder). Fixed by de-duplicating; applying a correction twice isn't necessarily harmless.
- `.env.automation` and `.site-account-mappings.json` now load from the repo root regardless of the current directory. Verified by running from `cwd=/`, which is what launchd does.
- Lambda child processes now always get `NODE_OPTIONS=--max-old-space-size=9728`, unless a heap limit is already set (`scripts/lib/lambda.ts`).
- `scripts/test-cross-account-access.ts` was stale (4 hardcoded sites, lambda names that no longer exist, and it wrote a test file to S3). Deleted; a read-only "can assume every site's role" check goes into `bds doctor` (M3).

## Notes from M3

- `pnpm bds validate sites` reports 34 errors on `main` as well: every `site.config.json` is missing `appHeader.includeAIUseDisclosure`. This was there before the overhaul and is out of scope; flagging it.
- `bds doctor --aws` (read-only `sts:AssumeRole`, once per site account) is written but hasn't been run yet; it needs your OK because it calls AWS.

## Notes from M4

- `bds ingest --parallel=N` plans every selected site's untranscribed files in the parent process (ffprobe durations, balanced longest-first) and runs N workers. Each worker runs the process-audio lambda per site batch, as a child process with an exact file list (`FILE_LIST_PATH`, keys like `audio/<podcast>/<file>.mp3`). Verified read-only that the planner's keys match the lambda's own discovery for haveaword.
- Progress comes from the lambda's JSON events on stdout: a live single-terminal view on a TTY, periodic log lines otherwise. Full per-worker output goes to `scripts/automation-logs/transcription/<timestamp>/worker-N.log`. Session 2 may move logs to `~/Library/Logs/browse-dot-show/`.
- Default N: `transcriptionWorkers` in `.local-files-config.json`, else 2 (to be benchmarked).
- process-audio lambda changes (these also ship to AWS on the next deploy; all are no-ops there): the file list now comes from `FILE_LIST_PATH` (the `TERMINAL_*` env vars, the legacy `TERMINAL_FILE_LIST` and the broken `LOG_FILE` writer are gone); progress reports actual per-file durations; `COMPLETE` is always emitted; on SIGINT/SIGTERM it releases its lockfile entries.
- Removed `run-local-transcriptions-multi-terminal.ts` and `utils/multi-terminal-runner.ts`. The site creator's "complete transcriptions" step uses the parallel runner. The platform-support feature row is renamed to `episode-transcription-parallel`.
- Observed, not changed: the lambda's lockfile lives at `transcripts/.processing-lock.json`, inside a synced folder, and its read-modify-write isn't atomic. Workers get disjoint files, so this is harmless for `bds ingest`.
