# 09: Tonight's Runbook (2026-10-06)

> **Completed on 2026-10-06.** All steps were done and the stack merged as #162–#168. Results are in [06](./06-session-1-decisions.md); what's next is in [HANDOFF.md](./HANDOFF.md). Kept for reference.

Work through this once the multi-terminal transcription run has finished. Steps marked **🧑 You** are yours; steps marked **💬 Prompt** are things to paste into the Claude session (resume it in the worktree: `~/Workrees_Personal_Development/browse-dot-show--worktrees/scripts-overhaul`).

## 0. Check the run is really done

**🧑 You:** confirm no transcription processes are left, and nothing is still holding files in a lockfile:

```bash
pgrep -fl "process-new-audio-files-via-whisper|whisper-cli" || echo "none running"
```

**💬 Prompt:**
> The transcription run is finished and nothing is running. Check for leftover `.processing-lock.json` entries in every site's local transcripts folder (read-only), then let's continue with the runbook.

## 1. Quick cleanup on your machine (about 2 minutes)

**🧑 You** (details in [06](./06-session-1-decisions.md)):

```bash
# Old LaunchAgents
for n in daily-pipeline ingestion-automation power-management; do
  launchctl bootout gui/$(id -u)/com.browse-dot-show.$n || sudo launchctl bootout gui/$(id -u)/com.browse-dot-show.$n
  sudo rm -f ~/Library/LaunchAgents/com.browse-dot-show.$n.plist
done
launchctl list | grep browse-dot-show   # expect nothing

# Old logs (main checkout); keeps ingestion-pipeline-runs.md
cd ~/Personal_Development/browse-dot-show/scripts/automation-logs
rm -f automation.log automation-error.log daily-pipeline.log daily-pipeline-error.log power-management.log power-management-error.log

# Credentials file permissions
chmod 600 ~/Personal_Development/browse-dot-show/.env.automation
```

## 2. Test runs

Do these in order. Each prompt says what it touches.

### 2a. Benchmark the default worker count (local only; GPU)

**💬 Prompt:**
> Benchmark parallel transcription on this machine. Copy 4–8 real mp3s (about 30–60 min each) from local files into a temp folder, and run whisper-cli directly with the same model and flags the lambda uses, at N = 1, 2, 3 and 4 concurrent processes. Report audio-minutes transcribed per wall-clock minute and peak memory for each N, and recommend a default. Don't write anything into the local-files folder.

Then, if you agree with the result, set it (or just tell Claude the number):

```json
// .local-files-config.json (main checkout; the worktree symlinks to it)
"transcriptionWorkers": 3
```

### 2b. Real parallel transcription + Ctrl+C (local only; no AWS)

This needs a few untranscribed files. Right after the big run there may be none, so first decide how to get some (question 1 below).

**💬 Prompt:**
> Run a real local-only parallel transcription test: `pnpm bds ingest --sites=<sites with untranscribed files> --skip=pre-sync,s3-sync,cloudfront --parallel=2`. Check the live progress view, the per-worker logs, and that new .srt files appear. Then start it again and interrupt it with Ctrl+C (SIGINT) partway through: confirm every whisper/lambda child process stops and the lockfile entries are released.

### 2c. AWS access check (read-only)

**💬 Prompt:**
> Go ahead and run `pnpm bds doctor --aws` (read-only `sts:AssumeRole`, once per site account) and show me the results.

### 2d. Real end-to-end run for haveaword (writes to S3, invalidates CloudFront)

**💬 Prompt:**
> You have my go-ahead to run the real pipeline for haveaword only: `pnpm bds ingest --sites=haveaword --parallel=2`. Afterwards, summarize what was downloaded, transcribed, uploaded and invalidated, then check that haveaword.browse.show loads and search returns results for the newest episode.

(If anything breaks, the site must be back up within a few hours. `v0.0.1` in the main checkout is the fallback: its pipeline still works.)

### 2e. Lambda packaging compare (local only)

**💬 Prompt:**
> Compare lambda packaging against main: in a temporary worktree at `v0.0.1`, prod-build the lambda packages that have `build:prod`, do the same on the M6 branch, and diff the `aws-dist` contents (file lists, package.json, bundle sizes). Remove the temporary worktree afterwards.

## 3. Open the PR stack

The branches are stacked; each PR's base is the previous branch:

| # | Branch | Base |
| --- | --- | --- |
| 1 | `jackkoppa/scripts-overhaul-plan` (plan docs + decisions) | `main` |
| 2 | `jackkoppa/scripts-overhaul-m0-baseline` | 1 |
| 3 | `jackkoppa/scripts-overhaul-m1-delete-dead-code` | 2 |
| 4 | `jackkoppa/scripts-overhaul-m2-shared-libs` | 3 |
| 5 | `jackkoppa/scripts-overhaul-m3-unified-cli` | 4 |
| 6 | `jackkoppa/scripts-overhaul-m4-parallel-transcription` | 5 |
| 7 | `jackkoppa/scripts-overhaul-m6-docs` (docs, Hermit removal, CHANGELOG) | 6 |

Note: the plan branch has the early session commits (decisions doc); later plan-doc updates (progress, notes, runbook) are in the milestone commits.

**🧑 You:** adjust commit timestamps however you like *before* pushing. If you rebase, keep the order above. The `v0.0.1` tag points at `main` (`999e345`), so it isn't affected.

**💬 Prompt:**
> Walk me through opening the PR stack. First show me the commit list and diff stats per branch. Then, once I confirm, push the branches and the v0.0.1 tag, and open the 7 stacked draft PRs with `gh` (each based on the previous branch), with descriptions summarizing each milestone, its test results from tonight, and the review notes from 06.

## 4. After merging

**💬 Prompt (when the stack is merged):**
> The stack is merged. Help me clean up: update the main checkout to main, `rm -rf .hermit`, `pnpm install && pnpm all:build`, run `pnpm bds doctor`, and remove the scripts-overhaul worktree and the merged local branches.

## Questions to decide tonight

1. **Untranscribed files for test 2b.** Options: (a) wait for new episodes, using `--skip=pre-sync,s3-sync,cloudfront` but keeping `rss`; (b) temporarily move a couple of `.srt` files aside into a backup folder and restore them if the test fails; (c) skip 2b and rely on the haveaword run (2d). Recommendation: (a) if any site has new episodes, otherwise (b).
2. **Merge strategy for the stack:** merge each PR in order (keeps milestone commits), or squash each? Squashing a stacked PR means rebasing the next one onto `main`.
3. **`bds infra automation deploy`** currently fails at `terraform plan` (the tfvars site map is incomplete); see [10](./10-follow-ups.md). Not needed tonight.
4. **The 34 `validate sites` errors** (missing `appHeader.includeAIUseDisclosure`, already failing on `main`): fix in a follow-up, or leave?
