# 03: Unattended Ingestion on a Mac

> **Timing:** this is **session 2, targeted for 2026-10-12**, a separate agent session after the scripts cleanup (session 1, 2026-10-06). It needs more work and real-machine testing than the cleanup does.
>
> **In session 1 (cleanup):** do only the "Remove first" section below, and keep the design compatible with this doc (non-interactive commands, headless `--parallel=N`, no dependence on a logged-in shell; see the README timeline). Don't build the LaunchDaemon, `pmset` wake, `setup machine` or `schedule` commands yet.
>
> **Notes from session 1 for session 2:** *(session 1 agent: add anything learned here, e.g. final CLI command names, where config and credentials now load from, the PATH/tooling decision on Hermit)*

## Goal

On an Apple silicon Mac (M1+; assuming M4 is fine if it helps), a few commands from this repo set the machine up to run the full ingestion pipeline for all sites on a schedule, with **no user logged in** and no manual steps afterwards. So far it has only ever been run by hand.

## Remove first (none of this has worked) *(done in session 1)*

Delete these outright; don't keep them for compatibility:

- `scripts/automation-management.ts` and the `ingestion:automation:manage` command. That approach was a LaunchAgent that ran at login, at most once per 24h, with `sudo` required for setup.
- `.automation-config` (gitignored state file used by the script above).
- The old run logs in `scripts/automation-logs/` (`automation*.log`, `daily-pipeline*.log`, `power-management*.log`), and its README text referring to `sudo pnpm power:manage`.
- `scratchpad/UPDATING_DOCS_AND_LAMBDA_DEPLOYMENTS_FOR_LOCAL-FOCUSED_AUDIO_PROCESSING.md` (describes the LaunchAgent approach).
- `docs/deployment-guide.md`, the sections "Automatic Updates → Option 1: Local Automation", "Managing Local Automation" and "Local Automation Issues (macOS)". Rewrite them to point at the new commands.
- Rename the `ingestion:run-pipeline:triggered-by-schedule` command as part of the CLI work.
- On the developer's machine, if present: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.browse-dot-show.ingestion-automation.plist`, then delete the plist. The developer runs this; mention it in the PR.

**Do NOT remove** the EventBridge Terraform in `terraform/sites/` (`modules/eventbridge`, `search_lambda_warming_schedule`, `enable_rss_processing_schedule`). Those are AWS-side schedules, and search warming is enabled for every deployed site. See [05](./05-deployed-sites-invariants.md).

## How the pieces fit (macOS facts to design around)

Verify each of these on the current macOS version while implementing.

1. **LaunchAgents need a logged-in user; LaunchDaemons don't.** `~/Library/LaunchAgents` jobs only run inside a logged-in session, which is why the old approach needed a login. Use a **LaunchDaemon** in `/Library/LaunchDaemons/` with `UserName` set to the developer's user, so it runs at the login window or with nobody logged in. Installing it needs `sudo` once.
2. **Scheduling uses `StartCalendarInterval`.** If the Mac is *asleep* at that time, launchd runs the missed job once on the next wake. If the Mac is *off*, it doesn't run. launchd also won't start a second copy of a job that's still running.
3. **Waking up:** `sudo pmset repeat wakeorpoweron MTWRFSU 02:55:00` schedules a wake (or power-on) a few minutes before the job. `pmset -g sched` shows it. Only one repeating wake schedule exists per machine, so `schedule install` should show and replace it, not stack another.
4. **Staying awake:** run the job under `caffeinate -i -s -m <command>`. `-i` prevents idle sleep and `-s` prevents system sleep while on AC power, so the Mac stays awake until the pipeline exits. Without this, a Mac woken on a schedule can fall back asleep mid-run.
5. **The most reliable setup is a desktop that never sleeps.** A Mac mini or Studio on AC with sleep disabled (`sudo pmset -c sleep 0`, plus `sudo pmset autorestart 1` to power back on after an outage) avoids depending on scheduled wake at all. A laptop with its lid closed and no external display won't stay awake reliably. Recommend the desktop setup and support laptops on a best-effort basis (wake + caffeinate, lid open, on power).
6. **FileVault blocks unattended reboots.** With FileVault on (the default on Apple silicon), the disk stays locked after any reboot until someone types a password, so nothing runs (not even LaunchDaemons) until then. Options for the developer to choose from:
   - (a) Accept it, and let `schedule status` / `doctor` warn about it.
   - (b) Use `sudo fdesetup authrestart` for planned restarts, and turn off automatic macOS update installs on this machine.
   - (c) Turn off FileVault on a dedicated ingestion machine.

   Present these options; don't pick one silently.
