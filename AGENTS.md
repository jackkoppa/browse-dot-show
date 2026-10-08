# Agent Instructions

## Tools

Node.js 22 (see `.nvmrc`) and pnpm 10 (via Corepack: `corepack enable`). No other tool manager is needed. Run `pnpm install && pnpm all:build` once after cloning.

## The `bds` CLI

All developer tasks go through `pnpm bds` (`scripts/cli/`). `pnpm bds help` lists commands; `pnpm bds <command> --help` shows flags. Always pass flags (e.g. `--site=<id>`, `--sites=a,b`, `--all-sites`) so commands don't prompt. Without a TTY, a missing required flag exits with code 2.

Useful, safe commands:

- `pnpm bds doctor`: check tools and config (no AWS calls unless `--aws`)
- `pnpm bds ingest --sites=<id> --dry-run`: preview the pipeline (no downloads, uploads or AWS calls)
- `pnpm bds validate sites`: validate site configs

Anything that touches AWS (`bds ingest` without `--dry-run`, `site deploy`, `site upload-client`, `site destroy`, `infra ...`, `lambda run --env=prod`, `doctor --aws`) needs the developer's go-ahead.

## Checks

- `pnpm --filter @browse-dot-show/scripts typecheck` (also runs on commit for `scripts/**/*.ts`)
- `pnpm --filter @browse-dot-show/process-audio-lambda typecheck` (also runs on commit for that package)
- `pnpm all:typecheck`: every TypeScript project (after `pnpm all:build`); required on PRs (the `checks` workflow)
- `pnpm all:test`, `pnpm all:lint`

## Current work

Developer-tooling work in progress is tracked in `scratchpad/scripts-overhaul/`. Start with [HANDOFF.md](scratchpad/scripts-overhaul/HANDOFF.md): what's done, what's next, and how to work with the developer.

## Guides

- [Local Development Guide](docs/local-development.md): setup, config files, CLI reference, ingestion, worktrees, scripts layout
- [Deployment Guide](docs/deployment-guide.md)
