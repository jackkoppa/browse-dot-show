# @browse-dot-show/auth-lambda

The shared subscriber login lambda (one for all sites; see [the plan](../../scratchpad/subscriber-access/PLAN.md)). It checks a listener's subscription with the site's provider (Supporting Cast, or `dev-code` for testing) and issues session tokens that each site's subscriber lambda verifies.

- `app.ts`: the routes (`/login`, `/complete`, `/refresh`), independent of AWS
- `dependencies.ts`: site config (`AUTH_SITES`) and secrets (SSM parameters under `SSM_PARAMETER_PREFIX`)
- `auth-lambda.ts`: the Lambda entry point (function URL)
- `dev-server.ts`: `pnpm dev:local` runs it locally with a throwaway key and the `dev-code` provider
