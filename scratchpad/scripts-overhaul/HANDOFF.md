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

### 1. Small follow-ups ([10](./10-follow-ups.md))

Suggested order. Each is small and can be its own PR:

1. **`bds validate sites` errors (10 §7).** All 23 `site.config.json` files are missing `appHeader.includeAIUseDisclosure` (34 errors, already failing before the overhaul). Decide with the developer: add the field (what value per site?) or make it optional in `sites/validate.ts`.
2. **Indexing after out-of-band transcription (10 §4).** Phase 4 should index any site whose transcripts are newer than its search index, not only sites with new files from *this* run. On 2026-10-06 haveaword had 11 transcribed-but-unindexed episodes until `--force-local-indexing` was used.
3. **Worktree config files (10 §8).** `bds worktree create` should symlink the gitignored config files (`.env.*`, `.site-account-mappings.json`, `.local-files-config.json`, `.deployed-sites.json`, each site's `.env.aws-sso`) into the new worktree.
4. **Pre-existing type error (10 §9)** in `packages/ingestion/process-audio-lambda/utils/ffmpeg-utils.ts:357`; consider adding a typecheck for that package.
5. **search-entries re-upload (10 §6)** and **lockfile robustness (10 §5)**: optional; bigger.

Leave for later: **10 §1** (automation Terraform), done as part of M4b; **10 §2** (Node 24), when draft [#156](https://github.com/jackkoppa/browse-dot-show/pull/156) is rebased onto `main`; **10 §3** (launchd signal testing), part of M5.

### 2. M4b: deploy code changes from GitHub Actions ([08](./08-github-actions-deploys.md))

Goal: when a PR merges to `main`, Actions deploys **only what changed** (a site's frontend/config, the lambdas, or the homepage), using AWS credentials stored in the repo. Deploying locally must stay just as easy. **Never** run transcription or ingestion in Actions; that stays on the Mac (whisper.cpp).

Decided:
- **Trigger: automatic on merge to `main`** (plus `workflow_dispatch` for manual runs).

Open, for the agent to propose and the developer to approve:
- **Credentials:** GitHub OIDC → an IAM deploy role per AWS account (likely), vs access keys in repo secrets. The 23 sites live in **2 AWS accounts** (`.site-account-mappings.json`); the homepage and the automation stack deploy with their own AWS profiles (see `scripts/deploy/deploy-homepage.ts` and `deploy-automation.ts`).
- How to detect what changed in a merge, and how CI gets today's gitignored inputs (`.site-account-mappings.json`, `.env.lambda-prod-build`, sites' `.env.aws-sso` profiles).
- Fix **10 §1** first or alongside: `bds infra automation deploy` currently fails at `terraform plan` because the gitignored `terraform/automation/terraform.tfvars` maps only 6 sites. Simplest fix: build the assume-role policy from the 2 account IDs.

Starting points in 08: what the deploy scripts assume today (SSO profiles, gitignored config, a hardcoded admin profile in the automation scripts, `tsx` on PATH).

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
- 23 sites, 2 site AWS accounts. Automation credentials are file-based (`.env.automation`, `chmod 600`) and assume `browse-dot-show-automation-role` in each account; `bds doctor --aws` checks this.
- Run history: `scripts/automation-logs/ingestion-pipeline-runs.md`. Worker logs: `scripts/automation-logs/transcription/<timestamp>/`.
