# Handoff: developer tooling (updated 2026-10-08, M5 merged)

**Start here** if you're picking up browse-dot-show developer-tooling work.

> **On the 16 GB runner Mac mini?** Its setup and test results are in **[M5-RUNNER-SESSION.md](./M5-RUNNER-SESSION.md)**.

**In progress: M5, unattended ingestion on a Mac: [M5-mac-automation.md](./M5-mac-automation.md).** Merged; it runs nightly on the runner and is being watched for a few days ([checklist](./M5-mac-automation.md#watching-the-runner-before-calling-m5-done)) before it's called done and `v1.0.0` is tagged.

## On the dev Mac after M5 (read this first there)

The 2026-10-08 session ran on the runner, so the dev Mac (M4 Pro, 64 GB) didn't see these changes happen:

- **The SSD (local files) moved to the runner.** On the dev Mac, `bds doctor` reports local files missing; that's expected (after #204; before it, scripts silently fell back to the repo's `aws-local-dev`, which on the dev Mac still holds a 61 GB copy of 2 sites from Dec 2025). The developer wants only the SSD long-term: removing the `aws-local-dev` fallback from `packages/config` (bundled into the lambdas, so it plans all 23 sites) and that folder is a follow-up.
- **The runner owns ingestion now.** Don't run a real `bds ingest` on the dev Mac without asking: the run lock lives on the SSD, so nothing stops two Macs ingesting at once (both would transcribe and upload the same new episodes), and with the SSD gone a real run exits (#204) rather than using another folder (pointed at another folder, the pre-sync downloads every site's files from S3 into it). `--dry-run` is fine. To test the pipeline or `bds dev client --site=<id>` there, ask the developer first; the usual way is a small local-files folder with one site (`bds ingest --sites=<id>` with `.local-files-config.json` pointing at it), or running on the runner.
- **The old "run on login" automation is gone from the dev Mac** (checked 2026-10-08: no LaunchAgent/LaunchDaemon, crontab entry or `pmset` wake schedule).
- **Don't install `bds schedule` on the dev Mac.** One runner is the design; `bds schedule status` there should say it isn't installed.
- **Messages from the runner:** Slack posts on every run (a bullet list; sites with new episodes link to their site), and healthchecks.io alerts when a run fails or doesn't happen. The webhook and ping URLs are only in the runner's `.env.automation`. The dev Mac's `.env.automation` doesn't need them.
- **Logs** for scheduled runs are on the runner (`~/Library/Logs/browse-dot-show/scheduled/`). Ask the developer to paste them, or SSH to the runner if Remote Login is set up.
- **Runner facts:** repo at `~/Personal_Development/browse-dot-show`, runner checkout `~/Personal_Development/browse-dot-show-runner`, `transcriptionWorkers: 2`, FileVault off, Full Disk Access for the Cellar node binary (`node@22` is pinned in Homebrew), Wi-Fi joined (its Ethernet goes through a hub that's sometimes unplugged).

## What's done

| Milestone | PRs | Result |
| --- | --- | --- |
| Session 1: scripts cleanup (M0–M4, M6) | #162–#168 | The `pnpm bds` CLI (`scripts/cli/`), shared modules (`scripts/lib/`), parallel transcription (`bds ingest --parallel=N`), docs rewrite, Hermit removed |
| Follow-ups | #170–#175, #183–#185 | `validate sites` passes; index sites whose transcripts are newer than their index; worktrees get config symlinked (`bds worktree link-config`); process-audio typecheck; unchanged search-entries not re-uploaded; atomic per-file transcription locks; lockfiles never synced; NFC file names; RSS User-Agent (Buzzsprout 403s) |
| M4b: deploys from GitHub Actions | #176–#181, #187–#192 | Plans on PRs (one job per AWS account), approval for every plan with changes, apply + client uploads on merge. Verified end to end on 2026-10-08 |
| M5: scheduled ingestion (merged; watching the runner) | #195–#200 | `bds schedule`, `bds setup machine/benchmark`, run lock, logs in `~/Library/Logs`, [docs/scheduled-ingestion.md](../../docs/scheduled-ingestion.md). Status, test runbook and open questions: [M5-mac-automation.md](./M5-mac-automation.md) |

How things work now:

- Day-to-day commands: [docs/local-development.md](../../docs/local-development.md) and [AGENTS.md](../../AGENTS.md).
- Deploys from GitHub Actions (how they work, setup, troubleshooting): [docs/github-actions-deploys.md](../../docs/github-actions-deploys.md).
- What must not break, and the smoke tests to run: [docs/deployed-sites-invariants.md](../../docs/deployed-sites-invariants.md).
- Changes since `v0.0.1`: [CHANGELOG.md](../../CHANGELOG.md).

## What's next

1. **M5: unattended ingestion on a Mac** ([M5-mac-automation.md](./M5-mac-automation.md)). Built as a PR stack and tested on the 16 GB runner (2026-10-08): a real scheduled run succeeded there, logged out. The runner session's report, fixes and decisions are in [M5-RUNNER-SESSION.md, section 8](./M5-RUNNER-SESSION.md#8-runner-test-results). Merged the same day; the runner follows `main` at 03:00. Next: [watch the runner](./M5-mac-automation.md#watching-the-runner-before-calling-m5-done) for a few nights, test a failure and SIGTERM while transcribing, then call M5 done.
2. **Alongside M5: typecheck client and homepage: done in #201 (open)**, independent of the M5 stack. Its lockfile change plans all 23 sites (no changes expected) and re-uploads every client on merge. The notes below are what it addressed. #194 added the required `typecheck` check (`pnpm all:typecheck`, `scripts/ci/typecheck.ts`), covering 16 projects but not these two:
   - Their `tsconfig.json` uses project references (`files: []`), so `tsc -p tsconfig.json` checks nothing; check `tsconfig.app.json` and `tsconfig.node.json` instead.
   - `tsconfig.app.json` fails with ~62 errors (client and homepage alike), all in `packages/ui` components (`TS7016`/`TS7026`: no types for `react`). `packages/ui` is imported from source and doesn't depend on `@types/react`. Fix: add `@types/react` (matching the client's version) to `packages/ui` devDependencies.
   - `packages/client/tsconfig.node.json`: 1 real error in `vite.config.ts` (~line 311, an env object with `string | undefined` assigned to `Record<string, string>`).
   - The `@types/react` change edits `pnpm-lock.yaml`, which `ci affected` treats as "deploy everything": the merge plans every site (no changes expected, so no approval) and re-uploads every client and the homepage. Harmless, but expect a long deploy run.
   - Then add both configs to `TYPECHECK_PROJECTS`. Don't add `typecheck` scripts to lambda packages: their `package.json` scripts and devDependencies are copied into `aws-dist`, changing every lambda zip.
