# @browse-dot-show/auth-lambda

The shared subscriber login lambda (one for all sites; see [the plan](../../scratchpad/subscriber-access/PLAN.md)). It checks a listener's subscription with the site's provider (Supporting Cast, or `dev-code` for testing) and issues session tokens that each site's subscriber lambda verifies.

- `app.ts`: the routes (`/login`, `/complete`, `/refresh`), rate limits and login links, independent of AWS
- `dependencies.ts`: site config (`AUTH_SITES`), secrets (SSM parameters under `SSM_PARAMETER_PREFIX`) and the Supporting Cast sync
- `dynamo.ts`: storage (rate-limit counters, used login links, Supporting Cast mirrors) in DynamoDB (`AUTH_TABLE_NAME`)
- `auth-lambda.ts`: the Lambda entry point (HTTP API, and the scheduled `sync-supporting-cast` event)
- `dev-server.ts`: `pnpm dev:local` runs it locally with a throwaway key, in-memory storage and the `dev-code` provider
