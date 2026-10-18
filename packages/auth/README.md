# @browse-dot-show/auth

Subscriber access (see [the plan](../../scratchpad/subscriber-access/PLAN.md)).

- `session-token.ts`: session tokens, compact JWTs signed with Ed25519. The shared auth lambda signs them with the private key; each site's subscriber lambda verifies them with the public key.
- `providers/`: subscription platforms a listener can log in with, behind one interface (`SubscriptionProvider`): Supporting Cast (`providers/supporting-cast/`: the API client, the subscriber mirror and its sync, the provider), and `dev-code` for testing
- `store.ts`: the interface for the auth lambda's small state (rate-limit counters, used login links), with an in-memory version
