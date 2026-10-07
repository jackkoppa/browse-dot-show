# 08: Deployments from GitHub Actions (placeholder)

> **Status:** placeholder, added 2026-10-06 during session 1. Not designed or scheduled yet.
> **Order:** do this **before** M5 (Mac automation / scheduled ingestion).

## Goal

Deploy **code changes** automatically from GitHub Actions when PRs merge, using AWS credentials stored in the repo's secrets. The same scripts must keep working equally easily from a local machine.

**In scope:** code deploys only:
- site frontends (client build + upload to S3 + CloudFront invalidation)
- lambdas (search lambda, ingestion lambda packages) via Terraform
- the browse.show homepage

**Out of scope:** never run transcription, the ingestion pipeline, or transcript/index sync to S3 in Actions. That stays on local Mac compute (whisper.cpp).

## Notes from session 1 (starting points, not decisions)

- `bds site deploy`, `bds site upload-client` and `bds infra homepage deploy` run the scripts in `scripts/deploy/` unchanged. Today they assume:
  - **AWS SSO profiles**: `AWS_PROFILE` from each site's gitignored `.env.aws-sso`. CI needs another credential source. GitHub OIDC → an IAM role per account is the usual choice over long-lived keys. The scripts would need to accept credentials from the environment instead of requiring a profile.
  - **Gitignored config**: `.site-account-mappings.json` (account, bucket, CloudFront ID, search API URL) and `.env.lambda-prod-build`. In CI these would come from secrets/variables, or from Terraform outputs.
  - **A hardcoded automation admin profile** in `deploy/deploy-automation.ts` and `bootstrap-automation-state.ts`.
  - **Interactive bits**: `site deploy` is non-interactive by default (`--interactive` opts in); `site destroy` needs a TTY (fine; it shouldn't run in CI).
  - `tsx` on PATH (deploy scripts spawn `tsx` by name; fine under `pnpm bds`).
- The CLI is already built for this: flags win, prompts only on a TTY, otherwise exit code 2; `--all-sites` / `--sites=`; exit codes are meaningful.
- Decide how to detect *what changed* in a merge (client vs lambda vs homepage vs a specific site's config) so CI deploys only what's needed.
- Terraform state lives in per-site S3 buckets (`<site>-browse-dot-show-tf-state`); CI's role needs access to it.
- Keep `pnpm bds doctor` useful in CI (e.g. a `--ci` mode that skips whisper/local-files checks).
