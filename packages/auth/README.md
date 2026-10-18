# @browse-dot-show/auth

Subscriber access (see [the plan](../../scratchpad/subscriber-access/PLAN.md)).

- `session-token.ts`: session tokens, compact JWTs signed with Ed25519. The shared auth lambda signs them with the private key; each site's subscriber lambda verifies them with the public key.
