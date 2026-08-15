---
'@packkit/provider-aws': minor
---

Conform to `@packkit/core`'s new provider contract: the provider now advertises a stable
`id` (`'aws'`) and `capabilities` (`['plan']` — no runtime apply, it emits IaC), and its
plan carries a `schemaVersion`. Passes `runProviderConformanceSuite`. Bumps `@packkit/core`
to `^0.6.0`.
