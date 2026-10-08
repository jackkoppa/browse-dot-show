# M5: Unattended Ingestion on a Mac

> **Status (2026-10-08): built, not yet tested with launchd.** The code and docs are in a stack of PRs (below), tested as far as possible without sudo or AWS. Next (developer's call): skip testing on the dev Mac; set up the **16 GB runner Mac from the unmerged stack** and test there, then merge. Read [HANDOFF.md](./HANDOFF.md) first for how to work with the developer.

## Goal

On an Apple silicon Mac (a dedicated 16 GB Mac mini is the target), a few commands from this repo set the machine up to run `bds ingest --all-sites` on a schedule, with **no user logged in** and no manual steps afterwards.

M5 is only about ingestion (download → transcribe → index → upload to S3 → invalidate CloudFront). Code deploys happen in GitHub Actions ([docs/github-actions-deploys.md](../../docs/github-actions-deploys.md)); the scheduled machine never deploys Terraform or clients.

The user-facing guide is [docs/scheduled-ingestion.md](../../docs/scheduled-ingestion.md).

## What's built (PR stack, merge in order)

Every PR is scripts/docs only, so `ci affected` deploys nothing and no Terraform plan needs approval.

| PR, branch | What |
| --- | --- |
| #195 `jackkoppa/m5-decisions` | This doc's decisions |
| #196 `jackkoppa/m5-toolchain` | `Brewfile`, `scripts/bootstrap.sh`; Homebrew `whisper-cli` via a checkout-like folder (`scripts/lib/whisper.ts`), so process-audio and the deployed lambdas don't change |
| #197 `jackkoppa/m5-run-lock` | Run-level lock (`scripts/lib/run-lock.ts`; `bds ingest` exits 75 when held); logs → `~/Library/Logs/browse-dot-show` (`scripts/lib/user-dirs.ts`); `bds ingest --summary-json`; per-run temp file for the search-lambda refresh (old `/tmp` "Permission denied") |
| #198 `jackkoppa/m5-scheduled-run` | `bds schedule run` / `run-now` / `test-notifications` (`scripts/schedule/`): caffeinate, guards, run-lock skip, runner update (anonymous HTTPS fetch; rollback on a failed install/build), ingest child with SIGTERM forwarding, run records, rotation, Slack + healthchecks.io |
| #199 `jackkoppa/m5-schedule-install` | `bds schedule install / uninstall / status`: runner worktree, `schedule.json`, plist (`scripts/schedule/launchd.ts`), sudo steps (install, bootout/bootstrap, `pmset repeat`), `--print-only`, `--track=<branch>`; `run-now` runs in the runner or `--via-launchd` |
| #200 `jackkoppa/m5-setup-machine` | `bds setup machine` and `bds setup benchmark` (`scripts/cli/commands/setup.ts`, `scripts/setup/`); docs (`docs/scheduled-ingestion.md`, local-development, AGENTS, CHANGELOG, this doc, HANDOFF) |

Design notes worth knowing:

- **Runner checkout:** a worktree of the main checkout, detached at `origin/<branch>` (default `main`), config symlinked from the main checkout. `bds schedule run` only updates the checkout when it *is* the configured runner (`schedule.json` `runnerDir`), so `run-now` in a dev checkout never moves it. The update runs in the old code; the ingest child runs the new code.
- **Fetching under launchd:** no SSH agent or keychain, so the runner fetches the public repo over HTTPS (`anonymousFetchUrl`), with `GIT_TERMINAL_PROMPT=0`. Found by simulating launchd's environment (below).
- **`ProcessType: Interactive`** in the plist: unset/Standard means "light resource limits" (CPU/IO throttling) per `launchd.plist(5)`. Worth confirming with a benchmark under launchd (open question).
- **Skips vs failures:** guards and "another run in progress" skip (exit 0). Healthcheck: success for a success or "already running", `/fail` otherwise; a missing run is caught by the healthcheck's schedule.

## Tested so far (without sudo or AWS)

- Unit tests for every module (`scripts/**/*.spec.ts`; 140+ tests), typecheck, oxlint clean for new files.
- `bds ingest` lock: a second run exits 75 and names the holder; the lock clears after.
- `bds schedule run-now --dry-run --no-update`: guards, ingest dry run, records, summary, message.
- "Another run in progress" skip with a held lock.
- `bds schedule install --print-only` with a scratch runner (`--track=jackkoppa/m5-schedule-install`): runner worktree, config links, install + build, `schedule.json`, plist passes `plutil -lint`; `run-now` delegates to the runner and updates it from the branch.
- **launchd-like environment:** the plist's `ProgramArguments` run with only its `EnvironmentVariables` and `cwd=/` (a small simulator): dry run succeeds; the update path (`pnpm install` + `all:build`) works with launchd's PATH. This caught the SSH fetch problem.
- `bds setup machine --yes` on the dev Mac: changes nothing (already set up), reports correctly.
- **SIGTERM during a runner update** (launchd-like environment, `kill -TERM` mid-`pnpm all:build`): record `interrupted`, exit 130, no `pnpm`/build processes left; the next run printed "Finishing an interrupted update", installed + built, then succeeded.
- `bds setup benchmark --workers=1,2`: 1 worker 25.2, 2 workers 38.9 audio-min/min on the M4 Pro (1.54×; session 1: 24.7 / 35.2). A first try with a single episode made 2 workers look no faster, so it now uses ≥ 2 episodes per worker.

Not tested yet (needs the developer): anything with sudo (the real LaunchDaemon, `pmset`), a real (non-dry) scheduled run, logged out, asleep, SIGTERM via `launchctl` while transcribing (whisper workers and their locks), Full Disk Access for the SSD under launchd, Homebrew `whisper-cli` end to end, the 16 GB Mac.

## Testing on the 16 GB runner, before merging (with the developer)

The developer chose to skip launchd tests on the dev Mac and test on the runner with the stack unmerged. So the runner's clone checks out the stack's top branch, and the runner worktree follows it (`--track`). Follow [docs/scheduled-ingestion.md](../../docs/scheduled-ingestion.md), with these differences:

1. **macOS settings** (doc step 1): FileVault off, `sudo pmset -c sleep 0`, `sudo pmset autorestart 1`, no automatic macOS installs, and Remote Login on (so the agent can be run over SSH, or a session started there).
2. **Clone at the stack's top branch:**
   ```bash
   git clone https://github.com/jackkoppa/browse-dot-show ~/browse-dot-show && cd ~/browse-dot-show
   git checkout jackkoppa/m5-setup-machine
   ./scripts/bootstrap.sh
   ```
   (An HTTPS clone needs no keys: the repo is public. Add an SSH remote later if you want to push from this Mac.)
3. **Plug in the SSD**, copy `.env.automation` over, then run `pnpm bds setup machine --local-files=/Volumes/4TB_SSD_jackkoppa_1/browse-dot-show-local-files --automation-env=<copied file>`. Expect it to create `.env.local` (Homebrew whisper) and download the model (~1.6 GB). This is the first end-to-end test of the Homebrew `whisper-cli` path.
4. **Notifications** (the developer creates both): the Slack webhook and the healthchecks.io check, put in `.env.automation`, then `pnpm bds schedule test-notifications` and `test-notifications --fail`.
5. **Benchmark:** `pnpm bds setup benchmark` (about 10–20 min on a base M4; watch memory with 16 GB), and save the recommendation.
6. **Install, following the branch:** `pnpm bds schedule install --at=<HH:MM, ~15 min from now> --track=jackkoppa/m5-setup-machine`. Expect the runner at `~/browse-dot-show-runner`, then 4 sudo steps. `pnpm bds schedule status` should show it loaded, with the wake listed, and warn only about the `--track` branch.
7. `pnpm bds schedule run-now --dry-run`: runs in the runner and ends with `✅ … (dry run) succeeded`.
8. **The real thing, logged out:** log out before the `--at` time and log back in after it. `pnpm bds schedule status` should show a `scheduled` run. This is a **real ingestion run**, the runner's first. Watch:
   - **The run log's checks.** `Operation not permitted` on the local files means Full Disk Access is needed (the developer decides how after seeing this: `brew pin node@22` or a stable node copy).
   - **Pre-sync.** The SSD already has the files, so it should download little.
   - **Peak memory while indexing.** The open question about the 9.5 GB heap on 16 GB. Either keep Activity Monitor open in a session, or measure the biggest site directly: `/usr/bin/time -l pnpm bds lambda run --lambda=srt-indexing --sites=<biggest>`, and read "maximum resident set size".
9. **SIGTERM while transcribing** (needs untranscribed episodes): `sudo launchctl kill SIGTERM system/com.browse-dot-show.ingest`. Expect:
   - The record says `interrupted`, and `pgrep -fl whisper-cli` shows nothing.
   - No locks from that pid are left in `<localFilesPath>/locks/transcription/*/`, and `ingestion-run.lock` is gone.
10. **Asleep instead of logged out:** only relevant if the runner sleeps. With `sleep 0` it doesn't, so this can be skipped.
11. **After the stack merges:**
    - In the clone, run `git checkout main && git pull`.
    - Run `pnpm bds schedule install --track=main`; the next run moves the runner to `main`.
    - Tag `v1.0.0`.

## Open questions: answered 2026-10-08

1. **Testing:** skip the dev Mac and test on the 16 GB runner before merging (runbook above).
2. **Full Disk Access:** wait for the runner test (step 8) to see whether it's needed at all.
3. **`ProcessType: Interactive`:** keep it.
4. **Indexing memory on 16 GB:** measure on the runner first (step 8).
5. **Success notifications:** `always` (a daily heartbeat). This is now the default.
6. **Slack + healthchecks.io:** the developer creates both during runner setup (step 4).
7. **Homebrew whisper.cpp:** test it on the runner only (step 3).
8. **Runner checkout on the 16 GB Mac:** a separate runner worktree, as designed.

## Remaining work

- The runner setup and tests above, merging the stack, then tag `v1.0.0` (move the changelog's "Unreleased" section under it).
- Full Disk Access handling and the indexing heap size depend on the runner test.
- Client/homepage typecheck: #201 (independent of this stack).

## Decisions (made with the developer, 2026-10-07)

Machines found: the dev machine is a **Mac mini M4 Pro, 64 GB** (`Mac16,11`, macOS 26.6.2, `sleep 0`, FileVault on, nvm Node). The local files are on a 4 TB Thunderbolt APFS SSD (`/Volumes/4TB_SSD_jackkoppa_1`, fixed, not encrypted).

1. **Machine:** the runner will be a **second Mac mini M4, 16 GB**, dedicated, with the same SSD moved over and left attached. It may later host other services (e.g. an LLM request server). Other developers matter only as far as good docs (assume ≤16 GB Macs). Development keeps happening on the 64 GB Mac.
2. **Rollout:** build and run the launchd acceptance tests **on the 64 GB dev Mac** with the SSD attached (scheduled minutes out, logged out, `bootout`/SIGTERM), **uninstall there**, then move the SSD and do the real install + benchmark on the 16 GB Mac. *Changed on 2026-10-08: skip the dev Mac; test on the 16 GB runner before merging (runbook above).*
3. **Code source:** a **dedicated runner checkout** (separate clone/worktree) that fast-forwards to `origin/main` before each run and rebuilds when it changed. Branch work in the main checkout never affects scheduled runs. It shares `.local-files-config.json`, `.env.local` and `.env.automation` (e.g. via `bds worktree link-config` or copies).
4. **FileVault:** **off on the 16 GB runner** (boots unattended after outages); `pmset autorestart 1`; macOS updates manual/deferred. Dev Mac unchanged. `schedule status` still reports the FileVault state.
5. **Notifications:** **Slack incoming webhook** (failures, skips, optional short success summary; URL in `.env.automation`) **plus a dead-man's switch** (healthchecks.io ping per run, alerting via Slack if no run by the expected time). No AWS/Terraform changes.
6. **Schedule:** **nightly at 03:00** (`pmset repeat wakeorpoweron` a few minutes before).
7. **Toolchain:** **Homebrew for everything** (Brewfile: `node@22`, `ffmpeg`, `awscli`, `whisper-cpp`, …) for stable absolute paths; small code change so `whisper-cli` can come from Homebrew, keeping the source-checkout path working on the dev Mac. Model file location TBD in implementation.
8. **Run-as user:** the developer's **normal user** (LaunchDaemon with `UserName`), not a service user.
9. **Logs:** **`~/Library/Logs/browse-dot-show/`**: one log per run + JSON summary, rotated, plus launchd stdout/stderr; `schedule status` reads the summaries.
10. **Workers:** **benchmark 1–4 workers on the runner during setup**, the developer picks, stored as `transcriptionWorkers` in `.local-files-config.json`.

## macOS facts the design relies on

From the planning; verify on the runner's macOS version.

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

