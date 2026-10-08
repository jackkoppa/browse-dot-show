# Deploys from GitHub Actions

When a PR merges to `main`, GitHub Actions deploys **only what changed**: each affected site's Terraform stack (infrastructure + lambdas) and client, and the homepage. Terraform changes are planned on the PR and need your approval first. Transcription and ingestion **never** run in Actions; they run on your Mac (`bds ingest`).

Local deploys (`bds site deploy`, `bds site upload-client`, `bds infra homepage deploy`) work exactly as before.

## How it works

### On a PR: `.github/workflows/terraform-plan.yml`

1. **`affected`**: `bds ci affected` lists what the PR's commits deploy (see [What deploys what](#what-deploys-what)).
2. **`plan (<account>: N sites)`**: one job per AWS account, using that account's read-only `browse-dot-show-gha-plan` role. `bds ci terraform-group` plans the account's targets in parallel (each site in its own copy of `terraform/sites`), and writes a summary per target: resource addresses and actions, never values.
3. **`comment`**: one sticky PR comment with a table per target. Anything **created, replaced or destroyed** is listed and flagged ⚠️; in-place updates are collapsed.
4. **`approve-plan`**: waits in the `terraform-approval` environment. **Every** Terraform plan needs your approval: open the run, click **Review deployments**, tick `terraform-approval`, **Approve and deploy**. Approving deploys nothing; it records that you reviewed this plan.
5. **`terraform-plan-result`**: the one required check. It passes when every job succeeded or was skipped (a PR with no Terraform changes skips the plan jobs and passes on its own).

Branch protection requires `terraform-plan-result` and **up-to-date branches**, so the approved plan was computed against the latest `main`. After another PR merges, rebase (which re-runs the plans and needs a fresh approval).

### On merge: `.github/workflows/deploy.yml`

1. **`affected`** on the pushed commits.
2. **`approved-plans`**: finds the merged PR's last successful `terraform-plan` run at its head commit and, only if its `approve-plan` job succeeded, downloads its summaries.
3. **`terraform (<account>: N sites)`**: one job per account, using the `browse-dot-show-gha-deploy` role. `bds ci terraform-group --mode=apply` plans each target again and applies it, **unless** the fresh plan creates, replaces or destroys something that wasn't in the approved summary (AWS can drift between approval and merge), or there's no approved plan at all (`--require-approval`). Those targets fail without applying.
4. **`client (<account>: N sites)`**: one job per account; builds and uploads each affected site's client (bucket and CloudFront ID from `.site-account-mappings.json`), one site after another. Skipped if any Terraform apply failed.
5. The homepage, if affected, is applied in its account's Terraform job and uploaded there (`bds ci upload-homepage`).

Deploys queue (`concurrency: deploy`), so merges never overlap. A manual run (**Actions → deploy → Run workflow**, optionally "Deploy everything") has no PR, so it applies **in-place updates only**.

### What deploys what

`scripts/ci/affected.ts` (tested in `affected.spec.ts`):

| Changed | Deploys |
| --- | --- |
| `sites/origin-sites/<id>/**` (except `terraform/`) | that site's client |
| `sites/origin-sites/<id>/terraform/**` | that site's Terraform and client |
| `packages/client/**`, or a package it depends on | every site's client |
| a lambda package (`packages/ingestion/*`, `packages/search/search-lambda`), a package one depends on, or `terraform/sites/**` | every site's Terraform |
| `packages/homepage/**`, `terraform/homepage/**` | the homepage |
| `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc` | everything |
| `terraform/automation/**`, `terraform/github-actions/**` | nothing (noted in the run summary; deploy these locally) |
| docs (`*.md`), tests, `scripts/`, `.github/`, `scratchpad/` | nothing |

Only sites in `.site-account-mappings.json` deploy. A brand-new site is deployed locally first (`bds site deploy`), which adds it there; commit that change.

### Lambda layers

`terraform/sites/main.tf` builds two lambda layers from zips in `terraform/sites/lambda-layers/` that aren't in git (see its README). CI can't rebuild them byte-for-byte, so `bds ci terraform` downloads **each site's latest deployed layer version** and checks it against Lambda's `CodeSha256` (`scripts/ci/lambda-layers.ts`). CI plans therefore never change a layer. **To change a layer:** build the new zip locally and deploy one site (`pnpm bds site deploy --site=<id>`), then the others; CI picks up whatever each site has deployed.

