# Agent Instructions

## Tools

Node.js 22 (see `.nvmrc`) and pnpm 10 (via Corepack: `corepack enable`). No other tool manager is needed. Run `pnpm install && pnpm all:build` once after cloning.

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
- `pnpm all:test`, `pnpm all:lint`

## Current work

Developer-tooling work in progress is tracked in `scratchpad/scripts-overhaul/`. Start with [HANDOFF.md](scratchpad/scripts-overhaul/HANDOFF.md): what's done, what's next (M5: unattended ingestion on a Mac), and how to work with the developer.

## Deploys

Merged PRs deploy from GitHub Actions. A PR that changes Terraform (including any lambda code) gets a plan comment and needs the developer's approval in the `terraform-approval` environment before it can merge; review the comment for unexpected creates, replaces or destroys. Branch protection requires up-to-date branches (rebase merges). See [GitHub Actions deploys](docs/github-actions-deploys.md).

## Guides

- [Local Development Guide](docs/local-development.md): setup, config files, CLI reference, ingestion, worktrees, scripts layout
- [Scheduled ingestion on a Mac](docs/scheduled-ingestion.md): runner Mac setup, `bds schedule`, troubleshooting
- [Deployment Guide](docs/deployment-guide.md)
- [GitHub Actions deploys](docs/github-actions-deploys.md)
- [Deployed-sites invariants and smoke tests](docs/deployed-sites-invariants.md): read before touching AWS names, the S3 layout, Terraform or lambda packaging
