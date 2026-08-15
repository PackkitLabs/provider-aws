# AGENTS.md

Guidance for AI coding agents working in **@packkit/provider-aws**.

## What this is

A **contract-driven, language-agnostic** AWS deployment provider for Packkit. It reads a
project's `@packkit/core` **deploymentContract** (never the language) and emits
OpenTofu/Terraform + a GitHub-OIDC deploy pipeline. Mirrors `provider-netlify`'s
`supports` / `prepare` / `plan` shape, but is IaC-emitting rather than API-driven — there
is no runtime `apply` and the package never holds AWS credentials.

## Stack

- Language: TypeScript (strict)
- Module format: ESM
- Package manager: npm
- Bundler: tsup
- Tests: vitest
- Lint/format: eslint-prettier
- Emitted IaC: OpenTofu (`tofu`) — also valid under Terraform

## Commands

- Type-check: `npm run typecheck`
- Lint: `npm run lint`
- Test: `npm test`
- Build: `npm run build`
- Full gate: `npm run check`

## Conventions

- Source lives in `src/`. Keep the public API in `src/index.ts`.
- `supports` / `prepare` / `plan` are **pure** (no fs, no network); keep them that way.
- The emitted Terraform must stay **`tofu fmt`-clean and `tofu validate`-clean**. After
  changing any `.tf` emitter, regenerate a sample and run `tofu fmt -check -recursive` +
  `tofu init -backend=false && tofu validate` (this is what CI enforces).
- Security posture is load-bearing: OIDC (no long-lived keys), private buckets, least-ish
  privilege, no DynamoDB (native S3 locking). Don't regress it.
- Add or update tests for any behavior change; keep `strict` passing.
- Run `npx changeset` after a user-facing change. Do not commit `dist/` or `node_modules/`.
