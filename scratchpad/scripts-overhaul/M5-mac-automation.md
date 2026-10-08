# M5: Unattended Ingestion on a Mac

> **Status (2026-10-08): next up, not started.** Everything before it is done: the `bds` CLI, parallel transcription, and deploys from GitHub Actions (M4b). Read [HANDOFF.md](./HANDOFF.md) first for how to work with the developer.

## Goal

On an Apple silicon Mac (M1+; a Mac mini is the likely target), a few commands from this repo set the machine up to run `bds ingest --all-sites` on a schedule, with **no user logged in** and no manual steps afterwards. Today it's only ever run by hand.

M5 is only about ingestion (download → transcribe → index → upload to S3 → invalidate CloudFront). Code deploys already happen in GitHub Actions ([docs/github-actions-deploys.md](../../docs/github-actions-deploys.md)); the scheduled machine never deploys Terraform or clients.

## What already exists (use it)

- **The job to run:** `pnpm bds ingest --all-sites --parallel=N`, or without pnpm/PATH: `<abs node> <repo>/node_modules/tsx/dist/cli.mjs <repo>/scripts/cli/index.ts ingest --all-sites`. Exit codes: 0 ok, 1 failure, 2 usage error (also when a required flag is missing without a TTY), 130 interrupted. Runs non-interactively with flags.
- **Placeholders to replace:** `bds schedule` and `bds setup machine` in `scripts/cli/commands/coming-soon.ts`; replace them there and in `MENU` (`scripts/cli/registry.ts`, whose test requires every command in the menu).
- **No logged-in shell needed:** config files resolve from the repo root (`scripts/lib/paths.ts`), not the cwd. Lambda children start via the current `node` binary plus tsx's CLI (`tsxCommand()` in `scripts/lib/lambda.ts`). Verified in session 1: an all-sites dry run with `cwd=/` and `PATH=/usr/bin:/bin:/usr/sbin:/sbin`. A real run still needs `aws`, `ffmpeg` and `ffprobe` on PATH: write absolute paths into the plist/wrapper.
- **Credentials:** file-based, no keychain or SSO: `.env.automation` (automation IAM user's keys, `chmod 600`; assumes `browse-dot-show-automation-role` in each site account; `terraform/automation/`, now covering every account in `.site-account-mappings.json`). The OpenAI key isn't needed for local transcription.
- **Signals:** `bds` handles SIGINT/SIGTERM (`scripts/lib/shutdown.ts`): it stops transcription children (the lambda kills its whisper process). launchd sends SIGTERM on stop/`bootout`; **test this under launchd** (not done yet). ffmpeg chunking children aren't killed explicitly; they're short-lived and die when their pipes close.
- **Overlap protection:** transcription uses atomic per-file locks in `<localFilesPath>/locks/transcription/<site>/` (stale after the pid dies or 2 h; `utils/local-file-locks.ts` in process-audio). That stops two runs transcribing the same file, but a manual `bds ingest` and a scheduled one could still both run the other phases; add a run-level lock (below).
- **Checks:** `bds doctor [--aws]` checks tools, whisper, local files + disk, credentials, mappings and (with `--aws`) role assumption per account. `schedule status` and `setup machine` can reuse those checks.
- **Logs today:** run summaries in `scripts/automation-logs/ingestion-pipeline-runs.md` (`scripts/lib/pipeline-result-logger.ts`); worker logs in `scripts/automation-logs/transcription/<timestamp>/`. Moving them to `~/Library/Logs/browse-dot-show/` is this milestone's call.
- **Parallelism:** `transcriptionWorkers` in `.local-files-config.json` (else 3). Benchmark on the dev machine (M4 Pro, 64 GB; whisper-cli large-v3-turbo; 120 audio-min): 1 worker 24.7 audio-min/min, 2 → 35.2, **3 → 47.6**, 4 → 50.7 (peak RSS 1.9 GB per worker). Output is byte-identical across N. Re-benchmark on the target machine.
- **whisper.cpp:** the code expects `WHISPER_CPP_PATH/build/bin/whisper-cli` and `WHISPER_CPP_PATH/models/ggml-<WHISPER_CPP_MODEL>.bin` (a source checkout; `transcribe-via-whisper.ts` around line 383). Homebrew's `whisper-cpp` puts the binary elsewhere; supporting it needs a small change there.
- **Pipeline order:** pre-sync S3→local first, so a machine that's been off catches up correctly. Keep it.
- **Already cleaned up on the dev machine:** the old LaunchAgents are gone and `.env.automation` is `chmod 600`.

## Decisions to ask the developer (batch them, multiple choice, with a recommendation)

1. **Which machine:** the dev MacBook (best effort) or a dedicated always-on Mac mini (recommended; see fact 5)? Where do local files live there (external SSD → Full Disk Access)?
2. **FileVault** (fact 6): (a) accept and warn, (b) `fdesetup authrestart` for planned restarts plus no automatic macOS update installs, or (c) turn it off on a dedicated machine. Don't pick silently.
3. **Failure notifications:** desktop notifications are invisible with nobody logged in. Options: email via SES/SNS, a push service (ntfy, Pushover), or opening a GitHub issue (the repo is public, so keep details out).
4. **Schedule:** time(s) of day and how often (once nightly? twice?).
5. **Logs:** move to `~/Library/Logs/browse-dot-show/`, or keep under `scripts/automation-logs/`?
6. **whisper.cpp:** keep the source checkout, or switch to Homebrew `whisper-cpp` (small code change)?

## How the pieces fit (macOS facts to design around)

Verify each on the current macOS version while implementing.

1. **LaunchAgents need a logged-in user; LaunchDaemons don't.** Use a **LaunchDaemon** in `/Library/LaunchDaemons/` with `UserName` set to the developer's user, so it runs at the login window or with nobody logged in. Installing needs `sudo` once (the developer runs it).
2. **`StartCalendarInterval`:** if the Mac is *asleep* at that time, launchd runs the missed job once on the next wake; if it's *off*, it doesn't run. launchd won't start a second copy of a running job.
3. **Waking:** `sudo pmset repeat wakeorpoweron MTWRFSU 02:55:00` schedules a wake a few minutes before the job; `pmset -g sched` shows it. There's one repeating wake schedule per machine, so `schedule install` should show and replace it, not stack another.
4. **Staying awake:** run under `caffeinate -i -s -m <command>` so a scheduled wake doesn't fall back asleep mid-run.
5. **Most reliable: a desktop that never sleeps.** Mac mini/Studio on AC with `sudo pmset -c sleep 0` and `sudo pmset autorestart 1`. A laptop with its lid closed and no external display won't stay awake reliably; support laptops best-effort (wake + caffeinate, lid open, on power).
6. **FileVault blocks unattended reboots:** after any reboot the disk stays locked until someone types a password, so nothing runs, not even LaunchDaemons. See decision 2.
7. **No keychain** with nobody logged in, and SSO tokens can't refresh: use `.env.automation` (above).
8. **Minimal PATH under launchd:** absolute paths for `node`, `ffmpeg`, `ffprobe`, `aws` and the whisper binary. The dev machine uses nvm (`~/.nvm/versions/node/v22.14.0`); a Homebrew `node@22` is simpler for a dedicated machine. Don't rely on shims.
9. **Privacy protections:** a background job can't read `~/Documents`, `~/Desktop`, `~/Downloads`, iCloud Drive or removable volumes without Full Disk Access for the binary. `setup machine` should check the repo and `localFilesPath` locations, or explain how to grant access. `bds doctor` already warns about an unmounted drive.
10. **Logs:** one file per run plus a JSON summary; set the plist's `StandardOutPath`/`StandardErrorPath` to a stable location for crashes before the app logger starts.

## Target developer experience

```bash
# On a fresh Mac (Homebrew, git and Xcode command line tools beforehand)
git clone https://github.com/jackkoppa/browse-dot-show && cd browse-dot-show
./scripts/bootstrap.sh                  # brew bundle (node@22, ffmpeg, awscli, whisper-cpp?, terraform), corepack, pnpm install, all:build
pnpm bds setup machine                  # local-files dir, whisper model, .env.local, .env.automation check, doctor
pnpm bds schedule install --at=03:00    # LaunchDaemon + pmset wake (prompts for sudo), then a dry run
pnpm bds schedule status                # next run, wake schedule, last N runs + results, warnings (FileVault, power, sleep)
pnpm bds schedule run-now               # the exact same wrapper as the scheduled job
pnpm bds schedule uninstall
```

- A `Brewfile` at the repo root keeps `bootstrap.sh` tiny.
- `schedule install` generates the plist from a template in the repo (e.g. `scripts/automation/com.browse-dot-show.ingest.plist.template`). The plist runs a wrapper that `cd`s to the repo, runs guard rails, then `caffeinate -i -s -m <node> … ingest --all-sites --parallel=N`, then rotates logs.
- **Run-level lock** so a manual `bds ingest` and the scheduled run can't overlap (a skipped run logs "skipped: already running").
- **Guard rails before each run:** on AC power (or battery above a threshold), enough free disk, network reachable, local-files drive mounted. Log "skipped" instead of failing noisily.

## Acceptance test

1. Run on a Mac (or fresh user account) that has never run the pipeline.
2. Schedule a run a few minutes out, log out completely, and (laptops) let it sleep.
3. Confirm it wakes, runs all sites, uploads to S3 and invalidates CloudFront, and that `schedule status` shows the result after logging back in. Check a site shows the new episodes.
4. Repeat with the machine asleep, rather than at the login window. Stop a run with `launchctl bootout` and check transcription children stop and locks clear.
