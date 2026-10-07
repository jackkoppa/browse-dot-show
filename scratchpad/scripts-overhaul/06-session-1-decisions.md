# 06: Session 1 Decisions (2026-10-06)

Answers from the developer before starting session 1.

| Topic | Decision |
| --- | --- |
| CLI name | `bds` (`pnpm bds …`) |
| Menu tree | 02 as written. "Automation" and "Set up this machine" are stubs that say "coming in session 2". |
| `--windows` (Terminal.app view) | Drop. Single-terminal progress on a TTY, plain log lines when headless. |
| Hermit | Drop in session 1: `.nvmrc` + `engines` set to Node 22, pnpm through Corepack, docs updated. |
| `site-setup-directories.ts` | Delete outright (and the `site:setup-directories` command). |
| `deploy/manage-tfstate.ts` | Delete. |
| `build-lambda-for-site.ts` | Delete, **after confirming** that the deploy path already covers building a lambda with a site's env. |
| `worktree.ts` | Keep, as `bds worktree`. |
| `scratchpad/homepage-2025-08-04/` | Delete. |
| Pipeline `--local-run-only` TODO | Drop; `--skip=<phase>` covers it. |
| Delivery | Stacked **local** branches, one per milestone. Don't push; the developer reviews tonight, adjusts commit timestamps and pushes. |
| Benchmark for default `--parallel=N` | Approved: this machine (M4 Pro, 64 GB), copies of real mp3s in a temp folder, nothing written to the local-files folder. |
| Smoke-test site (real pipeline run) | `haveaword`. Low traffic, but has real usage, so any breakage must be fixed within a few hours. Still ask for a go-ahead before touching AWS. |
| Old LaunchAgents | Write the `launchctl bootout` + `sudo rm` commands for all three (`daily-pipeline`, `ingestion-automation`, `power-management`) into the M1 notes; the developer runs them. |

## Observations for session 2

- Node and pnpm currently come from nvm (`~/.nvm/versions/node/v22.14.0`), not Hermit.
- `localFilesPath` is on an external volume (`/Volumes/4TB_SSD_…`). Background jobs need Full Disk Access to read removable volumes (03 §9).
- Three root-owned plists in `~/Library/LaunchAgents/`; `power-management` was still firing (and failing) as of 2026-10-05.
