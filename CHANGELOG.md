# @packkit/provider-aws

## 0.2.0

### Minor Changes

- 82182d9: Conform to `@packkit/core`'s new provider contract: the provider now advertises a stable
  `id` (`'aws'`) and `capabilities` (`['plan']` — no runtime apply, it emits IaC), and its
  plan carries a `schemaVersion`. Passes `runProviderConformanceSuite`. Bumps `@packkit/core`
  to `^0.6.0`.

## 0.1.1

### Patch Changes

- 72aeeb0: Fix the generated OIDC bootstrap for GitHub's 2026 immutable subject claims (#2).

  - **Trust policy now matches both subject formats.** Repositories created or renamed
    after 2026-07-15 emit an immutable `sub` of `repo:owner@<owner_id>/repo@<repo_id>:…`,
    which the old `repo:owner/name:*` pattern never matched — so CI would fail
    `AssumeRoleWithWebIdentity` on every new repo. The emitted trust policy now accepts
    both the legacy format and the immutable one (numeric ids wildcarded, since they don't
    exist at scaffold time). Owner/repo _names_ stay anchored (each followed by a literal
    `@`/`/`), so `${owner}evil` can't match.
  - **No pinned OIDC thumbprint.** AWS has managed GitHub's certificate chain since 2023, so
    pinning a thumbprint caused perpetual `plan` drift (AWS repopulates the list) and a
    future outage on certificate rotation. The provider now omits it and sets
    `lifecycle { ignore_changes = [thumbprint_list] }`.

  Both fixes are covered by a new test and remain `tofu fmt`- and `tofu validate`-clean.
