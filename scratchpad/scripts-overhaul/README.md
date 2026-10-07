# Scripts Overhaul: Agent Hand-off

This is a brief for an agent (or a series of agent sessions) to clean up this repo's developer tooling and make unattended ingestion on a Mac painless. The developer (Jack) wrote the goals below; the supporting docs in this folder add detail gathered from the codebase in October 2026.

## Context in one paragraph

browse.show hosts ~23 podcast search sites (e.g. `listenfairplay.com`, `hardfork.browse.show`, `iwantlistenthisrubbish.com`). Each site is deployed to its own AWS account: S3 + CloudFront for the client, plus Lambdas for search and ingestion. In practice, ingestion runs **locally on a Mac**. The pipeline (`scripts/run-ingestion-pipeline.ts`) downloads new episodes from RSS, transcribes them with local whisper.cpp, builds search indexes, syncs everything to each site's S3 bucket, and invalidates CloudFront. Today it is only ever run manually. The `scripts/` directory grew haphazardly and has many redundant or dead scripts.

## Goals

1. **Big cleanup of `scripts/`.** Delete dead scripts, merge overlapping ones, make naming and layout consistent. See [01-scripts-inventory.md](./01-scripts-inventory.md).
2. **One CLI entry point.** The user runs one command and gets prompted for what they want: set up a new site, run the ingestion pipeline manually, set up scheduling, review scheduling or past runs, deploy, and so on. Every action should also be runnable non-interactively, for automation. See [02-unified-cli.md](./02-unified-cli.md).
3. **Painless unattended automation on a Mac.** A few documented commands set up a machine (Apple silicon only; M1+ is fine, and assuming M4 is fine if it simplifies anything). The machine then runs the full pipeline for all sites on a schedule, **without a user logged in**. See [03-mac-automation.md](./03-mac-automation.md).
4. **All-sites parallel transcription inside the pipeline.** Make the multi-terminal "all sites" approach part of the pipeline. Multiple terminal windows have been nice for watching progress, but plain worker processes are fine, and are required for unattended runs. See [04-parallel-transcription.md](./04-parallel-transcription.md).

## Hard constraint: deployed sites must keep working

Developer ergonomics have **no** backwards-compatibility requirement. Any script, `package.json` command, env file name or doc can be renamed, merged or deleted. The one thing that must not break is the **deployed sites** and the ability to keep updating them. Read [05-deployed-sites-invariants.md](./05-deployed-sites-invariants.md) before deleting or moving anything that touches AWS, Terraform, Lambda packaging or the S3 layout.

## Working with the developer

- **Ask before deleting anything marked "Ask"** in the inventory. Batch your questions into one list per milestone rather than asking one at a time.
- **Propose the CLI menu tree** (from 02) and get a 👍 before building it.
- Anything that touches a real AWS account (deploys, S3 sync, Lambda invocations) needs the developer's go-ahead to run. Use `--dry-run` flags where they exist.
- Machine-level changes (`sudo`, `pmset`, `/Library/LaunchDaemons`, FileVault) must be run by or with the developer. Write the commands; don't run them silently.
- Hermit (`bin/activate-hermit`) has caused problems for some scripts. Scripts run fine with plain Node 22 + pnpm on PATH. Deciding whether to keep Hermit is part of this work (see 03).

## Timeline: two separate agent sessions

| Session | Target date | Scope |
| --- | --- | --- |
| **1. Scripts cleanup** | **2026-10-06** | M0–M4 and M6 below: clean up **all** existing scripts, build the unified CLI, add parallel transcription to the pipeline, update docs. This includes *deleting* the old, non-working Mac scheduling code. |
| **2. Mac scheduling** | **2026-10-12** | M5: unattended scheduled runs on a Mac ([03](./03-mac-automation.md)). It needs more work and real-machine testing (logging out, sleep/wake, reboots), so it's a separate follow-up session. |

Session 1 should **work towards** session 2 without building it. Every pipeline action must run non-interactively with a correct exit code, the CLI should leave room for a `schedule` command group, the pipeline should run headless with `--parallel=N`, and config and credentials loading should not depend on a logged-in shell (no reliance on Hermit/nvm shims or AWS SSO). Leave a note in [03](./03-mac-automation.md) of anything learned that session 2 should know. If M4 doesn't fit in session 1, it moves to session 2, since unattended runs need it.

## Suggested milestones (one PR each)

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | **Baseline.** Make `tsc --noEmit -p scripts/tsconfig.json` pass; write down a manual smoke-test checklist (from 05). | Typecheck green; checklist exists |
| M1 | **Delete dead code.** Remove scripts marked Delete; ask about Ask items; remove all old Mac scheduling code (see 03 → "Remove"). | Inventory items resolved; nothing in 05 affected |
| M2 | **Consolidate shared libs.** One module each for sites, env loading, arg parsing, running a lambda locally, S3 sync. | Duplicates in 01 §2 gone |
| M3 | **Unified CLI.** Single entry point plus subcommands; `package.json` scripts reduced to a handful. | Menu tree from 02 implemented; docs updated |
| M4 | **Parallel transcription in the pipeline.** `--parallel=N` across all sites; optional terminal-window view. | Pipeline transcribes all sites in parallel, headless |
| M5 | **Mac automation** *(session 2, 2026-10-12)*. `setup machine`, `schedule install / status / uninstall`, run logs, notifications on failure. | Fresh Mac → scheduled unattended runs with a few commands |
| M6 | **Docs.** Rewrite `docs/local-development.md`, the deployment guide's "Ongoing Updates" section, `AGENTS.md`; delete stale docs. | Docs match reality |

M1 can start immediately. M5 is out of scope for session 1.

### Progress

Decisions: [06](./06-session-1-decisions.md). Checklist: [07](./07-smoke-test-checklist.md). Each milestone is a stacked **local** branch `jackkoppa/scripts-overhaul-mN-*`, worked on in the worktree `~/Workrees_Personal_Development/browse-dot-show--worktrees/scripts-overhaul`.

- [x] M0: Baseline (`jackkoppa/scripts-overhaul-m0-baseline`)
- [x] M1: Delete dead code (`jackkoppa/scripts-overhaul-m1-delete-dead-code`)
- [ ] M2: Consolidate shared libs
- [ ] M3: Unified CLI
- [ ] M4: Parallel transcription
- [ ] M6: Docs

## Related state (as of writing)

- Branch `jackkoppa/multi-terminal-all-sites` adds an "All sites" option to `run-local-transcriptions-multi-terminal.ts`, balancing files by duration across terminals. Check whether it has merged; M4 builds on it.
- Beads issue tracking was removed from the repo. Track progress for this work in this folder, e.g. by checking off the milestones above.