7. **No keychain.** With nobody logged in, the login keychain is locked, and AWS SSO tokens can't be refreshed interactively. Use the existing file-based automation credentials (`.env.automation`: an IAM user's access key, plus cross-account role assumption into each site; see `scripts/utils/automation-credentials.ts` and `terraform/automation/`). The file should be `chmod 600`.
8. **Minimal `PATH` under launchd.** Write absolute paths into the plist and wrapper script (`node`, `pnpm`, `ffmpeg`, `ffprobe`, `aws`, the whisper binary). Don't rely on nvm or Hermit shims at runtime. Hermit has caused problems with some scripts; decide with the developer whether to drop it in favour of Homebrew `node@22` + Corepack pnpm. Dropping it simplifies this considerably.
9. **Privacy protections.** A background job can't read `~/Documents`, `~/Desktop`, `~/Downloads`, iCloud Drive or removable volumes unless the binary has Full Disk Access. `setup machine` should check that the repo and the local-files directory (from `.local-files-config.json`) aren't in those locations, or explain how to grant access.
10. **Logs:** write to `~/Library/Logs/browse-dot-show/` (one file per run, plus a JSON summary). Set `StandardOutPath` / `StandardErrorPath` in the plist to a stable location for crashes before the app logger starts.

## Target developer experience

```bash
# On a fresh Mac (only Homebrew, git, and Xcode command line tools needed beforehand)
git clone https://github.com/jackkoppa/browse-dot-show && cd browse-dot-show
./scripts/bootstrap.sh          # bash: brew bundle (node, pnpm, ffmpeg, awscli, whisper-cpp, terraform), pnpm install
pnpm bds setup machine          # interactive: local-files dir, whisper model download, .env.local, .env.automation check, doctor
pnpm bds schedule install --at=03:00   # writes LaunchDaemon + pmset wake (prompts for sudo), runs a dry run
pnpm bds schedule status        # next run, wake schedule, last N runs + results, warnings (FileVault, power, sleep settings)
```

Suggestions:

- A `Brewfile` at the repo root makes `bootstrap.sh` tiny. Homebrew's `whisper-cpp` formula provides a Metal-enabled `whisper-cli`. Check how the code consumes `WHISPER_CPP_PATH` / `WHISPER_CPP_MODEL` (see `packages/ingestion/process-audio-lambda/`) and point them at the Homebrew binary and a downloaded model.
- `schedule install` generates the plist from a template (keep it in the repo, e.g. `scripts/automation/com.browse-dot-show.ingest.plist.template`). The plist runs a wrapper script that does: `cd` to the repo, `caffeinate -i -s -m`, then `bds ingest --all-sites --parallel=N --non-interactive`, plus a log rotation step.
- `schedule run-now` must use the **exact** same wrapper as the scheduled job, so testing is honest.
- Add a lock file so a manual `bds ingest` and the scheduled run can't overlap.
- **Failure notifications:** desktop notifications are invisible with nobody logged in. Ask the developer which channel they want (email via SES/SNS, a push service like ntfy/Pushover, or opening a GitHub issue).
- **Guard rails before each run:** on AC power (or battery above a threshold), enough free disk space, and network reachability. Log a "skipped" result instead of failing noisily.
- **Unattended pipeline order:** the pipeline syncs S3→local first, so a machine that's been off for a while catches up correctly. Keep that.

## Acceptance test

1. Run on a Mac that has never run the pipeline, or a fresh user account.
2. Set a schedule a few minutes out, log out completely, and (on laptops) let it sleep.
3. Confirm that it wakes, runs all sites, uploads to S3, and invalidates CloudFront, and that `schedule status` shows the result after logging back in.
4. Repeat once with the machine asleep, rather than at the login window.
