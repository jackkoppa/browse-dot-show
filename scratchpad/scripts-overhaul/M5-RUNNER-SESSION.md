# M5 on the 16 GB runner Mac: brief for a new session

> **Update (2026-10-08): done.** The stack is merged and the runner follows `main` at 03:00. The results are in [section 8](#8-runner-test-results); what's still being watched is in [M5-mac-automation.md](./M5-mac-automation.md#watching-the-runner-before-calling-m5-done). Sections 3–6 still describe the setup on this Mac, if it's ever redone. On the runner, the repo is at `~/Personal_Development/browse-dot-show` (runner checkout: `~/Personal_Development/browse-dot-show-runner`).

**If you're an agent starting a session on the 16 GB Mac mini, start here.** This brief is self-contained. The session that built M5 ran on the developer's 64 GB Mac and can't be resumed here; its memory files stay on that Mac too. The developer will go back to that session only once everything below is done and merged, so **write down what you find** (see [Wrap-up](#7-wrap-up-leave-a-report-for-the-dev-mac-session)).

Background, read as needed:

- [M5-mac-automation.md](./M5-mac-automation.md): goal, PR stack, design notes, what's been tested, decisions and answers
- [docs/scheduled-ingestion.md](../../docs/scheduled-ingestion.md): the user-facing setup guide you're about to test
- [HANDOFF.md](./HANDOFF.md): the wider project and how to work with the developer

## 1. Where things stand (2026-10-08)

- **M5** (nightly ingestion on a Mac with nobody logged in) is built as **6 stacked, unmerged PRs**. Merge them in order:

  | PR | Branch | What |
  | --- | --- | --- |
  | #195 | `jackkoppa/m5-decisions` | Decisions doc |
  | #196 | `jackkoppa/m5-toolchain` | `Brewfile`, `scripts/bootstrap.sh`, Homebrew `whisper-cli` support |
  | #197 | `jackkoppa/m5-run-lock` | Run lock, logs in `~/Library/Logs`, `ingest --summary-json` |
  | #198 | `jackkoppa/m5-scheduled-run` | `bds schedule run` / `run-now` / `test-notifications` |
  | #199 | `jackkoppa/m5-schedule-install` | `bds schedule install` / `uninstall` / `status` |
  | #200 | `jackkoppa/m5-setup-machine` | `bds setup machine` / `benchmark`, docs, this brief |

  #195 is based on `main`; each of the others is based on the PR before it. All are scripts and docs only, so merging deploys nothing.
- **#201** (client/homepage typecheck) is independent of the stack, based on `main`. Its plan showed no changes; on merge it re-uploads every client and the homepage, which is a long but harmless deploy. The developer merges it whenever.
- **Tested so far, without sudo or AWS:**
  - unit tests (143)
  - the run lock
  - dry runs end to end
  - a launchd-like environment, which caught and fixed SSH `git fetch` failing under launchd
  - SIGTERM during a runner update
  - the benchmark
- **Not tested yet; this session's job:**
  - anything needing sudo: the real LaunchDaemon and `pmset`
  - a real (AWS) scheduled run while logged out
  - SIGTERM while transcribing
  - whether the LaunchDaemon needs Full Disk Access to read the SSD
  - Homebrew `whisper-cli` end to end
  - the benchmark and memory use on 16 GB
- **The developer's decisions for this session** (2026-10-08):
  - Test on this Mac *before* merging: the runner follows the stack's top branch with `--track`.
  - Full Disk Access: decide after seeing whether it's needed.
  - Keep `ProcessType: Interactive` in the plist.
  - Measure indexing memory here: lambdas run with a 9.5 GB heap, `LAMBDA_NODE_OPTIONS` in `scripts/lib/lambda.ts`.
  - Slack posts on every run (a daily heartbeat).
  - The developer creates the Slack webhook and the healthchecks.io check.
  - Use a separate runner worktree here too.
  - FileVault is off on this Mac.

## 2. Ground rules (how the developer works)

- **Ask questions as interactive prompts.** Use the question tool: multiple choice, batched (up to 4 per prompt), recommended option first. Don't ask in a long list in chat.
- **sudo and machine settings:** the developer runs them (`pmset`, `fdesetup`, `bds schedule install`/`uninstall`, `launchctl` with sudo). Give the exact command, the expected output and what to watch for, then read the output they paste back. They may type `! <command>` in the prompt so the output lands in the session.
- **AWS:** anything that touches AWS needs a go-ahead. That includes:
  - a real `bds ingest`
  - `schedule run-now` without `--dry-run`
  - `doctor --aws`
  - deploys

  Read-only checks have been fine. The developer often prefers to run AWS commands themselves: offer the command, expected output and checkpoints.
- **Never break the deployed sites** ([invariants](../../docs/deployed-sites-invariants.md)). Nothing here should touch Terraform.
- **Local files** (the SSD, hundreds of GB): normal pipeline runs are fine, but don't delete or move anything there without asking.
- **The repo is public:** PR comments, Actions logs and artifacts are public. Keep secrets (`.env.automation`, webhook URLs) out of them.
- **One PR per change.** For fixes found here, add a commit to the right PR in the stack (section 4).

## 3. Set up the session on this Mac

The developer may already have done some of this. Check first (`brew --version`, `ls ~/browse-dot-show`, `fdesetup status`, `pmset -g`).

1. **macOS settings** (the developer, with sudo):
   - FileVault off: `fdesetup status` should say `FileVault is Off.`
   - `sudo pmset -c sleep 0`
   - `sudo pmset autorestart 1`
   - No automatic installs of macOS updates
   - Remote Login on
2. **Homebrew, the Xcode tools, and GitHub access:**
   ```bash
   xcode-select --install          # if needed
   # Homebrew from https://brew.sh, if needed
   brew install gh
   gh auth login                   # the developer: GitHub.com, HTTPS, browser login
   gh auth setup-git               # lets git push over HTTPS with gh's token
   ```
   You need push access to fix PRs. The token stays on this always-on Mac; ask the developer whether to run `gh auth logout` once the stack has merged.
3. **Clone at the stack's top branch, and bootstrap:**
   ```bash
   git clone https://github.com/jackkoppa/browse-dot-show ~/browse-dot-show && cd ~/browse-dot-show
   git checkout jackkoppa/m5-setup-machine
   ./scripts/bootstrap.sh
   ```
   Don't clone into `~/Documents`, `~/Desktop` or `~/Downloads` (privacy protections block background jobs there).
4. **Node in your shell:** Homebrew's `node@22` is keg-only, so it isn't on PATH by default. In every shell command (your Bash tool doesn't keep state between calls), prefix:
   ```bash
   export PATH="$(brew --prefix node@22)/bin:$PATH"
   ```
   Or ask the developer to add it to `~/.zprofile` (bootstrap prints the line).
5. **Local branches for the whole stack**, so you can fix lower PRs:
   ```bash
   git fetch origin
   for b in m5-decisions m5-toolchain m5-run-lock m5-scheduled-run m5-schedule-install; do
     git branch -f jackkoppa/$b origin/jackkoppa/$b
   done
   ```
6. **Run the checks once:** `pnpm --filter @browse-dot-show/scripts test` and `pnpm all:typecheck`. Both should pass: 143 tests, 16/16 projects. #201's client/homepage checks aren't in this stack.

## 4. Fixing something in the stack

Find which PR the code belongs to (the table above, or `git log --oneline origin/main..` with `git show --stat`), then:

```bash
git checkout jackkoppa/<that-branch>
# edit, test (pnpm --filter @browse-dot-show/scripts test; typecheck)
git commit -m "fix(schedule): …"          # end the message with the attribution line your instructions give
git checkout jackkoppa/m5-setup-machine
git rebase --update-refs jackkoppa/<that-branch>   # restacks every branch above it
git push --force-with-lease origin jackkoppa/<that-branch> <every branch above it>
```

- **Avoid `--amend` on a lower branch.** If you do amend, restack with `git rebase --onto jackkoppa/<that-branch> <old commit> jackkoppa/<next-branch>`. A plain rebase replays the old commit and conflicts.
- If a fix is in the docs (#200), just commit on `jackkoppa/m5-setup-machine`.
- Mention notable fixes in the PR's description: `gh pr edit <n> --body-file <file>`. Read the body first with `gh pr view <n> --json body -q .body`.
- **Never edit or commit in the runner worktree (`~/browse-dot-show-runner`).** Scheduled runs refuse to update a checkout with uncommitted changes. Work in `~/browse-dot-show`.
- **The runner follows the pushed branch.** Each scheduled run (or `run-now`) fetches `origin/jackkoppa/m5-setup-machine`, force-pushes included. The run's own wrapper code is whatever the runner had *before* that update; the ingest step uses the updated code.

## 5. Test checklist

Mark each step ✅/❌ and add notes in [section 8](#8-runner-test-results) as you go. Expected output is described in [docs/scheduled-ingestion.md](../../docs/scheduled-ingestion.md); notes specific to this test follow.

1. **[Agent] Is this the right Mac?**
   - `sysctl -n hw.model hw.memsize` should show a Mac mini with about 16 GB (17179869184).
   - `sw_vers` gives the macOS version; record it.
   - `fdesetup status`, `pmset -g custom`.
2. **[Developer] Files to bring over:**
   - Plug in the SSD; it should mount as `/Volumes/4TB_SSD_jackkoppa_1`.
   - Copy `.env.automation` from the 64 GB Mac (AirDrop puts it in `~/Downloads`).
3. **[Agent] `bds setup machine`:**
   ```bash
   pnpm bds setup machine --local-files=/Volumes/4TB_SSD_jackkoppa_1/browse-dot-show-local-files --automation-env=~/Downloads/.env.automation
   ```
   - **Expect:** it creates `.env.local` with `WHISPER_CPP_PATH=~/Library/Application Support/browse-dot-show/whisper.cpp` (the Homebrew layout), downloads the model (~1.6 GB), and runs `chmod 600` on `.env.automation`. Doctor should pass, except for warnings about notifications and the external volume.
   - **First real test of Homebrew `whisper-cli`:** check that `"$HOME/Library/Application Support/browse-dot-show/whisper.cpp/build/bin/whisper-cli" --help` runs.
   - Afterwards, suggest the developer deletes the copy in `~/Downloads`.
   - Then `pnpm bds doctor --aws` is read-only (`sts:AssumeRole`), but ask first.
4. **[Developer + Agent] Notifications:**
   - The developer creates the Slack webhook and the healthchecks.io check (`docs/scheduled-ingestion.md#4-notifications`; cron `0 3 * * *`, their time zone, 8 h grace) and adds `SLACK_WEBHOOK_URL=` and `HEALTHCHECK_PING_URL=` to `~/browse-dot-show/.env.automation`. Don't print the URLs into logs or PRs.
   - Then you run `pnpm bds schedule test-notifications`, then `--fail`. Both should arrive.
   - Afterwards the healthcheck is red until the next success; another plain `test-notifications` turns it green.
5. **[Agent] Benchmark:**
   - `pnpm bds setup benchmark`, which takes about 10–30 min on a base M4.
   - **Watch memory:** in another call, `vm_stat` or `memory_pressure` while 3–4 workers run. Each worker is about 2 GB.
   - Record the table, and save the recommendation (ask the developer).
   - Do this **before the first real run**: without `transcriptionWorkers`, runs default to 3 workers.
6. **[Developer, sudo] Install, following the branch.** First pick a time about 15 min ahead (`date`).
   ```bash
   pnpm bds schedule install --at=<HH:MM> --track=jackkoppa/m5-setup-machine
   ```
   - **Expect:**
     - The runner is created at `~/browse-dot-show-runner`, then installed and built (a few minutes).
     - 4 sudo steps: install the plist, bootout (an error is fine on a first install), bootstrap, `pmset repeat`.
     - The node path should be `/opt/homebrew/opt/node@22/bin/node`.
   - **If `launchctl bootstrap` fails** (`Bootstrap failed: 5: Input/output error`):
     - `plutil -lint /Library/LaunchDaemons/com.browse-dot-show.ingest.plist`
     - `ls -l` should show `root wheel` and `-rw-r--r--`
     - `sudo launchctl print system/com.browse-dot-show.ingest`
7. **[Agent] `pnpm bds schedule status`:**
   - It should show the job loaded (`state = not running`) and the wake (`wakepoweron at … every day`).
   - The warnings should be only the `--track` branch and, until step 4, notifications.
   - Then `pnpm bds schedule run-now --dry-run` should run in the runner and end with `✅ … (dry run) succeeded`.
8. **[Developer] The real run, logged out:**
   - The developer logs out (Apple menu → Log Out) before the `--at` time and logs back in about 20+ min after it. Over SSH, `tail -f` the newest `~/Library/Logs/browse-dot-show/scheduled/*.log` instead.
   - This is a **real ingestion run** (AWS: pre-sync from S3, RSS, transcription, indexing, upload, CloudFront), the first from this Mac. Installing in step 6 is the go-ahead, but say so before step 6.
   - **Check:**
     - **The run log's checks.** `local files: can't read/write … Operation not permitted` means the LaunchDaemon needs **Full Disk Access**. Show the developer and ask how to handle it: grant FDA to the real path of `/opt/homebrew/opt/node@22/bin/node` (`realpath` it) and `brew pin node@22`, or something more stable. The decision was "wait for the test".
     - **The pre-sync.** The SSD is up to date, so it should download little. Many downloads would mean a path or config problem; stop and look.
     - **The run's outcome** in `bds schedule status`, the Slack message, and the healthcheck.
     - `~/Library/Logs/browse-dot-show/launchd.log` should be empty, or show only early errors.
9. **[Agent, measuring] Indexing memory** (open question: is a 9.5 GB heap OK on 16 GB?):
   - Ask before running anything. `/usr/bin/time -l pnpm bds lambda run --lambda=srt-indexing --sites=<biggest site>` runs locally with no AWS (check `pnpm bds lambda run --help` first). Read "maximum resident set size".
   - The biggest sites by transcripts: `du -sh /Volumes/4TB_SSD_jackkoppa_1/browse-dot-show-local-files/s3/sites/*/transcripts | sort -h | tail -3`.
   - Record the result, and ask the developer whether to lower the heap or make it configurable.
10. **[Developer, sudo] SIGTERM while transcribing.** This needs untranscribed episodes; a run on a day with new episodes works, or the developer may have some.
    - During a run's transcription phase (the run log shows worker progress), run `sudo launchctl kill SIGTERM system/com.browse-dot-show.ingest`.
    - **Expect:**
      - The record says `interrupted` (`bds schedule status`), and the Slack and healthcheck failure notices arrive.
      - `pgrep -fl whisper-cli` shows nothing.
      - `ls /Volumes/4TB_SSD_jackkoppa_1/browse-dot-show-local-files/locks/transcription/*/` has no locks from that pid.
      - `locks/ingestion-run.lock` is gone.
    - A later run transcribes those episodes.
11. **[Agent] Optional `run-now --via-launchd`** (sudo `launchctl kickstart`): the developer runs it if step 8 timing is awkward.
12. **[Developer] Set the real schedule:** `pnpm bds schedule install --at=03:00 --track=jackkoppa/m5-setup-machine`, until the stack merges.

Debugging aids:

- **Run records:** `~/Library/Logs/browse-dot-show/scheduled/<id>.json`, plus the `.log` and `.summary.json` next to them.
- **Settings:** `~/Library/Application Support/browse-dot-show/schedule.json`.
- **The launchd job:** `launchctl print system/com.browse-dot-show.ingest` (no sudo needed).
- **The wake:** `pmset -g sched`.
- **Reproduce launchd's environment without sudo:** run the plist's `ProgramArguments` with only its `EnvironmentVariables` and `cwd=/`, adding `--dry-run`. Keep this script outside the repo:
  ```js
  // launchd-sim.mjs <plist> [extra args]
  import { execFileSync, spawn } from 'child_process';
  const [plist, ...extra] = process.argv.slice(2);
  const job = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist], { encoding: 'utf8' }));
  const [cmd, ...args] = job.ProgramArguments;
  const child = spawn(cmd, [...args, ...extra], { cwd: '/', env: job.EnvironmentVariables, stdio: 'inherit' });
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('close', code => process.exit(code ?? 1));
  ```
- **Test without touching the real install:** point `BDS_LOGS_DIR` and `BDS_APP_SUPPORT_DIR` at a scratch folder and use `bds schedule install --print-only --runner-dir=<scratch>/runner`. Remove the scratch runner afterwards with `git worktree remove --force`.

## 6. Merging (once testing passes and the developer agrees)

The developer merges. `main` uses **rebase merges**, branch protection requires **up-to-date branches**, and the required checks are `typecheck` and `terraform-plan-result`. Checks only run on PRs whose base is `main`.

1. Merge #195; it's based on `main`. If GitHub doesn't retarget #196 to `main` automatically (it does when the merged branch is deleted), run `gh pr edit 196 --base main`.
2. Rebase the rest of the stack onto `main`:
   ```bash
   git fetch origin
   git checkout jackkoppa/m5-setup-machine
   git rebase --update-refs origin/main
   git push --force-with-lease origin jackkoppa/m5-toolchain jackkoppa/m5-run-lock jackkoppa/m5-scheduled-run jackkoppa/m5-schedule-install jackkoppa/m5-setup-machine
   ```
   A rebase merge gives the merged commits new hashes, so git normally drops them as already applied. If it replays one and conflicts, `git rebase --skip` it.
3. Wait for #196's checks: `typecheck`, plus `terraform-plan-result`, which should say nothing to deploy. Then the developer merges, and you repeat steps 2–3 for #197 … #200.
4. **After #200 merges:**
   - In `~/browse-dot-show`: `git checkout main && git pull`.
   - The developer runs `pnpm bds schedule install --at=03:00 --track=main`; the next run moves the runner to `main`, and `bds schedule status` stops warning about the branch.
   - Delete the stack's local branches.
5. **v1.0.0** (ask the developer):
   - Move the changelog's "Unreleased" section under a `## v1.0.0 (<date>)` heading, in its own small PR.
   - Then tag: `git tag v1.0.0 <merge commit> && git push origin v1.0.0`.

## 7. Wrap-up: leave a report for the dev-Mac session

The developer goes back to the original session on the 64 GB Mac afterwards. That session only knows what's in the repo, so before finishing:

1. **Fill in [section 8](#8-runner-test-results)** with results, fixes (PR + commit), decisions and anything left open. Put it in the last open PR, or in a small docs PR if everything has merged.
2. **Update** [M5-mac-automation.md](./M5-mac-automation.md) (status line, "Tested so far") and [HANDOFF.md](./HANDOFF.md) (the M5 row and "What's next"). Once M5 is done, this brief can shrink to the report, or move to the history table in HANDOFF.
3. **Update the docs** where reality differed: `docs/scheduled-ingestion.md` (Full Disk Access, timings, the benchmark table for a base M4 16 GB), troubleshooting entries.
4. Tell the developer what's done, and what's left for the dev-Mac session (the SSD has moved, so `bds doctor` there will report local files missing; that's expected).

## 8. Runner test results

Filled in on the runner, 2026-10-08.

| Step | Result | Notes |
| --- | --- | --- |
| 1 Mac / macOS version | ✅ | Mac mini M4 (Mac16,10), 16 GB, macOS 26.3 (25D125). **FileVault was on**; the developer turned it off. `sleep 0`, `autorestart 1` were already set |
| 3 setup machine, Homebrew whisper | ✅ | Repo at `~/Personal_Development/browse-dot-show` (not `~/browse-dot-show`), runner at `~/Personal_Development/browse-dot-show-runner`. Homebrew `whisper-cli` 1.9.5 via the symlink works; model downloaded. `doctor --aws`: both accounts assume, all 23 sites |
| 4 notifications | ✅ | Slack + healthchecks.io: success and `--fail` both arrived |
| 5 benchmark (workers → audio-min/min, memory) | ✅ | 1 → 14.1, 2 → 16.5, 3 → 16.4, 4 → 16.9. Peak whisper RSS 2.8 / 5.1 / 6.3 / 8.4 GB; min free memory 65 / 45 / 24 / 16%; swap < 1 GB. **Saved 2.** Took 2 h 10 min (8 hour-long episodes): fixed, see below |
| 6 install | ✅ | First install as expected (`Boot-out failed: 3` on the first install only). Node `/opt/homebrew/opt/node@22/bin/node` |
| 7 status, dry run | ✅ | Job loaded, wake set; `run-now --dry-run` succeeded through the runner |
| 8 real run logged out; Full Disk Access? | ✅ (2nd try) | **1st (11:15): skipped**: EPERM on the SSD (**Full Disk Access is needed**) *and* no network (the only Ethernet is via a hub that was unplugged; Wi-Fi had no network joined), so Slack/healthcheck couldn't send either. Fixes: FDA for `/opt/homebrew/Cellar/node@22/22.23.3_1/bin/node` + `brew pin node@22`; joined Wi-Fi. **2nd (12:35, logged out, hub unplugged): succeeded**, 1 h 3 min: pre-sync 0 downloads, 8 episodes transcribed (2 workers), 59 files uploaded, CloudFront for 23 sites. It finished 2 min after the developer logged in; logs and the power log show steady progress and no sleep throughout, so not waiting on the login. At the next login macOS asked "Allow node to find devices on local networks"; "Don't Allow" is fine (the run went on to upload and notify after it) |
| 9 indexing peak memory | ✅ | limitedresources (largest: 158 MB transcripts, 535,813 entries): 102 s, **max RSS 9.98 GB**, free memory ≥ 40%, no swap growth. The 9.5 GB heap is fine on 16 GB (indexing runs after transcription), and can't go lower without failing the largest site |
| 10 SIGTERM while transcribing | ⏳ | Not done: no untranscribed episodes after the real run. Test on a day with new episodes |
| Merged | ✅ | #195–#200 merged 2026-10-08 (GitHub's stacked PRs). Then `schedule install --at=03:00 --track=main` |

Fixes made here (each a commit on its PR; the stack was restacked):

- #197 `fix(ingest): Count new audio files when LOG_LEVEL is unset`: every run reported "0 downloaded" (the count is parsed from an info-level line, hidden at the default `warn`).
- #198 `feat(schedule): Easier-to-read Slack messages: bullets, linked sites` (the developer asked): bold headline, bullets, failed checks one per line (`failedChecks` in the record), episodes per site linked to the deployed site.
- #199 `fix(schedule): Name the branch the runner follows when reusing it`: install said "keep it at origin/main" with `--track`.
- #200 `fix(setup): Benchmark with shorter episodes; a realistic time estimate`; docs: network with nobody logged in, FDA is needed for an external SSD, the Local Network prompt, keg-only node and fnm/nvm prompts, the 16 GB benchmark table; `setup machine --help` says it doesn't ask without a terminal.

Decisions made here:

- FileVault off on the runner (it was on).
- Full Disk Access: grant it to the Cellar node binary and `brew pin node@22` (over copying node to a stable path).
- `transcriptionWorkers: 2` on the runner.
- Keep the 9.5 GB indexing heap.
- Network: Wi-Fi joined as the always-there network; the developer may add an Ethernet cable to the Mac itself later.
- Local Network permission for node: denied, not needed.
- Slack thread replies: not possible with an incoming webhook (no message `ts` to reply to); the site links went into the message instead. Threads would need a Slack app with a bot token (`chat.postMessage`): a possible follow-up.

Left open:

- Step 10 (SIGTERM while transcribing).
- Tailscale is installed on the runner (Homebrew `tailscaled` as root, plus the app's network extension), unused. It didn't affect the runs; uninstall if it ever gets in the way.
- The dry-run summary marks every phase ❌ although nothing failed (cosmetic, in the pipeline summary).
