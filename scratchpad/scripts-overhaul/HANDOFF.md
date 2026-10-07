# Handoff: after the scripts overhaul (2026-10-06)

**Start here** if you're picking up browse-dot-show developer tooling work. This page says what's done, what's next (in order), and how to work with the developer. Details live in the numbered docs in this folder.

## State of the repo

Session 1 of the scripts overhaul is **done and merged** into `main`:

| PR | What |
| --- | --- |
| [#162](https://github.com/jackkoppa/browse-dot-show/pull/162) | Plan and decisions (this folder) |
| [#163](https://github.com/jackkoppa/browse-dot-show/pull/163) | M0: scripts typecheck passes; runs on commit via lint-staged |
| [#164](https://github.com/jackkoppa/browse-dot-show/pull/164) | M1: deleted dead scripts and the old LaunchAgent automation |
| [#165](https://github.com/jackkoppa/browse-dot-show/pull/165) | M2: shared modules in `scripts/lib/` |
| [#166](https://github.com/jackkoppa/browse-dot-show/pull/166) | M3: the `pnpm bds` CLI (`scripts/cli/`) |
| [#167](https://github.com/jackkoppa/browse-dot-show/pull/167) | M4: parallel transcription (`bds ingest --parallel=N`, default 3) + process-audio lambda fixes |
| [#168](https://github.com/jackkoppa/browse-dot-show/pull/168) | M6: docs rewrite, Hermit removed (Node 22 via `.nvmrc`), `CHANGELOG.md` |

- **Tag [`v0.0.1`](https://github.com/jackkoppa/browse-dot-show/tree/v0.0.1)** = `main` before the overhaul (`999e345`). The README, Getting Started, Local Development and Deployment guides and `CHANGELOG.md` point pre-2026-10-06 users to it.
- **`v1.0.0`** gets tagged once M4b (GitHub Actions deploys) and M5 (Mac automation) both work. Then move the changelog's "Unreleased" section under it.
- Verified after merging: `pnpm install && pnpm all:build` ok, `pnpm bds doctor` 0 failures, `pnpm bds ingest --all-sites --dry-run` exit 0, scripts typecheck ok. Before merging: a real haveaword end-to-end run, real parallel transcription, Ctrl+C/SIGTERM tests, and lambda packaging compared against `v0.0.1`. Results are in [06](./06-session-1-decisions.md) ("Test results").

Orientation: [`docs/local-development.md`](../../docs/local-development.md) (setup, config files, the full `bds` command reference, scripts layout) and [`AGENTS.md`](../../AGENTS.md).

## What's next, in order

The developer chose this order on 2026-10-06. No dates.

### 1. Small follow-ups ([10](./10-follow-ups.md)): ✅ PRs open (2026-10-07)

Stacked on #169, in order: [#170](https://github.com/jackkoppa/browse-dot-show/pull/170) `validate sites` passes (10 §7) → [#171](https://github.com/jackkoppa/browse-dot-show/pull/171) index sites whose transcripts are newer than their index (10 §4) → [#172](https://github.com/jackkoppa/browse-dot-show/pull/172) worktrees get gitignored config symlinked (10 §8) → [#173](https://github.com/jackkoppa/browse-dot-show/pull/173) process-audio typecheck (10 §9) → [#174](https://github.com/jackkoppa/browse-dot-show/pull/174) search-entries no longer all rewritten/re-uploaded (10 §6) → [#175](https://github.com/jackkoppa/browse-dot-show/pull/175) atomic per-file transcription locks (10 §5).

After merging: the next real `bds ingest --all-sites` indexes and uploads ~300 episodes on 17 sites that were transcribed but never indexed (see #171). celebritymemoirbookclub and iwltrubbish need a client redeploy for #170.

Leave for later: **10 §1** (automation Terraform), done as part of M4b; **10 §2** (Node 24), when draft [#156](https://github.com/jackkoppa/browse-dot-show/pull/156) is rebased onto `main`; **10 §3** (launchd signal testing), part of M5.

### 2. M4b: deploy code changes from GitHub Actions ([08](./08-github-actions-deploys.md))

Goal: when a PR merges to `main`, Actions deploys **only what changed** (a site's frontend/config, the lambdas, or the homepage), using AWS credentials stored in the repo. Deploying locally must stay just as easy. **Never** run transcription or ingestion in Actions; that stays on the Mac (whisper.cpp).

**The plan is in [08](./08-github-actions-deploys.md)** (decisions, survey of today's deploy scripts, design, PR sequence). Decided: automatic deploys on merge; **GitHub OIDC → a deploy role per AWS account** (there are **3** accounts: homepage/automation, and 2 for sites); Terraform plans are **computed on the PR, posted as a comment, approved, then applied on merge**; `.site-account-mappings.json` gets committed. Fix **10 §1** as part of it.

### 3. M5: unattended scheduled ingestion on a Mac ([03](./03-mac-automation.md))

A LaunchDaemon plus a `pmset` wake schedule run `bds ingest --all-sites` with nobody logged in. The command names `bds schedule` and `bds setup machine` are reserved (`scripts/cli/commands/coming-soon.ts`). 03 starts with session-1 notes: PATH under launchd, signals, logs, Full Disk Access for the external SSD, FileVault options to present, and the whisper.cpp layout.

## Working with the developer

These preferences came up during session 1; please keep them:

- **Ask questions as interactive prompts** (multiple choice with a recommendation), batched, not as a long list in chat.
- **AWS:** anything that touches AWS needs a go-ahead (see `AGENTS.md`). The developer often prefers to **run AWS commands themselves**: give the exact command, the expected output, and what to watch for.
- **Never break the deployed sites.** Read [05](./05-deployed-sites-invariants.md) before touching AWS names, the S3 layout, Terraform or lambda packaging. Run the smoke-test checklist [07](./07-smoke-test-checklist.md) before finishing.
- **Live runs:** if a transcription or ingestion run is going in the main checkout, work in a separate git worktree (symlink the gitignored config in) so you don't change files under it.
- **Don't touch local files layout** (`localFilesPath`, on an external SSD, hundreds of GB) without asking.
- **Branches and PRs:** one PR per milestone; stacked local branches are fine. The developer reviews before pushing, and has used rebase merges (so a stacked PR needs rebasing onto `main` after each merge; merge commits avoid that).
- Machine-level changes (`sudo`, `pmset`, `/Library/LaunchDaemons`) are run by or with the developer.

## Key facts

- Node 22 via nvm on the dev machine (`~/.nvm/versions/node/v22.14.0`); pnpm via Corepack. Hermit is gone.
- Dev machine: Apple M4 Pro, 64 GB. Benchmark: 3 parallel whisper workers ≈ 47.6 audio-min per minute (large-v3-turbo). `transcriptionWorkers: 3` is set in `.local-files-config.json`; the code default is also 3.
- 23 sites in 2 site AWS accounts, plus account 0 for the homepage and the automation user. Automation credentials are file-based (`.env.automation`, `chmod 600`) and assume `browse-dot-show-automation-role` in each account; `bds doctor --aws` checks this.
- Run history: `scripts/automation-logs/ingestion-pipeline-runs.md`. Worker logs: `scripts/automation-logs/transcription/<timestamp>/`.
