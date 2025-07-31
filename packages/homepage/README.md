# homepage

React client for UI at https://browse.show/

Only inteded to be deployed from origin repo, https://github.com/jackkoppa/browse-dot-show

See [deploy-homepage.ts](../../scripts/deploy/deploy-homepage.ts) for deployment handling.

Configure AWS profile here, [.env.aws-sso](./env.aws-sso)

## Performance Profiling

For debugging performance issues, enable profiling mode:
- Add `?profile=true` to URL, or
- Run `npm run dev:with-profiling`

This enables detailed component render tracking and performance metrics in the console.
