# Agent Instructions

## Tools

Node.js 24 (see `.nvmrc`) and pnpm 10 (via Corepack: `corepack enable`). No other tool manager is needed. Run `pnpm install && pnpm all:build` once after cloning.

## The `bds` CLI

All developer tasks go through `pnpm bds` (`scripts/cli/`). `pnpm bds help` lists commands; `pnpm bds <command> --help` shows flags. Always pass flags (e.g. `--site=<id>`, `--sites=a,b`, `--all-sites`) so commands don't prompt. Without a TTY, a missing required flag exits with code 2.

Useful, safe commands:

- `pnpm bds doctor`: check tools and config (no AWS calls unless `--aws`)
- `pnpm bds ingest --sites=<id> --dry-run`: preview the pipeline (no downloads, uploads or AWS calls)
- `pnpm bds validate sites`: validate site configs
- `pnpm bds schedule status`: scheduled runs on this Mac (read-only)
- `pnpm bds schedule run-now --dry-run --no-update`: a scheduled run end to end, without AWS calls

Anything that touches AWS (`bds ingest` without `--dry-run`, `schedule run`/`run-now` without `--dry-run`, `site deploy`, `site upload-client`, `site destroy`, `infra ...`, `lambda run --env=prod`, `doctor --aws`) needs the developer's go-ahead. So do machine-level changes: `bds schedule install`/`uninstall` (sudo: LaunchDaemon, `pmset`).

## Checks

- `pnpm --filter @browse-dot-show/scripts typecheck` (also runs on commit for `scripts/**/*.ts`)
- `pnpm --filter @browse-dot-show/process-audio-lambda typecheck` (also runs on commit for that package)
- `pnpm all:typecheck`: every TypeScript project (after `pnpm all:build`); required on PRs (the `checks` workflow)
- `pnpm all:test`: every package's tests (after `pnpm all:build`); also on PRs (the `checks` workflow's `test` job)
- `pnpm all:lint`
- `terraform fmt -check -recursive terraform/`: Terraform formatting; also on PRs (the `checks` workflow's `terraform-fmt` job). Locally it also checks the gitignored `terraform/automation/terraform.tfvars`, which CI doesn't have.

## Current work

Work in progress has notes in `scratchpad/` (see its README); the backlog is in [GitHub issues](https://github.com/jackkoppa/browse-dot-show/issues).

Ingestion runs nightly on a dedicated runner Mac mini ([Scheduled ingestion](docs/scheduled-ingestion.md)), which has the SSD with the local files. On any other Mac, don't run a real `bds ingest` without asking: it would upload from a different copy of the local files.

## Working with the developer

- Ask questions as interactive multiple-choice prompts (with a recommendation), batched, not as a long list in chat.
- The developer often prefers to run AWS commands themselves: give the exact command, the expected output and what to watch for.
- Never break the deployed sites: read [the invariants](docs/deployed-sites-invariants.md) and run the smoke tests before finishing.
- Review every Terraform plan comment before telling the developer to approve. Unexpected creates, replaces or destroys usually mean drift: find out why first, and present it as a decision.
- If an ingestion run is going in the main checkout, work in a separate worktree (`bds worktree create`, then `bds worktree link-config`).
- Don't touch the local files (`localFilesPath`: an external SSD, hundreds of GB) without asking. Machine-level changes (`sudo`, `pmset`, `bds schedule install/uninstall`) are run by or with the developer.
- One PR per change; the developer merges. The repo is public: PR comments, Actions logs and artifacts are public.
- History: the planning notes for the October 2026 scripts overhaul (the `bds` CLI, GitHub Actions deploys, scheduled ingestion) are in git history at [`scratchpad/scripts-overhaul/`](https://github.com/jackkoppa/browse-dot-show/tree/d500ff0/scratchpad/scripts-overhaul); the PRs (#162–#222) have the context for each change.

## Deploys

Merged PRs deploy from GitHub Actions. A PR that changes Terraform (including any lambda code) gets a plan comment and needs the developer's approval in the `terraform-approval` environment before it can merge; review the comment for unexpected creates, replaces or destroys. Branch protection requires up-to-date branches (rebase merges). See [GitHub Actions deploys](docs/github-actions-deploys.md).

## Guides

- [Local Development Guide](docs/local-development.md): setup, config files, CLI reference, ingestion, worktrees, scripts layout
- [Scheduled ingestion on a Mac](docs/scheduled-ingestion.md): runner Mac setup, `bds schedule`, troubleshooting
- [Deployment Guide](docs/deployment-guide.md)
- [GitHub Actions deploys](docs/github-actions-deploys.md)
- [Deployed-sites invariants and smoke tests](docs/deployed-sites-invariants.md): read before touching AWS names, the S3 layout, Terraform or lambda packaging
