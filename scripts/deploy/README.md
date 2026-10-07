# scripts/deploy

Terraform-based deploy scripts. Don't run these directly; use the `bds` commands, which load the right site env and credentials:

| Command | Script |
| --- | --- |
| `pnpm bds site deploy --site=<id>` | `site-deploy.ts` (bootstraps the state bucket via `bootstrap-site-state.ts`, runs Terraform, uploads the client) |
| `pnpm bds site upload-client --site=<id>` | `upload-client.ts` |
| `pnpm bds site upload-client --all-sites` | `upload-all-client-sites.ts` (automation credentials) |
| `pnpm bds site destroy --site=<id>` | `site-destroy.ts` |
| `pnpm bds infra homepage <deploy\|bootstrap-state>` | `deploy-homepage.ts`, `bootstrap-homepage-state.ts` |
| `pnpm bds infra automation <deploy\|bootstrap-state>` | `deploy-automation.ts`, `bootstrap-automation-state.ts` |

See the [Deployment Guide](../../docs/deployment-guide.md).