3. **Tag `v1.0.0`** once the runner checklist is done: move the changelog's "Unreleased" section under it.
4. **Follow-ups from the runner session** (ask before starting):
   - **Slack thread replies** (the developer would like one listing the updated sites): incoming webhooks can't thread, so this needs a Slack app with a bot token and `chat.postMessage` (the reply uses the first message's `ts`). For now the site links are in the main message.
   - The dry-run summary marks every phase ❌ although nothing failed (cosmetic).
   - Tailscale is installed on the runner (unused); uninstall it if it ever gets in the way.
5. Smaller items, any time (ask before starting):
   - **Node 24:** draft #156 moves the lambdas to Node 24. When rebasing it, bump `.nvmrc`, `engines.node` and the docs (`docs/local-development.md`, `AGENTS.md`, `CHANGELOG.md`).
   - **Tighten `browse-dot-show-gha-deploy`** from `AdministratorAccess` once deploys have a track record (`terraform/github-actions/modules/github-oidc`).
   - **Search with very common words** (`the`): 10–28 s on the big sites (200k–330k hits), and a cold start plus one can hit API Gateway's 30 s limit (a 503). Normal queries take < 0.5 s. Pre-existing; a search-lambda change (e.g. cap or skip stop-word matches).
   - **Libero's extra domain:** `libero.jackkoppa.com` was removed by the #188 deploy (approved). The unmerged WIP branch `jackkoppa/libero-domain-updates` adds extra aliases; re-adding it goes through a normal PR + plan approval.
   - `terraform fmt -check` already fails on `terraform/sites/main.tf` (pre-existing formatting).

## Working with the developer