## AWS access

`terraform/github-actions/` (applied locally with `pnpm bds infra github-actions deploy`, using the three admin SSO profiles) creates, in each of the 3 AWS accounts:

- GitHub's OIDC provider (`token.actions.githubusercontent.com`).
- **`browse-dot-show-gha-plan`**: `ReadOnlyAccess`; only `pull_request` runs from this repo can assume it (`repo:jackkoppa/browse-dot-show:pull_request`). Plans run with `-lock=false`.
- **`browse-dot-show-gha-deploy`**: `AdministratorAccess` (to tighten once deploys have a track record); only runs on `main` (`repo:jackkoppa/browse-dot-show:ref:refs/heads/main`), 2-hour sessions. A PR, including one from a fork, can never assume it.

Workflows build role ARNs from account IDs (`arn:aws:iam::<account>:role/browse-dot-show-gha-<plan|deploy>`): site accounts from `.site-account-mappings.json`, the homepage's from the `HOMEPAGE_AWS_ACCOUNT_ID` repo variable. No long-lived AWS keys are stored in GitHub.

The repo is **public**: PR comments, job logs and artifacts are public. The CLI never prints the raw plan (`terraform show -json` and `tfplan` contain secrets); the OpenAI key goes to Terraform as `TF_VAR_openai_api_key`, never as an argument.

## Setup (done in October 2026; for a new fork or a rebuild)

1. **OIDC roles:** `aws sso login` for each admin profile in `terraform/github-actions/github-actions.tfvars`, then `pnpm bds infra github-actions deploy`. Expect `Plan: 15 to add` (5 per account) on a fresh setup; if an account already has a GitHub OIDC provider, it tells you to set `create_oidc_provider = false` for that account.
2. **Repo config:**
   ```sh
   gh variable set HOMEPAGE_AWS_ACCOUNT_ID --body 297202224084
   gh secret set OPENAI_API_KEY            # the key from .env.local
   gh api -X PUT repos/jackkoppa/browse-dot-show/environments/terraform-approval \
     -F "reviewers[][type]=User" -F "reviewers[][id]=$(gh api user -q .id)"
   ```
3. **Enable:** `gh variable set GHA_DEPLOYS_ENABLED --body true` (until then every workflow job is skipped).
4. **Branch protection:**
   ```sh
   gh api -X PUT repos/jackkoppa/browse-dot-show/branches/main/protection --input - <<'JSON'
   {"required_status_checks": {"strict": true, "contexts": ["terraform-plan-result"]},
    "enforce_admins": false, "required_pull_request_reviews": null, "restrictions": null}
   JSON
   ```
   With `enforce_admins: false` an admin can still bypass in an emergency; `deploy.yml` then applies nothing for stacks without an approved plan.

## Running the same steps locally

```bash
pnpm bds ci affected --base=origin/main                                # what this branch would deploy
pnpm bds ci terraform --target=site:<id> --mode=plan                   # one read-only plan (site's SSO profile)
pnpm bds ci terraform-group --targets=site:a,site:b --mode=plan        # several, in parallel (same AWS account)
```

## Troubleshooting

- **A plan or apply job failed:** open the job; each target's log is a collapsible group (`✅`/`❌ site:<id>`), and the job summary has a per-target table. Other targets in the job still ran.
- **"Not applying site:X: this plan has changes that weren't approved"**: AWS changed between approval and merge. Review the job log, then deploy that site locally, or open a PR to plan it again.
- **The plan comment shows changes you didn't make** (e.g. destroys): the code and what's deployed have drifted, often because a site was last deployed from another branch or before a default changed. Don't approve until you know why; deploying `main` locally to one site first (`bds site deploy --site=<id> --interactive`) shows the same plan.
- **Logs of a run that's waiting for approval:** `gh run view --log` refuses until the run completes; fetch one finished job with `gh api repos/jackkoppa/browse-dot-show/actions/jobs/<job-id>/logs`.
- **Stacked PRs:** `main` uses rebase merges and requires up-to-date branches, so after each merge rebase the next PR onto `main` (`git rebase --update-refs origin/main` for a stack). If GitHub already rebased a branch for you, reset your local copy to it instead of pulling.
- **Workflow YAML:** in a plain `run: echo "... #..."`, YAML treats ` #` as a comment (`actionlint` doesn't catch it). Use a block scalar (`run: |`) and pass event values through `env:`.
