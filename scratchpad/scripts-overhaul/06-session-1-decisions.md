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
- **`.deployed-sites.json` is stale, and `bds infra automation deploy` doesn't work** (corrected after review). The file lists 7 sites; 23 have account mappings. `terraform/automation` looks up `var.site_account_ids[site_id]` for every listed site, and the local `terraform.tfvars` maps only 6 sites, so `terraform plan` already fails with "Invalid index" (on `lordsoflimited`). With all 23 it would fail the same way. Nothing gets applied, so live sites are safe; the scheduled pipeline works because the existing policy covers both site accounts. Fix tracked in [10](./10-follow-ups.md).
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

## Notes from M6

- Hermit removed (`bin/`, `.gitignore` entries, `scripts/prereqs.sh`; `bds doctor` replaces it). Added `.nvmrc` (22) and `engines.node >=22`. Hermit had pinned Node **20.0.0**, while this machine actually ran Node 22 via nvm. **Developer action:** after checking out these branches in the main checkout, `rm -rf .hermit` there (it's no longer gitignored).
- Docs rewritten: `docs/local-development.md` (setup, config files, CLI reference, ingestion, worktrees, scripts layout), `AGENTS.md`, `docs/GETTING_STARTED.md`, the deployment guide's commands and "Ongoing Updates", `scripts/deploy/README.md` (was stale: "Listen Fair Play", `deploy.ts`, Node 20, pnpm 8), plus command references in package READMEs and guides.
- The deployment guide's "Step 3: Bootstrap Terraform State" pointed at the *automation* state command; `site deploy` already bootstraps the site's state bucket itself, so that step now says so.
- `bds validate <check> -- <args>` passes extra args through (e.g. `--format=json` for the consistency checker).
- A placeholder milestone for GitHub Actions code deploys was added ([08](./08-github-actions-deploys.md)), ordered before Mac scheduling.

## Test results (evening of 2026-10-06)

- **After the big multi-terminal run:** no transcription processes left, all 23 lockfiles empty, 0 untranscribed files.
- **Benchmark** (whisper-cli, large-v3-turbo, M4 Pro 64 GB; 12 × 10-min mp3 chunks = 120 audio-min; same args as the lambda):

  | Workers | Wall | Audio-min / wall-min | Speedup | Peak RSS (all whisper) |
  | --- | --- | --- | --- | --- |
  | 1 | 4.9 min | 24.7 | 1.0× | 1.9 GB |
  | 2 | 3.4 min | 35.2 | 1.4× | 3.8 GB |
  | 3 | 2.5 min | 47.6 | 1.9× | 5.7 GB |
  | 4 | 2.4 min | 50.7 | 2.1× | 7.6 GB |

  Recommendation: 3 on this machine (4 adds about 6%). Output was byte-identical across N.
- **Real parallel transcription (2b):** moved 4 transcripts aside (2 drivetowork ~31 min each, 2 spoutlore 5 and 11 min) and ran `bds ingest --sites=drivetowork,spoutlore --skip=pre-sync,rss,index,s3-sync,cloudfront --parallel=2`: exit 0 in 2.5 min. All 4 new `.srt` files were **byte-identical** to the originals (including the chunked >20-min episodes). Lockfiles empty afterwards.
- **Ctrl+C / SIGINT to the `bds` parent only** (the harder case; a terminal Ctrl+C also signals children directly): every lambda and whisper-cli child stopped, exit 130. The first attempt **left 1 of 2 lockfile entries behind** (concurrent read-modify-write between the two workers), so I fixed the lambda to verify and retry removals (commit on the M4 branch). Two reruns: exit 130, all children stopped, lockfile empty. Original transcripts restored from backup and verified identical.
- **Lambda packaging vs `v0.0.1` (2e):** prod-built rss-retrieval, process-audio and search in a temporary `v0.0.1` worktree and on this branch. Same file lists; the rss-retrieval and search bundles are byte-identical; the process-audio bundle is +295 B (tonight's lambda changes); `aws-dist/package.json` differs only in dependency key order (pnpm pack ordering), with the same entries and versions.
- **`bds doctor --aws` (2c, run by the developer):** 0 failed. Role assumption works in both site accounts (152849157974: 11 sites, 927984855345: 12 sites). Only warning: local files on an external volume.
- **Real haveaword run (2d, run by the developer):** `pnpm bds ingest --sites=haveaword --force-local-indexing`, 50 s, every phase ✅. Pre-sync: 1207 files in sync, 0 to download. RSS: 0 new episodes. Transcription: nothing to transcribe. Indexing: 359,745 entries. Upload: **11 search-entries were missing from S3** (episodes 391–401, transcribed earlier but never indexed), so `--force-local-indexing` was needed. 408 files uploaded (all 405 search-entries re-uploaded; the known re-index/mtime behavior), then search lambda refresh and CloudFront invalidation. Verified live: site 200, manifest `lastUpdated` 2026-10-07T02:10Z, and search for "Jessie Cave" returns the newest episode (#401, 2026-10-03).
- **Follow-up idea (not done):** after a manual multi-terminal or `bds lambda run` transcription, the next pipeline run won't index, because it didn't create new files itself. Consider having Phase 4 index any site whose transcripts are newer than its search index, instead of only sites with new files from this run.
