# @packkit/provider-aws

## 0.2.0

### Minor Changes

- 0fed85c: Initial release — a contract-driven, language-agnostic AWS deployment provider. From a
  project's `static` deployment contract it emits OpenTofu/Terraform (S3 + CloudFront via
  Origin Access Control, S3 backend with native lockfile — no DynamoDB) plus a
  `bootstrap/` module (state bucket + GitHub OIDC provider + repo-scoped IAM deploy role)
  and a `.github/workflows/deploy.yml` pipeline (fmt/lint/validate/plan on PRs, apply on
  merge, via OIDC — no long-lived keys). `supports`/`prepare`/`plan` are pure; the package
  never holds AWS credentials. Generated infra is `tofu fmt`- and `tofu validate`-clean.