- **Ask questions as interactive prompts** (multiple choice with a recommendation), batched, not as a long list in chat.
- **AWS:** anything that touches AWS needs a go-ahead (see `AGENTS.md`). The developer often prefers to **run AWS commands themselves**: give the exact command, the expected output and what to watch for. Read-only checks (listing, `iam simulate-principal-policy`, CloudWatch metrics) with their SSO session have been fine.
- **Never break the deployed sites** ([invariants](../../docs/deployed-sites-invariants.md)). Run the smoke tests before finishing.
- **Terraform plans:** review every PR plan comment before telling the developer to approve. Unexpected creates/replaces/destroys usually mean drift (a site last deployed from another branch, or before a default changed): find out why first, and present it as a decision.
- **Live runs:** if an ingestion run is going in the main checkout, work in a separate git worktree (`bds worktree create`, then `bds worktree link-config`).
- **Don't touch the local files** (`localFilesPath`, external SSD, hundreds of GB) without asking. Machine-level changes (`sudo`, `pmset`, `/Library/LaunchDaemons`, `bds schedule install/uninstall`) are run by or with the developer. To test scheduling without sudo, point `BDS_LOGS_DIR` / `BDS_APP_SUPPORT_DIR` at a scratch folder and use `bds schedule install --print-only --runner-dir=<scratch>`.
- **Branches and PRs:** one PR per change. `main` uses **rebase merges** and branch protection requires **up-to-date branches**, so stacked PRs need rebasing onto `main` after each merge (`git rebase --update-refs origin/main`). Don't check stacked branches out in the developer's main folder; use a worktree.
- The repo is **public**: PR comments, Actions logs and artifacts are public.

## Key facts

- Node 22 (`.nvmrc`; nvm on the dev machine), pnpm via Corepack. Dev machine: Apple M4 Pro, 64 GB. Runner: Mac mini M4, 16 GB (Homebrew `node@22`; its shell has fnm).
- 23 sites in 2 site AWS accounts (`152849157974`: 11, `927984855345`: 12); account `297202224084` has the homepage, the automation IAM user and shared Terraform state. SSO profiles: `browse.show-<0|1|2>_admin-permissions-<account>`.
- `.site-account-mappings.json` is committed; `bds site deploy` updates it.
- GitHub Actions: workflows are on (`GHA_DEPLOYS_ENABLED=true`); `terraform-approval` environment (developer as reviewer); `main` requires `terraform-plan-result` and (after #194) `typecheck`.
- Logs (since M5): `~/Library/Logs/browse-dot-show/`: `ingestion-runs.md` (run history), `transcription/<timestamp>/` (worker logs), `scheduled/` (scheduled runs), `launchd.log`. Older history: `scripts/automation-logs/` in the main checkout.

## History: removed planning docs

The planning docs for the work above were removed once it was done; their content is either in the code and `docs/` now, or no longer needed. To read why something was decided, see them at [`4712e82acf`](https://github.com/jackkoppa/browse-dot-show/tree/4712e82acf/scratchpad/scripts-overhaul) (or `git show 4712e82acf:scratchpad/scripts-overhaul/<file>`):

| File | What it was |
| --- | --- |
| `README.md` | The original brief: goals, milestones M0–M6, timeline |
| `01-scripts-inventory.md` | Every script before the cleanup: keep / merge / delete |
| `02-unified-cli.md` | The `bds` menu tree design |
| `03-mac-automation.md` | M5 design (now [M5-mac-automation.md](./M5-mac-automation.md), updated) |
| `04-parallel-transcription.md` | Design for `bds ingest --parallel=N` |
| `05-deployed-sites-invariants.md`, `07-smoke-test-checklist.md` | Now [docs/deployed-sites-invariants.md](../../docs/deployed-sites-invariants.md) |
| `06-session-1-decisions.md` | Session 1 decisions, test results, the whisper benchmark (summarized in the M5 doc) |
| `08-github-actions-deploys.md` | M4b decisions and design (now [docs/github-actions-deploys.md](../../docs/github-actions-deploys.md)) |
| `09-tonight-runbook.md` | Session 1's evening test runbook (done) |
| `10-follow-ups.md` | Follow-ups from session 1 (all done or listed above) |

The PRs listed above have the full context for each change.
