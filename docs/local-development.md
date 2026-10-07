# Local Development Guide

Setting up a Mac for `browse-dot-show`, and the day-to-day commands: running ingestion, developing the client, deploying.

Everything runs through one CLI, `pnpm bds`. Run it with no arguments for an interactive menu, or pass a command and flags to run it without prompts.

> [!NOTE]
> **Using this repo from before October 6, 2026?** Commands and scripts were reorganized into the `pnpm bds` CLI. If your local scripts and deployments already work, you can stay on the [`v0.0.1` tag](https://github.com/jackkoppa/browse-dot-show/tree/v0.0.1). See the [changelog](../CHANGELOG.md) for what changed.

## 1. Tools

Apple silicon Macs are the supported platform (Intel Macs and Linux mostly work for client development; transcription is only tested on Apple silicon).

| Tool | Why | Install |
| --- | --- | --- |
| Node.js 22 | Runs everything | `brew install node@22`, or [nvm](https://github.com/nvm-sh/nvm) (`nvm install`, which reads `.nvmrc`) |
| pnpm 10 | Workspace package manager | `corepack enable` (uses the version pinned in `package.json`) |
| ffmpeg / ffprobe | Audio splitting and durations | `brew install ffmpeg` |
| AWS CLI v2 | S3 sync, CloudFront, role assumption | `brew install awscli` |
| whisper.cpp | Local transcription | See [whisper.cpp](#whispercpp) below |
| Terraform | Only for deploying | `brew install terraform` |

Then install dependencies and build the shared packages:

```bash
pnpm install
pnpm all:build
```

### whisper.cpp

Clone and build [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (Metal is enabled by default on Apple silicon), and download a model:

```bash
git clone https://github.com/ggml-org/whisper.cpp ~/whisper.cpp
cd ~/whisper.cpp
cmake -B build && cmake --build build -j --config Release
./models/download-ggml-model.sh large-v3-turbo
```

The transcription code expects `build/bin/whisper-cli` and `models/ggml-<model>.bin` inside `WHISPER_CPP_PATH`.

## 2. Configuration files

All of these are gitignored.

| File | Purpose |
| --- | --- |
| `.env.local` | Shared local settings. Copy the tracked `.env` template. For local transcription set `WHISPER_API_PROVIDER=local-whisper.cpp`, `WHISPER_CPP_PATH` and `WHISPER_CPP_MODEL` (e.g. `large-v3-turbo`). |
| `.local-files-config.json` | Where audio, transcripts and search indexes live (`localFilesPath`, potentially hundreds of GB), plus optional `worktreeDirectory` and `transcriptionWorkers`. You're prompted to create it on first use. |
| `sites/<my-sites or origin-sites>/<site>/.env.aws-sso` | A site's `AWS_PROFILE` (AWS SSO), used for interactive deploys. |
| `.env.automation` | Credentials for the automation IAM user (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `SCHEDULED_RUN_MAIN_AWS_PROFILE`). Used by the ingestion pipeline's S3 phases and by `bds site upload-client --all-sites`. Keep it `chmod 600`. |
| `.site-account-mappings.json` | Each site's AWS account ID, bucket, CloudFront ID and search API URL. Written by `bds site deploy`. |

Check everything at once:

```bash
pnpm bds doctor          # tools, whisper, local files + disk space, credentials, site mappings
pnpm bds doctor --aws    # also checks the automation user can reach every site account (read-only)
```

## 3. The `bds` CLI

```bash
pnpm bds                   # interactive menu
pnpm bds help              # list every command
pnpm bds <command> --help  # flags and examples for one command
```

| Command | What it does |
| --- | --- |
| `bds ingest` | Run the ingestion pipeline (see below) |
| `bds site create` | Create a new site (interactive wizard; `--review` shows progress) |
| `bds site deploy --site=<id>` | Deploy a site's infrastructure (Terraform) and client |
| `bds site upload-client --site=<id>` / `--all-sites` | Build and upload client(s) to S3, invalidate CloudFront |
| `bds site destroy --site=<id>` | Destroy a site's infrastructure (typed confirmation) |
| `bds lambda run --lambda=<id> --sites=<ids>` | Run one ingestion lambda (`rss-retrieval`, `process-audio`, `srt-indexing`) locally, or in AWS with `--env=prod` |
| `bds dev client --site=<id>` | Client dev server + local assets + local search lambda |
| `bds dev search-health --site=<id>` | Search lambda health check, locally |
| `bds dev homepage` | Homepage dev server |
| `bds validate <sites\|local\|prod\|consistency>` | Validate site configs, local files or S3 contents |
| `bds infra <homepage\|automation> <deploy\|bootstrap-state>` | Shared infrastructure |
| `bds worktree <create\|list\|remove\|prune>` | Git worktrees (see below) |
| `bds doctor` | Check this machine and config |
| `bds schedule`, `bds setup machine` | Coming soon: scheduled unattended runs on a Mac |

Every command runs without prompts when its required flags are given. If something required is missing and there's no terminal (e.g. a scheduled job), it exits with code 2 instead of waiting for input. Exit codes: `0` success, `1` failure, `2` usage error, `130` cancelled.

## 4. Running ingestion

```bash
pnpm bds ingest --all-sites                      # everything, for every site
pnpm bds ingest --sites=haveaword --dry-run      # show what would happen
pnpm bds ingest --all-sites --parallel=3         # 3 transcription workers
pnpm bds ingest --sites=haveaword --skip=pre-sync,s3-sync,cloudfront   # local only, no AWS
```

Phases, in order (skip any with `--skip=<id,...>`):

| Phase | |
| --- | --- |
| `pre-sync` | Download files that exist in S3 but not locally, so a machine that's been offline catches up |
| `rss` | Download new episodes from each site's RSS feeds |
| `transcribe` | Transcribe new audio with whisper.cpp, for all selected sites at once with `--parallel=N` workers |
| `index` | Rebuild the search index for sites with new transcripts, or whose transcripts are newer than their index (e.g. after a manual `bds lambda run`) |
| `s3-sync` | Upload new local files (including the search index) to each site's bucket, then refresh the search lambda |
| `cloudfront` | Invalidate CloudFront for sites with uploads |

The S3 and CloudFront phases use `.env.automation` and assume `browse-dot-show-automation-role` in each site's account.

**Parallel transcription.** Untranscribed files from every selected site are balanced across N workers by audio duration. Each worker runs whisper as a separate process, so they share the GPU, and each loads its own copy of the model. On a terminal you get one combined progress view; otherwise (e.g. when scheduled) periodic log lines. Full worker logs are written to `scripts/automation-logs/transcription/<timestamp>/`. Set this machine's default with `"transcriptionWorkers": N` in `.local-files-config.json`.

**Run history** is appended to `scripts/automation-logs/ingestion-pipeline-runs.md`.

To reapply spelling corrections to every existing transcript (e.g. after adding corrections to a site), add `--reapply-spelling-corrections`.

## 5. Git worktrees

Worktrees give each branch (or agent session) its own working directory. The parent directory is `worktreeDirectory` in `.local-files-config.json` (you're prompted the first time).

```bash
pnpm bds worktree create feature/my-feature   # new branch from HEAD, if needed
pnpm bds worktree list
pnpm bds worktree remove feature/my-feature
pnpm bds worktree prune
```

A new worktree has no gitignored files. Copy or symlink the config files from section 2 into it, then run `pnpm install` and `pnpm all:build`.

## 6. Working on the scripts

```
scripts/
  cli/            bds entry point (index.ts), command registry + menu (registry.ts), commands/
  ingestion/      the pipeline: phases, steps, parallel transcription, spelling corrections
  lib/            shared modules: sites, env, args, lambda runner, S3 sync, site accounts, paths
  deploy/         Terraform-based deploy/destroy/upload scripts (run by bds commands)
  site-creator/   the `bds site create` wizard
```

- Add a command: create `scripts/cli/commands/<name>.ts` exporting a `Command`, and add it to `MENU` in `scripts/cli/registry.ts`.
- Typecheck: `pnpm --filter @browse-dot-show/scripts typecheck` (also runs on commit). Tests: `pnpm --filter @browse-dot-show/scripts test`.
- Before changing anything that touches AWS resource names, the S3 key layout, Terraform or lambda packaging, read [the deployed-sites invariants](../scratchpad/scripts-overhaul/05-deployed-sites-invariants.md).
