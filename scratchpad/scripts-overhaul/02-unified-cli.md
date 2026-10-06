# 02: Unified CLI

## Goal

One entry point. Running it with no arguments shows a menu of what the user wants to achieve. Every menu action is also a non-interactive subcommand with flags, so scheduled runs and agents never need prompts.

```bash
pnpm bds                          # interactive menu
pnpm bds ingest --all-sites       # same action, non-interactive
```

The name `bds` is a placeholder; confirm it with the developer.

## Proposed menu tree (get developer sign-off before building)

```
What do you want to do?
├── Run ingestion pipeline
│     → choose sites (All / pick), phases (all / custom), parallelism (N workers, optional terminal windows)
│     ≙ bds ingest [--sites=a,b | --all-sites] [--parallel=N] [--windows] [--skip=<phase>,...] [--dry-run]
├── Automation (scheduled runs on this Mac)
│   ├── Set up / change schedule   ≙ bds schedule install --at=03:00 [--days=...]
│   ├── Status & recent runs       ≙ bds schedule status   (next run, last N results, log paths, wake schedule)
│   ├── Run the scheduled job now  ≙ bds schedule run-now  (same code path as the scheduler)
│   └── Remove schedule            ≙ bds schedule uninstall
├── Set up this machine            ≙ bds setup machine      (deps, whisper.cpp + model, local-files dir, credentials check)
├── Sites
│   ├── Create a new site          ≙ bds site create
│   ├── Deploy a site              ≙ bds site deploy --site=x
│   ├── Upload client(s)           ≙ bds site upload-client [--site=x | --all-sites]
│   └── Destroy a site             ≙ bds site destroy --site=x   (typed confirmation)
├── Run a single lambda            ≙ bds lambda run --lambda=rss|transcribe|index --site=x [--env=local|prod]
├── Develop
│   ├── Client dev server          ≙ bds dev client --site=x
│   └── Search lambda health check ≙ bds dev search-health --site=x
├── Validate                       ≙ bds validate [local|prod|consistency] --site=x
├── Homepage / automation infra    ≙ bds infra homepage|automation [deploy|bootstrap-state]
└── Doctor                         ≙ bds doctor   (tools, env files, AWS access to every site, disk space)
```

## Implementation notes

- **Layout suggestion:** `scripts/cli/index.ts` (router + menu), `scripts/cli/commands/*.ts` (one file per subcommand, each exporting `{ name, description, flags, run(args) }`), `scripts/lib/*` (shared modules from 01 §7 / M2). The menu is generated from the command registry, so the two never drift apart.
- **Argument parsing:** `node:util` `parseArgs`. A missing required flag falls back to a prompt only when stdin is a TTY; otherwise it errors. This one rule makes every command safe to run from the scheduler.
- **Prompts:** keep `prompts` (already a dependency) unless there's a strong reason to switch.
- **Site selection:** one helper, `resolveSites({ sites, allSites, interactive })`. It replaces `run-with-site-selection.ts`, the `DEFAULT_SITE_ID` / `SKIP_SITE_SELECTION_PROMPT` env vars, and each script's own prompt.
- **Env loading:** one helper that loads `.env.local`, plus a site's `.env.aws-sso` (for interactive prod actions), or `.env.automation` (for scheduled runs). Name these explicitly at each call site.
- **`package.json`:** reduce the root scripts to roughly `bds`, maybe `ingest`, `dev`, and the workspace-level `all:*` / `prepare`. Lambda packages keep `__prepare-for-aws` (⚠️ see 05).
- **Output:** a short summary at the end of every command. Errors give a non-zero exit code; the scheduler relies on this.
- **Tests:** vitest is already set up in `scripts/`. Add tests for the arg/prompt resolution and for any pure planning logic (e.g. distributing files across workers).
