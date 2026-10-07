# 08: M4b, Deployments from GitHub Actions

> **Status:** plan approved in outline on 2026-10-07 (decisions below); implementation in progress.
> **Order:** after the small follow-ups ([10](./10-follow-ups.md)), before M5 (Mac automation).

## Goal

When a PR merges to `main`, GitHub Actions deploys **only what changed**: a site's frontend, the lambdas (via Terraform), or the homepage. Deploying locally stays just as easy. **Never** transcription, the ingestion pipeline, or transcript/index sync in Actions; that stays on the Mac (whisper.cpp).

## Decisions (developer, 2026-10-06/07)

| Topic | Decision |
| --- | --- |
| Trigger | Automatic on merge to `main`, plus `workflow_dispatch` |
| Credentials | **GitHub OIDC → a deploy role per AWS account** (3 accounts). No long-lived keys. |
| Terraform changes | **Plan on the PR, approve, then apply on merge.** A PR that affects Terraform gets a plan computed by a PR workflow and posted as a comment. The PR can't merge until the plan is approved. On merge, the plan is applied (any plan, not only "safe" ones). |
| `.site-account-mappings.json` | **Commit it** (no longer gitignored). Local runs and CI read the same file. |

## What exists today (survey, 2026-10-07)

- **3 AWS accounts**, not 2: account 0 `297202224084` (homepage, automation IAM user), account 1 `152849157974` (11 sites), account 2 `927984855345` (12 sites).
- No `.github/workflows/` at all; `main` has no branch protection. The repo is **public**, so PR comments and Actions logs are public.
- `bds site deploy` (non-interactive) runs `pnpm install`, tests, lint, `all:build`, `all:build:prod`, then `terraform init/plan`, then **auto-approves `terraform apply`**, then uploads the client.
- Every site's `terraform/prod.tfvars` hardcodes `aws_profile`; 13 of them are placeholders (`SETUP_AWS_PROFILE_AFTER_ACCOUNT_CREATION`, `…TODO…`). Local deploys work only because `site-deploy.ts` overrides it with `-var=aws_profile=$AWS_PROFILE` from the site's `.env.aws-sso`. The provider treats an empty profile as "use the environment's credentials", so CI can pass `-var=aws_profile=`.
- Terraform needs `-var=openai_api_key=…` (the process-audio lambda's env).
- Lambda zips: Terraform `archive_file` over each package's `aws-dist/`. `aws-dist/package.json` key order varies between builds, so a zip hash can change with identical code; worth making deterministic.
- `srt-indexing-lambda` has no `build:prod` script (its `aws-dist` comes from `pnpm build` in `all:build`).
- **Bug:** single-site `bds site upload-client --site=X` reads bucket/CloudFront IDs from `terraform output`, i.e. from whichever site's backend `terraform/sites` was last initialized for. If that was another site in the same account, it uploads X's build to that site's bucket. The multi-site path (`--sites`/`--all-sites`) reads `.site-account-mappings.json` and is fine.
- Homepage: `terraform/homepage`, account 0, profile from `packages/homepage/.env.aws-sso`; builds `packages/homepage` and syncs it to its bucket.
- Automation stack (`terraform/automation`): hardcoded account-0 admin profile; fails at plan today (10 §1). Stays manual, but fixed as part of M4b.

## Design

### 1. AWS: OIDC providers and roles (`terraform/github-actions/`, new)

One Terraform stack, applied once by the developer with their admin SSO profiles (`bds infra github-actions deploy`, plan reviewed first). Three provider aliases (one per account). In each account:

- `aws_iam_openid_connect_provider` for `token.actions.githubusercontent.com` (or a data source if one already exists).
- **`browse-dot-show-gha-deploy`**: trusted only for `repo:jackkoppa/browse-dot-show:ref:refs/heads/main` (and `workflow_dispatch` on `main`). Permissions: what `terraform/sites` (or `terraform/homepage`) manages, which is broad (S3, CloudFront, Lambda, API Gateway, IAM roles for lambdas, ACM, EventBridge, CloudWatch Logs), so start with `AdministratorAccess` scoped by the trust policy; tighten later if wanted.
- **`browse-dot-show-gha-plan`**: trusted for `pull_request` events from this repo. `ReadOnlyAccess` plus read on the Terraform state buckets. Plans run with `-lock=false` (read-only). Fork PRs get no OIDC token, so they can't plan; the approval check then can't pass (see 3), so they can't merge without the developer re-running from a branch.

State: a new bucket in account 0 (`browse-dot-show-github-actions-tf-state`), bootstrapped like the homepage state.

GitHub config (the developer runs the commands I give, via `gh`): repo variables for the 6 role ARNs (not secret), secret `OPENAI_API_KEY`.

### 2. What changed: `bds ci affected`

A tested module in `scripts/` that takes `--base`/`--head` SHAs and prints a JSON deploy matrix:

| Changed paths | Deploy |
| --- | --- |
| `sites/origin-sites/<id>/**` (except `terraform/`) | that site's **client** |
| `sites/origin-sites/<id>/terraform/**` | that site's **terraform** (+ client) |
| `packages/client/**` or a workspace package the client depends on | **client** for all sites |
| a lambda package (`packages/ingestion/*`, `packages/search/search-lambda`) or a package they depend on, or `terraform/sites/**` | **terraform** for all sites (lambda code) |
| `packages/homepage/**`, `terraform/homepage/**` | **homepage** |
| `terraform/automation/**`, `terraform/github-actions/**` | nothing automatic; noted in the summary |
| docs, `scratchpad/`, `scripts/` (except deploy code), tests | nothing |

Package dependencies come from pnpm (`pnpm --filter "...[<base>]" list --json` gives changed packages plus their dependents), so the table doesn't hard-code the workspace graph. Only sites in `.site-account-mappings.json` are deployable.

### 3. PR workflow: `terraform-plan.yml`

On `pull_request` to `main`:

1. `affected` job: run `bds ci affected`. If no Terraform targets, the workflow ends (required checks pass as skipped).
2. `plan` job (matrix over affected Terraform targets, `max-parallel` ~6): build (`all:build`, lambda `build:prod`), assume the **plan** role for the target's account, `terraform init` + `plan -lock=false -out`, then `terraform show -json` → a summary: per resource, the action (create / update / replace / destroy).
3. `comment` job: one sticky PR comment with, per target, counts and the list of resources being **created, replaced or destroyed** (in-place updates collapsed). The full plan text goes in the job log and as an artifact. Sensitive values are already redacted by Terraform; the comment shows resource addresses, not values (public repo).
4. `approve-plan` job, only when any target has a **create, replace or destroy**: uses a GitHub Environment `terraform-approval` with the developer as required reviewer. The job waits ("Review deployments" button in the PR's checks) until approved. Plans with only in-place updates (the usual lambda-code change) skip it.

Branch protection on `main` (the developer applies it; I'll give the `gh api` command): require the `terraform-plan / approve-plan` and `terraform-plan / plan` checks, and **require branches to be up to date**, so the approved plan was computed against the latest `main`. Skipped jobs count as passing.

### 4. Deploy workflow: `deploy.yml`

On `push` to `main` (and `workflow_dispatch` with an optional site list / target type):

1. `affected` job on `github.event.before..after`.
2. `terraform` job (matrix, `max-parallel` ~4, `concurrency: deploy-<site>`): build, assume the **deploy** role, `terraform init` + `plan -out` + `apply`. Before applying, compare the fresh plan's create/replace/destroy set with the one approved on the PR (the plan summary artifact from the PR's last run, found via the merge commit's PR). **If the fresh plan has a create/replace/destroy that wasn't approved, stop without applying** and fail the job with the diff. In-place updates are applied. (Needed because AWS can drift between approval and merge.)
3. `client` job (matrix): build the client for the site and upload it with the deploy role, using the bucket and CloudFront ID from `.site-account-mappings.json`; runs after that site's `terraform` job if both were affected.
4. `homepage` job: build + `terraform apply` for `terraform/homepage` with the account-0 deploy role.
5. A run summary (`$GITHUB_STEP_SUMMARY`) listing what deployed.

A workflow-level `concurrency: deploy` group queues merges instead of running them on top of each other.

### 5. Script changes (local deploys stay the same)

- `site-deploy.ts` / `deploy-homepage.ts`: accept credentials from the environment. If `AWS_PROFILE` is unset (CI), skip the SSO check and pass `-var=aws_profile=` so Terraform uses the environment's credentials. New flags for CI: `--plan-only --plan-json=<path>` and `--apply-plan=<path>` (or a thin `bds ci terraform` command reusing the same Terraform invocation: backend config, tfvars, state bucket all unchanged).
- Skip `pnpm install`/tests/lint inside the deploy script when CI already did them (`--skip-checks`).
- `upload-client.ts --site`: read bucket/CloudFront from `.site-account-mappings.json` (fixes the bug above), with credentials from the profile **or** the environment.
- `bds doctor --ci`: skip whisper/local-files checks.
- Deterministic `aws-dist/package.json` (sorted keys) so unchanged lambda code doesn't produce a new zip hash.
- Commit `.site-account-mappings.json`; `site-deploy.ts` keeps updating it after an apply (locally that shows up as a diff to commit; in CI a changed mapping fails the job, since a new site should be deployed locally first).

### 6. Fix 10 §1 (automation Terraform)

Build the automation user's assume-role policy from the distinct account IDs in `.site-account-mappings.json` (now committed) instead of the per-site tfvars map. Plan reviewed by the developer before applying. The automation stack stays a manual, local deploy.

## PRs (stacked)

1. **Plan** (this doc) + follow-up status updates.
2. **Prep**: commit `.site-account-mappings.json`; `upload-client --site` fix; env credentials in deploy scripts; `--plan-only`/`--apply-plan`; deterministic `aws-dist/package.json`. Local behavior unchanged; verified with a no-change plan on one site (developer runs it).
3. **`bds ci affected`** with unit tests over sample diffs.
4. **`terraform/github-actions/` stack** + `bds infra github-actions deploy`. Developer applies it.
5. **Workflows** (`terraform-plan.yml`, `deploy.yml`) + branch protection/environment setup commands. First real run: a no-op PR touching one site's client.
6. **10 §1** automation Terraform fix.

## Open questions (to confirm during implementation)

- Approval gate scope: required only for plans with create/replace/destroy (proposed above), or for every Terraform-affecting PR?
- `AdministratorAccess` for the deploy role to start, or scope it now?
- Is an OIDC provider already present in any of the 3 accounts? (Checked during PR 4's plan.)
