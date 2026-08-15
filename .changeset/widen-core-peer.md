---
'@packkit/provider-aws': patch
---

Widen the `@packkit/core` peer range to `>=0.6.0 <1.0.0` so the provider stays installable
against additive 0.x core minors (e.g. 0.7.0) without a peer mismatch or a churn release on
every core bump. No behavior change.
